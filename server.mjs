import {openPostgres} from './lib/postgres.mjs';
import {createApp,validateConfig} from './lib/http-app.mjs';
const config={...process.env};
config.APP_ORIGIN ||= 'http://localhost:3000';
validateConfig(config);
let db;try{db=await openPostgres(config);}catch{console.error('Database connection failed. Check your local .env and follow START-HERE.txt. Credentials are never printed.');process.exit(1);}
const server=createApp(config,db);server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(Number(config.PORT||3000),config.HOST||'127.0.0.1',()=>console.log('हाम्रो नेपाली डेरी ready: '+config.APP_ORIGIN));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
