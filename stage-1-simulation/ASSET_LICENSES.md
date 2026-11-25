# Asset licenses

| Files | Source and terms |
| --- | --- |
| `public/so101/assets/*.stl`, `public/so101/so101.xml` | MuJoCo Menagerie `robotstudio_so101` at revision `eea4c7431b63da8278b0ff31638e0b0e941cec0e`. Apache License 2.0 as included in [public/so101/LICENSE](public/so101/LICENSE). Upstream identifies I2RT Robotics and The Robot Studio's SO-ARM100 simulation as the model provenance. [Pinned model source](https://github.com/google-deepmind/mujoco_menagerie/tree/eea4c7431b63da8278b0ff31638e0b0e941cec0e/robotstudio_so101) |
| `public/so101/model.json` | Derived from the above MJCF by `scripts/import-model.py`. Stores body poses, visual references, box colliders and hinge parameters, with the optional camera subtree omitted. Coordinates and limits are preserved. |
| Station mesh, textures, signage, arc effects, icons and screenshots | Generated from HOLOWELD source.  |
| Three.js, Preact and Vite | npm packages distributed with their upstream MIT licenses. The Three.js `RoomEnvironment` helper supplies the procedural reflection environment. |
