import {Quaternion} from 'three';
import type { Robot } from './robot';
import { seamBins, type Weld } from './weld';
export class Recorder {
  active=false;
  startTime=0;
  camera=false;
  samples:unknown[]=[];
  frames:{ms:number;webp:string}[]=[];
  events:{ms:number;source:string;value:unknown}[]=[];
  private outcome?:ReturnType<Recorder['outcomeFor']>;
  start(camera:boolean){
    this.startTime=Date.now();this.samples=[];this.frames=[];this.events=[];
    this.outcome=undefined;this.active=true;this.camera=camera;
  }
  input(source:string,value:unknown){
    if(this.active)this.events.push({ms:Date.now()-this.startTime,source,value:value??null});
  }
  stop(w:Weld){this.active=false;this.outcome=this.outcomeFor(w);}
  private outcomeFor(w:Weld){
    return {bead:w.points.map(p=>p.toArray()),trace:w.trace.map(p=>p.toArray()),
      summary:{seamCoverage:w.coverage.size/seamBins,beadMeters:w.traveled},
      seamAudit:Array.from({length:seamBins},(_,bin)=>w.coverage.has(bin)?'deposited':w.missed.has(bin)?'visited':'untouched')};
  }
  sample(r:Robot,w:Weld,input:unknown,canvas:HTMLCanvasElement,view:string){
    if(!this.active)return;
    const ms=Date.now()-this.startTime;
    const orientation=r.gripper.getWorldQuaternion(new Quaternion());
    if(r.root.parent)orientation.premultiply(r.root.parent.getWorldQuaternion(new Quaternion()).invert());
    this.samples.push({ms,joints:r.q.slice(),tip:r.tip().toArray(),direction:r.direction().toArray(),
      gripperQuaternion:orientation.toArray(),
      electrodeLength:r.length,enabled:w.enabled,arc:w.arc,program:w.program,status:w.status,
      gap:w.gap,speed:w.speed,seamDeviation:w.deviation,angleDegrees:w.angle,coverage:w.coverage.size/seamBins,collision:r.collision,stopped:r.stopped,input,view});
    if(this.camera && this.frames.length<300 && (!this.frames.length || ms-this.frames[this.frames.length-1]!.ms>=500)){
      const thumb=document.createElement('canvas');thumb.width=320;thumb.height=Math.round(320*canvas.height/canvas.width);
      thumb.getContext('2d')?.drawImage(canvas,0,0,thumb.width,thumb.height);
      this.frames.push({ms,webp:thumb.toDataURL('image/webp',.67)});
    }
  }
  export(w:Weld){
    const data={schema:'holoweld.demonstration.v1',startTime:new Date(this.startTime).toISOString(),
      coordinates:'station XYZ, +Y up, meters, radians, seconds except explicitly labeled',
      samples:this.samples,events:this.events,camera:this.frames,...(this.outcome??this.outcomeFor(w))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='holoweld-demonstration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
}
