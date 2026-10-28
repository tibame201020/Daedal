export const lowRisk = { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' };
export function decompose(map, proposal) {
 let expectedCompositionVersion = 1, expectedParentVersion = 1;
 try { const parent = map.navigate(proposal.parentId).goal; expectedCompositionVersion = parent.compositionVersion; expectedParentVersion = parent.version; } catch {}
 return map.decompose({ ...proposal, expectedParentVersion, expectedCompositionVersion, actor: 'fixture-agent', decision: lowRisk });
}
export function relate(map, proposal) {
 return map.relate({ ...proposal, expectedVersion: map.navigate(proposal.fromId).goal.version,
  actor: 'fixture-agent', decision: lowRisk });
}
