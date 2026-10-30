'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../gitea_contribution.html'),'utf8');
const spec12=require('./fixtures/v1.12.0-capabilities.json');
const spec15=require('./fixtures/v1.15.0-capabilities.json');
const sha='1'.repeat(40),mergeSHA='2'.repeat(40),otherSHA='3'.repeat(40);
const c={sha,parents:[{sha:otherSHA}],commit:{author:{email:'me@example.com',date:'2026-02-01T00:00:00+08:00'},committer:{email:'me@example.com',date:'2026-02-01T00:00:00+08:00'},message:'Legacy contribution'}};
const merged={...c,sha:mergeSHA,parents:[{sha:otherSHA},{sha}],commit:{...c.commit,message:'Merge legacy PR'}};
const outside={...c,sha:otherSHA,commit:{...c.commit,committer:{email:'me@example.com',date:'2027-01-01T00:00:00+08:00'}}};
const pr={number:1,merged:true,merge_commit_sha:mergeSHA,body:'Refs Requests/Tasks#396',title:'Legacy PR',merged_at:'2026-03-01T00:00:00Z',user:{id:9}};
const diff='diff --git a/test.py b/test.py\nindex 111..222 100644\n--- a/test.py\n+++ b/test.py\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n+another\n';
const rootDiff='diff --git a/test.py b/test.py\nnew file mode 100644\nindex 0000000..2222222\n--- /dev/null\n+++ b/test.py\n@@ -0,0 +1,3 @@\n+context\n+new\n+another\n';
const showHeader='commit '+sha+'\nAuthor: Developer <me@example.com>\nDate:   Sun Feb 1 00:00:00 2026 +0800\n\n    First commit\n\n    diff --git a/fake b/fake\n    +message content is not a change\n\n';
const patch='From '+sha+' Mon Sep 17 00:00:00 2001\nFrom: Developer <me@example.com>\nDate: Sun, 1 Feb 2026 00:00:00 +0800\nSubject: [PATCH] Legacy contribution\n\n---\n'+diff;
function setup(mode='12',options={}){
 const record=options.root?{...c,parents:[]}:options.knownFields?{...c,stats:{additions:7,deletions:null},files:[{filename:'test.py'}]}:c;
 const elements=new Map(),requests=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,innerHTML:'',textContent:'',dataset:{},listeners:{},classList:{toggle(){}},addEventListener(t,f){this.listeners[t]=f},append(p){this.innerHTML+=p.textContent},replaceChildren(){this.innerHTML=''}});return elements.get(id)};
 const response=(data,headers={},status=200)=>({ok:status>=200&&status<300,status,headers:{get:k=>headers[k]??null},json:async()=>data,text:async()=>data});
 const ctx={URL,console,TextEncoder,TextDecoder,Uint8Array,AbortController,DOMException,Blob,setTimeout,clearTimeout,confirm:()=>true,btoa:s=>Buffer.from(s,'binary').toString('base64'),location:{origin:'http://drc:8080'},window:{addEventListener(){}},document:{getElementById:el,querySelectorAll:()=>[],createElement:()=>({})}};
 ctx.fetch=async(url,opts)=>{
   const u=new URL(url),p=u.pathname,pg=Number(u.searchParams.get('page')||1);
   requests.push({path:p,query:Object.fromEntries(u.searchParams),credentials:opts.credentials});
   if(p.endsWith('/swagger.v1.json'))return options.noSchema?response({}, {},404):response(mode==='12'?spec12:spec15);
   if(p.endsWith('/api/v1/user'))return response({id:1,login:'me',email:'me@example.com'});
   if(p.endsWith('/version'))return response({}, {},404); // Version is not required.
   if(p.endsWith('/repos/search'))return response({data:[{id:1,full_name:'Org/Code',default_branch:'main'}]},{'X-Total-Count':'1'});
   if(p.endsWith('/user/repos'))return response([]);
   if(p.endsWith('/branches')){
     if(mode==='12'&&!options.noSchema)assert(!u.searchParams.has('page'));
     return response([{name:'main'}],(mode==='15'||options.noSchema&&!options.repeat)?{'X-HasMore':'false'}:{});
   }
   if(p.endsWith('/pulls/1/commits')){
     if(mode==='12'&&!options.noSchema)throw new Error('Unsupported endpoint must not be requested');
     return response({}, {},404); // 404 can be per-PR, not proof that the whole server lacks the API.
   }
   if(p.endsWith('/pulls/1.patch')){
     if(p.includes('/api/v1/')&&options.apiPatch404)return response({}, {},404);
     if(!p.includes('/api/v1/'))assert.equal(opts.credentials,'same-origin');
     if(options.loginHTML)return response('<!doctype html><html>Sign in</html>',{'Content-Type':'text/html'});
     return response(options.partialPatch?patch+patch.replaceAll(sha,otherSHA):patch,{'Content-Type':'text/plain'});
   }
   if(p.endsWith('/pulls/1'))return response(pr);
   if(p.endsWith('/pulls')&&options.stopAtPR){vm.runInContext('S.controller.abort()',ctx);throw new DOMException('Stop','AbortError');}
   if(p.endsWith('/pulls'))return response([pr],{'Link':'<http://drc:8080/gitea/api/v1/repos/Org/Code/pulls?page=1>; rel="last"','X-Total-Count':'1'});
   if(options.partialPatch&&p.endsWith('/git/commits/'+otherSHA))return response({}, {},404);
   if(p.includes('/git/commits/'))return options.detail404&&p.endsWith('/'+sha)?response({}, {},404):response(p.endsWith('/'+sha)?record:merged);
   if(p.endsWith('/commits')){
     if(!options.noSchema)assert(!u.searchParams.has('since'),'old API does not support date filter');
     return pg===1?response([record,merged,outside],{'X-Page':'1','X-PageCount':'1','X-HasMore':'false'}):response([record,merged,outside]);
   }
   if(p.endsWith('.diff')){
     assert.equal(opts.credentials,'same-origin');
     if(options.diff403)return response('',{},403);
     if(options.unrecognized)return response('{"message":"private response contents"}',{'Content-Type':'application/json'});
     if(options.root)return response((options.wrongSHA?showHeader.replace(sha,otherSHA):showHeader)+rootDiff,{'Content-Type':'text/plain'});
     return response(options.truncated?diff.replace('+another\n',''):diff,{'Content-Type':'text/plain'});
   }
   throw new Error('Unexpected '+p);
 };
 vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 const evaluate=s=>vm.runInContext(s,ctx);
 Object.entries({measurement:'legacy',base:'http://drc:8080/gitea',username:'me',secret:'secret',auth:'basic',start:'2026-01-01',end:'2026-12-31',scope:'all'}).forEach(([k,v])=>el(k).value=v);
 return {evaluate,el,requests,ctx};
}
async function scan(mode,opts){const t=setup(mode,opts);await t.evaluate('loadCatalog()');t.evaluate("S.selected.add('Org/Code')");await t.evaluate('run()');return t;}
(async()=>{
 // Final-result mode counts first-parent history, attributes verified PRs to merger, and never reads PR patches.
 const final=setup(),fe=final.evaluate,hash=n=>String(n).repeat(40);
 const record=(n,parents,email='me@example.com',message='Direct commit')=>({...c,sha:hash(n),parents:parents.map(n=>({sha:hash(n)})),commit:{...c.commit,author:{...c.commit.author,email:'someoneelse@example.com'},committer:{...c.commit.committer,email},message}});
 const mainMerge=record(1,[2,9],'other@example.com','Merge (#10)');mainMerge.stats={additions:999,deletions:999};mainMerge.files=[{filename:'wrong'}];
 const squash=record(2,[3],'me@example.com','Squash (#11)');
 const rebase=record(3,[4]);const direct=record(4,[5]);const foreign=record(5,[6],'me@example.com','Other merger (#12)');
 const rootRecord=record(6,[]);rootRecord.commit={...rootRecord.commit,committer:{...rootRecord.commit.committer,date:'2024-01-01T00:00:00Z'}};
 const feature=record(9,[6]);const records=[mainMerge,squash,rebase,direct,foreign,feature,rootRecord];const finalRequests=[];
 final.ctx.fetch=async url=>{const u=new URL(url),p=u.pathname;finalRequests.push(p);let data;
   if(p.endsWith('/commits')&&!p.includes('/git/'))data=records;
   else if(p.includes('/git/commits/'))data=records.find(c=>c.sha===p.split('/').at(-1));
   else if(/\/pulls\/(10|11|12)$/.test(p)){const n=Number(p.split('/').at(-1));data={...pr,number:n,merge_commit_sha:hash(n===10?1:n===11?2:5),merged_by:{id:n===12?99:1,login:n===12?'other':'me'}};}
   else if(p.endsWith('.diff'))data=diff;
   else throw Error('Unexpected final-mode request '+p);
   return {ok:true,status:200,headers:{get:k=>k==='X-HasMore'?'false':null},json:async()=>data,text:async()=>data};
 };
 fe("S.base='http://drc:8080/gitea';S.headers={};S.controller=new AbortController();S.email='me@example.com';S.user={id:1,login:'me'};S.range={start:Date.parse('2026-01-01'),end:Date.parse('2027-01-01')};S.measurement='final'");
 await fe("scanRepo({full_name:'Org/Code',default_branch:'main'})");
 assert.equal(fe('S.rows.size'),4);assert.equal(fe('aggregate(filtered()).add'),8);assert.equal(fe('aggregate(filtered()).del'),4);assert.equal(fe('S.prs.size'),2);assert(!fe('S.rows.has("Org/Code@"+"9".repeat(40))'));assert(!fe('S.rows.has("Org/Code@"+"5".repeat(40))'));assert(!finalRequests.some(p=>p.endsWith('.patch')||p.endsWith('/pulls')||/\/pulls\/\d+\/commits/.test(p)));assert(fe('csvData()').includes('PR merged_by'));assert(fe('csvData()').includes('statistics_state'));
 console.log('PASS: final mode first-parent traversal; merged_by overrides committer/author; squash, normal merge, rebase and direct contributions; no original PR history requests');

 // Multiple result repos affect every view and CSV without more requests.
 fe("S.rows.set('Team/Other@copy',{...S.rows.values().next().value,repo:'Team/Other',sha:'copy',prs:new Set()});render()");
 fe("S.scanRepos=['Org/Code','Team/Other','Empty/NoResults'];S.prs.set('Empty/PR#1',{repo:'Empty/PR'});render()");
 assert.deepEqual(Array.from(fe('resultRepoNames()')),['Org/Code','Team/Other']);assert(!final.el('repoFilter').innerHTML.includes('Empty/'));assert(final.el('repoFilter').innerHTML.includes('4 筆'));assert(final.el('repoFilter').innerHTML.includes('<small>Org</small><strong>Code</strong>'));
 fe("S.prs.delete('Empty/PR#1')");
 const originalMarkup=final.el('repoFilter').innerHTML;
 fe("selectResultRepo('Team/Other',false)");assert.equal(final.el('repoFilter').innerHTML,originalMarkup,'selection keeps checkbox DOM stable');
 final.el('resultRepoSearch').value='team';fe('renderResultRepos()');assert(!final.el('repoFilter').innerHTML.includes('<strong>Code</strong>'));assert.equal(fe('filtered().length'),4,'search only filters options');
 final.el('resultRepoSearch').value='not-found';fe('renderResultRepos()');assert(final.el('repoFilter').innerHTML.includes('沒有符合名稱'));assert.equal(fe('filtered().length'),4);
 final.el('resultRepoSearch').value='';final.el('resultReposAll').onclick();
 const beforeFilters=finalRequests.length;
 fe("selectResultRepo('Org/Code',false)");assert.equal(fe('filtered().length'),1);assert.equal(fe('aggregate(filtered()).add'),2);assert(!fe('csvData()').includes('Requests/Tasks#396'));
 for(const tab of ['repos','issues','prs']){fe('S.tab='+JSON.stringify(tab)+';render()');assert.equal(fe('viewData(filtered()).length'),tab==='repos'?1:0);}
 fe("selectResultRepo('Org/Code',true);S.tab='commits';render()");assert.equal(fe('filtered().length'),5);
 final.el('resultReposNone').onclick();assert.equal(fe('filtered().length'),0);assert.equal(final.el('export').disabled,true);assert(final.el('repoFilterSummary').textContent.includes('未選取'));
 final.el('resultReposAll').onclick();assert.equal(fe('filtered().length'),5);assert.equal(finalRequests.length,beforeFilters);
 fe("selectResultRepo('Team/Other',false)");final.el('query').value='Squash';fe('render()');assert.equal(fe('filtered().length'),1);final.el('query').value='';
 console.log('PASS: only repos with records; card counts; option search preserves selection; stable checkbox DOM');
 console.log('PASS: result repo multi-select, clear/all, every view, CSV, combined search and no network requests');
 for(const id of ['otp','email','measurement','scope','requestDebug'])assert(!html.includes('id="'+id+'"'));
 assert(!html.includes('debugRequest'));assert(!html.includes('function pullCommits'));assert(!html.includes('function addRow'));
 final.ctx.fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({id:1,login:'me',email:'me@example.com'})});
 await fe('identify()');assert.equal(fe('S.email'),'me@example.com');
 final.ctx.fetch=()=>new Promise(()=>{});fe('S.controller=new AbortController()');const pending=fe("api('/stalled')");fe('S.controller.abort()');await assert.rejects(pending,e=>e.name==='AbortError');
 final.el('clear').onclick();assert.equal(final.el('secret').value,'');assert.equal(fe('S.email'),'');
 console.log('PASS: removed controls/code; automatic account email; cancellation and clear');
})().catch(e=>{console.error(e);process.exitCode=1});
