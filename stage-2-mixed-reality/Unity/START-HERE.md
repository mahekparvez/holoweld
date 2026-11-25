# HOLOWELD native workshop

This is the Unity source project for the walk-around HoloLens 2 workshop. All 13 SO-101 render meshes, joint data, and both simulation passes are bundled. Unity downloads the pinned XR packages when it first opens. This project runs without the Node or browser simulator once extracted.

## Preview in Unity

1. Install **Unity 2022.3.62f1** through Unity Hub using the Unity archive. Keep this exact release for HoloLens support. [Unity Download Archive](https://unity.com/releases/editor/whats-new/2022.3.62) · [Microsoft's version compatibility table](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/unity/choosing-unity-version)
2. In Unity Hub select **Add → Add project from disk** and pick the folder containing this file. Let package import finish. Accept the Input System restart if prompted.
3. The first import generates the scene. If it does not open automatically, use **HOLOWELD → Open Workshop**. Press **Play** and click the Game view. Use **WASD**, **right-mouse drag**, **Space** for a demo pass, **R** to reset and **Esc** to stop.

On a Mac with the pinned editor installed, `./open-unity.sh` opens the project directly.

## Build and install on HoloLens 2

1. On Windows, install the pinned Unity editor with **Universal Windows Platform Build Support**. Install **Visual Studio 2022**, the UWP tools, ARM64 C++ tools and a Windows SDK. Activate the editor in Unity Hub and close it before the command-line build. [Microsoft toolchain checklist](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/install-the-tools)
2. From PowerShell in this folder, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Build-HoloLens.ps1
   ```

   For a custom editor location append `-Unity "C:\path\to\Unity.exe"`. Append `-ExportOnly` to generate just the Visual Studio solution.
3. A successful build prints the signed ARM64 installer and the public `HOLOWELD-dev.cer` path. Install that public signing certificate on the headset, then install the app via Windows Device Portal. Select the generated ARM64 dependency packages if Device Portal asks for them. [Microsoft Device Portal and sideload instructions](https://learn.microsoft.com/en-us/windows/mixed-reality/using-the-windows-device-portal)
4. From the headset's Start menu open **HOLOWELD**. With clear space in front of you, open your right hand and pinch once to place the workshop. Walk around the tabletop. Pinch again to replay the next simulated weld. During replay, a right pinch stops it, and a left pinch resets it. The device's displays are see-through. [Microsoft's HoloLens rendering overview](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/advanced-concepts/rendering-overview)

## Verification and current scope

The resource exporter replayed the Stage 1 solver on this Mac at 60 Hz and checked the reference passes with the simulator's collision and joint limits. Both passes covered all 57 seam bins. Native playback uses these reference trajectories. Gesture controls place, start, stop and reset the demo. Manual hand-to-tool teleoperation, glove input and remote transport are future native increments.

This package contains Unity source. The Unity editor and Windows UWP toolchain were unavailable in this workspace, and the HoloLens was inaccessible. Unity import, signed Windows build and headset behavior require their first run. See `Builds/unity-prepare.log` and `Builds/unity-uwp.log` if the build script exits. The bundled SO-101 CAD comes from Apache-licensed MuJoCo Menagerie, revision `eea4c7431b63da8278b0ff31638e0b0e941cec0e`. Its license is under `Assets/Resources/SO101`.
