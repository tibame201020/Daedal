import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createFileSnapshotStore, createProjectResolver } from '../src/durable.mjs';
import { createProtectedLocalWriter, createLocalEvidenceProvider, createSourceBoundVerifier } from '../src/protected-local.mjs';

const risk = { door:'two-way', blastRadius:'local', evidenceConfidence:'high' };
const seed = projectId => ({ projectId, id:'project', outcome:'Use native system through a provider',
 acceptance:['Native integration readback'], boundary:{allow:['provider.implementation'],deny:['native.ownership','harness.core']} });

test('durable multi-session Goal lifecycle: real protected write/test/review, parent proof, live reference reconciliation and source freshness',()=>{
 const directory=mkdtempSync(join(tmpdir(),'daedal-vs5-'));
 const workspaceRoot=join(directory,'workspace'); const stateDir=join(directory,'state');
 mkdirSync(join(workspaceRoot,'src','provider'),{recursive:true});mkdirSync(join(workspaceRoot,'test'));mkdirSync(stateDir);
 try {
  const source=createLabyrinth(seed('source-harness'));
  source.decompose({id:'interface',parentId:'project',outcome:'Published generic interface',
   acceptance:['Generic interface exists'],boundary:{allow:['provider.implementation']}});
  const referenceResolver=createProjectResolver({getProject:id=>id==='source-harness'?source:null});
  const projectSeed=seed('integration');
  const providers=new Map();const reviewers=new Map();
  const ports={referenceResolver,
   evidenceProvider:{
    resolve(reference,input){return providers.get(input.contract.goalId)?.resolve(reference,input)??null;},
    freshness(receipt){return providers.get(receipt.goalId)?.freshness(receipt)??'unresolved';}
   },
   independentVerifier:{review(input){const reviewer=reviewers.get(input.contract.goalId); if(!reviewer)throw Error('reviewer unavailable');return reviewer.review(input);}}
  };
  let store=createFileSnapshotStore({directory:stateDir});
  const stage1=store.transact(projectSeed,ports,map=>{
   map.decompose({id:'feature',parentId:'project',outcome:'Provider adapter obeys generic harness',
    acceptance:['Real native readback'],boundary:{allow:['provider.implementation']}});
   const ref=map.attachReference({fromId:'feature',sourceProjectId:'source-harness',sourceGoalId:'interface',
    expectedVersion:1,actor:'worker'});
   return {ref, contract:map.issueContract('feature')};
  });
  assert.equal(stage1.revision,1);
  const {contract,ref}=stage1.result;
  // A new process or session can rehydrate the issued contract and validate actual operations.
  store=createFileSnapshotStore({directory:stateDir});
  store.read(projectSeed,ports,map=>{
   const writer=createProtectedLocalWriter({labyrinth:map,workspaceRoot,
    routes:[{prefix:'src/provider',capability:'provider.implementation'}]});
   assert.equal(writer.describe().enforcement,'enforced');
   writer.writeNewFile({contract,relativePath:'src/provider/feature.mjs',content:"export const nativeIssue = () => 'ok';\n"});
  });
  writeFileSync(join(workspaceRoot,'test','feature.test.mjs'),
   "import {test} from 'node:test';import assert from 'node:assert/strict';import {nativeIssue} from '../src/provider/feature.mjs';test('integration',()=>assert.equal(nativeIssue(),'ok'));\n");
  for (const goalId of ['feature','project']) {
   providers.set(goalId,createLocalEvidenceProvider({workspaceRoot,artifactPath:'src/provider/feature.mjs',
    testPath:'test/feature.test.mjs',projectId:'integration',goalId,implementerId:'worker'}));
   reviewers.set(goalId,createSourceBoundVerifier({workspaceRoot,artifactPath:'src/provider/feature.mjs',
    reviewerId:'independent-qc',reviewSource({content,context}){
     const outOfScope=content.includes('parallelIssueLifecycle')||content.includes('modifyHarnessCore');
     return {verdict:outOfScope?'fail':'pass',boundaryReviewed:true,findings:outOfScope?['Cross-system ownership drift']:[],
       criterionResults:context.acceptance.map(criterion=>({criterion,passed:!outOfScope}))};
    }}));
  }
  assert.equal(store.transact(projectSeed,ports,map=>map.verifyGoal({contract,evidenceRefs:['artifact','test']}),{expectedRevision:1}).result.goalState,'completed');
  const parent=store.transact(projectSeed,ports,map=>map.issueContract('project'),{expectedRevision:2}).result;
  assert.equal(store.transact(projectSeed,ports,map=>map.verifyGoal({contract:parent,evidenceRefs:['artifact','test']}),{expectedRevision:3}).result.goalState,'completed');
  store=createFileSnapshotStore({directory:stateDir});
  assert.deepEqual(store.read(projectSeed,ports,map=>[map.navigate('feature').goal.status,map.navigate('project').goal.status]),['completed','completed']);
  assert.equal(store.read(projectSeed,ports,map=>map.proofs('project').length),1);

  // The external Project evolves without any write permission being transferred to the integration Project.
  source.reviseGoal({id:'interface',expectedVersion:1,actor:'architect',change:{outcome:'Generic interface revision 2'},decision:risk});
  assert.deepEqual(store.read(projectSeed,ports,map=>[map.navigate('feature').goal.status,map.navigate('project').goal.status]),
   ['needs-reverification','needs-reverification']);
  const updated=store.transact(projectSeed,ports,map=>map.refreshReference({fromId:'feature',
   sourceProjectId:'source-harness',sourceGoalId:'interface',expectedVersion:2,
   expectedRevision:ref.revision,actor:'worker',decision:risk}));
  assert.notEqual(updated.result.revision,ref.revision);
  assert.equal(store.read(projectSeed,ports,map=>map.proofs('feature').length),1); // old receipt retained
  const refreshed=store.transact(projectSeed,ports,map=>map.issueContract('feature')).result;
  assert.equal(store.transact(projectSeed,ports,map=>map.verifyGoal({contract:refreshed,evidenceRefs:['artifact','test'] })).result.goalState,'completed');
  const refreshedParent=store.transact(projectSeed,ports,map=>map.issueContract('project')).result;
  assert.equal(store.transact(projectSeed,ports,map=>map.verifyGoal({contract:refreshedParent,evidenceRefs:['artifact','test']})).result.goalState,'completed');

  // External mutation bypassing the bounded adapter is visible at the next Goal read, not silently accepted.
  writeFileSync(join(workspaceRoot,'test','feature.test.mjs'),"import {test} from 'node:test';test('changed',()=>{});\n");
  assert.deepEqual(store.read(projectSeed,ports,map=>[map.navigate('feature').goal.status,map.navigate('project').goal.status]),
    ['needs-reverification','needs-reverification']);
  assert.equal(source.navigate('interface').goal.outcome,'Generic interface revision 2');
 } finally { rmSync(directory,{recursive:true,force:true}); }
});
