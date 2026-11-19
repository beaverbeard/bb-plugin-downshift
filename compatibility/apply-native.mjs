import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const directory=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(join(directory,'native-manifest.json'),'utf8'));
const args=process.argv.slice(2);
let source=null,apply=false;
for(let i=0;i<args.length;i++){
 if(args[i]==='--source'&&typeof args[i+1]==='string'){source=args[++i];continue;}
 if(args[i]==='--apply'){apply=true;continue;}
 throw Error('Usage: node compatibility/apply-native.mjs --source <clean BB checkout> [--apply]');
}
if(!source)throw Error('A clean BB source checkout is required. This tool never patches an installed runtime.');
const root=realpathSync(resolve(source));
function git(...args){const result=spawnSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:4*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw Error(result.stderr.trim()||'Git command failed.');return result.stdout.trim();}
if(realpathSync(git('rev-parse','--show-toplevel'))!==root)throw Error('The source path must be the repository root.');
if(git('rev-parse','HEAD')!==manifest.baseCommit)throw Error('Unsupported BB source revision. No files were changed.');
if(git('status','--porcelain=v1','--untracked-files=all'))throw Error('The BB source checkout must be completely clean. No files were changed.');
const patch=join(directory,'bb-execution-policy.patch');
if(createHash('sha256').update(readFileSync(patch)).digest('hex')!==manifest.patchSha256)throw Error('Native patch checksum mismatch. No files were changed.');
git('apply','--check',patch);
if(apply){git('apply',patch);process.stdout.write('Applied the reviewed native source patch. Build and start BB explicitly using NATIVE-INTEGRATION.md.\n');}
else process.stdout.write('Compatible clean BB checkout; patch check passed. Add --apply to modify this source checkout.\n');
