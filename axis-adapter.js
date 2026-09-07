import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// RenderSlicer uses Y-up in the interactive Three.js viewport because that is
// Three.js' natural convention. STL and printer G-code conventionally use Z-up.
// Keep the conversion in one place so imported, exported, and sliced geometry
// has the same physical orientation.
const originalParse = STLLoader.prototype.parse;
STLLoader.prototype.parse = function patchedStlParse(data) {
  const geometry = originalParse.call(this, data);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

const originalExport = STLExporter.prototype.parse;
STLExporter.prototype.parse = function patchedStlExport(inputScene, options) {
  const exportScene = inputScene.clone(true);
  exportScene.rotateX(Math.PI / 2);
  exportScene.updateMatrixWorld(true);
  const result = originalExport.call(this, exportScene, options);
  // Three.js versions have returned either ArrayBuffer-like values or DataView.
  // Normalize binary exports for slicer/file consumers while leaving ASCII alone.
  if (options?.binary && result && !(result instanceof ArrayBuffer) && result.buffer instanceof ArrayBuffer) {
    return result.buffer.slice(result.byteOffset || 0, (result.byteOffset || 0) + (result.byteLength || result.buffer.byteLength));
  }
  return result;
};
