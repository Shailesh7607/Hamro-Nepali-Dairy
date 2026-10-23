// Offline administrative operation. Imports only into an empty Supabase commerce schema.
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {poolOptions} from '../lib/postgres.mjs';
import {backupTables} from '../lib/improvements.mjs';
const source=process.argv[2];if(!source){console.error('Usage: npm run import:backup -- backup.json');process.exit(1);}
const data=JSON.parse(readFileSync(source,'utf8'));
if(!['dudhghar-backup-v3','hamro-dairy-postgres-v1'].includes(data.format)||!data.tables||backupTables.some(t=>!Array.isArray(data.tables[t])))throw new Error('Use an independent v3 or Hamro PostgreSQL backup. Sites exports require verified identity mapping first.');
for(const table of ['orders','saved_addresses','support_tickets','standing_plans'])for(const row of data.tables[table])if(!/^sb:[0-9a-f-]{36}$/i.test(row.owner))throw new Error('Unverified account owner. Stop and complete identity mapping before importing.');
const pool=new pg.Pool(poolOptions(process.env)),client=await pool.connect();
try{
 await client.query('BEGIN');await client.query("SET LOCAL search_path TO dairy,pg_catalog");await client.query('SELECT pg_advisory_xact_lock(731904219)');
 for(const table of backupTables){const result=await client.query('SELECT count(*) n FROM '+table);if(Number(result.rows[0].n)!==0)throw new Error('Destination contains business data. Refusing to merge or overwrite.');}
 for(const table of backupTables){
  const meta=await client.query("SELECT column_name,is_generated FROM information_schema.columns WHERE table_schema='dairy' AND table_name=$1 ORDER BY ordinal_position",[table]);
  const columns=meta.rows.filter(r=>r.is_generated==='NEVER').map(r=>r.column_name),known=new Set(meta.rows.map(r=>r.column_name));
  for(const row of data.tables[table]){
   if(!row||columns.some(c=>!(c in row))||Object.keys(row).some(c=>!known.has(c)))throw new Error('Backup schema mismatch');
   await client.query('INSERT INTO '+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(c=>row[c]));
  }
 }
 await client.query('COMMIT');console.log('Import complete. Stock balances preserved; line items rebuilt. Verify totals and account ownership before opening ordering.');
}catch{await client.query('ROLLBACK');console.error('Import refused or failed; no partial data committed. Check format, account mapping and that destination tables are empty.');process.exitCode=1;}finally{client.release();await pool.end();}
