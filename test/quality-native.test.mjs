import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { summarizeCrapkit, summarizeStryker, summarizeGitHubReviews,
  summarizeInterrogate, createNativeQualityReportProvider } from '../src/quality-native.mjs';

const sha='a'.repeat(40), digest='b'.repeat(64);
const crap={schema:1,kind:'coverage',commit:sha,functions:9,measured:8,untested:1,
  over_target:2,grade:'D',crap_load:21,lane_failures:{},unmeasured_scopes:[]};
const mutation={schemaVersion:'1.0',framework:{name:'StrykerJS',version:'10.1.1'},files:{
  'src/example.mjs':{mutants:[{status:'Killed'},{status:'Survived'},{status:'NoCoverage'},{status:'TimedOut'}]}}};
test('native crapkit report checks real metrics, no self-reported green',()=>{
 assert.equal(summarizeCrapkit(crap,{maxOverTarget:2}).status,'pass');
 assert.equal(summarizeCrapkit(crap,{maxOverTarget:0}).status,'fail');
 assert.equal(summarizeCrapkit(crap).status,'unknown');
 assert.equal(summarizeCrapkit({...crap,measured:0},{maxOverTarget:5}).status,'unknown');
 assert.equal(summarizeCrapkit({...crap,lane_failures:{js:'failed'}},{maxOverTarget:5}).status,'unknown');
 assert.equal(summarizeCrapkit({...crap,commit:'not-sha'},{maxOverTarget:5}).status,'unknown');
});
test('native Stryker mutant statuses calculate mutation score from source report',()=>{
 const x=summarizeStryker(mutation,{minMutationScore:50});
 assert.equal(x.status,'pass');
 assert.equal(x.metrics.total,4);
 assert.equal(x.metrics.mutationScore,50);
 assert.equal(summarizeStryker(mutation,{minMutationScore:60}).status,'fail');
 assert.equal(summarizeStryker({...mutation,files:{x:{mutants:[{status:'Pending'}]}}},{minMutationScore:0}).status,'unknown');
 assert.equal(summarizeStryker({...mutation,files:{x:{mutants:[]}}},{minMutationScore:0}).status,'unknown');
});
test('real GitHub PR reviews need independent approval pinned to the checked commit',()=>{
 assert.equal(summarizeGitHubReviews([],{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 const review={commitId:sha,reviewerId:'qc',state:'APPROVED'};
 assert.equal(summarizeGitHubReviews([review],{sourceRevision:sha,implementerId:'worker'}).status,'pass');
 assert.equal(summarizeGitHubReviews([{...review,reviewerId:'worker'}],{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 assert.equal(summarizeGitHubReviews([{...review,commitId:'c'.repeat(40)}],{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 assert.equal(summarizeGitHubReviews([{...review,state:'CHANGES_REQUESTED'}],{sourceRevision:sha,implementerId:'worker'}).status,'fail');
});
test('pstack-style review requires two independent sourced reviewers; never auto-invents their decision',()=>{
 const reviews=[{reviewerId:'a',model:'model-a',verdict:'pass',reportSha256:digest,reportUri:'fixture://a'},
 {reviewerId:'b',model:'model-b',verdict:'pass',reportSha256:digest,reportUri:'fixture://b'}];
 assert.equal(summarizeInterrogate({sourceRevision:sha,reviews},{sourceRevision:sha,implementerId:'worker'}).status,'pass');
 assert.equal(summarizeInterrogate({sourceRevision:sha,reviews:[reviews[0]]},{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 assert.equal(summarizeInterrogate({sourceRevision:sha,reviews:[reviews[0],{...reviews[1],model:'model-a'}]},{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 assert.equal(summarizeInterrogate({sourceRevision:sha,reviews:[reviews[0],{...reviews[1],reviewerId:'a'}]},{sourceRevision:sha,implementerId:'worker'}).status,'unknown');
 assert.equal(summarizeInterrogate({sourceRevision:sha,reviews:[reviews[0],{...reviews[1],verdict:'fail'}]},{sourceRevision:sha,implementerId:'worker'}).status,'fail');
});
test('native provider requires independent origin assertion pinned to report bytes and code SHA',()=>{
 const bytes=JSON.stringify(crap),reportSha=createHash('sha256').update(bytes).digest('hex');
 const profile={id:'risk',version:'1',checks:[{id:'crap',mode:'required'}]};
 const contract={projectId:'p',goalId:'g',contractId:'issued'};
 const raw={bytes,runId:'trusted-ci-run',reportUri:'ci://crapkit',tool:'crapkit',toolVersion:'0.8.1'};
 const make=origin=>createNativeQualityReportProvider({ retrieve:()=>raw,
  verifyOrigin:()=>origin, limits:{crap:{maxOverTarget:3}}});
 const resolve=provider=>provider.resolve('crap',{contract,profile,sourceRevision:sha});
 assert.equal(resolve(make({trusted:true,commitSha:sha,reportSha256:reportSha})).status,'pass');
 assert.equal(resolve(make({trusted:false,commitSha:sha,reportSha256:reportSha})),null);
 assert.equal(resolve(make({trusted:true,commitSha:sha,reportSha256:digest})),null);
 assert.equal(resolve(make({trusted:true,commitSha:'c'.repeat(40),reportSha256:reportSha})),null);
});
