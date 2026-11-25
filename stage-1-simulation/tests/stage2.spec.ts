import {expect,test} from '@playwright/test';
import {Clutch} from '../../stage-2-mixed-reality/clutch';
import {Quaternion,Vector3} from '../src/extension';

test('clutch requires release and maps relative translation and rotation',()=>{
  const clutch=new Clutch();
  const tool={position:new Vector3(.2,.8,0),axis:new Vector3(0,-1,0)};
  const hand=(gap:number,x=0,q=new Quaternion())=>({position:new Vector3(x,0,0),orientation:q,pinchGap:gap});
  expect(clutch.update(hand(.01),tool,.5)).toBeNull();
  expect(clutch.update(hand(.05),tool,.5)).toBeNull();
  expect(clutch.update(hand(.01),tool,.5)).toBeNull();
  const target=clutch.update(hand(.025,.1,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2)),tool,.5);
  expect(target?.position.x).toBeCloseTo(.25);
  expect(target?.axis.x).toBeCloseTo(1);
  expect(clutch.update(null,tool,.5)).toBeNull();
  expect(clutch.update(hand(.01,.5),tool,.5)).toBeNull();
  expect(clutch.update(hand(.04,.6),tool,.5)).toBeNull();
  expect(clutch.update(hand(.01,.6),tool,.5)).toBeNull();
  expect(clutch.update(hand(.01,.62),tool,.5)?.position.x).toBeCloseTo(.21);
});

test('Stage 2 opens a usable simulator when the browser has no immersive AR',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'xr',{value:{isSessionSupported:async()=>false}}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'HoloLens control'})).toBeVisible();
  await expect(page.getByText(/Immersive AR unavailable/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Enter mixed reality'})).toBeDisabled();
  const tip=page.locator('.viewportBottom span').last();
  const initial=await tip.innerText();
  await page.getByRole('button',{name:'X+',exact:true}).click();
  await expect(tip).not.toHaveText(initial);
});
