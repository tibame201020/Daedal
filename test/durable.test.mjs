import { decompose, relate } from '../test-support/domain-fixtures.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createFileSnapshotStore, createProjectResolver } from '../src/durable.mjs';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const seed = projectId => ({ projectId, id: 'root', outcome: 'Deliver native integration',
  acceptance: ['Integration independently verified'],
  boundary: { allow: ['adapter.integration'], deny: ['native.ownership'] } });
const add = (map,id='feature') => decompose(map, { id, parentId:'root', outcome:'Use native capability',
  acceptance:['Real E2E'], boundary:{allow:['adapter.integration']} });
const port = {
  evidenceProvider: { resolve(ref,{contract}) { return ({ artifact:{kind:'artifact',sha256:'a'.repeat(64),sourceUri:'fixture://real-diff'},
    test:{kind:'test',sha256:'b'.repeat(64),sourceUri:'fixture://test-run'} })[ref] && ({
      reference:ref, kind:ref, sha256:ref==='artifact'?'a'.repeat(64):'b'.repeat(64), sourceUri:'fixture://'+ref,
      sourceRevision:'source-r1', verified:true,passed:true,projectId:contract.projectId,goalId:contract.goalId,
      contractId:contract.contractId, implementerId:'worker'
  }); } },
  independentVerifier:{ review({context,subject}) {return {reviewerId:'independent-qc', reviewReceipt:'fixture://review',
    subject, verdict:'pass', codeReviewed:true,boundaryReviewed:true,
    criterionResults:context.acceptance.map(criterion=>({criterion,passed:true}))};} }
};
const temp = () => { const directory=mkdtempSync(join(tmpdir(),'daedal-durable-'));return {directory,cleanup(){rmSync(directory,{recursive:true,force:true});}}; };

