// Run on your own computer. Never paste connection passwords into chat.
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {poolOptions} from '../lib/postgres.mjs';
const hints={
 MISSING_URL:'Set DATABASE_SETUP_URL to the Session pooler PostgreSQL URI from Supabase Connect.',
 EXISTING_URL:'DATABASE_URL is already configured. Try npm start; setup will not rotate an existing application credential.',
 ADMIN_REQUIRED:'Use the project administrator connection for setup, not hamro_server.',
 INVALID_URL:'Use a postgresql:// connection URI, not the https:// project API URL. URL-encode special characters in the password.',
 '28P01':'Database authentication failed. Check the database password and the complete pooler username locally.',
 '42501':'The database account lacks the required setup permissions.',
 '3F000':'The dairy schema is missing. Apply the supplied database migration first.',
 '42P01':'A required database table is missing. Check the supplied database migration.',
 '42704':'A required database role or object is missing. Check the supplied database migration.',
 ENOTFOUND:'The database hostname could not be resolved. Copy the exact host from Supabase Connect.',
 EAI_AGAIN:'DNS lookup failed temporarily. Check your connection and retry.',
 ECONNREFUSED:'The database connection was refused. Check the pooler host, port and project availability.',
 ETIMEDOUT:'The connection timed out. Check your network, firewall and project availability.',
 CERTIFICATE:'TLS certificate verification failed. Use the project CA certificate downloaded from Supabase; do not disable certificate verification.',
 ENOENT:'A required local file was not found. Check DATABASE_CA_CERT if it is set.',
 EACCES:'A local file could not be accessed. Check certificate and .env file permissions.',
 VERIFY_FAILED:'The restricted database account could not be verified.',
 UNKNOWN:'An unclassified setup error occurred. Share only this diagnostic code and stage, not your .env or connection URI.'
};
export function setupDiagnostic(error){
 let code=error?.code;
 if(code==='ERR_INVALID_URL'||error?.message==='Use a PostgreSQL connection URL.')code='INVALID_URL';
 if(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))code='CERTIFICATE';
 if(!code&&/timeout|timed out/i.test(error?.message||''))code='ETIMEDOUT';
 if(!Object.hasOwn(hints,code))code='UNKNOWN';
 return `[${code}] ${hints[code]}`;
}
const fail=code=>Object.assign(new Error('Setup stopped'),{code});
export async function setupDatabase(config={...process.env}){
 let pool,stage='local configuration',credentialChanged=false;
 try{
  if(!config.DATABASE_SETUP_URL)throw fail('MISSING_URL');
  const existing=existsSync('.env')?readFileSync('.env','utf8'):'';
  if(config.DATABASE_URL?.trim()||/^\s*DATABASE_URL\s*=\s*[^\s#]+/m.test(existing))throw fail('EXISTING_URL');
  pool=new pg.Pool(poolOptions(config,config.DATABASE_SETUP_URL));
  stage='administrator connection';
  const state=await pool.query("SELECT current_user username,has_schema_privilege(current_user,'dairy','CREATE') AS can_setup");
  if(!state.rows[0].can_setup||state.rows[0].username==='hamro_server')throw fail('ADMIN_REQUIRED');
  const password=randomBytes(36).toString('base64url');
  stage='restricted account password setup';
  // Generated locally with a URL-safe alphabet; never logged.
  await pool.query("ALTER ROLE hamro_server PASSWORD '"+password+"'");credentialChanged=true;
  const url=new URL(config.DATABASE_SETUP_URL),username=decodeURIComponent(url.username);
  url.username=username.includes('.')?'hamro_server.'+username.split('.').slice(1).join('.'):'hamro_server';url.password=password;
  stage='restricted account verification';
  const testPool=new pg.Pool(poolOptions(config,url.toString()));
  try{
   const r=await testPool.query('SELECT current_user username');
   if(r.rows[0].username!=='hamro_server')throw fail('VERIFY_FAILED');
   await testPool.query('SELECT version FROM dairy.schema_version');
  }finally{await testPool.end();}
  stage='saving local configuration';
  const clean=existing.split(/\r?\n/).filter(line=>!/^\s*(DATABASE_SETUP_URL|DATABASE_URL)\s*=/.test(line)).join('\n');
  writeFileSync('.env',clean+'\nDATABASE_URL='+url.toString()+'\n',{mode:0o600});chmodSync('.env',0o600);
  console.log('Restricted database account configured. Administrator URL removed from .env. Run npm start.');
 }catch(error){
  console.error(`Database setup failed at ${stage}. ${setupDiagnostic(error)}`);
  if(credentialChanged)console.error('The restricted account password was changed before setup finished. Local configuration may be incomplete.');
  console.error('No connection credentials are printed. See START-HERE.txt.');process.exitCode=1;
 }finally{if(pool)await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await setupDatabase();
