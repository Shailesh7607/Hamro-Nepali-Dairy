import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
let checked=0;
function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){if(['node_modules','.git','data','test-results','playwright-report'].includes(entry.name))continue;const file=join(path,entry.name);if(entry.isDirectory())walk(file);else if(/\.(mjs|js)$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}checked++;}}}
walk('.');
for(const page of ['public/shop.html','public/auth.html']){const html=readFileSync(page,'utf8');if(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html))throw new Error('Inline script violates the script-source policy: '+page);}
console.log(`Syntax checked ${checked} JavaScript files; CSP script checks passed.`);
