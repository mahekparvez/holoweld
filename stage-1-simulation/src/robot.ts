import { Box3, Group, Matrix3, Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';

type Pose = { pos: number[]; quat: number[] };
export type Link = Pose & {
  name: string; joint?: string; limits?: [number, number]; axis?: number[];
  meshes: (Pose & {file: string})[];
  boxes: (Pose & {half: number[]})[];
  children: Link[];
};
export const v = (a: number[]) => new Vector3(a[0], a[1], a[2]);
export const quat = ([w,x,y,z]: number[]) => new Quaternion(x,y,z,w).normalize();
export const plateY = .859;
export const seam = { start: .205, end: .319, z: .0 };
export const toolRoot = new Vector3(0, 0, -.075);
export const electrodeRoot = new Vector3(.022, 0, -.113);
export const electrodeAxis = new Vector3(-.76, 0, -.65).normalize();
const initialLength = .092;
export const down = new Vector3(-.3,-1,0).normalize();

export class Robot {
  root = new Group();
  joints: { frame: Group; rotation: Quaternion; axis: Vector3; limits: [number,number]; name: string }[] = [];
  links: { model: Link; frame: Group; depth: number }[] = [];
  boxes: { frame: Group; shape: OBB; depth: number }[] = [];
  obstacles: OBB[] = [];
  q: number[] = [];
  home: number[] = [];
  gripper!: Group;
  length = initialLength;
  collision = false;
  stopped = false;
  constructor(model: Link) {
    this.root.position.set(0,.836,0);
    this.root.rotation.x = -Math.PI/2;
    const build = (data: Link, parent: Group, depth: number) => {
      const frame = new Group();
      parent.add(frame);
      frame.position.copy(v(data.pos));
      frame.quaternion.copy(quat(data.quat));
      this.links.push({model:data,frame,depth});
      if (data.joint && data.joint !== 'gripper') {
        this.joints.push({frame,rotation:frame.quaternion.clone(),axis:v(data.axis!),limits:data.limits!,name:data.joint});
      }
      if(data.name === 'gripper') this.gripper = frame;
      for (const box of data.boxes) {
        this.boxes.push({frame,depth,shape:new OBB(v(box.pos),v(box.half).multiplyScalar(.9),
          new OBB().rotation.setFromMatrix4(new Matrix4().makeRotationFromQuaternion(quat(box.quat))) )});
      }
      data.children.forEach(child => build(child,frame,depth+1));
    };
    build(model,this.root,0);
    this.q = this.joints.map(() => 0);
    this.home = [-.001, -.973, .660, 1.312, .048];
    this.apply(this.q);
  }
  apply(q: number[]) {
    this.joints.forEach((j,i) => j.frame.quaternion.copy(j.rotation).multiply(new Quaternion().setFromAxisAngle(j.axis,q[i])));
    this.root.updateMatrixWorld(true);
  }
  point(local: Vector3) {
    const p = local.clone().applyMatrix4(this.gripper.matrixWorld);
    return this.root.parent ? p.applyMatrix4(this.root.parent.matrixWorld.clone().invert()) : p;
  }
  tip() {return this.point(electrodeRoot.clone().addScaledVector(electrodeAxis,this.length));}
  end() {return this.point(toolRoot);}
  direction() {return this.tip().sub(this.point(electrodeRoot)).normalize();}
  setObstacle(box: Box3) { this.obstacles.push(new OBB().fromBox3(box)); }
  hits() {
    const inverse = this.root.parent?.matrixWorld.clone().invert() ?? new Matrix4();
    const boxes = this.boxes.map(({shape,frame})=>{
      const matrix=inverse.clone().multiply(frame.matrixWorld);
      const rotation=new Matrix3().setFromMatrix4(matrix).multiply(shape.rotation);
      return new OBB(shape.center.clone().applyMatrix4(matrix),shape.halfSize,rotation);
    });
    if(boxes.some(b=>this.obstacles.some(o=>b.intersectsOBB(o)))) return true;
    for(let i=0;i<boxes.length;i++) for(let j=0;j<i;j++) {
      if(this.boxes[i].depth-this.boxes[j].depth>2 && boxes[i].intersectsOBB(boxes[j])) return true;
    }
    const a=this.point(electrodeRoot), b=this.tip(), h=this.end();
    return ([[a,b,.0017],[h,a,.010]] as const).some(([start,end,radius])=>{
      const origin=start, delta=end.clone().sub(origin);
      const length=delta.length();
      const ray=new Ray(origin,delta.normalize());
      return this.obstacles.some(obstacle=>{
        const padded=obstacle.clone();
        padded.halfSize.addScalar(radius);
        const hit=padded.intersectRay(ray,new Vector3());
        return padded.containsPoint(origin) || !!hit && hit.distanceTo(origin)<=length;
      });
    });
  }
  commit(q: number[]) {
    if(this.stopped || q.length!==this.q.length || !q.every(Number.isFinite)) return false;
    const bounded = q.map((value,i)=>Math.max(this.joints[i].limits[0],Math.min(this.joints[i].limits[1],value)));
    const steps=Math.max(1,Math.ceil(Math.max(...bounded.map((value,i)=>Math.abs(value-this.q[i])))/.045));
    for(let step=1;step<=steps;step++) {
      this.apply(this.q.map((value,i)=>value+(bounded[i]-value)*step/steps));
      if(this.hits()) {
        this.collision=true;
        this.apply(this.q);
        return false;
      }
    }
    this.collision=false;
    this.q=bounded;
    return true;
  }
  solve(target: Vector3, mode: 'tip'|'end' = 'tip', axis: Vector3 | null = down, seed = this.q, iterations=22) {
    const q=seed.slice();
    const sample=()=>{
      const p=this[mode]().sub(target);
      const d=axis ? this.direction().sub(axis).multiplyScalar(.055) : new Vector3();
      return [...p.toArray(),...d.toArray()];
    };
    this.apply(q);
    let residual=sample();
    for(let step=0;step<iterations;step++) {
      if(Math.hypot(...residual)<.000095) break;
      const columns=q.map((value,i)=>{
        q[i]+=.0005;
        this.apply(q);
        const next=sample().map((value,j)=>(value-residual[j])/.0005);
        q[i]=value;
        return next;
      });
      // Damped normal equations, solved by Gauss–Jordan elimination.
      const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
      const matrix=columns.map((a,i)=>columns.map((b,j)=>dot(a,b)+(i===j?.000025:0)).concat(-dot(a,residual)));
      for(let i=0;i<q.length;i++){
        const scale=matrix[i][i];
        matrix[i]=matrix[i].map(x=>x/scale);
        for(let j=0;j<q.length;j++) if(i!==j) {
          const factor=matrix[j][i];
          matrix[j]=matrix[j].map((x,k)=>x-factor*matrix[i][k]);
        }
      }
      for(let i=0;i<q.length;i++){
        const [lo,hi]=this.joints[i].limits;
        q[i]=Math.max(lo,Math.min(hi,q[i]+Math.max(-.22,Math.min(.22,matrix[i][q.length]))));
      }
      this.apply(q);
      residual=sample();
    }
    const error=Math.hypot(...residual);
    const clear=!this.hits();
    this.apply(this.q);
    return {q,error,clear};
  }
  move(target: Vector3, mode: 'tip'|'end', axis?: Vector3|null) {
    const result=this.solve(target,mode,axis);
    if(!result.clear) this.collision=true;
    return result.error<.004 && result.clear && this.commit(result.q);
  }
  reset() {
    this.stopped=false;
    this.collision=false;
    this.length=initialLength;
    this.q=this.home.slice();
    this.apply(this.q);
  }
}
