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
  for (const src of ['./js/part01.js','./js/part02.js','./js/part03.js','./js/part04.js','./js/part05.js','./js/part06.js','./js/part07a.js','./js/part07b.js','./js/part08.js','./js/part09.js','./js/part10.js','./js/part11.js','./js/part12.js','./js/part13.js','./js/part14.js','./js/ui-shell.js']) {
    await loadClassic(src);
  }
} catch (error) {
  console.error(error);
  const status = document.getElementById('statusText');
  if (status) status.textContent = `Startup failed: ${error.message || error}`;
}
