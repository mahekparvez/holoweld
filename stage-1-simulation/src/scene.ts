import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { electrodeAxis,electrodeRoot,plateY,quat,seam,toolRoot,v,type Robot } from './robot';
import type { Weld } from './weld';

const metal=(color:number,metalness=.52,roughness=.43)=>new T.MeshStandardMaterial({color,metalness,roughness});
const dark=metal(0x282d32), iron=metal(0x5c666f), yellow=metal(0xd99031,.22), silver=metal(0xa3afba,.78,.32);
const rubber=metal(0x191b1d,.03,.75);
const rect=(x:number,y:number,z:number)=>new T.BoxGeometry(x,y,z);
function mesh(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0) {
  const item=new T.Mesh(g,m);
  item.position.set(x,y,z);
  item.castShadow=item.receiveShadow=true;
  parent.add(item);
  return item;
}
const box=(parent:T.Object3D, m:T.Material, x:number,y:number,z:number,w:number,h:number,d:number)=>
  mesh(parent,rect(w,h,d),m,x,y,z);
const rod=(parent:T.Object3D,m:T.Material,a:T.Vector3,b:T.Vector3,r:number,r2=r)=>{
  const d=b.clone().sub(a);
  const item=mesh(parent,new T.CylinderGeometry(r2,r,d.length(),12),m);
  item.position.copy(a).lerp(b,.5);
  item.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  return item;
};
const p=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
function cable(parent:T.Object3D,m:T.Material,pts:T.Vector3[],radius:number) {
  const curve=new T.CatmullRomCurve3(pts);
  return mesh(parent,new T.TubeGeometry(curve,48,radius,8),m);
}
function texture(linear=false) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  const data=ctx.createImageData(canvas.width,canvas.height);
  let seed=19;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let y=0;y<canvas.height;y++) {
    const streak=rand()*32;
    for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      const n=(linear?178+streak:177+Math.sin(x*.09)*Math.sin(y*.07)*14)+rand()*40;
      data.data.set([n,n,n,255],i);
    }
  }
  ctx.putImageData(data,0,0);
  const tex=new T.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.anisotropy=4;
  return tex;
}
function sign(parent:T.Object3D,text:string,sub:string,x:number,y:number,z:number,w:number,h:number) {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#21292e'; ctx.fillRect(0,0,768,256);
  ctx.fillStyle='#db9b51';ctx.fillRect(30,34,14,188);
  ctx.font='bold 77px sans-serif';ctx.fillStyle='#e3e8eb';ctx.fillText(text,69,125);
  ctx.font='31px monospace';ctx.fillStyle='#a5b2ba';ctx.fillText(sub,73,190);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  return mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}),x,y,z);
}
export type View='Orbit'|'First person'|'Robot';
export class Station {
  renderer:T.WebGLRenderer;
  scene=new T.Scene();
  rig=new T.Group();
  room=new T.Group();
  camera=new T.PerspectiveCamera(43,1,.015,25);
  orbit:OrbitControls;
  view:View='Orbit';
  freeKeys=new Set<string>();
  private electrode:T.Mesh;
  private beads:T.InstancedMesh;
  private trace:T.Line;
  private spark:T.LineSegments;
  private sparkData:{p:T.Vector3;v:T.Vector3;ttl:number}[]=[];
  private arc:T.Mesh;
  private arcLight:T.PointLight;
  private arcHalo:T.Sprite;
  private shown=0;
  private seenTrace=0;
  private activeCable:T.Mesh;
  private cableAnchor=p(.83,.56,-.22);
  private clamps:T.Group[]=[];
  private look=new T.Euler(0,0,0,'YXZ');
  loaded:Promise<void>;
  constructor(readonly host:HTMLElement,readonly robot:Robot) {
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.12;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    const canvas=this.renderer.domElement;
    host.append(canvas);
    canvas.addEventListener('pointerdown',event=>{
      if(this.view==='First person')canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(this.view!=='First person'||!canvas.hasPointerCapture(event.pointerId))return;
      this.look.setFromQuaternion(this.camera.quaternion,'YXZ');
      this.look.y-=event.movementX*.004;
      this.look.x=T.MathUtils.clamp(this.look.x-event.movementY*.004,-1.5,1.5);
      this.camera.quaternion.setFromEuler(this.look);
    });
    const env=new RoomEnvironment();
    const generator=new T.PMREMGenerator(this.renderer);
    this.scene.environment=generator.fromScene(env,.045).texture;
    env.dispose(); generator.dispose();
    this.scene.background=new T.Color(0x202830);
    this.scene.fog=new T.Fog(0x29313a,2.6,7);
    this.scene.add(this.room,this.rig);
    this.rig.add(robot.root);
    this.scene.add(new T.HemisphereLight(0xcde4ff,0x67584d,1.6));
    const key=new T.DirectionalLight(0xffecd5,3.8);
    key.position.set(-.5,2.8,1.65); key.target.position.set(.3,.65,0);
    key.castShadow=true; key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-1.7,right:1.7,top:1.7,bottom:-1.7,near:.1,far:6});
    key.shadow.normalBias=.008; key.shadow.bias=-.0003;
    this.scene.add(key,key.target);
    const fill=new T.DirectionalLight(0xbfdcff,1.9);fill.position.set(.2,2,-1.8);this.scene.add(fill);
    this.buildRoom();
    this.buildBench();
    this.loaded=this.loadRobot();
    const gripper=robot.gripper;
    box(gripper,dark,.035,.021,-.019,.024,.017,.023);
    rod(gripper,silver,p(.035,.026,-.019),p(.035,.034,-.019),.006);
    const clampEnd=p(-.01,0,-.126);
    rod(gripper,rubber,toolRoot,clampEnd,.015,.013);
    rod(gripper,dark,clampEnd,electrodeRoot,.014,.010);
    rod(gripper,silver,p(.004,-.011,-.108),p(.004,.011,-.108),.004);
    this.electrode=mesh(gripper,new T.CylinderGeometry(.0017,.0017,1,12),metal(0xaba596,.42,.6));
    this.electrode.quaternion.setFromUnitVectors(p(0,1,0),electrodeAxis);
    this.activeCable=cable(this.rig,rubber,[this.cableAnchor,p(.4,.6,0),p(.1,1,0)],.006);
    this.beads=new T.InstancedMesh(new T.SphereGeometry(1,10,6),metal(0x534b43,.68,.4),6500);
    this.beads.frustumCulled=false;
    this.beads.count=0;
    this.beads.castShadow=true;
    this.rig.add(this.beads);
    this.trace=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x61c5ce,transparent:true,opacity:.63}));
    this.rig.add(this.trace);
    this.spark=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(240*6),3)),new T.LineBasicMaterial({color:0xffa146,transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false}));
    this.spark.frustumCulled=false;this.rig.add(this.spark);
    this.arc=mesh(this.rig,new T.SphereGeometry(.0035,10,8),new T.MeshBasicMaterial({color:0xfff4dc}));
    this.arcLight=new T.PointLight(0x8bc8ff,0,.18,2);
    const halo=document.createElement('canvas');halo.width=halo.height=96;
    const ctx=halo.getContext('2d')!;const gradient=ctx.createRadialGradient(48,48,0,48,48,48);
    gradient.addColorStop(0,'rgba(255,251,230,1)');gradient.addColorStop(.13,'rgba(160,209,255,.75)');gradient.addColorStop(.42,'rgba(98,137,255,.23)');gradient.addColorStop(1,'rgba(70,120,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,96,96);
    this.arcHalo=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(halo),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
    this.arcHalo.scale.setScalar(.085);
    this.rig.add(this.arcLight,this.arcHalo);
    this.orbit=new OrbitControls(this.camera,this.renderer.domElement);
    this.orbit.enableDamping=true; this.orbit.minDistance=.15; this.orbit.maxDistance=4;this.orbit.maxPolarAngle=Math.PI*.485;
    this.setView('Orbit');
    new ResizeObserver(()=>this.resize()).observe(host);this.resize();
  }
  resize() {
    const w=this.host.clientWidth,h=this.host.clientHeight;
    if(!w||!h||this.renderer.xr.isPresenting)return;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);
  }
  async loadRobot(){
    const loader=new STLLoader();
    const paths=new Set(this.robot.links.flatMap(link=>link.model.meshes.map(m=>m.file)));
    const geometries=new Map(await Promise.all([...paths].map(async file=>[file,await loader.loadAsync('/so101/assets/'+file)] as const)));
    for(const link of this.robot.links) for(const visual of link.model.meshes) {
      const m=mesh(link.frame,geometries.get(visual.file)!,visual.file.startsWith('sts')?dark:yellow);
      m.position.copy(v(visual.pos));m.quaternion.copy(quat(visual.quat));
    }
  }
  private buildRoom() {
    const floor=metal(0x4a5155,.04,.87);floor.map=texture();floor.map.repeat.set(6,6);
    box(this.room,floor,.7,-.052,0,8,.1,7);
    const wall=metal(0x3b454e,.17,.75), rib=metal(0x4b5760,.38,.63);
    box(this.room,wall,.7,1.43,-1.12,7,2.9,.08);
    box(this.room,wall,-1.77,1.43,0,.08,2.9,2.2);
    for(let i=-12;i<23;i++) box(this.room,rib,i*.145,1.48,-1.07,.024,2.87,.035);
    for(const y of [.18,1.2,2.56]) box(this.room,dark,.62,y,-1.037,5.2,.053,.055);
    for(const x of [-1.15,.55,2.18]) box(this.room,dark,x,1.4,-1.018,.07,2.8,.1);
    sign(this.room,'WELD BAY','SMAW  /  ROBOTICS LAB',.37,1.46,-.994,.58,.195);
    for(const x of [-.78,1.26]) {
      box(this.room,dark,x,2.36,-.64,.85,.037,.075);
      box(this.room,new T.MeshBasicMaterial({color:0xf4f5f5}),x,2.336,-.64,.78,.011,.038);
    }
    for(let i=0;i<15;i++){
      const mark=box(this.room,i%2?yellow:dark,-.6+i*.125,.0005,.73,.125,.002,.056);
      mark.rotation.y=.28;
    }
    for(const x of [-1.05,1.48]) {
      box(this.room,dark,x,.43,-.75,.43,.85,.38);
      box(this.room,iron,x,.862,-.75,.46,.018,.41);
      for(let i=0;i<5;i++){
        box(this.room,rib,x,.15+i*.139,-.548,.4,.123,.021);
        box(this.room,silver,x,.17+i*.139,-.53,.13,.011,.018);
      }
    }
    const conduit=metal(0x768994,.53);
    for(const y of [1.81,1.86]) rod(this.room,conduit,p(-1.32,y,-.985),p(2.32,y,-.985),.008);
  }
  private buildBench(){
    const top=metal(0x606b70,.56,.49);top.map=texture(true);
    box(this.rig,top,.354,.814,0,.83,.041,.58);
    box(this.rig,iron,.354,.782,0,.81,.024,.554);
    for(const x of [.006,.695]) for(const z of [-.227,.227]){
      box(this.rig,dark,x,.39,z,.052,.77,.052);
      box(this.rig,iron,x,.018,z,.081,.018,.081);
      for(const k of [-1,1]) mesh(this.rig,new T.CylinderGeometry(.006,.006,.006,6),silver,x+k*.026,.029,z);
    }
    for(const z of [-.227,.227]) box(this.rig,dark,.35,.26,z,.70,.037,.04);
    box(this.rig,dark,.35,.27,0,.73,.026,.49);
    sign(this.rig,'HW / 01','SO-101  •  SMAW',.37,.747,.29,.184,.061);
    const plate=metal(0x84939d,.72,.37);plate.map=texture(true);
    for(const z of [-.075,.075]) box(this.rig,dark,.262,.843,z,.146,.016,.043);
    for(const z of [-.05,.05]) box(this.rig,plate,.262,plateY-.004,z,.154,.008,.0975);
    const seamMat=metal(0x12181a,.28);
    box(this.rig,seamMat,.262,.836,0,.152,.002,.0024);
    const line=new T.Line(new T.BufferGeometry().setFromPoints([p(seam.start,plateY+.00035,0),p(seam.end,plateY+.00035,0)]),new T.LineDashedMaterial({color:0x56bac2,dashSize:.003,gapSize:.0025,transparent:true,opacity:.85}));
    line.computeLineDistances();this.rig.add(line);
    for(const x of [seam.start,seam.end]) box(this.rig,new T.MeshBasicMaterial({color:0x72d3d4}),x,plateY+.00045,0,.0012,.0006,.017);
    for(const x of [.211,.323]) for(const z of [-.087,.087]){
      const group=new T.Group();group.position.set(x,.837,z);this.rig.add(group);this.clamps.push(group);
      box(group,dark,0,.0075,0,.029,.015,.022);
      box(group,yellow,0,.024,Math.sign(z)*.008,.026,.018,.022);
      rod(group,silver,p(0,.013,0),p(0,.045,0),.003);
      rod(group,dark,p(-.013,.043,0),p(.013,.043,0),.0025);
      const obstacle=new T.Box3();
      this.robot.setObstacle(obstacle.setFromCenterAndSize(p(x,.86,z),p(.027,.049,.023)));
    }
    this.robot.setObstacle(new T.Box3(p(-.06,.785,-.29),p(.769,.833,.29)));
    this.robot.setObstacle(new T.Box3(p(.185,.833,-.1),p(.339,plateY,.1)));
    this.robot.setObstacle(new T.Box3(p(.745,.37,-.344),p(.995,.636,-.105)));
    const machine=metal(0xad572e,.25,.43);
    box(this.rig,dark,.87,.42,-.23,.244,.09,.238);
    box(this.rig,machine,.87,.548,-.23,.234,.173,.216);
    box(this.rig,dark,.87,.549,-.116,.228,.166,.014);
    box(this.rig,metal(0x253631,.1),.834,.589,-.106,.096,.037,.008);
    sign(this.rig,'SMAW','POWER UNIT',.874,.552,-.103,.115,.038);
    for(const x of [.824,.916]){
      rod(this.rig,x<.87?yellow:rubber,p(x,.501,-.113),p(x,.501,-.091),.013);
    }
    for(let i=0;i<7;i++) box(this.rig,dark,.751,.531+i*.011,-.236,.006,.004,.134);
    cable(this.rig,rubber,[p(.916,.5,-.09),p(.95,.29,.07),p(.85,.045,.29),p(.61,.053,.23),p(.52,.32,.246),p(.332,.836,.06)],.006);
    cable(this.rig,rubber,[p(.824,.50,-.09),p(.78,.41,-.03),p(.72,.4,-.12),this.cableAnchor],.006);
  }
  shiftClamps(offset:number) {
    const previous=this.clamps.map(group=>group.position.z);
    const apply=(positions:number[])=>this.clamps.forEach((group,i)=>{
      group.position.z=positions[i];
      this.robot.obstacles[i].center.z=positions[i];
    });
    apply(previous.map((_,i)=>(i%2?1:-1)*(.087+offset)));
    if(this.robot.hits()){apply(previous);return false;}
    return true;
  }
  setView(view:View){
    this.view=view;
    this.orbit.enabled=view==='Orbit';
    if(view==='Orbit'){
      this.camera.position.set(.96,1.37,.93);this.orbit.target.set(.29,.82,0);this.orbit.update();
    }
    if(view==='First person'){
      this.camera.position.set(.69,1.42,.72);this.camera.lookAt(.26,.86,0);
    }
  }
  render(weld:Weld,dt:number) {
    const r=this.robot;
    if(!this.renderer.xr.isPresenting){
      if(this.view==='Orbit')this.orbit.update();
      if(this.view==='Robot'){
        this.camera.position.copy(r.point(p(.035,.033,-.019)));
        this.camera.lookAt(r.point(electrodeRoot.clone().addScaledVector(electrodeAxis,.127)));
      }
      if(this.view==='First person'){
        const forward=this.camera.getWorldDirection(p(0,0,0));forward.y=0;forward.normalize();
        const right=forward.clone().cross(p(0,1,0));
        for(const [key,d] of [['w',forward],['s',forward.clone().negate()],['d',right],['a',right.clone().negate()]] as const)
          if(this.freeKeys.has(key))this.camera.position.addScaledVector(d,dt*.75);
      }
    }
    this.electrode.position.copy(electrodeRoot).addScaledVector(electrodeAxis,r.length/2);
    this.electrode.scale.y=r.length;
    const cableEnd=r.point(toolRoot);
    if(this.activeCable.position.distanceToSquared(cableEnd)>.000001){
      this.activeCable.geometry.dispose();this.activeCable.removeFromParent();
      const pts=[this.cableAnchor,p(.63,.52,-.2),p(cableEnd.x+.09,cableEnd.y-.17,cableEnd.z-.105),cableEnd];
      this.activeCable=cable(this.rig,rubber,pts.map(point=>point.clone().sub(cableEnd)),.005);
      this.activeCable.position.copy(cableEnd);
    }
    if(weld.points.length<this.shown){this.shown=0;this.beads.count=0;}
    const marker=new T.Object3D();
    for(;this.shown<weld.points.length && this.shown<6500;this.shown++){
      marker.position.copy(weld.points[this.shown]);marker.scale.set(.0021,.0011,.0025);
      marker.rotation.y=this.shown*.73;marker.updateMatrix();
      this.beads.setMatrixAt(this.shown,marker.matrix);
      const color=new T.Color().setHSL(.08+(this.shown%7)*.012,.19,.30+(this.shown%4)*.035);
      this.beads.setColorAt(this.shown,color);
      this.beads.count=this.shown+1;
      this.beads.instanceMatrix.needsUpdate=true;
      this.beads.instanceColor!.needsUpdate=true;
    }
    if(weld.trace.length!==this.seenTrace){
      this.seenTrace=weld.trace.length;
      this.trace.geometry.dispose();
      this.trace.geometry=new T.BufferGeometry().setFromPoints(weld.trace);
    }
    const tip=r.tip();
    this.arc.visible=this.arcHalo.visible=weld.arc;
    this.arc.position.copy(tip);this.arcHalo.position.copy(tip);this.arcLight.position.copy(tip).y+=.013;
    this.arcLight.intensity=weld.arc?.3+Math.random()*.18:0;
    if(weld.arc) for(let i=0;i<4;i++){
      const a=Math.random()*Math.PI*2;const speed=.2+Math.random()*.8;
      this.sparkData.push({p:tip.clone(),v:p(Math.cos(a)*speed,.24+Math.random()*.57,Math.sin(a)*speed),ttl:.18+Math.random()*.24});
    }
    this.sparkData=this.sparkData.filter(s=>s.ttl>0 && s.p.y>plateY-.02).slice(-240);
    const points=this.spark.geometry.getAttribute('position');
    this.sparkData.forEach((s,i)=>{
      s.ttl-=dt;s.v.y-=dt*3.1;s.p.addScaledVector(s.v,dt);
      const tail=s.p.clone().addScaledVector(s.v,-.021);
      points.setXYZ(i*2,s.p.x,s.p.y,s.p.z);
      points.setXYZ(i*2+1,tail.x,tail.y,tail.z);
    });
    this.spark.geometry.setDrawRange(0,this.sparkData.length*2);points.needsUpdate=true;
    this.renderer.render(this.scene,this.camera);
  }
}
