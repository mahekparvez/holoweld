import {readFileSync} from 'node:fs';
import {Robot} from '../src/robot.ts';
const robot=new Robot(JSON.parse(readFileSync('public/so101/model.json','utf8')));
const poses=[robot.home,
  [0,0,0,0,0],[.4,-.5,.36,.7,-.6],[-.65,.11,-.13,.71,1.2],
  ...robot.joints.flatMap((j,i)=>j.limits.map(limit=>robot.home.map((q,k)=>k===i?limit:q)))];
process.stdout.write(JSON.stringify({
  names:robot.joints.map(j=>j.name),
  limits:robot.joints.map(j=>j.limits),
  poses:poses.map(q=>{
    robot.apply(q);
    return {q,tip:robot.tip().toArray(),direction:robot.direction().toArray(),end:robot.end().toArray()};
  })
}));
