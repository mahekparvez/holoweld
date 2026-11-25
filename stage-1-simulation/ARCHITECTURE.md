# Architecture

## State and coordinates

`Robot` is authoritative. There is a single joint vector, current electrode length and stop state per browser session. Joint commands, Cartesian jogs, the scripted weld pass and desktop keyboard commands all update the same object. Three.js draws the exact scene graph used for forward kinematics. A probe solve temporarily updates transforms and restores committed state before rendering.

The browser uses the pinned MuJoCo MJCF link transforms and hinge limits through a generated JSON file, the corresponding STL meshes in meters, and a fixed conversion from model Z-up to station Y-up. The origin is the floor beneath the arm mount. +X follows the nominal pass, +Z is transverse and +Y is up. Five pose axes are active. The sixth servo is held at the MJCF zero-angle jaw position for the attached holder. The holder and electrode are mounted to the gripper frame.

The renderer and simulator run together in the browser for predictable startup. Native MuJoCo is used by the optional FK comparison only. The desktop backend approximates collision using transformed MJCF boxes, selected nonadjacent self-collision pairs, static workstation boxes and padded electrode/holder segments with intermediate joint checks. Dynamic contacts, forces, cable collision and physical servo behavior are outside the model. Inverse kinematics uses damped least squares with finite differences, joint bounds, and collision rejection. Position mode can jog either the electrode tip or the end-effector attachment point. The weld program can constrain the electrode direction along with position.

## Station and process

The table height is 0.835 m, the mounted arm base is 0.836 m from the floor, and the top surface of the two 8 mm coupons is at 0.859 m. The simulated seam spans X 0.205–0.319 m at Z 0. Both automated paths use the robot's constrained tip IK and continually compensate for electrode consumption. The script targets a 4 mm gap. The approximate allowed arc gap is 1.5–7.5 mm with an electrode tilt up to 40 degrees and tip proximity to the seam. Arc ignition enables light, sparks and consumption. Deposition also requires 3–32 mm/s smoothed lateral travel. Bead points project the accepted tip path onto the coupon plane. Coverage uses 57 longitudinal 2 mm bins. Angle is relative to the downward surface normal and seam deviation is transverse tip distance. These geometric heuristics have no validated thermal or metallurgical meaning.

## Demonstration format

**`holoweld.demonstration.v1`** is a JSON object.

| Field | Representation |
| --- | --- |
| `startTime` | ISO 8601 UTC recording epoch. |
| `samples` | Approximately 10 Hz rows with elapsed `ms`, joints in shoulder pan, shoulder lift, elbow flex, wrist flex, wrist roll order and radians, Cartesian tip XYZ in meters, electrode direction unit vector, gripper XYZW quaternion, electrode length, enabled/arc/program/status, gap, speed, seam deviation, angle in degrees, coverage fraction, collision, stop and camera view. |
| `samples[].input` | Latest timestamped command source and value, sampled alongside robot state. |
| `events` | Discrete desktop input actions, with elapsed `ms`, source and value. |
| `camera` | Optional viewport observations every ~500 ms, as timestamped data URLs at 320 px width. Capped at 300 frames. |
| `seamAudit` | Start-to-end array of 57 longitudinal bins. Values are `untouched`, `visited` (armed without successful deposition) or `deposited`. |
| `bead`, `trace`, `summary` | Accepted bead center positions, sampled tip trace and aggregate seam coverage and bead travel of the current workpiece when recording stops. |

Position arrays are station XYZ, quaternions are XYZW, and the UI converts SI units to millimeters and degrees where labeled. An imitation-learning loader can align camera observations to adjacent state samples by elapsed `ms`. For one pass per demonstration, reset the cell before starting.
