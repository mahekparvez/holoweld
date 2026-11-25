import {render} from 'preact';
import {useEffect,useRef,useState} from 'preact/hooks';
import {Vector3} from 'three';
import {Robot, type Link} from './robot';
import {Station,type View} from './scene';
import {Weld,seamBins} from './weld';
import {Recorder} from './record';
import './style.css';

const names=['Shoulder pan','Shoulder lift','Elbow flex','Wrist flex','Wrist roll'];
const rad=180/Math.PI;
const mm=(m:number)=>(m*1000).toFixed(1);
const axisKeys:Record<string,number[]>={ArrowLeft:[-1,0,0],ArrowRight:[1,0,0],ArrowUp:[0,0,-1],ArrowDown:[0,0,1],PageUp:[0,1,0],PageDown:[0,-1,0]};
type Runtime={r:Robot;s:Station;w:Weld;rec:Recorder};

function Mark(){return <span class="mark" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M3 4v16m18-16v16M3 12h5m8 0h5M13 3l-4 9h6l-4 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="square"/></svg></span>;}
function App(){
  const viewport=useRef<HTMLDivElement>(null);
  const runtime=useRef<Runtime|null>(null);
  const input=useRef({event:'initial',at:Date.now(),value:null as unknown});
  const [loading,setLoading]=useState('Loading workstation');
  const [view,setView]=useState<View>('Orbit');
  const [tab,setTab]=useState('Robot');
  const [mode,setMode]=useState<'tip'|'end'>('tip');
  const [step,setStep]=useState(2);
  const [recordCamera,setRecordCamera]=useState(false);
  const [notice,setNotice]=useState('');
  const [clampOffset,setClampOffset]=useState(0);
  const [,repaint]=useState(0);
  const event=(name:string,value?:unknown)=>{
    input.current={event:name,at:Date.now(),value:value??null};
    runtime.current?.rec.input(name,value);
  };
  function jog(delta:Vector3, source:string, target=mode){
    const rt=runtime.current;
    if(!rt || rt.r.stopped)return;
    event(source,{delta:delta.toArray(),target});
    rt.w.program=null;
    const ok=rt.r.move(rt.r[target]().add(delta),target,null);
    setNotice(ok?'':rt.r.collision?'Motion would collide with the station.':'Target outside reachable workspace.');
  }
  useEffect(()=>{
    let disposed=false;
    let previous=0,elapsed=0,carry=0;
    let station:Station|undefined;
    const setup=async()=>{
      try{
        const asset=await fetch('/so101/model.json');
        if(!asset.ok)throw new Error('SO-101 model unavailable');
        const model=await asset.json() as Link;
        if(disposed)return;
        const r=new Robot(model);r.reset();
        const s=station=new Station(viewport.current!,r);
        const w=new Weld(r),rec=new Recorder();
        await s.loaded;
        if(disposed)return;
        runtime.current={r,s,w,rec};
        setLoading('');
        s.renderer.setAnimationLoop(now=>{
          const dt=previous?Math.max(0,Math.min(.08,(now-previous)/1000)):1/60;previous=now;
          carry+=dt;
          while(carry>=1/60){w.step(1/60);carry-=1/60;}
          s.render(w,dt);
          elapsed+=dt;
          if(elapsed>=.095){
            elapsed=0;
            rec.sample(r,w,{lastCommand:input.current},s.renderer.domElement,s.view);
            repaint(n=>n+1);
          }
        });
      }catch(error){setLoading(error instanceof Error?error.message:String(error));}
    };
    void setup();
    return ()=>{disposed=true;station?.renderer.setAnimationLoop(null);};
  },[]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      const rt=runtime.current;if(!rt)return;
      if(e.code==='Escape'){rt.r.stopped=true;rt.w.stop();setNotice('');event('Emergency stop');return;}
      if((e.target as HTMLElement)?.closest('input,select,button,textarea'))return;
      if(axisKeys[e.key]){e.preventDefault();jog(new Vector3(...axisKeys[e.key]).multiplyScalar(step/1000),'Keyboard');}
      if(rt.s.view==='First person')rt.s.freeKeys.add(e.key.toLowerCase());
    };
    const up=(e:KeyboardEvent)=>runtime.current?.s.freeKeys.delete(e.key.toLowerCase());
    const blur=()=>runtime.current?.s.freeKeys.clear();
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[mode,step]);
  const rt=runtime.current;
  const r=rt?.r,w=rt?.w;
  const tip=r?.tip();
  const coverage=Math.min(100,(w?.coverage.size??0)/seamBins*100);
  const changeView=(value:View)=>{setView(value);rt?.s.setView(value);};
  const stop=()=>{if(rt){rt.r.stopped=true;rt.w.stop();setNotice('');event('Emergency stop');}};
  const home=()=>{if(!rt)return;rt.w.stop();rt.r.stopped=false;setNotice(rt.r.commit(rt.r.home)?'':'Home path blocked. Reset the cell to restore the starting pose.');event('Home');};
  const reset=()=>{if(!rt)return;rt.r.reset();rt.w.reset();rt.s.shiftClamps(0);setClampOffset(0);setNotice('');event('Reset cell');};
  return <>
    <header class="topbar">
      <div class="brand"><Mark/><div><b>HOLOWELD</b><span>Stage 1 · Robotic welding simulator</span></div></div>
      <div class="topright"><span class="sim"><i/> Simulation only</span><button class="danger" onClick={stop} disabled={!rt}><span>■</span> E-stop</button></div>
    </header>
    <main>
      <section class="workspace" aria-label="3D welding workstation">
        <div class="workHeading"><div><h1>Welding cell</h1><p>SO-101 follower <span> / </span> SMAW butt joint</p></div><div class="viewbar" aria-label="Camera view">{(['Orbit','First person','Robot'] as const).map(v=><button class={v===view?'current':''} aria-pressed={v===view} onClick={()=>changeView(v)}>{v}</button>)}</div></div>
        <div class="viewport" ref={viewport} tabIndex={0} aria-label="Simulation viewport" onPointerDown={e=>e.currentTarget.focus()}>
          <div class="hud"><span class={r?.stopped?'red':w?.arc?'bright':''}><i/>{r?.stopped?'E-stop active':w?.arc?'Arc active':w?.enabled?'Arc armed':'Arc off'}</span><span>{view==='Orbit'?'Drag to orbit · Scroll to zoom':view==='First person'?'W A S D to walk':'Wrist-mounted camera'}</span></div>
          {loading&&<div class="loading" role="status">{loading}</div>}
          <div class="viewportBottom"><span>METRIC WORKSPACE</span><span>X <b>{mm(tip?.x??0)}</b> Y <b>{mm(tip?.y??0)}</b> Z <b>{mm(tip?.z??0)} mm</b></span></div>
        </div>
        <div class="metrics">
          <div><span>Arc gap</span><strong>{mm(w?.gap??0)} <small>mm</small></strong></div>
          <div><span>Travel speed</span><strong>{mm(w?.speed??0)} <small>mm/s</small></strong></div>
          <div><span>Electrode angle</span><strong>{(w?.angle??0).toFixed(1)}<small>°</small></strong></div>
          <div><span>Seam deviation</span><strong>{mm(w?.deviation??0)} <small>mm</small></strong></div>
          <div><span>Seam covered</span><strong data-testid="coverage">{coverage.toFixed(0)}<small>%</small></strong></div>
        </div>
      </section>
      <aside>
        <nav aria-label="Controls">{['Robot','Weld','Record'].map(name=><button class={tab===name?'selected':''} onClick={()=>setTab(name)} aria-pressed={tab===name}>{name}</button>)}</nav>
        <div class="panel">
        {tab==='Robot'&&<>
          <div class="panelHeading"><h2>Joint control</h2><button onClick={home} disabled={!rt}>Home</button></div>
          <div class="joints">{r?.joints.map((j,i)=><label><span>{names[i]} <output>{(r.q[i]*rad).toFixed(1)}°</output></span>
            <input type="range" min={j.limits[0]} max={j.limits[1]} value={r.q[i]} step=".001" disabled={r.stopped} onInput={e=>{
              const q=r.q.slice();q[i]=+e.currentTarget.value;rt!.w.program=null;event('Joint slider',q);
              if(!r.commit(q)){e.currentTarget.value=String(r.q[i]);setNotice('Motion would collide with the station.');}else setNotice('');
              repaint(n=>n+1);
            }}/></label>)}</div>
          <div class="rule"/>
          <div class="panelHeading"><h2>Cartesian jog</h2><select aria-label="Cartesian target" value={mode} onChange={e=>setMode(e.currentTarget.value as 'tip'|'end')}><option value="tip">Electrode tip</option><option value="end">End effector</option></select></div>
          <div class="jogs">{['X','Y','Z'].map((axis,i)=><div><span>{axis}</span>{[-1,1].map(direction=><button aria-label={axis+(direction===1?'+':'-')} disabled={!r||r.stopped} onClick={()=>jog(new Vector3().setComponent(i,direction*step/1000),'Cartesian jog')}>{direction===1?'+':'−'}</button>)}</div>)}</div>
          <label class="inline">Jog increment <select value={step} onChange={e=>setStep(+e.currentTarget.value)}>{[1,2,5,10].map(v=><option value={v}>{v} mm</option>)}</select></label>
          <p class="hint">Arrow keys jog X/Z. Page Up and Page Down jog Y. Escape stops the cell.</p>
        </>}
        {tab==='Weld'&&<>
          <div class="panelHeading"><h2>Weld program</h2><span class="pill">SMAW</span></div>
          <button class="primary wide" disabled={!r||r.stopped} onClick={()=>{w!.start('straight');event('Straight pass');}}>Run straight pass</button>
          <button class="wide" disabled={!r||r.stopped} onClick={()=>{w!.start('weave');event('Circular weave');}}>Run circular weave</button>
          <button class="wide" disabled={!r||r.stopped} onClick={()=>{const armed=w!.enabled;armed?w!.stop():w!.start(null);event(armed?'Stop arc':'Arm manual arc');}}>{w?.enabled?'Stop welding':'Arm manual arc'}</button>
          <p class="hint">Manual mode uses the same joint and Cartesian controls. Arc gap and travel speed determine when bead material is deposited.</p>
          <div class="rule"/>
          <label class="inline">Clamp offset <output>{clampOffset} mm</output></label>
          <input class="full" aria-label="Clamp offset" type="range" min="-10" max="28" step="1" value={clampOffset} onInput={e=>{
            const offset=+e.currentTarget.value;
            if(rt?.s.shiftClamps(offset/1000)){setClampOffset(offset);event('Clamp offset',offset);setNotice('');}
            else{e.currentTarget.value=String(clampOffset);setNotice('Clamp adjustment blocked by the arm.');}
          }}/>
          <div class="detail"><span>Electrode remaining</span><b>{mm(r?.length??0)} mm</b></div>
          <div class="detail"><span>Bead length</span><b>{mm(w?.traveled??0)} mm</b></div>
          <div class="rule"/>
          <div class="panelHeading"><h2>Seam audit</h2><span class="pill">{w?.coverage.size??0} / {seamBins}</span></div>
          <div class="seamAudit" role="img" aria-label={`${w?.coverage.size??0} deposited bins, ${w?.missed.size??0} visited without deposition, from seam start to end`}>
            {Array.from({length:seamBins},(_,bin)=>{
              const state=w?.coverage.has(bin)?'deposited':w?.missed.has(bin)?'missed':'untouched';
              return <span class={state} title={`Bin ${bin+1} · ${state}`}/>;
            })}
          </div>
          <p class="hint auditLegend"><span>Untouched</span><span>Visited</span><span>Deposited</span></p>
          <p class="hint">Geometric training model. Thermal behavior and weld integrity are outside its scope.</p>
        </>}
        {tab==='Record'&&<>
          <div class="panelHeading"><h2>Demonstration</h2><span class="pill">{rt?.rec.active?'Recording':'Idle'}</span></div>
          <label class="toggle"><input type="checkbox" checked={recordCamera} disabled={rt?.rec.active} onChange={e=>setRecordCamera(e.currentTarget.checked)}/> Include camera observations</label>
          <button class="primary wide" disabled={!rt} onClick={()=>{if(rt)rt.rec.active?rt.rec.stop(rt.w):rt.rec.start(recordCamera);}}>{rt?.rec.active?'Stop recording':'Start recording'}</button>
          <button class="wide" disabled={!rt?.rec.samples.length||rt.rec.active} onClick={()=>rt?.rec.export(rt.w)}>Export JSON</button>
          <p class="hint">{rt?.rec.samples.length??0} state samples · {rt?.rec.frames.length??0} camera frames</p>
          <p class="hint">The export includes robot state, input, electrode pose, arc metrics, and the weld trajectory.</p>
        </>}
        </div>
        <div class="asideBottom"><span role="status" class={r?.stopped||r?.collision?'warning':''}>{notice||w?.status||'Initializing'}</span><button disabled={!rt} onClick={reset}>Reset cell</button></div>
      </aside>
    </main>
  </>;
}
render(<App/>,document.getElementById('app')!);
