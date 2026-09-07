# RenderSlicer Studio

**Version 0.1.0** — first working prototype for the `3D render slicer` repository.

RenderSlicer Studio is intended to combine the parts of CAD/modeling software that are genuinely useful for making printable parts with a slicer workflow that does not force users to bounce between unrelated programs.

## Product philosophy

The goal is not to copy every menu from Blender, FreeCAD, Fusion, Cura, PrusaSlicer, and OrcaSlicer. The goal is to keep the features people actually need for 3D printing, organize them around the job being done, and hide advanced controls until they are useful.

The main workflow is:

1. **Design** — create or import the part.
2. **Slice** — choose printer, material, quality, strength, supports, and speeds.
3. **Preview** — inspect the generated toolpath by layer before downloading G-code.

## Research influences

### Modeling / CAD

- **FreeCAD** — real-world units, parametric objects, constrained/precise modeling, model history, solids and booleans.
- **Fusion** — user parameters, feature parameters, sketch-to-solid workflows, extrude/revolve/sweep/loft, patterns, fillets/chamfers.
- **Blender** — non-destructive thinking, fast transforms, modifier-style workflow, mirror/array/boolean concepts, strong viewport navigation.
- **OpenSCAD** — simple primitives + constructive solid geometry and configurable dimensions.

### Slicing

- **PrusaSlicer** — multiple beds/projects, precise per-print controls, variable layer height, organic/support painting concepts, advanced G-code preview.
- **OrcaSlicer** — calibration-first workflow, pressure advance/flow/temp/retraction tuning, modern printer coverage, granular process controls.
- **UltiMaker Cura** — simple recommended mode plus deep custom mode, printer/material profiles, broad slicing settings.
- **Kiri:Moto** — local browser slicing, a clear Arrange → Slice → Preview → Export concept, JavaScript slicing API.

## What v0.1.0 already does

### Design workspace

- Add parametric Box, Cylinder, Sphere, Cone, Torus, and Tube primitives.
- Edit primitive dimensions numerically in millimeters.
- Move, rotate, and scale with a 3D transform gizmo or exact numeric inputs.
- Rename, duplicate, hide, delete, place on bed, and center objects.
- Front, right, top, and isometric camera views.
- Fit camera and wireframe toggle.
- Scene/object list.
- Object bounding-box measurements.
- Import binary or ASCII STL.
- Export selected object or the visible scene to STL.
- Boolean Union, Subtract, and Intersect for two checked solid meshes (browser CSG module; best with watertight meshes).
- Undo/redo history.
- Save/load RenderSlicer project files as JSON.

### Slice workspace

- Printer profiles including a Creality K1C-sized 220 × 220 × 250 mm profile and a fully editable custom profile.
- Editable bed X/Y/Z and nozzle diameter.
- PLA, PETG, ABS/ASA, TPU, and Custom material starting profiles.
- Draft, Standard, Fine, Strong Functional, and Custom quality presets.
- Layer height, wall loops, top/bottom layers.
- Infill amount and pattern.
- Support generation and overhang angle.
- Brim.
- Nozzle temperature, bed temperature, cooling fan.
- Print/travel speed and retraction.
- Simple/Advanced settings mode.
- Advanced outer-wall speed, acceleration, line width, ironing and vase controls are represented in the UI; the Kiri adapter will be expanded as engine mappings are verified.
- Browser slicing adapter based on the documented Kiri:Moto JavaScript engine API.
- Download generated G-code.

### Preview workspace

- Parses generated G-code locally.
- Separates extrusion moves from travel moves.
- Groups toolpaths by Z/layer.
- Layer slider to inspect the toolpath progressively.
- Basic G-code line/layer/file-size summary.

## Important v0.1 limitations

This is a first prototype, not yet a production slicer for unattended printing.

- The browser slicer currently loads Kiri:Moto's live engine module from Grid.Space. The intended next revision should vendor/pin a tested engine build so slicing is reproducible and can work offline.
- G-code must be visually checked in Preview before printing, especially until printer-specific start/end G-code profiles are tested on the real printer.
- The modeling kernel is mesh-based in v0.1. Robust STEP/BRep CAD, sketch constraints, fillet/chamfer, shell, revolve, sweep, loft, mirror and array history are planned for the next modeling phase.
- Boolean operations rely on a browser mesh CSG library and work best on watertight/manifold objects.
- Material temperature presets are starting points, not guarantees for every filament brand.

## Planned architecture

The project should stay modular rather than becoming one huge HTML file:

- `index.html` — interface shell
- `styles.css` — responsive UI
- `app.js` — viewport, objects, CAD tools, project state, slicing adapter, preview
- later `model/` — parametric/solid modeling subsystem
- later `slicer/` — pinned local slicing engine + profiles
- later `profiles/` — printer/material/process definitions
- later `tests/` — geometry and G-code regression tests

For the more advanced CAD phase, OpenCascade.js is a strong candidate because it provides a real solid/BRep geometry kernel in WebAssembly. For the slicer, a pinned Kiri:Moto engine is the simplest permissively licensed browser route; a CuraEngine/WASM adapter can be evaluated as a second backend.

## High-priority next features

1. **Sketch mode** — rectangle, circle, line, arc, dimensions, horizontal/vertical/coincident constraints.
2. **Sketch → solid** — Extrude/Cut and Revolve first; Sweep and Loft after those are stable.
3. **Solid tools** — fillet, chamfer, shell/hollow, hole tool.
4. **Patterns** — mirror, rectangular array, circular array.
5. **Model history** — editable operation tree instead of only undo/redo snapshots.
6. **Printability inspection** — non-manifold check, thin-wall warnings, out-of-bed warning, minimum wall thickness, overhang visualization.
7. **Auto orientation** — suggest flat/stable faces and estimate support cost.
8. **Arrange** — automatically place multiple parts on one or more plates.
9. **Support painting** — paint support/blocker regions directly on the model.
10. **Variable layer height** — automatic and manual layer-height painting.
11. **Seam painting** — choose or hide Z-seam regions.
12. **Calibration** — temperature tower, flow ratio, pressure advance/linear advance, retraction, max-flow tests.
13. **Printer profile manager** — import/export profiles and separate printer/nozzle/material/process settings.
14. **3MF projects** — retain multiple parts, transforms, profiles, colors/material assignments and plate data.
15. **Safer G-code validation** — bed-bound checks, max-Z checks, extrusion sanity checks, start/end macro verification.

## Third-party components used by the prototype

- Three.js — 3D rendering, STL loading/export, viewport controls.
- three-bvh-csg — optional mesh boolean operations loaded dynamically.
- Kiri:Moto / Grid.Space engine API — browser FDM slicing/G-code generation adapter.

Their respective upstream licenses and notices should be retained when vendoring dependencies into the repository.
