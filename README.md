# Render Studio

**Version 0.2.0** — focused 3D modeling edition.

The slicer workspace from the earlier prototype has been intentionally removed. The current goal is to make a practical browser-based 3D modeling tool with fast direct manipulation like SketchUp, exact dimensions like CAD software, and a clean workflow that does not bury basic tools under advanced settings.

## Design philosophy

The UI is organized around what a person is trying to do:

- create a shape,
- change it directly,
- enter an exact measurement when precision matters,
- combine shapes,
- measure/check the result,
- save or export it.

The app avoids a separate "simple" and "expert" world wherever possible. Exact values are available beside direct tools instead.

## Research influences

### SketchUp

Render Studio borrows the workflow ideas behind:

- **Push/Pull** — turn a flat face/profile into a 3D volume with an exact distance.
- **Follow Me** — sweep a profile along a path for trim, tubing, curved parts, bowls, and similar geometry.
- **Offset** — create an evenly larger or smaller version of a profile.
- **Tape Measure / Guides** — measurement helpers should aid modeling without becoming normal model geometry.
- **Inferencing / snapping** — easy alignment to useful increments and references.
- **Groups / Components philosophy** — reusable/nested organization is a planned next-stage feature.

### FreeCAD / Fusion-style CAD

- real-world millimeter dimensions,
- parametric primitive/profile/path dimensions,
- exact transforms,
- Booleans,
- model history/undo,
- future constrained sketches and feature history.

### Blender

- quick viewport navigation,
- transform gizmos,
- object outliner,
- material controls,
- non-destructive/modifier-style thinking for future tools,
- snapping and duplication shortcuts.

## What v0.2.0 does now

### Direct 3D creation

- Box
- Cylinder
- Sphere
- Cone
- Torus
- Hollow Tube
- exact parametric dimensions for generated objects

### Sketch-style profiles

- Rectangle Profile
- Circle Profile
- exact width/depth/radius
- **Push/Pull** a selected profile by an exact distance to create a solid
- **Offset** a selected profile by an exact distance
- source profiles are kept as hidden construction geometry after Push/Pull so they can be recovered from the Scene list

### Paths and Follow Me

- Line Path
- Arc Path
- Circle Path
- editable path length/radius/angle
- check one profile and one path, then use **Follow Me** to sweep the profile along the path

### Solid operations

- Union
- Subtract A − B
- Intersect

These browser CSG operations work best with closed/watertight solids.

### Precision and inspection

- Move / Rotate / Scale transform gizmos
- exact numeric position, rotation, and scale
- translation snapping
- configurable movement snap size
- configurable rotation snap angle
- configurable grid spacing
- Measure tool: click two model/ground points to get a distance
- measurement guide segments are kept separately from model geometry
- clear all measurement guides at once
- measured object bounding size
- Place on Ground
- Center at Origin

### Scene organization

- named object list
- show/hide individual objects
- lock/unlock individual objects
- select objects for two-object operations without changing the main active object
- rename
- duplicate
- delete
- undo/redo

### Appearance and rendering

- per-object color
- roughness and metalness for solid materials
- smooth/flat shading toggle
- background color
- light intensity
- shadows on/off
- axes on/off
- grid on/off
- wireframe display
- isometric, top, front, and right views
- fit view

### Files

- Import STL
- Export selected solid or visible solid scene to STL
- Save Render Studio project JSON
- Reopen Render Studio project JSON

STL orientation is converted between Three.js' Y-up viewport convention and STL's common Z-up convention by `axis-adapter.js`.

## Current limitations / next important features

The current Push/Pull works on Render Studio sketch profiles. A later face-editing engine should allow clicking a face directly on any compatible solid, like SketchUp.

High-priority next additions:

1. line / polyline / arc drawing directly in the viewport
2. automatic face creation from closed sketches
3. direct face Push/Pull on existing solids
4. endpoint, midpoint, face, axis, parallel, and perpendicular inferencing
5. true guide lines and guide points
6. groups and linked Components/instances
7. mirror and rectangular/circular arrays
8. constrained sketch mode with dimensions
9. fillet, chamfer, shell/hollow, and hole tools
10. editable modeling-history tree
11. STEP/BRep solid kernel for more reliable engineering geometry
12. OBJ/GLTF/STEP import/export as the geometry kernel grows

A WebAssembly OpenCascade kernel remains a strong candidate for the later BRep/STEP phase. The current mesh-based core is appropriate for fast browser prototyping and STL-oriented work, but a true solid kernel will be better for advanced mechanical CAD.

## Project files

- `index.html` — application interface
- `styles.css` — responsive layout and visual styling
- `app.js` — scene, modeling tools, measurements, project data, import/export
- `axis-adapter.js` — STL Z-up ↔ viewport Y-up conversion
- `bootstrap.js` — loads the axis adapter before the main application
- `THIRD_PARTY.md` — third-party library notes
