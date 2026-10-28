import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createLocalEvidenceProvider } from '../src/protected-local.mjs';
import { createLocalQualityReportProvider } from '../src/quality-local.mjs';
import { createRiskAdaptiveQualityPolicy } from '../src/quality-review.mjs';
import { decompose } from '../test-support/domain-fixtures.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'daedal-quality-'));
  mkdirSync(join(workspaceRoot, 'src')); mkdirSync(join(workspaceRoot, 'reports'));
  mkdirSync(join(workspaceRoot, 'test'));
  const src = 'src/feature.mjs', tst = 'test/feature.test.mjs';
  writeFileSync(join(workspaceRoot, src), "export const value = 7;\n");
  writeFileSync(join(workspaceRoot, tst), "import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from '../src/feature.mjs';test('actual',()=>assert.equal(value,7));\n");
  const policy = createRiskAdaptiveQualityPolicy({ assessRisk: () => ({
    door:'two-way',blastRadius:'local',evidenceConfidence:'high' }), profiles: Object.fromEntries(
    ['low','medium','high'].map(tier => [tier,{id:tier,version:'1',checks:[
      {id:'unit',mode:'required'},{id:'spec',mode:'required'}]}])) });
  const quality = createLocalQualityReportProvider({ workspaceRoot, sourcePath: src,
    reportPaths: { unit: 'reports/unit.json', spec: 'reports/spec.json' } });
  const evidence = createLocalEvidenceProvider({ workspaceRoot, artifactPath:src, testPath:tst,
    projectId:'p',goalId:'feature',implementerId:'builder' });
  const verifier = { review({context,subject}) {return {
    reviewerId:'qc',reviewReceipt:'fixture://review',verdict:'pass',subject,
    codeReviewed:true,boundaryReviewed:true,criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))
  };} };
  const seed = {projectId:'p',id:'root',outcome:'Project',acceptance:['Parent E2E'],boundary:{allow:['provider']}};
  const map = createLabyrinth(seed, { qualityPolicy:policy, qualityEvidenceProvider:quality,
    evidenceProvider:evidence, independentVerifier:verifier });
  decompose(map,{id:'feature',parentId:'root',outcome:'Implement',acceptance:['Actual test']});
  const contract = map.issueContract('feature');
  const sourceRevision = sha(readFileSync(join(workspaceRoot,src)));
  const writeReport=(checkId,status='pass',overrides={})=>{
    writeFileSync(join(workspaceRoot,'reports',checkId+'.json'),JSON.stringify({
      checkId, status, projectId:'p', goalId:'feature', contractId:contract.contractId,
      sourceRevision, profileId:contract.qualityProfile.id, profileVersion:contract.qualityProfile.version,
      tool:checkId==='unit'?'node-test':'source-review',toolVersion:'22',...overrides
    }));
  };
  return {workspaceRoot,map,contract,quality,sourceRevision,writeReport,cleanup(){
    rmSync(workspaceRoot,{recursive:true,force:true});
  }};
}
test('real on-disk quality reports enable an actual Node test and independent Goal proof',()=>{
 const f=fixture();try {
  f.writeReport('unit');f.writeReport('spec');
  const result=f.map.verifyGoal({contract:f.contract,evidenceRefs:['artifact','test']});
  assert.equal(result.verdict,'pass');assert.equal(result.quality.status,'pass');
  assert.equal(f.map.navigate('feature').goal.status,'completed');
  assert.equal(f.map.proofs('feature')[0].quality.receipts.length,2);
  assert.match(f.map.proofs('feature')[0].quality.receipts[0].reportSha256,/^[a-f0-9]{64}$/);
 }finally{f.cleanup();}
});
test('report altered after completion invalidates completed proof; missing report becomes UNKNOWN',()=>{
 const f=fixture();try {
  f.writeReport('unit');f.writeReport('spec');
  f.map.verifyGoal({contract:f.contract,evidenceRefs:['artifact','test']});
  f.writeReport('spec','fail');
  assert.equal(f.map.navigate('feature').goal.status,'needs-reverification');
  unlinkSync(join(f.workspaceRoot,'reports','spec.json'));
  assert.equal(f.map.navigate('feature').goal.status,'unresolved');
 }finally{f.cleanup();}
});
test('modified source or forged report source revision cannot produce a quality PASS',()=>{
 const f=fixture();try{
  f.writeReport('unit');f.writeReport('spec','pass',{sourceRevision:'wrong'});
  assert.equal(f.map.verifyGoal({contract:f.contract,evidenceRefs:['artifact','test']}).verdict,'unknown');
  f.writeReport('spec');
  writeFileSync(join(f.workspaceRoot,'src','feature.mjs'),"export const value = 9;\n");
  const bad=f.quality.resolve('spec',{contract:f.contract,sourceRevision:f.sourceRevision,profile:f.contract.qualityProfile});
  assert.equal(bad,null);
 }finally{f.cleanup();}
});

test('actual green test plus a verified failing spec report must BLOCK completion',()=>{
 const f=fixture();try {
  f.writeReport('unit','pass');f.writeReport('spec','fail');
  const result=f.map.verifyGoal({contract:f.contract,evidenceRefs:['artifact','test']});
  assert.equal(result.verdict,'block');
  assert.equal(f.map.navigate('feature').goal.status,'pending');
  assert.equal(f.map.proofs('feature').length,0);
 }finally{f.cleanup();}
});
