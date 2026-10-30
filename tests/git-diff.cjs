// Verify the diff parser against real Git output, including tricky filenames and CRLF content.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const html=fs.readFileSync(path.join(__dirname,'../gitea_contribution.html'),'utf8');
const parser=html.slice(html.indexOf('function gitPath('),html.indexOf('async function commitDetail('));
const context={TextEncoder,TextDecoder,Uint8Array};vm.createContext(context);vm.runInContext(parser,context);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gitea-diff-test-'));
const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}});
try{
 git('init','-q');
 const write=(name,data)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),data)};
 write('test.py','old\r\ncontext\r\n');write('remove.py','delete\n');write('old name','unchanged\n');write('測試.py','a\n');write('image.bin',Buffer.from([0,1,2]));write('path b/part','before\n');write('space\tname','before\n');
 git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture\n\ndiff --git a/fake b/fake\n+not an addition');
 // Match the exact root-commit command used by Gitea 1.12's GetRepoRawDiffForFile.
 context.expectedSHA=git('rev-parse','HEAD').trim();context.diff=git('show',context.expectedSHA);
 const root=vm.runInContext('parseDiff(diff,expectedSHA)',context);
 const rootStats=git('diff-tree','--root','--no-commit-id','--numstat','-r','HEAD').trim().split('\n').map(l=>l.split('\t'));
 assert.equal(root.stats.add,rootStats.reduce((n,r)=>n+(r[0]==='-'?0:Number(r[0])),0));
 assert.equal(root.stats.del,0);assert.equal(root.files.length,rootStats.length);
 assert(root.files.includes('測試.py'));assert(root.files.includes('space\tname'));
 console.log('PASS: legacy root-commit git show matches git diff-tree --root --numstat; indented message excluded');
 write('test.py','new\r\ncontext\r\n+++ extra\r\n');fs.unlinkSync(path.join(dir,'remove.py'));fs.renameSync(path.join(dir,'old name'),path.join(dir,'new name'));write('測試.py','a\nb\n');write('image.bin',Buffer.from([0,3,4]));write('path b/part','after\n');write('space\tname','after\n');write('empty','');
 git('add','.');context.diff=git('diff','--cached','--no-ext-diff','--no-color','-M');
 const parsed=vm.runInContext('parseDiff(diff)',context);
 const stats=git('diff','--cached','--no-ext-diff','--numstat','-M').trim().split('\n').map(l=>l.split('\t'));
 assert.equal(parsed.stats.add,stats.reduce((n,r)=>n+(r[0]==='-'?0:Number(r[0])),0));
 assert.equal(parsed.stats.del,stats.reduce((n,r)=>n+(r[1]==='-'?0:Number(r[1])),0));
 assert.equal(parsed.files.length,stats.length);
 for(const name of ['測試.py','new name','remove.py','path b/part','space\tname','empty'])assert(parsed.files.includes(name),name);
 console.log('PASS: unified diff parser matches real git --numstat for text, CRLF, UTF-8/tab/space paths, rename, deletion, empty file and binary changes');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
