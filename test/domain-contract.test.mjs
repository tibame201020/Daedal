import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabyrinth } from '../src/labyrinth.mjs';
const seed = {projectId:'p',id:'root',outcome:'Original intent',acceptance:['Real native E2E'],boundary:{allow:['adapter'],deny:['harness.core']}};
const low={door:'two-way',blastRadius:'local',evidenceConfidence:'high'};
const child=(parentId='root')=>({id:'child',parentId,outcome:'Build adapter',acceptance:['Native readback'],actor:'worker',decision:low,expectedParentVersion:1,expectedCompositionVersion:1});
test('decomposition rejects missing/stale CAS, records actor and decision, does not loosen parent',()=>{
 const m=createLabyrinth(seed);
 assert.throws(()=>m.decompose({id:'child',parentId:'root',outcome:'child',acceptance:['Mock']}),/actor|revision|decision/);
 assert.throws(()=>m.decompose({...child(),expectedCompositionVersion:99}),/version conflict/);
 assert.equal(m.navigate('root').children.length,0);
 m.decompose(child());
 assert.equal(m.revisions().at(-1).type,'decompose');
 assert.equal(m.revisions().at(-1).actor,'worker');
 assert.equal(m.revisions().at(-1).decision.door,'two-way');
 assert.throws(()=>m.decompose({...child(),id:'other',expectedCompositionVersion:1}),/version conflict/);
 assert.equal(m.navigate('child').boundary.deny.includes('harness.core'),true);
});
test('relation mutation rejects missing/stale CAS and records decision',()=>{
 const m=createLabyrinth(seed);m.decompose(child());m.decompose({...child(),id:'other',expectedCompositionVersion:2});
 assert.throws(()=>m.relate({fromId:'child',toId:'other',type:'depends_on'}),/actor|version|decision/);
 assert.throws(()=>m.relate({fromId:'child',toId:'other',type:'depends_on',expectedVersion:99,actor:'worker',decision:low}),/version conflict/);
 assert.equal(m.navigate('child').relations.length,0);
 m.relate({fromId:'child',toId:'other',type:'depends_on',expectedVersion:1,actor:'worker',decision:low});
 assert.equal(m.revisions().at(-1).type,'relate');
 assert.equal(m.navigate('child').goal.version,2);
});
test('project-risk map mutations require independent host gate, not caller asserted approval',()=>{
 const m=createLabyrinth(seed);assert.throws(()=>m.decompose({...child(),decision:{...low,door:'one-way',blastRadius:'project'}}),/independent decision gate/);
 assert.equal(m.navigate('root').children.length,0);
});
test('discovered knowledge stays candidate until independent provenance check and accepted revision',()=>{
 let checks=0;
 const m=createLabyrinth(seed,{knowledgeVerifier:{verify(x){checks++;return {verified:true,sourceRevision:x.source.revision,sourceSha256:x.source.sha256,receipt:'test://independent-source-check',reviewerId:'checker'};}}});
 m.decompose(child());m.decompose({...child(),id:'other',expectedCompositionVersion:2});
 const source={uri:'test://source/artifact',revision:'commit123',sha256:'a'.repeat(64)};
 const candidate=m.discover({id:'observation1',fromId:'child',toId:'other',type:'depends_on',source,claim:'Interface requires other'});
 assert.equal(candidate.status,'candidate');
 assert.equal(m.navigate('child').relations.length,0);
 assert.equal(m.navigate('child').discoveryCandidates[0].status,'candidate');
 assert.throws(()=>m.acceptDiscovery({id:'observation1',actor:'worker',expectedVersion:99,decision:low}),/version conflict/);
 m.acceptDiscovery({id:'observation1',actor:'worker',expectedVersion:1,decision:low});
 assert.equal(checks,1);assert.equal(m.navigate('child').relations.length,1);
 assert.equal(m.revisions().at(-1).type,'accept-discovery');
 assert.equal(m.navigate('child').acceptedKnowledge[0].source.uri,'test://source/artifact');
 assert.throws(()=>m.acceptDiscovery({id:'observation1',actor:'worker',expectedVersion:2,decision:low}),/already accepted/);
 const restored=createLabyrinth(seed,{initialSnapshot:m.exportSnapshot()});
 assert.equal(restored.navigate('child').acceptedKnowledge.length,1);
});
test('unchecked provenance and self-attested acceptance cannot promote candidate',()=>{
 const m=createLabyrinth(seed,{knowledgeVerifier:{verify(){return {verified:true,sourceRevision:'wrong',sourceSha256:'a'.repeat(64),receipt:'fake',reviewerId:'worker'};}}});
 m.decompose(child());m.decompose({...child(),id:'other',expectedCompositionVersion:2});
 assert.throws(()=>m.discover({id:'bad',fromId:'child',toId:'other',type:'depends_on',claim:'bad',source:{uri:'x',revision:'1'}}),/source|sha256/);
 m.discover({id:'good',fromId:'child',toId:'other',type:'depends_on',claim:'claim',source:{uri:'test://source',revision:'abc',sha256:'a'.repeat(64)}});
 assert.throws(()=>m.acceptDiscovery({id:'good',actor:'worker',expectedVersion:1,decision:low}),/provenance|independent/);
 assert.equal(m.navigate('child').relations.length,0);
});

