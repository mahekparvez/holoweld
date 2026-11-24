# HollowWeld — development checkpoint

2026-11-23. Recovered from the 471-message Hermes session export. These are reported results, not independently rerun tests. Original source was on a Windows machine under OneDrive/Purdue/Projects/HoloWeld-SO101; this checkpoint does not contain those source files.

## Goal
HoloLens 2 master-welder demonstration of a bracket seam, with SO-101 robot following a taught pose using a dummy torch. No live welding during commissioning.

## Reported implementation
- Unity: hello handshake, typed challenge parsing, UWP connection state, bounded inbox, latest-pose sending, reconnect resets, finite tracking-loss coordinates, 150 ms expiry, arm status display; wired runtime UI, MRTK bootstrap, bracket and seam, assembly references and Microsoft package registry.
- Robot backend: hardware gates, calibration checks, explicit URDF/LeRobot joint mapping, refreshed hardware reads, position-priority IK and orientation residual reporting.
- Files reported changed: `holoweld/robot.py`, `tests/test_robot.py`, `docs/ROBOT_SETUP.md`, `config/hardware.example.json`, `docs/HOLOLENS_SETUP.md`, `unity/Assets/HoloWeld/Editor/HoloWeldBootstrap.cs`, `unity/Assets/HoloWeld/Runtime/HoloWeldClient.cs`, `unity/Assets/HoloWeld/Runtime/WsTransport.cs`, `unity/Packages/manifest.json`, `tests/test_unity_contract.py`.

## Test log (reported)
- Unity contract: 4 passed; earlier full suite 52 passed.
- Robot: 36 passed; later full suite 79 passed, 1 failed: `tests/test_cli.py::test_control_cli_function_reads_status_and_refuses_nonloopback` expected ESTOP, got DISARMED.
- Independent core/bridge focused suite: 23 passed in 1.88 s; review did not pass.
- Unity package retrieval blocked; compilation/deployment not verified. No physical robot connected.

## Review blockers
1. `holoweld/core.py:210-241`: motion limits reference prior commands rather than measured feedback; stalled robot can remain FOLLOWING while commands advance.
2. `holoweld/bridge.py:135-139,161-171`: challenge nonce is not consumed; replay with distinct sequence numbers can refresh freshness.
3. `holoweld/core.py:137-159`: hold exceptions only append a reason, potentially reporting a safe state despite failed hold.
4. Bound motion configuration; test malformed JSON, feedback exceptions and delayed worker shutdown.

## Next steps
- [ ] Import actual source tree from original machine, excluding credentials, local calibration secrets and build caches.
- [ ] Reproduce failing CLI test and three review findings with mock tests.
- [ ] Fix measured-state tracking, single-use challenge semantics and fail-closed hold handling; verify full suite.
- [ ] Resolve Unity dependencies, compile, deploy and validate HoloLens connection in simulation.
- [ ] Commission robot locally with dummy tool, independent emergency stop, conservative limits and supervised tests. Do not enable live welding.
- [ ] Measure latency, jitter, packet loss and tracking error before considering remote operation.
