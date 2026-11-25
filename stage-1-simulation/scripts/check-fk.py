"""Compare the browser FK against native MuJoCo for the pinned robot."""
from pathlib import Path
import json
import subprocess
import sys

import mujoco
import numpy as np

path = Path("public/so101/so101.xml")
if len(sys.argv) > 1:
    path = Path(sys.argv[1])
samples = json.loads(subprocess.check_output(["node", "scripts/fk-samples.mjs"], text=True))
model = mujoco.MjModel.from_xml_path(str(path.resolve()))
data = mujoco.MjData(model)
joints = [mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, j) for j in samples["names"]]
np.testing.assert_allclose(model.jnt_range[joints], samples["limits"], atol=1e-9)
gripper = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "gripper")
local_direction = np.array([-.76, 0, -.65])
local_direction /= np.linalg.norm(local_direction)
local_tip = np.array([.022, 0, -.113]) + .092 * local_direction
local_end = np.array([0, 0, -.075])
z_to_y = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])
mount = np.array([0, .836, 0])
max_error = 0
for pose in samples["poses"]:
    data.qpos[model.jnt_qposadr[joints]] = pose["q"]
    mujoco.mj_forward(model, data)
    orientation = data.xmat[gripper].reshape(3, 3)
    origin = data.xpos[gripper]
    for key, target in [
        ("tip", mount + z_to_y @ (origin + orientation @ local_tip)),
        ("end", mount + z_to_y @ (origin + orientation @ local_end)),
        ("direction", z_to_y @ orientation @ local_direction),
    ]:
        max_error = max(max_error, np.linalg.norm(target - pose[key]))
        np.testing.assert_allclose(target, pose[key], atol=1e-8)
print(f"MuJoCo {mujoco.__version__}: {len(samples['poses'])} poses, all joint ranges agree, max position/vector error {max_error:.3g}")
