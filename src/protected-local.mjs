import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const validPath = p => typeof p === 'string' && p.length > 0 && !isAbsolute(p) && !p.includes('\\') && !p.includes('\0') && p.split('/').every(s => s && s !== '.' && s !== '..');
const isInside = (root, path) => path.startsWith(root + sep) && !relative(root, path).startsWith('..');

/** Only paths already inside a host-controlled workspace are eligible. Reject symlinks in every component. */
function safePath(root, relativePath, { mustExist = false } = {}) {
  if (!validPath(relativePath)) throw new Error('unsafe relative path');
  const full = resolve(root, relativePath);
  if (!isInside(root, full)) throw new Error('outside workspace');
  const segments = relativePath.split('/');
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    if (!existsSync(current)) {
      if (i !== segments.length - 1 || mustExist) throw new Error('parent missing or source not found');
      break;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('symlink path rejected');
    if (i < segments.length - 1 && !stat.isDirectory()) throw new Error('parent is not a directory');
    if (i === segments.length - 1 && !stat.isFile()) throw new Error('source not a regular file');
  }
  return full;
}

/** Host-owned protected file creation seam; no shell, overwrite, directory creation or arbitrary operation. */
export function createProtectedLocalWriter({ labyrinth, workspaceRoot, routes }) {
  if (!labyrinth || typeof labyrinth.contractStatus !== 'function' || typeof labyrinth.checkCapability !== 'function') throw new Error('labyrinth required');
  const root = realpathSync(workspaceRoot);
  if (!Array.isArray(routes) || !routes.length || routes.some(x => !validPath(x.prefix) || typeof x.capability !== 'string' || !x.capability)) throw new Error('host routes required');
  const rules = routes.map(x => ({ prefix: x.prefix.replace(/\/$/, '') + '/', capability: x.capability }));
  if (new Set(rules.map(x => x.prefix)).size !== rules.length) throw new Error('ambiguous routes');
  return Object.freeze({
    describe() { return { enforcement: 'enforced', coverage: 'writeNewFile only; no OS or alternate-tool mediation' }; },
    writeNewFile({ contract, relativePath, content }) {
      if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw new Error('invalid content');
      const bytes = Buffer.from(content);
      if (bytes.length > 1024 * 1024) throw new Error('content exceeds cap');
      // contractStatus checks this contract was issued by this labyrinth and is unaltered.
      const status = labyrinth.contractStatus(contract);
      if (status.status !== 'current') throw new Error(`contract ${status.status}`);
      if (!validPath(relativePath)) throw new Error('unsafe relative path');
      const rule = rules.filter(r => relativePath.startsWith(r.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0];
      if (!rule || !labyrinth.checkCapability(contract.goalId, rule.capability).allowed || !contract.boundary.allow.includes(rule.capability)) throw new Error('outside permitted capability');
      const target = safePath(root, relativePath);
      // wx = exclusive creation (reject existing file/final-component symlink), no overwrite.
      const fd = openSync(target, 'wx', 0o600);
      try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
      return Object.freeze({ enforcement: 'enforced', operation: 'writeNewFile', contractId: contract.contractId,
        relativePath, capability: rule.capability, sha256: digest(readFileSync(target)) });
    },
  });
}

export function createLocalEvidenceProvider({ workspaceRoot, artifactPath, testPath, projectId, goalId, implementerId, timeoutMs = 10000 }) {
  const root = realpathSync(workspaceRoot);
  if (!projectId || !goalId || !implementerId) throw new Error('trusted source identities required');
  const artifact = safePath(root, artifactPath, { mustExist: true });
  const testFile = safePath(root, testPath, { mustExist: true });
  return Object.freeze({
    resolve(reference, { contract }) {
      if (!['artifact', 'test'].includes(reference) || contract.projectId !== projectId || contract.goalId !== goalId) return null;
      // Recheck the source on every read; do not accept caller-provided digest or exit status.
      safePath(root, artifactPath, { mustExist: true }); safePath(root, testPath, { mustExist: true });
      const before = digest(readFileSync(artifact));
      if (reference === 'artifact') return { reference, kind: 'artifact', sourceUri: `workspace:${artifactPath}`, sha256: before,
        sourceRevision: before, implementerId, projectId, goalId, contractId: contract.contractId, verified: true, passed: true };
      // Node's outer test runner sets NODE_TEST_CONTEXT; nested test runs must not inherit it.
      const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ['--test', testFile], { cwd: root, shell: false, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024, env });
      const after = digest(readFileSync(artifact));
      const passed = !result.error && result.status === 0 && before === after;
      return { reference, kind: 'test', sourceUri: `workspace-test:${testPath}`, sha256: digest(`${result.status}:${result.stdout ?? ''}:${result.stderr ?? ''}`),
        sourceRevision: before, implementerId, projectId, goalId, contractId: contract.contractId, verified: !result.error, passed };
    },
  });
}
/** Source-bound review port: host supplies the independent reviewer; the adapter cannot invent a PASS. */
export function createSourceBoundVerifier({ workspaceRoot, artifactPath, reviewerId, reviewSource }) {
  const root = realpathSync(workspaceRoot);
  if (!reviewerId || typeof reviewSource !== 'function') throw new Error('trusted reviewer required');
  return Object.freeze({ review({ sources, context, contract, subject }) {
    const artifact = sources.find(s => s.kind === 'artifact');
    if (!artifact) throw new Error('artifact required for independent review');
    const bytes = readFileSync(safePath(root, artifactPath, { mustExist: true }));
    if (digest(bytes) !== artifact.sha256 || subject.sourceRevision !== artifact.sha256) throw new Error('source changed before review');
    // Reviewer examines actual source bytes and accepted Goal context, not an agent-authored summary.
    const reviewed = reviewSource(Object.freeze({ content: bytes.toString('utf8'), context: structuredClone(context), subject: structuredClone(subject) }));
    if (digest(readFileSync(safePath(root, artifactPath, { mustExist: true }))) !== artifact.sha256) throw new Error('source changed during review');
    if (!reviewed || !['pass', 'fail'].includes(reviewed.verdict) || reviewed.boundaryReviewed !== true || !Array.isArray(reviewed.criterionResults)) throw new Error('incomplete source review');
    const result = { reviewerId, reviewReceipt: `sha256:${digest(JSON.stringify({ reviewerId, subject, reviewed, source: artifact.sha256 }))}`,
      subject: structuredClone(subject), codeReviewed: true, boundaryReviewed: true, verdict: reviewed.verdict,
      criterionResults: structuredClone(reviewed.criterionResults), findings: structuredClone(reviewed.findings ?? []) };
    return result;
  } });
}
