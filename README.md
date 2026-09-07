# Render Studio CAD

**Version 1.0.0** — SketchUp-style CAD/modeling workspace.

Render Studio CAD is a browser-based 3D modeling application designed around two goals:

1. **SketchUp-like interaction** — choose a tool, then work directly in the 3D viewport.
2. **Fusion-style precision** — exact dimensions, parametric features, solid operations, construction geometry, inspection, and feature history.

The slicer has been removed from this project. This repository is focused on 3D modeling/CAD.

## Interface

The v1 interface intentionally replaces the older permanent left/right button panels.

- Classic top menus: **File, Edit, View, Camera, Draw, Tools, Window, Help**.
- A docked **Getting Started** icon toolbar across the top.
- A docked **Large Tool Set** down the left.
- Optional **Camera, Solid Tools, and Shapes** toolbars.
- Toolbars can be dragged, floated, and docked to the top, left, or right edge.
- Toolbars can be shown or hidden from **View**.
- **Entity Info, Outliner, Model Info, Tool Settings, Tags, Scenes, Styles & Lighting, Inspector, and Feature History** are trays opened from **Window**.
- Trays can dock left/right, float, collapse, or close.
- Toolbar/tray layout is remembered locally in the browser.
- A Measurements field stays available at the bottom for exact typed values.

## Primary tools

### Selection and navigation

- Select
- Box Select
- Move
- Rotate
- Scale
- Orbit
- Pan
- Zoom
- Zoom Extents
- Isometric / Top / Front / Right views
- Perspective / Orthographic projection

Middle mouse can temporarily orbit, right mouse pans, and the wheel zooms even while another modeling tool is active.

### Sketching

- Line / Pencil
- Freehand
- Rectangle
- Rotated Rectangle
- Circle
- Polygon
- 2-Point Arc
- 3-Point Arc
- Pie
- Offset
- Trim
- Extend
- Mirror Sketch
- XY / XZ / YZ sketch planes
- Exact typed dimensions
- Grid and vertex snapping

Initial constraint support includes horizontal, vertical, coincident, parallel, perpendicular, equal, midpoint, concentric, and fixed geometry behavior.

### Solid modeling

- Push / Pull
- Extrude
- Revolve
- Sweep / Follow Me
- Loft
- Rib / Web
- Hole
- Thread / Helix
- Fillet
- Chamfer
- Shell
- Draft / Taper
- Offset Face
- Split Body
- Union
- Subtract
- Intersect
- Rectangular Pattern
- Circular Pattern
- Path Pattern
- Mirror
- Align

Some advanced solid operations currently use mesh-based geometry and are not yet equivalent to a full engineering B-Rep kernel. A B-Rep/WebAssembly backend is the intended path for fully robust STEP solids, arbitrary-edge fillets/chamfers, shells, and exact Boolean behavior.

### Construction and inspection

- Tape Measure / Guides
- Protractor
- Offset / angled / mid construction planes
- Construction axes and points
- Section planes
- Mass properties
- Interference check
- Mesh/watertightness checks
- Basic mesh repair

### Organization and appearance

- Groups / Ungroup
- Components and instances
- Tags
- Lock / Hide
- Saved Scenes
- Outliner
- Entity Info
- Materials
- Shaded, Edges, Wireframe, X-Ray, and Monochrome display styles
- Point and spot lights
- Feature history
- Undo / Redo

### Files

- Save/open Render Studio project JSON
- Import STL
- Export STL
- Export OBJ

## Keyboard shortcuts

- **Space** — Select
- **M** — Move
- **Q** — Rotate
- **S** — Scale
- **L** — Line / Pencil
- **R** — Rectangle
- **C** — Circle
- **P** — Push / Pull
- **F** — Offset
- **T** — Tape Measure / Guide
- **O** — Orbit
- **H** — Pan
- **Z** — Zoom
- **Delete** — Delete selection
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** — Redo
- **Shift+S** — Find a Tool

## Runtime architecture

The user interface is HTML/CSS, while the interactive 3D engine is JavaScript using Three.js/WebGL. The application is split into modules under `js/` rather than one monolithic script.

The long-term exact-solid architecture is:

- HTML/CSS — menus, toolbars, trays, dialogs
- JavaScript/Three.js — viewport, interaction, selection, snapping, rendering
- WebAssembly B-Rep CAD kernel — future exact engineering solid operations and STEP workflows

All model coordinates are **Z-up** and internal length units are **millimeters**. The interface can display millimeters or inches.

## Status

v1.0.0 is the first integrated CAD-style interface and modeling engine. Static syntax/reference checks have been performed. Browser behavior should still be exercised on the actual desktop/mobile browsers and real models before treating every advanced operation as production-grade CAD.
