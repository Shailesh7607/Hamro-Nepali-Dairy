// Run from the repository root after staging the changes you want to publish.
import {spawnSync} from 'node:child_process';
function git(args){const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw new Error('Git command failed. Check your Git installation, branch and GitHub sign-in.');return r.stdout.trim();}
try{
 const remote=git(['remote','get-url','origin']);
 if(!/^(https:\/\/github\.com\/|git@github\.com:)Shailesh7607\/Hamro-Nepali-Dairy(?:\.git)?$/i.test(remote))throw new Error('Origin must point to Shailesh7607/Hamro-Nepali-Dairy.');
 const branch=git(['branch','--show-current']);if(!branch)throw new Error('Switch to a branch before syncing.');
 const staged=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean);
 if(staged.some(p=>/(^|\/)(\.env($|\.)|node_modules\/|data\/|backups\/)|\.(pem|key|crt|cer|sqlite|db)$/i.test(p)&&p!=='.env.example'))throw new Error('A staged file may contain private settings or data. Unstage it before syncing.');
 if(git(['diff','--cached','--name-only','-z'])){
  const message=process.argv.slice(2).join(' ').trim();if(!message)throw new Error('Provide a commit message.');
  const test=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-isolation=none','tests/*.test.mjs'],{stdio:'inherit'});
  if(test.status!==0)throw new Error('Tests failed. No commit or push was made.');
  git(['commit','-m',message]);
 }
 git(['push','--set-upstream','origin',branch]);console.log('Pushed to GitHub. Check the Actions tab for CI results.');
}catch(error){console.error(error.message);process.exitCode=1;}
