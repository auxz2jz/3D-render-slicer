// ---------- SketchUp-style continuous Pencil ----------
(() => {
  let lineChain = [];

  function resetLineChain(clearMeasurement=true) {
    lineChain = [];
    app.drawPoints = [];
    if (clearMeasurement && $('measurementInput')) $('measurementInput').value = '';
  }

  const baseSetTool = setTool;
  setTool = function(tool, prompt) {
    if (app.tool === 'line' && tool !== 'line') resetLineChain();
    baseSetTool(tool, prompt);
  };

  const baseExecuteSketchClick = executeSketchClick;
  executeSketchClick = function(p) {
    if (app.tool !== 'line') return baseExecuteSketchClick(p);

    const plane = currentSketchPlane();
    const uv = planeUV(p, plane);
    if (!lineChain.length) {
      lineChain = [uv];
      app.drawPoints = [uv];
      setStatus('Pencil: choose the next point. Click the starting point to close a face.');
      return;
    }

    const previous = lineChain.at(-1);
    if (Math.hypot(uv[0] - previous[0], uv[1] - previous[1]) < EPS) return;

    addPath([uvWorld(previous, plane), uvWorld(uv, plane)], 'line');
    lineChain.push(uv);
    app.drawPoints = [uv];

    const first = lineChain[0];
    const closeTolerance = Math.max(0.25, safeNum($('moveSnap')?.value, 1) * 0.5);
    const closed = lineChain.length >= 4 && Math.hypot(uv[0] - first[0], uv[1] - first[1]) <= closeTolerance;

    if (closed) {
      const points = lineChain.slice(0, -1);
      const face = addProfile(points, plane, 'custom', {points});
      addFeature(face, 'Closed Pencil Loop');
      resetLineChain();
      selectObject(face);
      setStatus('Closed face created. Choose Push/Pull to give it thickness.');
      return;
    }

    setStatus('Pencil: continue drawing, click the starting point to close a face, or Esc to end the chain.');
  };

  const baseApplyTypedMeasurement = applyTypedMeasurement;
  applyTypedMeasurement = function(text) {
    if (app.tool !== 'line') return baseApplyTypedMeasurement(text);
    if (!lineChain.length || !app.hoverPoint) return false;
    const length = parseUnitValue(text);
    if (!(length > 0)) return false;

    const plane = currentSketchPlane();
    const start = lineChain.at(-1);
    const hover = planeUV(app.hoverPoint, plane);
    const dx = hover[0] - start[0], dy = hover[1] - start[1];
    const magnitude = Math.hypot(dx, dy) || 1;
    const end = [start[0] + dx / magnitude * length, start[1] + dy / magnitude * length];
    executeSketchClick(uvWorld(end, plane));
    $('measurementInput').value = '';
    return true;
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && app.tool === 'line' && lineChain.length) {
      resetLineChain();
      setStatus('Pencil chain ended.');
    }
  });
})();
