import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../../stage-1-simulation/node_modules/vite/dist/node/index.js';
import {Box3,Vector3} from '../../stage-1-simulation/node_modules/three/build/three.module.js';

const stage=resolve(dirname(fileURLToPath(import.meta.url)),'../../stage-1-simulation');
const output=resolve(stage,'../stage-2-mixed-reality/Unity/Assets/Resources/SO101');
const source=resolve(stage,'public/so101');
await mkdir(output,{recursive:true});
const model=JSON.parse(await readFile(resolve(source,'model.json'),'utf8'));
const assets=new Set();
function gather(link){
  for(const item of link.meshes)assets.add(item.file);
  for(const child of link.children)gather(child);
}
gather(model);
for(const file of [...assets].sort()){
  const data=await readFile(resolve(source,'assets',file));
  if(data.length!==84+data.readUInt32LE(80)*50)throw new Error('Invalid binary STL: '+file);
  await writeFile(resolve(output,file.replace(/\.stl$/,'.bytes')),data);
}
await copyFile(resolve(source,'model.json'),resolve(output,'Model.json'));
await copyFile(resolve(source,'LICENSE'),resolve(output,'LICENSE.txt'));

const server=await createServer({root:stage,configFile:false,server:{middlewareMode:true,ws:false},appType:'custom'});
try{
  const {Robot}=await server.ssrLoadModule('/src/robot.ts');
  const {Weld}=await server.ssrLoadModule('/src/weld.ts');
  const passes=[];
  for(const program of ['straight','weave']){
    const robot=new Robot(model);robot.reset();
    const point=(...coords)=>new Vector3(...coords);
    for(const x of [.211,.323])for(const z of [-.087,.087]){
      robot.setObstacle(new Box3().setFromCenterAndSize(point(x,.86,z),point(.027,.049,.023)));
    }
    robot.setObstacle(new Box3(point(-.06,.785,-.29),point(.769,.833,.29)));
    robot.setObstacle(new Box3(point(.185,.833,-.1),point(.339,.859,.1)));
    robot.setObstacle(new Box3(point(.745,.37,-.344),point(.995,.636,-.105)));
    const weld=new Weld(robot);
    weld.start(program);
    const rows=[];
    for(let i=0;i<900&&weld.enabled;i++){
      weld.step(1/60);
      if(robot.collision || !robot.q.every(Number.isFinite))throw new Error('Invalid robot pose');
      rows.push({q:robot.q.slice(),length:robot.length,tip:robot.tip().toArray(),arc:weld.arc,beadCount:weld.points.length});
    }
    if(weld.coverage.size!==57 || weld.enabled)throw new Error(`Incomplete ${program} reference pass`);
    passes.push({program,rows,bead:weld.points.map((p)=>({xyz:p.toArray()}))});
    console.log(`${program}: ${rows.length} frames, ${weld.coverage.size} covered bins, ${assets.size} shared meshes`);
  }
  await writeFile(resolve(output,'Passes.json'),JSON.stringify({rate:60,passes})+'\n');
}finally{await server.close();}
