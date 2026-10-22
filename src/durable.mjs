import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLabyrinth } from './labyrinth.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const clone = value => structuredClone(value);
const valid = value => typeof value === 'string' && value.length > 0;

/** Host-only, local durable store. A per-directory lock serializes its synchronous transactions.
 * Not a cryptographic authentication or network/distributed storage implementation.
 */
export function createFileSnapshotStore({ directory }) {
  const root = realpathSync(directory);
  const statePath = join(root, 'labyrinth-state.json');
  const lockPath = join(root, '.labyrinth-write-lock');
  const readEnvelope = () => {
    if (!existsSync(statePath)) return { revision: 0, snapshot: null };
    const stat = lstatSync(statePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('corrupt state file type');
    let record;
    try { record = JSON.parse(readFileSync(statePath, 'utf8')); }
    catch { throw new Error('corrupt state JSON'); }
    if (!record || record.format !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        !valid(record.projectId) || !record.snapshot || !/^[a-f0-9]{64}$/i.test(record.sha256 ?? ''))
      throw new Error('invalid state envelope');
    const actual = hash(JSON.stringify({ format: record.format, revision: record.revision,
      projectId: record.projectId, snapshot: record.snapshot }));
    if (actual !== record.sha256 || record.snapshot.projectId !== record.projectId) throw new Error('state checksum mismatch');
    return { revision: record.revision, snapshot: record.snapshot };
  };
  const restore = (seed, ports, stored) => {
    if (!seed || !valid(seed.projectId)) throw new Error('project seed required');
    if (stored.snapshot && stored.snapshot.projectId !== seed.projectId) throw new Error('state project mismatch');
    return createLabyrinth(seed, { ...ports, ...(stored.snapshot ? { initialSnapshot: stored.snapshot } : {}) });
  };
  const write = (revision, snapshot) => {
    const body = { format: 1, revision, projectId: snapshot.projectId, snapshot };
    const data = JSON.stringify({ ...body, sha256: hash(JSON.stringify(body)) });
    const tmp = join(root, '.labyrinth-' + randomUUID() + '.tmp');
    let fd;
    try {
      fd = openSync(tmp, 'wx', 0o600);
      writeFileSync(fd, data, 'utf8');
      fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(tmp, statePath);
      // Flush directory metadata where supported. On platforms without directory fsync, best-effort only.
      let dir;
      try { dir = openSync(root, 'r'); fsyncSync(dir); } catch {} finally { if (dir !== undefined) closeSync(dir); }
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(tmp)) unlinkSync(tmp);
    }
  };
  return Object.freeze({
    statePath,
    read(seed, ports, operation) {
      if (typeof operation !== 'function') throw new Error('trusted read operation required');
      const map = restore(seed, ports, readEnvelope());
      const result = operation(map);
      if (result && typeof result.then === 'function') throw new Error('async operation unsupported');
      return clone(result);
    },
    transact(seed, ports, operation, { expectedRevision } = {}) {
      if (typeof operation !== 'function') throw new Error('trusted transaction required');
      try { mkdirSync(lockPath, { mode: 0o700 }); } catch { throw new Error('concurrent state transaction or lock recovery required'); }
      try {
        const before = readEnvelope();
        if (expectedRevision !== undefined && expectedRevision !== before.revision) throw new Error('revision conflict');
        const map = restore(seed, ports, before);
        const result = operation(map);
        if (result && typeof result.then === 'function') throw new Error('async operation unsupported');
        const snapshot = map.exportSnapshot();
        write(before.revision + 1, snapshot);
        return { revision: before.revision + 1, result: clone(result) };
      } finally { rmdirSync(lockPath); }
    },
  });
}

/** Host registry returns another Project's accepted projection, never a source write handle. */
export function createProjectResolver({ getProject }) {
  if (typeof getProject !== 'function') throw new Error('host project registry required');
  return Object.freeze({ inspect({ projectId, goalId }) {
    if (!valid(projectId) || !valid(goalId)) return null;
    const source = getProject(projectId);
    if (!source || source.projectId !== projectId || typeof source.inspectReference !== 'function') return null;
    try {
      const projection = source.inspectReference(goalId);
      return projection && projection.projectId === projectId && projection.goalId === goalId ? clone(projection) : null;
    } catch { return null; }
  } });
}
