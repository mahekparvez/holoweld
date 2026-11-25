import type {Robot} from './robot';
import type {Station} from './scene';
import type {Weld} from './weld';
export {Quaternion,Vector3} from 'three';
export type Extension = {
  frame?: (frame?: XRFrame) => void;
  sample?: () => unknown;
  close?: () => void;
};
export type ExtensionFactory = (
  host: HTMLElement, station: Station, robot: Robot, weld: Weld,
  record: (name: string, value?: unknown) => void,
) => Extension;