test('decision callback cannot commit a decomposition after parent composition changes during approval',()=>{
 let m;const gate=()=>{m.decompose({...child(),id:'concurrent',decision:low});return {accepted:true,receipt:'fixture://gate',humanApproved:true};};
 m=createLabyrinth(seed,{decisionGate:gate});
 assert.throws(()=>m.decompose({...child(),id:'stale',decision:{door:'one-way',blastRadius:'project',evidenceConfidence:'high'}}),/stale|version conflict/);
 assert.deepEqual(m.navigate('root').children,['concurrent']);
});
test('decision callback cannot add a relation after its source Goal changes during approval',()=>{
 let m;const gate=()=>{m.reviseGoal({id:'child',expectedVersion:1,actor:'other',change:{outcome:'changed'},decision:low});return {accepted:true,receipt:'fixture://gate',humanApproved:true};};
 m=createLabyrinth(seed,{decisionGate:gate});m.decompose(child());m.decompose({...child(),id:'other',expectedCompositionVersion:2});
 assert.throws(()=>m.relate({fromId:'child',toId:'other',type:'depends_on',expectedVersion:1,actor:'worker',decision:{door:'one-way',blastRadius:'project',evidenceConfidence:'high'}}),/stale|version conflict/);
 assert.deepEqual(m.navigate('child').relations,[]);
});

test('restoration rejects accepted discoveries detached from their actual relation or accepted index',()=>{
 const m=createLabyrinth(seed,{knowledgeVerifier:{verify(c){return {verified:true,sourceRevision:c.source.revision,
  sourceSha256:c.source.sha256,reviewerId:'checker',receipt:'fixture://verified'};}}});
 m.decompose(child());m.decompose({...child(),id:'other',expectedCompositionVersion:2});
 m.discover({id:'candidate',fromId:'child',toId:'other',type:'depends_on',claim:'checked',
  source:{uri:'fixture://source',revision:'v1',sha256:'a'.repeat(64)}});
 m.acceptDiscovery({id:'candidate',actor:'worker',expectedVersion:1,decision:low});
 const missingIndex=m.exportSnapshot();missingIndex.acceptedKnowledge=[];
 assert.throws(()=>createLabyrinth(seed,{initialSnapshot:missingIndex}),/accepted knowledge|snapshot/);
 const missingRelation=m.exportSnapshot();missingRelation.edges=[];
 assert.throws(()=>createLabyrinth(seed,{initialSnapshot:missingRelation}),/accepted knowledge|snapshot/);
});

test('decomposition CAS binds both parent content and child composition revisions',()=>{
 const m=createLabyrinth(seed);
 m.reviseGoal({id:'root',expectedVersion:1,actor:'architect',change:{outcome:'New parent intent'},decision:low});
 assert.throws(()=>m.decompose(child()),/version conflict/);
 assert.deepEqual(m.navigate('root').children,[]);
 m.decompose({...child(),expectedParentVersion:2});
 assert.deepEqual(m.navigate('root').children,['child']);
});
