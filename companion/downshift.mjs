import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const node=path.join(root,'runtime/node/bin/node');
const bb=path.join(root,'runtime/bb');
const args=process.argv.slice(2),command=args.shift()??'help';
const help=`Unofficial Downshift companion · Linux x64 (glibc)

./downshift verify
./downshift start --data-dir /absolute/new/directory [--port 39020] [--host-port 39021]
./downshift cli --data-dir /absolute/directory -- plugin list --json
./downshift stop --data-dir /absolute/directory

Starts in the foreground. Ctrl+C stops only this instance.
A new, separate data directory is required. Existing BB data is refused.
The included plugin is installed on first start, unconfigured and OFF.
Ports are remembered for later commands. User uninstall/disable is respected.
No service installation, existing-data upgrade, account login, model call or mode activation is performed.
`;
const inside=(file,parent)=>file===parent||file.startsWith(parent+path.sep);
function files(dir,prefix=''){
 const result=[];
 for(const name of fs.readdirSync(dir).sort()){
  const relative=path.join(prefix,name),target=path.join(dir,name),s=fs.lstatSync(target);
  if(s.isDirectory())result.push(...files(target,relative));
  else result.push(relative);
 }
 return result;
}
function verify(){
 if(process.platform!=='linux'||process.arch!=='x64'||!process.report.getReport().header.glibcVersionRuntime)throw Error('Requires Linux x64 with glibc');
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'),'utf8'));
 const expected=new Set(['inventory.json']);
 for(const item of inventory){
  const target=path.resolve(root,item.path);
  if(target===root||!inside(target,root)||expected.has(item.path))throw Error('Invalid inventory path');
  expected.add(item.path);
  const stat=fs.lstatSync(target);
  if(item.link!==undefined){if(!stat.isSymbolicLink()||fs.readlinkSync(target)!==item.link||!inside(fs.realpathSync(target),root))throw Error('Invalid distribution link: '+item.path);}
  else if(!stat.isFile()||crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==item.sha256)throw Error('Checksum mismatch: '+item.path);
 }
 for(const file of files(root))if(!expected.has(file))throw Error('Unexpected distribution file: '+file);
 console.log('Verified '+inventory.length+' files/links; '+manifest.id+'; native '+manifest.nativeProtocol);
}
function options(){
 let data=null,port,hostPort,rest=[];
 while(args.length){const key=args.shift();if(key==='--'){rest=args.splice(0);break;}const value=args.shift();if(value===undefined)throw Error('Missing value for '+key);if(key==='--data-dir')data=value;else if(key==='--port')port=Number(value);else if(key==='--host-port')hostPort=Number(value);else throw Error('Unknown option '+key);}
 if(!data||!path.isAbsolute(data))throw Error('An explicit absolute --data-dir is required');
 data=path.resolve(data);
 let ancestor=data;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
 if(inside(fs.realpathSync(ancestor),root))throw Error('Keep data outside the immutable distribution directory');
 const markerFile=path.join(data,'downshift-companion.json');
 if(fs.existsSync(markerFile)){const m=JSON.parse(fs.readFileSync(markerFile,'utf8'));port??=m.port;hostPort??=m.hostPort;}
 port??=39020;hostPort??=39021;
 if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(hostPort)||hostPort<1024||hostPort>65535||port===hostPort)throw Error('Use two distinct ports between 1024 and 65535');
 return {data,port,hostPort,rest,url:'http://127.0.0.1:'+port,markerFile};
}
function saveMarker(o,m){const f=o.markerFile+'.tmp';fs.writeFileSync(f,JSON.stringify(m,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(f,o.markerFile);}
function marker(o,create=false){
 const distributionSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'manifest.json'))).update(fs.readFileSync(path.join(root,'inventory.json'))).digest('hex');
 if(fs.existsSync(o.data)&&fs.lstatSync(o.data).isSymbolicLink())throw Error('Data directory must not be a symlink');
 if(fs.existsSync(o.markerFile)){const m=JSON.parse(fs.readFileSync(o.markerFile,'utf8'));if(m.id!==manifest.id||m.root!==root||m.distributionSha256!==distributionSha256||m.port!==o.port||m.hostPort!==o.hostPort)throw Error('Data belongs to another distribution or port configuration. Use a new directory; upgrades require operator review.');return m;}
 if(!create)throw Error('This data directory was not created by this companion');
 if(fs.existsSync(o.data)&&fs.readdirSync(o.data).length)throw Error('Refusing a nonempty existing data directory. Choose a new directory.');
 fs.mkdirSync(o.data,{recursive:true,mode:0o700});const m={id:manifest.id,root,distributionSha256,port:o.port,hostPort:o.hostPort,pluginInstalled:false};fs.writeFileSync(o.markerFile,JSON.stringify(m,null,2)+'\n',{mode:0o600,flag:'wx'});return m;
}
function env(o){
 const e={...process.env};
 for(const k of Object.keys(e))if(k.startsWith('BB_')||['NODE_PATH','NODE_OPTIONS','GH_TOKEN','GITHUB_TOKEN'].includes(k))delete e[k];
 return {...e,PATH:path.join(root,'runtime/node/bin')+path.delimiter+(e.PATH??''),BB_DATA_DIR:o.data,BB_SERVER_URL:o.url,BB_CLI:path.join(bb,'dist/bb.js'),BB_TELEMETRY:'false',DO_NOT_TRACK:'1'};
}
async function run(entry,argv,o){
 const p=spawn(node,[path.join(bb,'dist',entry),...argv],{env:env(o),stdio:['ignore','pipe','pipe']});let stdout='',stderr='',overflow=false;
 const append=(name,v)=>{if(name==='out')stdout+=v;else stderr+=v;if(stdout.length+stderr.length>16*1024*1024){overflow=true;p.kill('SIGTERM');}};
 p.stdout.on('data',v=>append('out',v));p.stderr.on('data',v=>append('err',v));
 const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',resolve);});if(overflow)throw Error('Companion command output exceeded 16 MiB');if(code!==0)throw Error('Companion command failed ('+code+'): '+stderr.slice(-3000));return stdout;
}
async function readJson(o,route){const r=await fetch(o.url+route,{signal:AbortSignal.timeout(3000),headers:{connection:'close'}});if(!r.ok)throw Error('Companion readiness read failed: '+r.status);return r.json();}
async function owned(o){const c=await readJson(o,'/api/v1/system/config');if(path.resolve(c.dataDir)!==o.data)throw Error('Server data directory does not match');}
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
async function start(o){
 if(o.rest.length)throw Error('Unexpected trailing start arguments');verify();await free(o.port);await free(o.hostPort);const m=marker(o,true);
 const managed=path.join(o.data,'companion-plugin');
 if(!fs.existsSync(managed))fs.cpSync(path.join(root,'plugin'),managed,{recursive:true,dereference:true,errorOnExist:true,force:false});
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'),'utf8'));
 for(const item of inventory.filter(v=>v.path.startsWith('plugin/')&&!v.path.startsWith('plugin/dist/'))){const target=path.join(managed,item.path.slice('plugin/'.length));if(item.sha256&&crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==item.sha256)throw Error('Managed plugin source changed: '+item.path);}
 console.log('Starting unofficial Downshift companion at '+o.url+' with separate data '+o.data);
 const child=spawn(node,[path.join(bb,'dist/bb-app.js'),'--data-dir',o.data,'--server-bind-host','127.0.0.1','--server-port',String(o.port),'--host-daemon-port',String(o.hostPort),'--bundled','--no-in-app-updates'],{env:env(o),stdio:'inherit'});
 let exited=false,stopping=false;const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{exited=true;resolve(code??1);});});
 const stop=()=>{stopping=true;if(!exited)child.kill('SIGTERM');};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const end=Date.now()+60000;let ready=false;
  while(Date.now()<end&&!exited&&!stopping){try{await owned(o);ready=true;break;}catch{}await new Promise(r=>setTimeout(r,250));}
  if(stopping){await done;return;}if(!ready)throw Error('Companion did not become ready');
  const first=await readJson(o,'/api/v1/plugins'),installed=first.plugins.find(p=>p.id==='downshift');
  const expectedPresent=!!installed||!m.pluginInstalled;
  if(installed&&installed.rootDir!==managed)throw Error('Unexpected Downshift source; inspect it before continuing');
  if(!installed&&!m.pluginInstalled)await run('bb.js',['plugin','install',managed,'--yes','--json'],o);
  const deadline=Date.now()+45000;let healthy=false;
  while(Date.now()<deadline&&!exited&&!stopping){
   const list=await readJson(o,'/api/v1/plugins'),plugin=list.plugins.find(p=>p.id==='downshift');
   if(plugin&&plugin.rootDir!==managed)throw Error('Unexpected Downshift source');
   if(plugin?.status==='error')throw Error('Downshift failed to load: '+String(plugin.statusDetail??'Unknown plugin error').slice(0,500));
   const pluginReady=expectedPresent?plugin&&(plugin.status==='running'||!plugin.enabled):!plugin;
   const hosts=await readJson(o,'/api/v1/hosts');
   if(pluginReady&&hosts.some(h=>h.status==='connected'&&h.lastRejectedProtocolVersion===null)){healthy=true;break;}
   await new Promise(r=>setTimeout(r,250));
  }
  if(stopping){await done;return;}if(!healthy)throw Error('Plugin and primary daemon did not become ready');
  if(expectedPresent&&!m.pluginInstalled){m.pluginInstalled=true;saveMarker(o,m);}
  if(!expectedPresent)console.log('Downshift remains uninstalled as requested; no automatic reinstall.');
  console.log('Downshift companion ready: '+o.url+' · Settings → Plugins → Downshift');
  process.exitCode=await done;
 }catch(e){stop();await done;throw e;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
try{
 if(command==='help'||command==='--help'||command==='-h')console.log(help);
 else if(command==='verify'){if(args.length)throw Error('verify takes no arguments');verify();}
 else {const o=options();if(command==='start')await start(o);else if(command==='cli'){marker(o);await owned(o);process.stdout.write(await run('bb.js',o.rest,o));}else if(command==='stop'){marker(o);process.stdout.write(await run('bb-app.js',['stop','--data-dir',o.data],o));}else throw Error('Unknown command '+command);}
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
