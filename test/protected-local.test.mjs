import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProtectedLocalWriter, createLocalEvidenceProvider, createSourceBoundVerifier } from '../src/protected-local.mjs';

const fresh = () => {
 const root = mkdtempSync(join(tmpdir(), 'daedal-fixture-'));
 mkdirSync(join(root,'src','provider'),{recursive:true}); mkdirSync(join(root,'test'));
 const valid = { contractId:'issued', projectId:'synthetic-project', goalId:'feature', boundary:{allow:['provider.implementation']}};
 let current=true;
 const labyrinth={contractStatus(c){ if(c !== valid)throw new Error('unknown or altered issued contract');return {status:current?'current':'stale'};}, checkCapability(id,cap){return {allowed:id==='feature'&&cap==='provider.implementation'};}};
 const writer=createProtectedLocalWriter({labyrinth,workspaceRoot:root,routes:[{prefix:'src/provider',capability:'provider.implementation'}]});
 return {root,writer,valid,stale(){current=false;},cleanup(){rmSync(root,{recursive:true,force:true})}};
};

test('enforced adapter creates a real file inside host route; domain contract alone remains advisory',()=>{
 const f=fresh();try{
  assert.equal(f.writer.describe().enforcement,'enforced');
  const result=f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/index.mjs',content:"export const value = 'ok';\n"});
  assert.equal(result.enforcement,'enforced');assert.equal(result.capability,'provider.implementation');
  assert.equal(readFileSync(join(f.root,'src/provider/index.mjs'),'utf8'),"export const value = 'ok';\n");
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
 }finally{f.cleanup();}
});

test('stale, forged, out-of-scope, traversal and overwrite are denied before touching protected files',()=>{
 const f=fresh();try{
  assert.throws(()=>f.writer.writeNewFile({contract:{...f.valid},relativePath:'src/provider/a.mjs',content:'X'}),/issued contract/);
  for(const path of ['../escape.mjs','/tmp/out.mjs','src/provider/../escape.mjs','src\\provider\\escape.mjs','src/provider/missing/a.mjs','src/other.mjs'])
    assert.throws(()=>f.writer.writeNewFile({contract:f.valid,relativePath:path,content:'X'}));
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/a.mjs',content:'GOOD'});
  assert.throws(()=>f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/a.mjs',content:'BAD'}));
  assert.equal(readFileSync(join(f.root,'src/provider/a.mjs'),'utf8'),'GOOD');
  f.stale();assert.throws(()=>f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/b.mjs',content:'X'}),/stale/);
 }finally{f.cleanup();}
});

test('symlink parents and last component are refused by the protected seam',(t)=>{
 const f=fresh();try{
  try { symlinkSync(f.root,join(f.root,'src/provider/link')); }
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) { t.skip('host lacks symlink creation privilege'); return; }
    throw error;
  }
  assert.throws(()=>f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/link/escape.mjs',content:'X'}),/symlink/);
  symlinkSync(join(f.root,'test'),join(f.root,'src/provider/linkfile'));
  assert.throws(()=>f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/linkfile',content:'X'}));
 }finally{f.cleanup();}
});

test('real local evidence provider hashes actual artifact and runs test; source-bound reviewer receives actual code',()=>{
 const f=fresh();try{
  const source="export const nativeIssue = () => 'ok';\n";
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:source});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import { test } from 'node:test'; import assert from 'node:assert/strict'; import {nativeIssue} from '../src/provider/feature.mjs'; test('native issue',()=>assert.equal(nativeIssue(),'ok'));\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  const artifact=provider.resolve('artifact',{contract:f.valid}), result=provider.resolve('test',{contract:f.valid});
  assert.equal(result.passed,true);assert.equal(artifact.sourceRevision,result.sourceRevision);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  let inspected='';const verifier=createSourceBoundVerifier({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',reviewerId:'qc',reviewSource({content,context}){
    inspected=content;return {verdict:'pass',boundaryReviewed:true,criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))};
  }});
  const subject={contractId:f.valid.contractId,goalVersion:1,pins:[],sourceRevision:artifact.sourceRevision};
  const verdict=verifier.review({contract:f.valid,sources:[artifact,result],subject,context:{acceptance:['Native readback']}});
  assert.equal(inspected,source);assert.equal(verdict.verdict,'pass');assert.equal(verdict.codeReviewed,true);assert.match(verdict.reviewReceipt,/^sha256:/);
  assert.equal(provider.resolve('invented',{contract:f.valid}),null);
 }finally{f.cleanup();}
});

