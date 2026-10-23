import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupDiagnostic} from '../scripts/setup-database.mjs';
test('setup diagnostics classify failures without exposing connection details',()=>{
 const secret='postgresql://user:secret-password@private-host/db';
 for(const [code,expected] of [['28P01','28P01'],['ENOTFOUND','ENOTFOUND'],['SELF_SIGNED_CERT_IN_CHAIN','CERTIFICATE'],['ERR_INVALID_URL','INVALID_URL'],['arbitrary-secret','UNKNOWN']]){
  const result=setupDiagnostic({code,message:secret,detail:secret,stack:secret});
  assert.ok(result.startsWith(`[${expected}]`));assert.ok(!result.includes(secret));assert.ok(!result.includes('secret-password'));
 }
 assert.ok(setupDiagnostic({message:'Connection terminated due to connection timeout'}).startsWith('[ETIMEDOUT]'));
});
