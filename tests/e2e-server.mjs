// Test-only server: synthetic identity, isolated embedded PostgreSQL, no real credentials.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {createApp} from '../lib/http-app.mjs';
import {postgresAdapter} from '../lib/postgres.mjs';
const pg=new PGlite({parsers:{20:Number,1700:Number}});await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await pg.exec("INSERT INTO dairy.inventory(product_id,available,enabled,revision,updated) VALUES('milk',1000,1,0,0);SET ROLE hamro_server");let tail=Promise.resolve();
const pool={async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,params)=>pg.query(sql,params),release};},end:()=>pg.close()};
const db=postgresAdapter(pool),config={APP_ORIGIN:'http://127.0.0.1:3099',SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_only'};
const contextFactory=()=>({responseHeaders:new Headers(),client:{auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'browser@example.invalid',email_confirmed_at:'2026-01-01'}}})},rpc:async()=>({data:'customer'})}});
const server=createApp(config,db,{contextFactory});server.listen(3099,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0)}));
