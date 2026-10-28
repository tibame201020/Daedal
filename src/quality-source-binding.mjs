import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',timeout:10000}).trim();
const properPath=path=>typeof path==='string' && !!path && !isAbsolute(path) &&
  !path.includes('\\') && !path.includes('\0') && path.split('/').every(x=>x && x!=='.' && x!=='..');
/** Verifies one real tracked, regular file's exact bytes against the current Git tree. */
export function createVerifiedGitSourceBinding({workspaceRoot,relativePath,expectedCommit}) {
  if (!properPath(relativePath)) throw new Error('unsafe source path');
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit??'')) throw new Error('expected commit required');
  const root=realpathSync(workspaceRoot);
  const gitRoot=realpathSync(git(root,['rev-parse','--show-toplevel']));
  if (gitRoot!==root) throw new Error('workspace must be the Git root');
  const commitSha=git(root,['rev-parse','HEAD']);
  if(commitSha!==expectedCommit) throw new Error('checked out commit mismatch');
  let current=root;
  for(const name of relativePath.split('/')) {
    current=join(current,name);
    const stat=lstatSync(current);
    if(stat.isSymbolicLink()) throw new Error('symlink source refused');
  }
  if(!lstatSync(current).isFile()) throw new Error('source not a regular file');
  const full=resolve(root,relativePath);
  if(!full.startsWith(root+sep))throw new Error('source outside Git workspace');
  const tree=git(root,['ls-tree','HEAD','--',relativePath]);
  const found=tree.match(/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/);
  if(!found || found[3]!==relativePath)throw new Error('source not a tracked Git file');
  const checkedOut=readFileSync(full);
  const committed=execFileSync('git',['show','HEAD:'+relativePath],{cwd:root,timeout:10000});
  if(!checkedOut.equals(committed))throw new Error('source content mismatch with commit');
  return Object.freeze({sourceMappingVerified:true,commitSha,sourceRevision:sha256(committed),
    gitBlobSha:found[2],relativePath});
}
