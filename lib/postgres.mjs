import pg from 'pg';
import {readFileSync} from 'node:fs';
// Fixed application SQL only. No endpoint accepts SQL from customers.
export function compileSQL(source){
 let sql=source.replace(/INSERT OR IGNORE INTO/g,'INSERT INTO');
 sql=sql.replace(/json_extract\(([^,()]+),'\$\.([A-Za-z]+)'\)/g,(_,v,key)=>['qty','subtotal','price'].includes(key)?`((${v}::jsonb)->>'${key}')::bigint`:`((${v}::jsonb)->>'${key}')`);
 sql=sql.replace(/json_each\(([^,()]+),'\$\.items'\)/g,"jsonb_array_elements(($1)::jsonb->'items')");
 sql=sql.replace(/instr\(lower\(id\),lower\(\?\)\)/g,'strpos(lower(id),lower(?))');
 sql=sql.replace(/instr\(lower\(\(\(payload::jsonb\)->>'business'\)\),lower\(\?\)\)/g,"strpos(lower(((payload::jsonb)->>'business')),lower(?))");
 sql=sql.replace(/instr\(\(\(payload::jsonb\)->>'phone'\),\?\)/g,"strpos(((payload::jsonb)->>'phone'),?)");
 sql=sql.replace(/date\(created\/1000,'unixepoch','\+345 minutes'\)/g,"to_char(to_timestamp(created/1000.0) AT TIME ZONE 'Asia/Kathmandu','YYYY-MM-DD')");
 if(source.includes('INSERT OR IGNORE INTO'))sql+=' ON CONFLICT DO NOTHING';
 // Parse literals so question marks inside text cannot become bind parameters.
 let n=0,quoted=false,result='';for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){result+=c;if(quoted&&sql[i+1]==="'"){result+=sql[++i];continue;}quoted=!quoted;continue;}result+=c==='?'&&!quoted?'$'+(++n):c;}
 return result;
}
const normalize=result=>({results:result.rows||[],meta:{changes:result.rowCount??result.affectedRows??0}});
export function postgresAdapter(pool){
 async function transaction(statements){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("SET LOCAL search_path TO dairy,pg_catalog");
   await client.query("SET LOCAL statement_timeout='15s'");
   await client.query("SET LOCAL lock_timeout='10s'");
   // Serialize business writes across every Node process. Reads see committed snapshots.
   if(statements.some(s=>!/^SELECT\b/i.test(s.sql)))await client.query('SELECT pg_advisory_xact_lock(731904219)');
   const results=[];for(const s of statements)results.push(normalize(await client.query(compileSQL(s.sql),s.values)));
   await client.query('COMMIT');return results;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 const prepare=sql=>({bind(...values){const s={sql,values};return {...s,first:async()=>(await transaction([s]))[0].results[0]||null,all:async()=>(await transaction([s]))[0],run:async()=>(await transaction([s]))[0]};}});
 return {prepare,batch:transaction,close:()=>pool.end(),kind:'postgres'};
}
export function poolOptions(config,url=config.DATABASE_URL){
 if(!url)throw new Error('Database setup is required. Follow START-HERE.txt.');
 const parsed=new URL(url);if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('Use a PostgreSQL connection URL.');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])parsed.searchParams.delete(key);
 return {connectionString:parsed.toString(),ssl:{rejectUnauthorized:true,...(config.DATABASE_CA_CERT?{ca:readFileSync(config.DATABASE_CA_CERT,'utf8')}:{})},max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,types:{getTypeParser(oid,format){if([20,1700].includes(oid))return value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Unsafe numeric database value');return n;};return pg.types.getTypeParser(oid,format);}}};
}
export async function openPostgres(config){
 const pool=new pg.Pool(poolOptions(config));
 try{const result=await pool.query('SELECT current_user AS username');if(result.rows[0].username!=='hamro_server')throw new Error('Use the restricted hamro_server database account. Run npm run setup:database locally.');
 const version=await pool.query('SELECT version FROM dairy.schema_version');if(!version.rows.some(r=>r.version===1))throw new Error('Database schema is not ready.');return postgresAdapter(pool);
 }catch(e){await pool.end();throw e;}
}
