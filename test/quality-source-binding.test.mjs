import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createVerifiedGitSourceBinding } from '../src/quality-source-binding.mjs';
import { createNativeQualityReportProvider } from '../src/quality-native.mjs';
import { buildNativeQualityEvidenceBundle } from '../scripts/quality/build-evidence-bundle.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function repo() {
  const dir=mkdtempSync(join(tmpdir(),'daedal-source-bridge-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  git('init','-q');git('config','core.autocrlf','false');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  mkdirSync(join(dir,'src'));writeFileSync(join(dir,'src','feature.mjs'),'export const value = 7;\n');
  git('add','--','src/feature.mjs');git('commit','-qm','source fixture');
  const commit=git('rev-parse','HEAD');const baseBranch=git('branch','--show-current');
  return {dir,git,commit,baseBranch,sourceRevision:hash(readFileSync(join(dir,'src','feature.mjs'))),
    cleanup(){rmSync(dir,{recursive:true,force:true})}};
}
test('actual tracked Git blob bridges file SHA256 to the exact checked out commit',()=>{
 const r=repo();try{
  const binding=createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:r.commit});
  assert.equal(binding.sourceRevision,r.sourceRevision);assert.equal(binding.commitSha,r.commit);
  assert.equal(binding.sourceMappingVerified,true);
  assert.equal(binding.relativePath,'src/feature.mjs');
  assert.match(binding.gitBlobSha,/^[0-9a-f]{40}$/);
  assert.throws(()=>createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:'a'.repeat(40)}),/commit/);
 }finally{r.cleanup()}
});
test('source edit, untracked source, traversal, and symlink provenance cannot create a bridge',()=>{
 const r=repo();try{
  assert.throws(()=>createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'../outside',expectedCommit:r.commit}),/path|unsafe/);
  writeFileSync(join(r.dir,'src','untracked.mjs'),'untracked');
  assert.throws(()=>createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/untracked.mjs',expectedCommit:r.commit}),/tracked|Git/);
  writeFileSync(join(r.dir,'src','feature.mjs'),'export const value = 9;\n');
  assert.throws(()=>createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:r.commit}),/content|source|mismatch/);
 }finally{r.cleanup()}
});
test('a trusted native report may be checked against a different local artifact digest only through verified Git mapping',()=>{
 const r=repo();try{
  const b=createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:r.commit});
  const report=JSON.stringify({schema:1,kind:'coverage',commit:r.commit,functions:2,measured:2,over_target:0,grade:'A',crap_load:0,lane_failures:{},unmeasured_scopes:[]});
  const reportSha=hash(report);
  const profile={id:'local',version:'1',checks:[{id:'crap',mode:'required'}]};
  const contract={projectId:'p',goalId:'g',contractId:'issued'};
  const raw={bytes:report,runId:'ci-1',reportUri:'ci://crap',tool:'crapkit',toolVersion:'0.8.1'};
  const retrieve=()=>raw;
  const resolve=origin=>createNativeQualityReportProvider({retrieve,verifyOrigin:()=>origin,limits:{crap:{maxOverTarget:0}}})
    .resolve('crap',{contract,profile,sourceRevision:r.sourceRevision});
  assert.equal(resolve({trusted:true,commitSha:r.commit,...b,reportSha256:reportSha}).status,'pass');
  assert.equal(resolve({trusted:true,commitSha:r.commit,reportSha256:reportSha,sourceArtifactSha256:r.sourceRevision}),null);
  assert.equal(resolve({trusted:true,commitSha:r.commit,reportSha256:reportSha,sourceMappingVerified:true,sourceRevision:'b'.repeat(64)}),null);
  assert.equal(resolve({trusted:true,...b,commitSha:'b'.repeat(40),reportSha256:reportSha}),null);
  assert.equal(resolve({trusted:true,...b,commitSha:r.commit,reportSha256:'a'.repeat(64)}),null);
 }finally{r.cleanup()}
});
test('GitHub PR checkout tested commit and branch source commit are distinct identities',()=>{
 const r=repo();try{
  const first=r.commit;
  r.git('checkout','-qb','feature');writeFileSync(join(r.dir,'src','feature.mjs'),'export const value = 8;\n');
  r.git('commit','-qam','feature');
  const head=r.git('rev-parse','HEAD');
  r.git('checkout','-q',r.baseBranch);r.git('checkout','-qb','integration');
  writeFileSync(join(r.dir,'README.md'),'base');r.git('add','README.md');r.git('commit','-qm','base');
  r.git('merge','--no-ff','-qm','test merge','feature');
  const merged=r.git('rev-parse','HEAD');
  assert.notEqual(head,merged);
  const b=createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:merged});
  assert.equal(b.commitSha,merged);
  assert.throws(()=>createVerifiedGitSourceBinding({workspaceRoot:r.dir,relativePath:'src/feature.mjs',expectedCommit:head}),/commit/);
  assert.equal(first.length,40);
 }finally{r.cleanup()}
});

test('native evidence bundle binds actual source, original report digests and tested checkout SHA',()=>{
 const r=repo();try {
  mkdirSync(join(r.dir,'reports'));
  const crap={schema:1,kind:'coverage',commit:r.commit,functions:1,measured:1,over_target:1,grade:'D',crap_load:10,lane_failures:{},unmeasured_scopes:[]};
  const mutation={schemaVersion:'1.0',framework:{name:'StrykerJS'},files:{'src/feature.mjs':{mutants:[{status:'Killed'},{status:'Survived'}]}}};
  const policy={crap:{limits:{maxOverTarget:0}},mutation:{limits:{minMutationScore:80}}};
  for(const [name,obj] of [['crap',crap],['mutation',mutation],['policy',policy]])
   writeFileSync(join(r.dir,'reports',name+'.json'),JSON.stringify(obj));
  const args={workspaceRoot:r.dir,sourcePath:'src/feature.mjs',crapPath:'reports/crap.json',
   mutationPath:'reports/mutation.json',policyPath:'reports/policy.json',
   eventName:'push',expectedCheckoutSha:r.commit};
  const bundle=buildNativeQualityEvidenceBundle(args);
  assert.equal(bundle.testedCommit,r.commit);
  assert.equal(bundle.source.sha256,r.sourceRevision);
  assert.equal(bundle.metrics.crap.status,'fail');
  assert.equal(bundle.metrics.mutation.status,'fail');
  assert.equal(bundle.reports.crap.sha256,hash(readFileSync(join(r.dir,'reports','crap.json'))));
  assert.throws(()=>buildNativeQualityEvidenceBundle({...args,expectedCheckoutSha:'a'.repeat(40)}),/commit/);
  assert.throws(()=>buildNativeQualityEvidenceBundle({...args,eventName:'pull_request',pullRequestHeadSha:r.commit}),/PR HEAD/);
  writeFileSync(join(r.dir,'reports','crap.json'),JSON.stringify({...crap,commit:'b'.repeat(40)}));
  assert.throws(()=>buildNativeQualityEvidenceBundle(args),/crapkit.*commit/);
 }finally{r.cleanup()}
});
