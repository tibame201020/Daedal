import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createProjectResolver } from '../src/durable.mjs';
import { decompose } from '../test-support/domain-fixtures.mjs';
import { summarizeGitHubReviews } from '../src/quality-native.mjs';

const low = {door:'two-way',blastRadius:'local',evidenceConfidence:'high'};
const seed = projectId => ({projectId,id:'root',outcome:'Project',acceptance:['Real native E2E'],boundary:{allow:['adapter'],deny:['native.issues']}});
const gate = () => ({accepted:true,receipt:'fixture://decision',reviewer:'independent-qc'});

test('Q17/Q22 a source descendant Acceptance revision invalidates reference, unrelated sibling does not',()=>{
 const source=createLabyrinth(seed('source'),{decisionGate:gate});
 decompose(source,{id:'api',parentId:'root',outcome:'API',acceptance:['Stable interface']});
 decompose(source,{id:'child',parentId:'api',outcome:'Sub-goal',acceptance:['Native API E2E']});
 decompose(source,{id:'sibling',parentId:'root',outcome:'Unrelated',acceptance:['Unrelated acceptance']});
 const consumer=createLabyrinth(seed('consumer'),{referenceResolver:createProjectResolver({getProject:id=>id==='source'?source:null})});
 decompose(consumer,{id:'consumer',parentId:'root',outcome:'Uses API',acceptance:['Integration']});
 consumer.attachReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'api',expectedVersion:1,actor:'worker'});
 const contract=consumer.issueContract('consumer');
 assert.equal(consumer.contractStatus(contract).status,'current');
 source.reviseGoal({id:'sibling',expectedVersion:1,actor:'architect',change:{acceptance:['Different']},decision:low});
 assert.equal(consumer.contractStatus(contract).status,'current');
 source.reviseGoal({id:'child',expectedVersion:1,actor:'architect',change:{acceptance:['Mock-only proof']},decision:low});
 assert.equal(consumer.contractStatus(contract).status,'stale');
});

test('Q11 mandatory navigate provides ancestor acceptance and accepted revision decisions',()=>{
 const map=createLabyrinth(seed('project'),{decisionGate:gate});
 map.reviseGoal({id:'root',expectedVersion:1,actor:'architect',change:{acceptance:['Actual end-to-end acceptance']},decision:low});
 decompose(map,{id:'feature',parentId:'root',outcome:'Feature',acceptance:['Own acceptance']});
 const nav=map.navigate('feature',{retrieved:[]});
 assert.deepEqual(nav.ancestors[0].acceptance,['Actual end-to-end acceptance']);
 assert.deepEqual(nav.acceptance,['Own acceptance']);
 assert.equal(nav.acceptedDecisions.some(x=>x.type==='revise-goal' && x.id==='root' && x.actor==='architect' && x.gateReceipt==='fixture://decision'),true);
 assert.equal(nav.ancestors[0].boundary.deny.includes('native.issues'),true);
});

test('Q19 a source becoming stale during independent review must not record PASS/proof',()=>{
 let changed=false;
 const evidenceProvider={
  resolve(reference,{contract}){return {reference,kind:reference,sourceUri:'fixture://'+reference,sha256:'a'.repeat(64),sourceRevision:'build1',implementerId:'worker',projectId:contract.projectId,goalId:contract.goalId,contractId:contract.contractId,verified:true,passed:true};},
  freshness(){return changed?'stale':'current';}
 };
 const verifier={review({subject,context}){changed=true;return {reviewerId:'qc',reviewReceipt:'fixture://review',subject,codeReviewed:true,boundaryReviewed:true,verdict:'pass',criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))};}};
 const map=createLabyrinth(seed('p'),{evidenceProvider,independentVerifier:verifier});
 const contract=map.issueContract('root');
 assert.throws(()=>map.verifyGoal({contract,evidenceRefs:['artifact','test']}),/evidence.*stale|stale.*evidence|changed during review/);
 assert.equal(map.proofs('root').length,0);
 assert.equal(map.navigate('root').goal.status,'pending');
});

test('P2 GitHub review reduction honors newest effective action for each reviewer',()=>{
 const sha='a'.repeat(40), ctx={sourceRevision:sha,implementerId:'worker'};
 const old={reviewerId:'qc',commitId:sha,state:'CHANGES_REQUESTED',submittedAt:'2026-10-26T08:00:00Z',id:7};
 const updated={...old,state:'APPROVED',submittedAt:'2026-10-27T08:00:00Z',id:8};
 assert.equal(summarizeGitHubReviews([old,updated],ctx).status,'pass');
 assert.equal(summarizeGitHubReviews([updated,old],ctx).status,'pass');
 assert.equal(summarizeGitHubReviews([updated,{...old,id:9,submittedAt:'2026-10-27T09:00:00Z'}],ctx).status,'fail');
 assert.equal(summarizeGitHubReviews([old,{...updated,id:8,submittedAt:undefined}],ctx).status,'unknown');
 const sameSecond={...updated,id:9,submittedAt:old.submittedAt};
 assert.equal(summarizeGitHubReviews([old,sameSecond],ctx).status,'pass');
 assert.equal(summarizeGitHubReviews([old,{...sameSecond,id:undefined}],ctx).status,'unknown');
});


test('an unavailable freshness check is not accepted as proof after review',()=>{
 const evidenceProvider={resolve(reference,{contract}){return {reference,kind:reference,sourceUri:'fixture://'+reference,
  sha256:'a'.repeat(64),sourceRevision:'build-1',implementerId:'worker',projectId:contract.projectId,
  goalId:contract.goalId,contractId:contract.contractId,verified:true,passed:true};},
  freshness(){throw new Error('origin is offline');}};
 const independentVerifier={review({subject,context}){return {reviewerId:'qc',reviewReceipt:'fixture://review',subject,
  codeReviewed:true,boundaryReviewed:true,verdict:'pass',
  criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))};}};
 const map=createLabyrinth(seed('p'),{evidenceProvider,independentVerifier});
 assert.throws(()=>map.verifyGoal({contract:map.issueContract('root'),evidenceRefs:['artifact','test']}),/evidence.*unresolved/);
 assert.equal(map.proofs('root').length,0);
});

test('GitHub review dismissal and other reviewers do not manufacture an independent approval',()=>{
 const sha='b'.repeat(40),ctx={sourceRevision:sha,implementerId:'worker'};
 const approve={reviewerId:'qc',commitId:sha,state:'APPROVED',submittedAt:'2026-10-26T08:00:00Z',id:1};
 const dismissed={...approve,state:'DISMISSED',submittedAt:'2026-10-27T08:00:00Z',id:2};
 assert.equal(summarizeGitHubReviews([approve,dismissed],ctx).status,'unknown');
 assert.equal(summarizeGitHubReviews([approve,dismissed,{...approve,reviewerId:'another',id:3}],ctx).status,'pass');
 assert.equal(summarizeGitHubReviews([approve,{...approve,reviewerId:'another',state:'CHANGES_REQUESTED',id:3}],ctx).status,'fail');
});
