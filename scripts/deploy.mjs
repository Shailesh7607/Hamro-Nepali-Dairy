// Host-neutral deployment contract; requires a configured deployment endpoint.
// No credentials or full URLs are logged. Never called from pull-request jobs.
import {pathToFileURL} from 'node:url';
export async function deploy(config,transport=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 const {DEPLOY_HOOK_URL,DEPLOY_TOKEN,HEALTH_URL,RELEASE_IMAGE,RELEASE_SHA,DEPLOY_ENVIRONMENT}=config;
 for(const value of [DEPLOY_HOOK_URL,HEALTH_URL]){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Deployment requires HTTPS URLs without embedded credentials.');}
 if(!DEPLOY_TOKEN||!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(RELEASE_IMAGE||'')||! /^[a-f0-9]{40}$/.test(RELEASE_SHA||'')||!['staging','production'].includes(DEPLOY_ENVIRONMENT))throw new Error('Missing or invalid release configuration.');
 const response=await transport(DEPLOY_HOOK_URL,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+DEPLOY_TOKEN,'content-type':'application/json'},body:JSON.stringify({image:RELEASE_IMAGE,commit:RELEASE_SHA,environment:DEPLOY_ENVIRONMENT}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Deployment endpoint rejected the release.');
 for(let i=0;i<40;i++){
  try{const r=await transport(HEALTH_URL,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok){const health=await r.json();if(health.ok===true&&health.release===RELEASE_SHA)return;}}catch{}
  if(i<39)await wait(15000);
 }
 throw new Error('The expected release did not become healthy. Inspect the host and roll back if necessary.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await deploy(process.env);console.log('Expected release is healthy.');}catch{console.error('Deployment failed. Verify environment settings and host status. Secret URLs and tokens are not printed.');process.exitCode=1;}}
