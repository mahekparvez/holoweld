import { Quaternion, Vector3 } from '../stage-1-simulation/src/extension';

export type HandPose = {position:Vector3; orientation:Quaternion; pinchGap:number};
export type ToolPose = {position:Vector3; axis:Vector3};

export class Clutch {
  private released=false;
  private anchor?:{hand:HandPose;tool:ToolPose};

  // Require an observed open hand after tracking loss or initial placement.
  clear(){this.released=false;this.anchor=undefined;}
  update(hand:HandPose|null, tool:ToolPose, scale:number):ToolPose|null {
    if(!hand){this.clear();return null;}
    if(hand.pinchGap>=(this.anchor?.032:.023)){
      this.anchor=undefined;
      this.released=true;
      return null;
    }
    if(!this.released)return null;
    if(!this.anchor){
      this.anchor={hand,tool};
      return null;
    }
    const {hand:origin,tool:initial}=this.anchor;
    const rotation=hand.orientation.clone().multiply(origin.orientation.clone().invert());
    return {
      position:initial.position.clone().addScaledVector(hand.position.clone().sub(origin.position),scale),
      axis:initial.axis.clone().applyQuaternion(rotation),
    };
  }
}
