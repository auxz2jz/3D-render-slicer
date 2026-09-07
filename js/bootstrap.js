import * as THREE_NS from 'three';
import { OrbitControls as OrbitControlsNS } from 'three/addons/controls/OrbitControls.js';
import { TransformControls as TransformControlsNS } from 'three/addons/controls/TransformControls.js';
import { STLLoader as STLLoaderNS } from 'three/addons/loaders/STLLoader.js';
import { STLExporter as STLExporterNS } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter as OBJExporterNS } from 'three/addons/exporters/OBJExporter.js';
import { RoundedBoxGeometry as RoundedBoxGeometryNS } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices as mergeVerticesNS } from 'three/addons/utils/BufferGeometryUtils.js';

Object.assign(globalThis, {
  THREE: THREE_NS,
  OrbitControls: OrbitControlsNS,
  TransformControls: TransformControlsNS,
  STLLoader: STLLoaderNS,
  STLExporter: STLExporterNS,
  OBJExporter: OBJExporterNS,
  RoundedBoxGeometry: RoundedBoxGeometryNS,
  mergeVertices: mergeVerticesNS,
});

async function loadClassic(src) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

try {
  for (const src of ['./js/chunk1.js','./js/chunk2.js','./js/chunk3.js','./js/chunk4.js','./js/chunk5.js']) {
    await loadClassic(src);
  }
} catch (error) {
  console.error(error);
  const status = document.getElementById('statusText');
  if (status) status.textContent = `Startup failed: ${error.message || error}`;
}
