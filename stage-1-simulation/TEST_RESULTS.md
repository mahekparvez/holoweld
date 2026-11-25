# Stage 1 verification

Run `npm run build` and `npm test` from this directory. The browser suite uses Google Chrome on macOS and starts the local server if needed.

| Check | Result |
| --- | --- |
| Build | TypeScript and Vite production build passed. |
| Desktop controls | Verified joint sliders, keyboard and Cartesian jog, tip and end-effector targets, all three camera modes, collision rejection, E-stop, and reset. |
| Straight pass and circular weave | Both reached full geometric seam coverage. The straight pass deposited about 112.9 mm of bead travel. |
| Seam audit | An armed stationary tip registered a visit with no bead. Reset cleared it. The completed straight run exported all 57 bins as deposited. |
| Demonstration export | Verified the HOLOWELD schema, operator events, arc samples, camera images, and the final bead and seam audit. |
| Forward kinematics | Native MuJoCo 4.0.1 and browser transforms agreed at 14 poses, including the joint range endpoints. Maximum vector difference was `1.81e-15`. |

The optional MuJoCo comparison uses the bundled MJCF and its assets.

```bash
python3.12 -m venv .venv
.venv/bin/pip install mujoco==4.0.1
.venv/bin/python scripts/check-fk.py
```

[Desktop](screenshots/desktop.png) · [Active arc](screenshots/active-weld.png) · [Straight pass](screenshots/completed-pass.png) · [Circular weave](screenshots/completed-weave.png)
