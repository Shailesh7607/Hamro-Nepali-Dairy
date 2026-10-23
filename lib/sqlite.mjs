import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
export function migrationFiles(){return readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort().map(name=>({name,sql:readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8')}));}
export function markMigrations(sqlite){
 sqlite.exec('CREATE TABLE IF NOT EXISTS _schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
 for(const m of migrationFiles())sqlite.prepare('INSERT INTO _schema_migrations(name,checksum) VALUES(?,?)').run(m.name,createHash('sha256').update(m.sql).digest('hex'));
}
export function openDatabase(path){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const sqlite=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 const tracked=sqlite.prepare("SELECT name FROM sqlite_master WHERE name='_schema_migrations'").get();
 if(!tracked&&sqlite.prepare("SELECT name FROM sqlite_master WHERE name='orders'").get()){sqlite.close();throw new Error('Existing database requires the verified migration/import process. See MIGRATION.md.');}
 sqlite.exec('CREATE TABLE IF NOT EXISTS _schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
 for(const m of migrationFiles()){
  const checksum=createHash('sha256').update(m.sql).digest('hex');const applied=sqlite.prepare('SELECT checksum FROM _schema_migrations WHERE name=?').get(m.name);
  if(applied){if(applied.checksum!==checksum)throw new Error('Applied migration was modified: '+m.name);continue;}
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(m.sql);sqlite.prepare('INSERT INTO _schema_migrations(name,checksum) VALUES(?,?)').run(m.name,checksum);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }
 const prepare=sql=>({bind(...values){
  const stmt=sqlite.prepare(sql);
  return {sql,first:async()=>stmt.get(...values)||null,all:async()=>({results:stmt.all(...values)}),run:async()=>({meta:{changes:Number(stmt.run(...values).changes)}}),execute(){return stmt.columns().length?{results:stmt.all(...values)}:{meta:{changes:Number(stmt.run(...values).changes)}};}};
 }});
 return {sqlite,prepare,batch(statements){
  // No awaits inside this transaction: other requests cannot join an open batch.
  sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return Promise.resolve(results);}catch(e){sqlite.exec('ROLLBACK');return Promise.reject(e);}
 },close(){sqlite.close();}};
}
