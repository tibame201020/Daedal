import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function checkedPath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') ||
      path.includes('\0') || path.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error('unsafe quality report path');
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error('symlink source refused');
  }
  const full = resolve(root, path);
  if (!full.startsWith(root + sep) || !lstatSync(full).isFile()) throw new Error('invalid report file');
  return full;
}
/** A host-owned local report directory is an evidence source, not a CI identity/attestation service. */
export function createLocalQualityReportProvider({ workspaceRoot, sourcePath, reportPaths }) {
  const root = realpathSync(workspaceRoot);
  if (!reportPaths || !Object.keys(reportPaths).length ||
      Object.values(reportPaths).some(p => typeof p !== 'string')) throw new Error('host report paths required');
  const currentSource = () => digest(readFileSync(checkedPath(root, sourcePath)));
  const readReport = checkId => {
    if (!Object.hasOwn(reportPaths, checkId)) return null;
    const path = reportPaths[checkId];
    const bytes = readFileSync(checkedPath(root, path));
    const record = JSON.parse(bytes.toString('utf8'));
    return { record, sha256: digest(bytes), path };
  };
  return Object.freeze({
    resolve(checkId, { contract, profile, sourceRevision }) {
      try {
        if (currentSource() !== sourceRevision) return null;
        const item = readReport(checkId);
        if (!item) return null;
        const record = item.record;
        if (!record || record.checkId !== checkId || !['pass', 'fail', 'unknown'].includes(record.status) ||
            record.projectId !== contract.projectId || record.goalId !== contract.goalId ||
            record.contractId !== contract.contractId || record.sourceRevision !== sourceRevision ||
            record.profileId !== profile.id || record.profileVersion !== profile.version) return null;
        if (currentSource() !== sourceRevision) return null;
        return { ...record, verified: true, reportUri: 'workspace-quality:' + item.path,
          reportSha256: item.sha256 };
      } catch { return null; }
    },
    freshness(receipt) {
      const proof = receipt?.quality;
      if (!proof?.receipts || !proof.sourceRevision) return 'unresolved';
      try {
        if (currentSource() !== proof.sourceRevision) return 'stale';
        for (const record of proof.receipts) {
          if (!record.reportSha256) continue; // optional check without a verified report
          const item = readReport(record.checkId);
          if (!item) return 'unresolved';
          if (item.sha256 !== record.reportSha256) return 'stale';
        }
        return 'current';
      } catch { return 'unresolved'; }
    },
  });
}
