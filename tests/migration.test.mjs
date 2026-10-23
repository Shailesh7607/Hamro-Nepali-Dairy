import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../lib/sqlite.mjs';
import {backupTables} from '../lib/improvements.mjs';
test('offline migration preserves stock and IDs, maps verified owners and isolates unmapped records',t=>{
 const folder=mkdtempSync(join(tmpdir(),'dahi-migrate-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const source=openDatabase(':memory:');
 for(const owner of ['old-a','old-b'])source.sqlite.prepare('INSERT INTO orders(id,owner,payload,subtotal,delivery,total,method,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(owner,owner,'{}',1700,100,1800,'cod',0,0);
 source.sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,37,1,0,0)').run('milk');
 const snapshot={format:'dudhghar-backup-v2',tables:Object.fromEntries(backupTables.map(name=>[name,source.sqlite.prepare('SELECT * FROM '+name).all()]))};source.close();
 const backup=join(folder,'backup.json'),mapping=join(folder,'mapping.json'),target=join(folder,'new.sqlite');writeFileSync(backup,JSON.stringify(snapshot));
 writeFileSync(mapping,JSON.stringify([{old_owner:'old-a',supabase_user_id:'11111111-1111-4111-8111-111111111111',verification_note:'Fixture only: both identities checked in this isolated test.'}]));
 const script=fileURLToPath(new URL('../scripts/import-sites-backup.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,[script,backup,mapping,target],{encoding:'utf8'});
 const result=run();assert.equal(result.status,0,result.stderr);
 const restored=openDatabase(target);assert.equal(restored.sqlite.prepare("SELECT owner FROM orders WHERE id='old-a'").get().owner,'sb:11111111-1111-4111-8111-111111111111');assert.equal(restored.sqlite.prepare("SELECT owner FROM orders WHERE id='old-b'").get().owner,'legacy:old-b');assert.equal(restored.sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,37);assert.equal(restored.sqlite.prepare('SELECT count(*) n FROM identity_migrations').get().n,1);restored.close();
 assert.notEqual(run().status,0);
});
test('v3 backup restores addresses, slots and account ownership into a runnable database',t=>{
 const folder=mkdtempSync(join(tmpdir(),'dahi-v3-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const source=openDatabase(':memory:');
 source.sqlite.prepare('INSERT INTO saved_addresses VALUES(?,?,?,?,?,?)').run('a','sb:customer','Home',JSON.stringify({address:'Original address'}),2,100);
 source.sqlite.prepare('INSERT INTO delivery_slots VALUES(?,?,?,?)').run('2027-01-01','morning',3,1);
 const snapshot={format:'dudhghar-backup-v3',tables:Object.fromEntries(backupTables.map(name=>[name,source.sqlite.prepare('SELECT * FROM '+name).all()]))};source.close();
 const backup=join(folder,'backup.json'),target=join(folder,'restored.sqlite');writeFileSync(backup,JSON.stringify(snapshot));
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/restore-backup.mjs',import.meta.url)),backup,target],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const restored=openDatabase(target);assert.equal(restored.sqlite.prepare('SELECT owner FROM saved_addresses').get().owner,'sb:customer');assert.equal(restored.sqlite.prepare('SELECT capacity FROM delivery_slots').get().capacity,3);restored.close();
});
test('upgrading an existing database preserves orders and stock',async t=>{
 const {DatabaseSync}=await import('node:sqlite'),{migrationFiles}=await import('../lib/sqlite.mjs'),{createHash}=await import('node:crypto');
 const folder=mkdtempSync(join(tmpdir(),'dahi-upgrade-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const path=join(folder,'old.sqlite'),db=new DatabaseSync(path);
 db.exec('CREATE TABLE _schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
 for(const m of migrationFiles().filter(m=>m.name<'0004')){db.exec(m.sql);db.prepare('INSERT INTO _schema_migrations VALUES(?,?)').run(m.name,createHash('sha256').update(m.sql).digest('hex'));}
 db.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,37,1,0,0)').run('milk');
 db.prepare('INSERT INTO orders(id,owner,payload,subtotal,delivery,total,method,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run('legacy-order','sb:buyer','{}',1700,100,1800,'cod',0,0);db.close();
 const upgraded=openDatabase(path);assert.equal(upgraded.sqlite.prepare('SELECT available FROM inventory').get().available,37);assert.equal(upgraded.sqlite.prepare('SELECT owner FROM orders').get().owner,'sb:buyer');assert.equal(upgraded.sqlite.prepare('SELECT count(*) n FROM saved_addresses').get().n,0);upgraded.close();
});
