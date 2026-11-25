import {Quaternion,Vector3,type ExtensionFactory} from '../stage-1-simulation/src/extension';
import {Clutch,type HandPose} from './clutch';

export const attach:ExtensionFactory=(host,station,robot,weld,record)=>{
  host.innerHTML=`<div class="panelHeading"><h2>HoloLens control</h2></div>
    <button class="wide" data-enter>Enter mixed reality</button>
    <label class="inline">Movement scale <input data-scale type="number" value="0.45" min="0.05" max="1" step="0.05"></label>
    <button class="wide" data-check>Check compatibility</button>
    <p class="hint" role="status" data-result>Checking browser compatibility…</p>`;
  const readout=host.querySelector<HTMLElement>('[data-result]')!;
  const enter=host.querySelector<HTMLButtonElement>('[data-enter]')!;
  const scale=host.querySelector<HTMLInputElement>('[data-scale]')!;
  const {renderer,scene,room,rig}=station;
  const clutch=new Clutch();
  let session:XRSession|undefined;
  let placed=false;
  let opening=false;
  let last=0;
  let source:XRInputSource|undefined;
  let sample:unknown=null;
  let placedAt=0;
  const report=(message:string)=>{if(readout.textContent!==message)readout.textContent=message;};
  const check=async()=>{
    enter.disabled=true;
    if(!window.isSecureContext){report('HTTPS is required for immersive AR. Desktop controls are available.');return;}
    if(!navigator.xr){report('WebXR API unavailable. Desktop controls are available.');return;}
    try{
      const supported=await navigator.xr.isSessionSupported('immersive-ar');
      enter.disabled=!supported;
      report(supported?'Immersive AR available. Articulated hands are checked in-session.':
        'Secure context · WebXR present · Immersive AR unavailable. Desktop controls are available.');
    }catch(error){report(`WebXR check failed: ${String(error)}`);}
  };
  host.querySelector<HTMLButtonElement>('[data-check]')!.onclick=()=>void check();
  enter.onclick=async()=>{
    if(session||opening||!navigator.xr)return;
    opening=true;
    try{
      const active=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});
      session=active;
      renderer.xr.enabled=true;
      renderer.xr.setReferenceSpaceType('local-floor');
      const bg=scene.background;
      scene.background=null;
      room.visible=false;rig.visible=false;
      weld.stop();
      active.addEventListener('end',()=>{
        session=undefined;placed=false;sample=null;source=undefined;
        clutch.clear();weld.stop();
        rig.position.set(0,0,0);rig.updateMatrixWorld(true);
        scene.background=bg;rig.visible=room.visible=true;
        report('Session ended. Desktop controls are available.');
        requestAnimationFrame(()=>station.resize());
      },{once:true});
      active.addEventListener('visibilitychange',()=>{
        clutch.clear();sample=null;
        if(active.visibilityState!=='visible')weld.stop();
      });
      active.addEventListener('select',event=>{
        if(placed)return;
        const ref=renderer.xr.getReferenceSpace();
        const viewer=ref&&event.frame.getViewerPose(ref);
        if(!viewer)return;
        const {position:p,orientation:q}=viewer.transform;
        const ahead=new Vector3(0,0,-1).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w));
        ahead.y=0;ahead.normalize();
        rig.position.set(p.x+ahead.x*1.15,0,p.z+ahead.z*1.15);
        rig.updateMatrixWorld(true);rig.visible=true;placed=true;placedAt=performance.now();
        record('XR placement',rig.position.toArray());
      });
      await renderer.xr.setSession(active);
      report('Air-tap to place the cell on the reference floor.');
    }catch(error){
      await session?.end().catch(()=>{});
      report(`Immersive session failed: ${String(error)}`);
    }finally{opening=false;}
  };
  void check();
  return {
    close:()=>{void session?.end().catch(()=>{});},
    sample:()=>sample,
    frame:(frame)=>{
      if(!session||!frame||!placed||session.visibilityState!=='visible')return;
      const ref=renderer.xr.getReferenceSpace();
      if(!ref)return;
      const available=[...session.inputSources].filter(input=>input.hand);
      const next=available.find(input=>input.handedness==='right')??available[0];
      if(next!==source){clutch.clear();source=next;}
      const joint=(name:XRHandJoint)=>{
        const space=source?.hand?.get(name);
        return space?frame.getJointPose?.(space,ref)?.transform:undefined;
      };
      const wrist=joint('wrist'),thumb=joint('thumb-tip'),index=joint('index-finger-tip');
      const vector=(p:DOMPointReadOnly)=>new Vector3(p.x,p.y,p.z);
      const q=wrist?.orientation;
      const hand:HandPose|null=wrist && q && thumb && index?{
        position:vector(wrist.position).sub(rig.position),
        orientation:new Quaternion(q.x,q.y,q.z,q.w),
        pinchGap:vector(thumb.position).distanceTo(vector(index.position)),
      }:null;
      const now=performance.now();
      if(!hand||robot.stopped||now-placedAt<300){
        clutch.clear();sample=null;
        report(robot.stopped?'Simulation E-stop active.': 'Waiting for articulated hand tracking.');
        return;
      }
      report('Open your hand, then hold a pinch to move the tool. Release to reclutch.');
      const tool={position:robot.tip(),axis:robot.direction()};
      const gain=Math.max(.05,Math.min(1,Number(scale.value)||.45));
      const target=clutch.update(hand,tool,gain);
      sample={handPosition:hand.position.toArray(),handOrientation:hand.orientation.toArray(),pinchGap:hand.pinchGap,driving:!!target};
      if(!target|| now-last<33)return;
      last=now;
      // Limit each committed translation after a tracking jump.
      const delta=target.position.sub(tool.position).clampLength(0,.008);
      const tilt=tool.axis.angleTo(target.axis);
      const axis=tool.axis.clone().lerp(target.axis,Math.min(1,.13/Math.max(tilt,1e-6))).normalize();
      weld.program=null;
      robot.move(tool.position.add(delta),'tip',axis);
    },
  };
};
