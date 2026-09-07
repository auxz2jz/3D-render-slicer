# Third-party components

Render Studio v0.2.0 currently uses these browser libraries:

- **Three.js** — WebGL rendering, camera/transform controls, STL import/export, geometry helpers.
- **three-bvh-csg** — loaded on demand for Boolean Union, Subtract, and Intersect operations.

The application source in this repository does not include the source code of those libraries; they are loaded from public module/CDN endpoints at runtime.
