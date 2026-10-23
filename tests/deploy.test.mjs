import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploy} from '../scripts/deploy.mjs';
const config={DEPLOY_HOOK_URL:'https://deploy.example.invalid/release',DEPLOY_TOKEN:'fixture-only',HEALTH_URL:'https://shop.example.invalid/healthz',RELEASE_IMAGE:'ghcr.io/example/dairy@sha256:'+'a'.repeat(64),RELEASE_SHA:'b'.repeat(40),DEPLOY_ENVIRONMENT:'staging'};
test('deploy sends a digest and waits for the exact healthy release',async()=>{
 let n=0;await deploy(config,async(url,options)=>{
  if(++n===1){assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).image,config.RELEASE_IMAGE);assert.equal(options.redirect,'error');return {ok:true};}
  return {ok:true,json:async()=>({ok:true,release:n===2?'c'.repeat(40):config.RELEASE_SHA})};
 },async()=>{});assert.equal(n,3);
});
test('deployment acceptance without a healthy expected commit fails',async()=>{
 await assert.rejects(deploy(config,async()=>({ok:true,json:async()=>({ok:true,release:'old'})}),async()=>{}),/did not become healthy/);
});
test('deployment refuses HTTP, mutable image tags and unknown environments before sending',async()=>{
 for(const patch of [{DEPLOY_HOOK_URL:'http://deploy.example.invalid'},{RELEASE_IMAGE:'ghcr.io/example/dairy:latest'},{DEPLOY_ENVIRONMENT:'unknown'},{DEPLOY_TOKEN:''}]){
  let sent=false;await assert.rejects(deploy({...config,...patch},async()=>{sent=true}));assert.equal(sent,false);
 }
});
