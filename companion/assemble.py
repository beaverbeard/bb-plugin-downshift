#!/usr/bin/env python3
"""Assemble the reviewed Linux carrier from explicit public build inputs."""
from pathlib import Path
import argparse, hashlib, json, os, posixpath, re, shutil, tarfile

BB_SHA='956151da133b6cfdd92bd5544ba1dd304d4b28437ad59330b6a6e847a9e201f7'
PLUGIN_SHA='b617af10348d20d606d8a29519048d49096520c39728d4aff8289e7ae89da1dc'
NODE_SHA='472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6'
ID='bb-downshift-companion-0.50.1-ds.1-linux-x64'
SOURCE=Path(__file__).resolve().parent

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def extract(archive, target, prefix, links=False):
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as t:
        for m in t.getmembers():
            n=Path(m.name)
            if not n.parts or n.parts[0]!=prefix or '..' in n.parts or n.is_absolute():
                raise ValueError('Unsafe archive path')
            if not (m.isfile() or m.isdir() or (links and (m.issym() or m.islnk()))):
                raise ValueError('Unsupported archive member')
            if m.issym() or m.islnk():
                dest=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname) if m.issym() else m.linkname)
                if dest!=prefix and not dest.startswith(prefix+'/'):
                    raise ValueError('Escaping archive link')
        if links:
            temp=target.parent/('.node-extract-'+str(os.getpid()))
            temp.mkdir()
            try:
                t.extractall(temp)
                for p in (temp/prefix).iterdir():
                    shutil.move(str(p),target/p.name)
            finally:
                shutil.rmtree(temp)
        else:
            for m in t.getmembers():
                n=Path(m.name)
                if len(n.parts)==1:
                    continue
                p=target.joinpath(*n.parts[1:]);p.parent.mkdir(parents=True,exist_ok=True)
                if m.isdir():p.mkdir(exist_ok=True)
                else:p.write_bytes(t.extractfile(m).read());p.chmod(m.mode&0o777)

def packages(modules):
    found={}
    for p in modules.rglob('package.json'):
        if p.is_symlink() or p.parent.is_symlink():continue
        try:
            data=json.loads(p.read_text());name=data['name'];version=data['version']
            if not isinstance(name,str) or not isinstance(version,str):continue
        except (KeyError,ValueError,UnicodeError):continue
        found.setdefault((name,version),(p.parent,data))
    return found

def write_notices(root,build_packages):
    destination=root/'licenses/build-dependencies';destination.mkdir(parents=True)
    notices=[]
    for (name,version),(directory,data) in sorted(packages(build_packages).items()):
        stem=re.sub(r'[^a-zA-Z0-9._-]','_',name+'-'+version)
        license_paths=[]
        for p in directory.rglob('*'):
            if p.is_symlink() or not p.is_file() or 'node_modules' in p.relative_to(directory).parts:continue
            if not re.match(r'^(licen[sc]e|copying|notice|copyright)([._-].*)?$',p.name,re.I):continue
            relative=p.relative_to(directory);target=destination/stem/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
            license_paths.append(str(target.relative_to(root)))
        notices.append({'name':name,'version':version,'license':data.get('license'),'files':license_paths})
    (root/'licenses/build-dependencies.json').write_text(json.dumps(notices,indent=2)+'\n')
    runtime=[]
    for section in ['bb','toolchain','node']:
        for (name,version),(directory,data) in sorted(packages(root/'runtime'/section).items()):
            runtime.append({'section':section,'name':name,'version':version,'license':data.get('license'),'path':str(directory.relative_to(root))})
    (root/'runtime-packages.json').write_text(json.dumps(runtime,indent=2)+'\n')
    (root/'THIRD_PARTY_NOTICES.md').write_text('''# Third-party notices

BB is MIT licensed, copyright Michael Yong; its license is retained at
`runtime/bb/LICENSE`. Node.js and its bundled third-party notices are retained in
`runtime/node/LICENSE`. Downshift and its icon notices remain under `plugin/`.
This carrier's launcher/assembly source is MIT licensed in the root `LICENSE`.

Runtime package manifests and original license files are retained with their
packages. `runtime-packages.json` lists those package versions. The index at
`licenses/build-dependencies.json` and its copied notices are a conservative
superset of the source build's installed public dependencies, including compiler
and development dependencies; inclusion in that index does not assert that every
listed package is executed or included in a compiled bundle. It preserves the
available source dependency notices alongside the upstream built assets.
''')

def inventory(root):
    result=[]
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            if not p.exists() or not p.resolve().is_relative_to(root):raise ValueError('Escaping/broken link '+str(p))
            result.append({'path':str(p.relative_to(root)),'link':os.readlink(p)})
        elif p.is_file():result.append({'path':str(p.relative_to(root)),'sha256':sha(p),'bytes':p.stat().st_size})
    (root/'inventory.json').write_text(json.dumps(result,indent=2)+'\n')

