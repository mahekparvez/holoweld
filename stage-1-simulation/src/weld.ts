import { Vector3 } from 'three';
import { down, plateY, seam, type Robot } from './robot';

export const seamBins=57;

export class Weld {
  enabled=false;
  arc=false;
  program: 'straight'|'weave'|null=null;
  speed=0;
  gap=0;
  deviation=0;
  angle=0;
  status='Ready';
  private failure='';
  traveled=0;
  coverage=new Set<number>();
  missed=new Set<number>();
  points: Vector3[]=[];
  trace: Vector3[]=[];
  private last: Vector3;
  private phase=0;
  constructor(readonly robot:Robot){this.last=robot.tip();}
  start(program: Weld['program']) {
    if(this.robot.stopped) return;
    this.failure='';
    if(program && !this.robot.move(new Vector3(seam.start,plateY+.004,seam.z),'tip',down)){
      this.failure='Start position blocked';
      return;
    }
    this.last=this.robot.tip();
    this.phase=0;
    this.enabled=true;
    this.program=program;
  }
  stop() {this.enabled=false;this.arc=false;this.program=null;}
  reset() {
    this.stop();
    this.failure='';
    this.points=[]; this.trace=[]; this.coverage.clear(); this.missed.clear(); this.traveled=0;
    this.last=this.robot.tip(); this.speed=0;
  }
  step(dt:number) {
    const r=this.robot;
    if(r.stopped) this.stop();
    if(this.program){
      this.phase+=dt;
      const circular=this.program==='weave';
      const phase=this.phase*5;
      const amplitude=circular?.0025:0;
      const x=seam.start+this.phase*.011+Math.sin(phase)*amplitude*.65;
      if(x>seam.end) this.stop();
      else if(!r.move(new Vector3(x,plateY+.004,seam.z+(1-Math.cos(phase))*amplitude*.65),'tip',down)){
        this.stop();
        this.failure='Path blocked';
      }
    }
    const tip=r.tip();
    const direction=r.direction();
    this.speed+=(Math.hypot(tip.x-this.last.x,tip.z-this.last.z)/dt-this.speed)*.2;
    this.last=tip.clone();
    this.gap=tip.y-plateY;
    this.deviation=Math.abs(tip.z-seam.z);
    this.angle=Math.acos(Math.min(1,Math.max(-1,-direction.y)))*180/Math.PI;
    if(this.trace.length===0 || this.trace[this.trace.length-1]!.distanceTo(tip)>.001) {
      this.trace.push(tip.clone());
      if(this.trace.length>12000) this.trace.shift();
    }
    const onSeam=tip.x>=seam.start-.002 && tip.x<=seam.end+.002 && this.deviation<.008;
    const bin=Math.max(0,Math.min(seamBins-1,Math.floor((tip.x-seam.start)/.002)));
    if(this.enabled && onSeam && !this.coverage.has(bin))this.missed.add(bin);
    const validGap=this.gap>=.0015 && this.gap<=.0075;
    this.arc=this.enabled && onSeam && validGap && this.angle<=40 && r.length>.025 && !r.collision;
    this.status=r.stopped?'Emergency stop':r.collision?'Collision blocked':!this.enabled?this.failure||'Ready':
      !onSeam?'Off seam':!validGap?'Adjust arc gap':this.angle>40?'Adjust electrode angle':
      r.length<=.025?'Electrode spent':this.speed<.003?'Increase travel speed':this.speed>.032?'Reduce travel speed':'Depositing';
    if(this.arc) {
      r.length=Math.max(.025,r.length-dt*.0012);
      if(this.speed>=.003 && this.speed<=.032) {
        const point=new Vector3(tip.x,plateY+.0009,tip.z);
        const previous=this.points[this.points.length-1];
        if(!previous || previous.distanceTo(point)>.00125) {
          this.points.push(point);
          if(previous && previous.distanceTo(point)<.006) this.traveled+=previous.distanceTo(point);
          this.coverage.add(bin);
          this.missed.delete(bin);
        }
      }
    }
  }
}
