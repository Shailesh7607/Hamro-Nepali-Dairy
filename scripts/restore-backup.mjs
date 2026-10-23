// Restore only into a NEW, offline SQLite database; never writes to the hosted Site.
import {readFileSync,readdirSync,existsSync,chmodSync,unlinkSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {markMigrations} from '../lib/sqlite.mjs';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('Usage: node scripts/restore-backup.mjs backup.json NEW-database.sqlite');
if(existsSync(target))throw new Error('Refusing to overwrite an existing database.');
const data=JSON.parse(readFileSync(source,'utf8'));
const legacy=data.format==='dudhghar-backup-v1';
const tables=['orders','inventory','shop_settings','order_events','support_tickets','operation_errors',...(legacy?[]:['delivery_days','daily_inventory','stock_movements','standing_plans']),...(data.format==='dudhghar-backup-v3'?['saved_addresses','delivery_slots']:[])];
if(!['dudhghar-backup-v1','dudhghar-backup-v2','dudhghar-backup-v3'].includes(data.format)||!data.tables||tables.some(name=>!Array.isArray(data.tables[name])))throw new Error('Invalid or incomplete backup format.');
const db=new DatabaseSync(resolve(target));chmodSync(target,0o600);
try{
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
 db.exec('BEGIN');
 for(const trigger of triggers)db.exec('DROP TRIGGER "'+trigger.name.replaceAll('"','""')+'"');
 for(const table of tables){
  const columns=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
  const insert=db.prepare('INSERT INTO '+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');
  for(const row of data.tables[table]){
   if(legacy&&table==='orders')row.stock_date='';
   if(legacy&&table==='inventory')row.low_threshold=0;
   if(!row||columns.some(c=>!(c in row))||Object.keys(row).some(c=>!columns.includes(c)))throw new Error('Schema mismatch in '+table);
   insert.run(...columns.map(c=>row[c]));
  }
 }
 for(const trigger of triggers)db.exec(trigger.sql);
 db.exec('COMMIT');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed');
 console.log('Restored offline database. Stock reservations preserved. Hosted restore requires a separate reviewed deployment procedure.');
 if(data.format==='dudhghar-backup-v3')markMigrations(db);
 db.close();
}catch(e){try{db.close();}catch{}unlinkSync(target);throw e;}