test('green test does not override actual source-based scope rejection',()=>{
 const f=fresh();try{
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:"export const nativeIssue = () => 'ok'; export const parallelIssueLifecycle = true;\n"});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('green',()=>{});\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  const artifact=provider.resolve('artifact',{contract:f.valid}), outcome=provider.resolve('test',{contract:f.valid});
  assert.equal(outcome.passed,true);
  const verifier=createSourceBoundVerifier({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',reviewerId:'qc',reviewSource({content,context}){
    const drift=content.includes('parallelIssueLifecycle');return {verdict:drift?'fail':'pass',boundaryReviewed:true,findings:drift?['parallel lifecycle outside adapter boundary']:[],criterionResults:context.acceptance.map(criterion=>({criterion,passed:!drift}))};
  }});
  const decision=verifier.review({contract:f.valid,sources:[artifact,outcome],subject:{contractId:f.valid.contractId,goalVersion:1,pins:[],sourceRevision:artifact.sourceRevision},context:{acceptance:['Native readback']}});
  assert.equal(decision.verdict,'fail');assert.match(decision.findings[0],/parallel lifecycle/);
 }finally{f.cleanup();}
});

test('tampering source after artifact observation prevents reviewer from accepting stale source',()=>{
 const f=fresh();try{
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:"export const v = 1;\n"});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('green',()=>{});\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  const artifact=provider.resolve('artifact',{contract:f.valid});
  writeFileSync(join(f.root,'src/provider/feature.mjs'),"export const v = 2;\n"); // external change, outside protected adapter
  const verifier=createSourceBoundVerifier({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',reviewerId:'qc',reviewSource(){throw Error('must not run');}});
  assert.throws(()=>verifier.review({contract:f.valid,sources:[artifact],context:{acceptance:['OK']},subject:{sourceRevision:artifact.sourceRevision}}),/source changed/);
 }finally{f.cleanup();}
});

test('failing real test output remains failed despite successful artifact read',()=>{
 const f=fresh();try{
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:'export const v = 1;\n'});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; import assert from 'node:assert/strict'; test('red',()=>assert.equal(1,2));\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  assert.equal(provider.resolve('test',{contract:f.valid}).passed,false);
 }finally{f.cleanup();}
});

test('source mutation during review cannot be accepted, even if reviewer returned pass',()=>{
 const f=fresh();try{
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:'export const v = 1;\n'});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('green',()=>{});\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  const artifact=provider.resolve('artifact',{contract:f.valid});
  const verifier=createSourceBoundVerifier({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',reviewerId:'qc',reviewSource({context}){
    writeFileSync(join(f.root,'src/provider/feature.mjs'),'export const v = 2;\n');
    return {verdict:'pass',boundaryReviewed:true,criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))};
  }});
  assert.throws(()=>verifier.review({contract:f.valid,sources:[artifact],context:{acceptance:['OK']},subject:{sourceRevision:artifact.sourceRevision}}),/changed during review/);
 }finally{f.cleanup();}
});

test('source/test freshness is checked against actual bytes after acceptance and missing sources remain unresolved',()=>{
 const f=fresh();try{
  f.writer.writeNewFile({contract:f.valid,relativePath:'src/provider/feature.mjs',content:'export const v = 1;\n'});
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('green',()=>{});\n");
  const provider=createLocalEvidenceProvider({workspaceRoot:f.root,artifactPath:'src/provider/feature.mjs',
    testPath:'test/feature.test.mjs',projectId:'synthetic-project',goalId:'feature',implementerId:'worker'});
  const artifact=provider.resolve('artifact',{contract:f.valid}), testRun=provider.resolve('test',{contract:f.valid});
  assert.equal(testRun.passed,true);
  assert.match(testRun.testSourceSha256,/^[a-f0-9]{64}$/);
  const receipt={projectId:'synthetic-project',goalId:'feature',sources:[artifact,testRun]};
  assert.equal(provider.freshness(receipt),'current');
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('different',()=>{});\n");
  assert.equal(provider.freshness(receipt),'stale');
  writeFileSync(join(f.root,'test','feature.test.mjs'),"import {test} from 'node:test'; test('green',()=>{});\n");
  writeFileSync(join(f.root,'src/provider/feature.mjs'),'export const v = 2;\n');
  assert.equal(provider.freshness(receipt),'stale');
  rmSync(join(f.root,'src/provider/feature.mjs'));
  assert.equal(provider.freshness(receipt),'unresolved');
 }finally{f.cleanup();}
});
