# Stage 2 · Mixed reality

For the native HoloLens app, follow the [Unity quick start](Unity/START-HERE.md). The [root README](../README.md#start-stage-2-on-hololens-2) has the launch and build commands.

## Browser prototype

The WebXR prototype adds a HoloLens-oriented control layer to the Stage 1 simulator. It shares the welding cell, robot limits, collision checks, E-stop, and recorder. Stage 1's normal launch stays available.

## Try the desktop fallback

From the repository root:

```bash
./stage-2-mixed-reality/launch.sh
```

At [127.0.0.1:4182](http://127.0.0.1:4182/), the **HoloLens control** panel reports secure-context and immersive AR availability. If the browser cannot start an immersive session, the desktop simulation remains interactive.

## Device bring-up

1. Put the Mac and headset on the same local network. Use a reachable hostname with a certificate matching that hostname and trusted by the headset.
2. Run `./stage-2-mixed-reality/launch-https.sh fullchain.pem private-key.pem` from the repository root. Open `https://your-host:8443/` in HoloLens Edge. The server port can be set with `HOLOWELD_HTTPS_PORT`.
3. Check compatibility and select **Enter mixed reality**. The session requests a floor-relative reference space and optional articulated hands. Microsoft documents a WebXR Hand Input flag for some Edge versions. [Microsoft's HoloLens Edge documentation](https://learn.microsoft.com/en-us/hololens/hololens-new-edge)
4. Air-tap to place the simulated cell on the reference floor, approximately 1.15 m ahead. Open the tracked hand, then hold thumb and index together. Move the wrist to jog the electrode tip, or turn the wrist to steer its axis. Release to reposition your hand without driving the tool.
5. Verify that tracking loss, switching hands, and suspending the session clear the clutch and require an open hand before motion can resume. Use the headset's system gesture to leave the session.

The prototype streams wrist position, orientation, pinch gap, and clutch activity into the existing demonstration recording. It rate-limits updates and caps each simulated tip increment. Live hardware, remote transport, and glove input are outside this increment.

## Tests

From `stage-1-simulation/`, run `npm run test:stage2`. This covers clutch scaling and rotation, release and reacquisition, and desktop operation in a browser that reports immersive AR unavailable. The first physical headset session is still required to verify placement, in-headset rendering, and live hand tracking.