def main():
    parser=argparse.ArgumentParser()
    for name in ['bb-tar','deps-root','node-tar','toolchain-root','plugin-tar','build-packages','out']:parser.add_argument('--'+name,required=True,type=Path)
    parser.add_argument('--carrier-commit',required=True)
    a=parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}',a.carrier_commit):raise ValueError('Exact carrier commit required')
    for p,d in [(a.bb_tar,BB_SHA),(a.node_tar,NODE_SHA),(a.plugin_tar,PLUGIN_SHA)]:
        if sha(p)!=d:raise ValueError('Unreviewed input archive '+p.name)
    root=a.out.resolve()
    if root.exists():raise ValueError('Output must be a new directory')
    root.mkdir(parents=True)
    extract(a.bb_tar,root/'runtime/bb','package')
    shutil.copytree(a.deps_root,root/'runtime/bb/node_modules',symlinks=True)
    p=root/'runtime/bb/node_modules/.pnpm/node_modules/bb-app'
    if not p.is_symlink():raise ValueError('Expected pnpm self-reference')
    p.unlink();p.symlink_to('../../..')
    extract(a.node_tar,root/'runtime/node','node-v24.15.0-linux-x64',links=True)
    target=root/'runtime/toolchain';target.mkdir()
    for name in ['package.json','.bb-toolchain.json']:shutil.copy2(a.toolchain_root/name,target/name)
    shutil.copytree(a.toolchain_root/'node_modules',target/'node_modules',symlinks=True)
    for name in ['esbuild','tailwindcss','@tailwindcss']:(root/'runtime/bb/node_modules'/name).symlink_to('../../toolchain/node_modules/'+name)
    extract(a.plugin_tar,root/'plugin','package')
    shutil.copytree((root/'runtime/bb/node_modules/zod').resolve(),root/'plugin/node_modules/zod',symlinks=True)
    for p in list(root.rglob('*.map'))+list(root.rglob('.modules.yaml'))+list(root.rglob('.package-lock.json')):p.unlink()
    (root/'runtime/bb/node_modules/.pnpm/lock.yaml').unlink(missing_ok=True)
    shutil.rmtree(root/'runtime/bb/node_modules/.bin')
    for name in ['downshift','downshift.mjs','assemble.py','README.md','BUILD.md','LICENSE']:shutil.copyfile(SOURCE/name,root/name)
    (root/'downshift').chmod(0o755)
    write_notices(root,a.build_packages)
    manifest={'format':1,'id':ID,'carrier':{'name':'bb-downshift-companion','version':'0.50.1-ds.1','sourceCommit':a.carrier_commit,'experimental':True},'platform':{'os':'linux','arch':'x64','glibcMinimumElfRequirement':'2.34','glibcxxMinimumElfRequirement':'3.4.29','tested':'Ubuntu22.04.5/glibc2.35'},'bb':{'version':'0.50.1','sdkVersion':'0.6.164','repository':'https://github.com/get-bb/bb','baseCommit':'df9619d8e8aac4aff00c0c3ff9b8ef4e2823e4f2','reviewedTree':'ed4e544a27a63435166d6884a7b22f545032f2ef','reviewedNativeCommit':'55695f85550270494c90b31b3dbbc35254b99124','packageArchiveSha256':BB_SHA,'patchSha256':'f9b3e210bf37fb462f73979ba6d1e1db2fffcc837754a22448d6b822101b6522'},'nativeProtocol':273,'executionPolicyProtocol':'bb.execution-policy/v1','requiredSemantic':'consistent-durable-registry','node':{'version':'24.15.0','url':'https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz','archiveSha256':NODE_SHA,'binarySha256':sha(root/'runtime/node/bin/node')},'plugin':{'name':'bb-plugin-downshift','version':'0.1.0-rc.6','id':'downshift','source':'https://github.com/beaverbeard/bb-plugin-downshift.git#v0.1.0-rc.6','sourceCommit':'60ad01c92c12478d8bde60d6f857f47d64f52b19','archiveSha256':PLUGIN_SHA},'toolchain':{'esbuild':'0.28.2','@tailwindcss/node':'4.3.0','@tailwindcss/oxide':'4.3.0','tailwindcss':'4.3.0'},'productionDependencyDeployment':{'pnpm':'9.15.0','scripts':'ignored','source':'BB locked production deployment'},'validation':{'nativeTests':'retained exact reviewed source evidence; unchanged suites not repeated','realSubscribedModelCalls':0,'productionRollout':False,'otherPlatforms':'unvalidated'}}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for p in root.rglob('*'):
        if p.is_dir() and not p.is_symlink():p.chmod(0o755)
        elif p.is_file() and not p.is_symlink():p.chmod(0o755 if p.stat().st_mode&0o111 else 0o644)
    inventory(root)
    print(json.dumps({'directory':str(root),'id':ID,'manifestSha256':sha(root/'manifest.json'),'inventorySha256':sha(root/'inventory.json')}))

if __name__=='__main__':main()
