// Offline only. Never replaces an existing database, edits the hosted Site, or matches by email.
import {readFileSync,existsSync,unlinkSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {markMigrations} from '../lib/sqlite.mjs';
const [backup,mappingFile,targetArg]=process.argv.slice(2);
if(!backup||!mappingFile||!targetArg)throw new Error('Usage: node scripts/import-sites-backup.mjs backup.json verified-identities.json NEW.sqlite');
const target=resolve(targetArg);if(existsSync(target))throw new Error('Refusing to overwrite an existing database.');
const data=JSON.parse(readFileSync(backup,'utf8')),mapping=JSON.parse(readFileSync(mappingFile,'utf8'));
if(!['dudhghar-backup-v1','dudhghar-backup-v2'].includes(data.format)||!Array.isArray(mapping))throw new Error('Invalid backup or identity mapping.');
const owners=new Set(['orders','support_tickets','standing_plans'].flatMap(table=>(data.tables?.[table]||[]).map(row=>row.owner)));
const seen=new Set(),targets=new Set();
for(const row of mapping){
 if(typeof row.old_owner!=='string'||!owners.has(row.old_owner)||seen.has(row.old_owner)||targets.has(row.supabase_user_id)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.supabase_user_id)||typeof row.verification_note!=='string'||row.verification_note.trim().length<12)throw new Error('Each mapping needs a unique existing owner, unique Supabase UUID and documented identity verification.');
 seen.add(row.old_owner);targets.add(row.supabase_user_id);
}
// Even unmapped accounts remain preserved and inaccessible until identity is verified.
const restored=spawnSync(process.execPath,[fileURLToPath(new URL('./restore-backup.mjs',import.meta.url)),resolve(backup),target],{encoding:'utf8'});
if(restored.status!==0)throw new Error('Restore failed: '+restored.stderr);
const db=new DatabaseSync(target);chmodSync(target,0o600);
try{
 db.exec('BEGIN IMMEDIATE');markMigrations(db);
 for(const table of ['orders','support_tickets','standing_plans'])db.prepare('UPDATE '+table+" SET owner='legacy:' || owner").run();
 for(const table of ['order_events','stock_movements'])db.prepare('UPDATE '+table+" SET actor='legacy:' || actor WHERE actor<>'system'").run();
 db.exec('CREATE TABLE identity_migrations(old_owner TEXT PRIMARY KEY,new_owner TEXT UNIQUE NOT NULL,verification_note TEXT NOT NULL,migrated_at TEXT NOT NULL)');
 for(const row of mapping){
  const owner='sb:'+row.supabase_user_id;
  for(const table of ['orders','support_tickets','standing_plans'])db.prepare('UPDATE '+table+' SET owner=? WHERE owner=?').run(owner,'legacy:'+row.old_owner);
  // Historical actors intentionally stay namespaced; audit records are not rewritten to pretend they were Supabase sessions.
  db.prepare('INSERT INTO identity_migrations VALUES(?,?,?,?)').run(row.old_owner,owner,row.verification_note,new Date().toISOString());
 }
 db.exec('COMMIT');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed.');
 console.log(JSON.stringify({imported:true,mapped:seen.size,unmapped:owners.size-seen.size,stockReservations:'preserved',productionChanged:false}));
 db.close();
}catch(e){try{db.exec('ROLLBACK')}catch{}db.close();unlinkSync(target);throw e;}
