# HOLOWELD

A staged robotics project for capturing and reproducing welding motions. Stage 1 gives operators a repeatable desktop cell for practicing and reviewing simulated welds before hardware enters the workflow.

![HOLOWELD Stage 1 with the SO-101 following a steel butt joint](stage-1-simulation/screenshots/active-weld.png)

## Project stages

| Stage | What you can run |
| --- | --- |
| [Stage 1 · Welding simulation](stage-1-simulation/) | SO-101 robot controls, straight and circular weld passes, seam audit, and demonstration recording. |
| [Stage 2 · Mixed reality](stage-2-mixed-reality/) | Native Unity workshop project for HoloLens 2 and a separate WebXR prototype. |

## Start Stage 2 on HoloLens 2

Use [Unity **2022.3.62f1**](https://unity.com/releases/editor/whats-new/2022.3.62), the version this project pins for HoloLens support. The repository includes the workshop, SO-101 meshes and two weld demos.

For a fresh checkout on either computer:

```sh
git clone https://github.com/mahekparvez/holoweld.git
cd holoweld
```

**Preview on your Mac** after installing Unity. Run this from the repository root:

```bash
./stage-2-mixed-reality/Unity/open-unity.sh
```

Press **Play**. Use **WASD** and **right-drag** to walk and look, **Space** to run a demo, **R** to reset and **Esc** to stop. If the scene did not open, select **HOLOWELD → Open Workshop**. Accept the Input System restart if Unity prompts.

**Build the headset installer on Windows.** Install the same Unity editor with **Universal Windows Platform Build Support**, plus **Visual Studio 2022** with UWP, ARM64 C++ and a Windows SDK. Activate Unity in Hub, close the editor and run this from the repository root. [Required Windows tools](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/install-the-tools)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\stage-2-mixed-reality\Unity\Build-HoloLens.ps1
```

After the script succeeds, use **Windows Device Portal** to install the printed `HOLOWELD-dev.cer` and the signed ARM64 app package. On the headset, open **HOLOWELD** from Start, pinch to place the workshop, then walk around it. Pinch again to start a weld demo. [Installation details](stage-2-mixed-reality/Unity/START-HERE.md)

The Unity source and resources are included. The first Windows build and physical headset test are pending.

## Start Stage 1

On macOS with Node.js and Google Chrome, clone this repository and run the launcher from its root:

```bash
./stage-1-simulation/launch.sh
```

Open **Weld → Run straight pass** to see the first run. Select **Reset cell** and run a weave to compare trajectories. The seam audit tracks which parts of the joint were visited while the arc was armed and which received a bead. You can export an operator demonstration with joint positions, input events, tip trajectories, optional camera observations, and the final seam audit.

![Completed circular weave with the simulated bead and coverage metrics](stage-1-simulation/screenshots/completed-weave.png)

HOLOWELD's workstation, browser controls, process simulation, seam audit, and recording pipeline were built for this project. The SO-101 geometry and joint limits come from the Apache-licensed Menagerie model. Stage 1 is a geometric simulator with no physical robot or welding equipment control. [Asset credits](stage-1-simulation/ASSET_LICENSES.md)

[Stage 1 guide](stage-1-simulation/README.md) · [Architecture](stage-1-simulation/ARCHITECTURE.md) · [Test results](stage-1-simulation/TEST_RESULTS.md)