test('snapshot restores graph, issued work contract, real proof state and version history without re-verifying old PASS',()=>{
 const map=createLabyrinth(seed('p'),port); add(map);
 const c=map.issueContract('feature'); const r=map.verifyGoal({contract:c,evidenceRefs:['artifact','test']});
 assert.equal(r.goalState,'completed');
 const snapshot=map.exportSnapshot();
 const restored=createLabyrinth(seed('p'),{...port,initialSnapshot:snapshot});
 assert.deepEqual(restored.navigate('feature').goal.status,'completed');
 assert.deepEqual(restored.proofs('feature'),map.proofs('feature'));
 assert.equal(restored.contractStatus(c).status,'current');
 restored.reviseGoal({id:'feature',expectedVersion:1,actor:'worker',change:{outcome:'Updated integration'},
   decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
 assert.equal(restored.navigate('feature').goal.status,'needs-reverification');
 assert.equal(map.navigate('feature').goal.status,'completed'); // restored instance is independent
});

test('restore rejects mismatched seed and invalid structural snapshot rather than granting authority to its contents',()=>{
 const map=createLabyrinth(seed('p'));add(map);
 const snap=map.exportSnapshot();
 assert.throws(()=>createLabyrinth(seed('foreign'),{initialSnapshot:snap}),/snapshot|seed|project/);
 const bad=structuredClone(snap);bad.nodes[1].parentId='missing';
 assert.throws(()=>createLabyrinth(seed('p'),{initialSnapshot:bad}),/snapshot|parent/);
 const duplicate=structuredClone(snap);duplicate.nodes.push(duplicate.nodes[0]);
 assert.throws(()=>createLabyrinth(seed('p'),{initialSnapshot:duplicate}),/snapshot|duplicate/);
});

test('host-owned store commits atomic versioned snapshots and reloads in separate Labyrinth instances',()=>{
 const t=temp();try{
  const store=createFileSnapshotStore({directory:t.directory});
  const first=store.transact(seed('p'),port,map=>{add(map);return map.issueContract('feature');});
  assert.equal(first.revision,1);
  const contract=first.result;
  const second=store.transact(seed('p'),port,map=>map.verifyGoal({contract,evidenceRefs:['artifact','test']}),{expectedRevision:1});
  assert.equal(second.revision,2);assert.equal(second.result.goalState,'completed');
  const read=store.read(seed('p'),port,map=>({status:map.navigate('feature').goal.status,proofs:map.proofs('feature').length}));
  assert.deepEqual(read,{status:'completed',proofs:1});
  assert.throws(()=>store.transact(seed('p'),port,map=>add(map,'lost-write'),{expectedRevision:1}),/revision conflict/);
  assert.equal(store.read(seed('p'),port,map=>map.navigate('feature').goal.status),'completed');
 }finally{t.cleanup();}
});

test('failed transaction does not publish partially changed map, corrupted file fails closed',()=>{
 const t=temp();try{
  const store=createFileSnapshotStore({directory:t.directory});
  assert.throws(()=>store.transact(seed('p'),port,map=>{add(map);throw Error('abort');}),/abort/);
  assert.deepEqual(store.read(seed('p'),port,map=>map.navigate('root').children),[]);
  store.transact(seed('p'),port,map=>add(map));
  const path=store.statePath;
  const bytes=readFileSync(path,'utf8');writeFileSync(path,bytes.replace('Use native capability','Tampered acceptance'));
  assert.throws(()=>store.read(seed('p'),port,map=>map.navigate('feature')),/checksum|corrupt|invalid/);
 }finally{t.cleanup();}
});

test('cross-project live reference is read-only, pinned, and reports changed or unavailable source',()=>{
 const source=createLabyrinth(seed('harness'));add(source,'capability');
 let online=true;
 const projects=new Map([['harness',source]]);
 const resolver=createProjectResolver({getProject:id=>online?projects.get(id):null});
 const integration=createLabyrinth(seed('integration'),{referenceResolver:resolver});
 add(integration,'provider');add(integration,'unrelated');
 assert.throws(()=>integration.attachReference({fromId:'provider',sourceProjectId:'integration',sourceGoalId:'root',expectedVersion:1,actor:'agent'}),/external|self/);
 const link=integration.attachReference({fromId:'provider',sourceProjectId:'harness',sourceGoalId:'capability',expectedVersion:1,actor:'agent'});
 assert.match(link.revision,/^[a-f0-9]{64}$/);
 assert.deepEqual(integration.navigate('provider').references[0].sourceProjectId,'harness');
 assert.equal(integration.checkCapability('provider','native.ownership').allowed,false);
 const a=integration.issueContract('provider'), b=integration.issueContract('unrelated');
 assert.equal(integration.contractStatus(a).status,'current');
 source.reviseGoal({id:'capability',expectedVersion:1,actor:'architect',change:{outcome:'Revised interface'},
   decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
 assert.equal(integration.contractStatus(a).status,'stale');
 assert.equal(integration.contractStatus(b).status,'current');
 online=false;
 assert.equal(integration.contractStatus(integration.issueContract('provider')).status,'unresolved');
 assert.equal(integration.contractStatus(b).status,'current');
});

test('cross-project reference persists and rechecks source after restart rather than copying its goal ownership',()=>{
 const t=temp();try{
 const source=createLabyrinth(seed('source'));add(source,'cap');
 const resolver=createProjectResolver({getProject:id=>id==='source'?source:null});
 const store=createFileSnapshotStore({directory:t.directory});
 const args={...port,referenceResolver:resolver};
 store.transact(seed('integration'),args,map=>{add(map,'consumer');return map.attachReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',expectedVersion:1,actor:'agent'});});
 const contract=store.transact(seed('integration'),args,map=>map.issueContract('consumer')).result;
 assert.equal(store.read(seed('integration'),args,map=>map.contractStatus(contract).status),'current');
 source.reviseGoal({id:'cap',expectedVersion:1,actor:'architect',change:{outcome:'new source'},
   decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
 assert.equal(store.read(seed('integration'),args,map=>map.contractStatus(contract).status),'stale');
 assert.equal(source.navigate('cap').goal.outcome,'new source');
 }finally{t.cleanup();}
});

test('refreshing a live reference requires matching local and source CAS revisions, and explicitly records decision',()=>{
 const source=createLabyrinth(seed('source'));add(source,'cap');
 const resolver=createProjectResolver({getProject:id=>id==='source'?source:null});
 const integration=createLabyrinth(seed('integration'),{referenceResolver:resolver});add(integration,'consumer');
 assert.throws(()=>integration.attachReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',expectedVersion:99,actor:'agent'}),/version conflict/);
 const old=integration.attachReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',expectedVersion:1,actor:'agent'});
 source.reviseGoal({id:'cap',expectedVersion:1,actor:'architect',change:{outcome:'new source'},
   decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
 const decision={door:'two-way',blastRadius:'local',evidenceConfidence:'high'};
 assert.throws(()=>integration.refreshReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',
   expectedVersion:1,expectedRevision:old.revision,actor:'agent',decision}),/version conflict/);
 assert.throws(()=>integration.refreshReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',
   expectedVersion:2,expectedRevision:'0'.repeat(64),actor:'agent',decision}),/source revision conflict/);
 const refreshed=integration.refreshReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',
   expectedVersion:2,expectedRevision:old.revision,actor:'agent',decision});
 assert.notEqual(refreshed.revision,old.revision);
 assert.equal(integration.contractStatus(integration.issueContract('consumer')).status,'current');
 assert.equal(integration.revisions().at(-1).type,'refresh-reference');
});

test('source changes during independent refresh decision cannot commit a now-stale source revision',()=>{
 const source=createLabyrinth(seed('source'));add(source,'cap');
 const resolver=createProjectResolver({getProject:id=>id==='source'?source:null});
 const integration=createLabyrinth(seed('integration'),{referenceResolver:resolver,
   decisionGate(){source.reviseGoal({id:'cap',expectedVersion:2,actor:'architect',
     change:{outcome:'v3 during decision'},decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
     return {accepted:true,receipt:'fixture://review',reviewer:'qc'};
   }});
 add(integration,'consumer');
 const original=integration.attachReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',
   expectedVersion:1,actor:'agent'});
 source.reviseGoal({id:'cap',expectedVersion:1,actor:'architect',
   change:{outcome:'v2'},decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'high'}});
 assert.throws(()=>integration.refreshReference({fromId:'consumer',sourceProjectId:'source',sourceGoalId:'cap',
   expectedVersion:2,expectedRevision:original.revision,actor:'agent',
   decision:{door:'two-way',blastRadius:'local',evidenceConfidence:'low'}}),/reference became stale/);
 assert.equal(integration.navigate('consumer').references[0].revision,original.revision);
 assert.equal(integration.navigate('consumer').goal.version,2);
});

test('snapshot read callback cannot mutate the effective graph through a read operation',()=>{
 const t=temp();try {
 const store=createFileSnapshotStore({directory:t.directory});
 assert.throws(()=>store.read(seed('p'),port,map=>decompose(map,{id:'unexpected',parentId:'root',outcome:'change',acceptance:['fake']})),/not a function|readonly|read-only/);
 assert.deepEqual(store.read(seed('p'),port,map=>map.navigate('root').children),[]);
 }finally{t.cleanup();}
});
