// ---------- v1.0.2 direct-manipulation + visibility fixes ----------
(() => {
  // Make the Pencil unmistakable and keep only one starter toolbar visible by default.
  const pencilSymbol = document.getElementById('i-line');
  if (pencilSymbol) {
    pencilSymbol.innerHTML = '<path d="M4 20l4.6-1.1L20 7.5 16.5 4 5.1 15.4z" fill="#f2c94c" stroke="currentColor"/><path d="M14.8 5.7l3.5 3.5M5.1 15.4l3.5 3.5"/><path d="M4 20l1.1-4.6 3.5 3.5z" fill="currentColor"/>';
  }
  document.querySelectorAll('.floating-toolbar [data-command-target="lineCommand"]').forEach(btn => {
    btn.title = 'Pencil / Line (L)';
    btn.setAttribute('aria-label', 'Pencil / Line');
  });
  const mainPencil = document.querySelector('#gettingStartedToolbar [data-command-target="lineCommand"]');
  if (mainPencil && !mainPencil.querySelector('.pencil-label')) {
    mainPencil.classList.add('pencil-labeled');
    const label = document.createElement('span');
    label.className = 'pencil-label';
    label.textContent = 'Pencil';
    mainPencil.append(label);
  }
  const style = document.createElement('style');
  style.textContent = `
    #gettingStartedToolbar .pencil-labeled{width:auto;min-width:64px;grid-template-columns:22px auto;gap:3px;padding:3px 6px}
    #gettingStartedToolbar .pencil-labeled svg{width:20px;height:20px}
    #gettingStartedToolbar .pencil-label{font-size:10px;font-weight:650;line-height:1;white-space:nowrap}
    @media(max-width:800px){#gettingStartedToolbar .pencil-labeled{min-width:70px}}
  `;
  document.head.append(style);

  // One-time migration: the old layout exposed two mostly duplicated toolbars.
  const layoutKey = 'renderStudioCad.ui.v1';
  const migrationKey = 'renderStudioCad.ui.v102.singleStarterToolbar';
  try {
    if (!localStorage.getItem(migrationKey)) {
      const layout = JSON.parse(localStorage.getItem(layoutKey) || '{}') || {};
      layout.toolbars ||= {};
      layout.toolbars.largeToolsetToolbar = {
        ...(layout.toolbars.largeToolsetToolbar || {}),
        hidden: true,
        dock: layout.toolbars.largeToolsetToolbar?.dock || 'left',
        floating: false,
        left: '', top: ''
      };
      localStorage.setItem(layoutKey, JSON.stringify(layout));
      localStorage.setItem(migrationKey, '1');
      document.getElementById('largeToolsetToolbar')?.classList.add('toolbar-hidden');
      const toggle = document.querySelector('[data-toggle-toolbar="largeToolsetToolbar"]');
      if (toggle) toggle.checked = false;
    }
  } catch {}

  // SketchUp-like sketch appearance: translucent face, strong perimeter, dark drawing paths.
  const baseProfileMaterial = profileMaterial;
  profileMaterial = function() {
    const mat = baseProfileMaterial();
    mat.color.setHex(0x62a6f6);
    mat.opacity = 0.34;
    mat.transparent = true;
    mat.depthWrite = false;
    return mat;
  };
  const baseLineMaterial = lineMaterial;
  lineMaterial = function(color = 0x1d5f95) {
    if (color === 0x75d0ff || color === 0x77a7ff) color = 0x1d5f95;
    return baseLineMaterial(color);
  };

  function disposeObject(obj) {
    obj?.traverse?.(c => {
      c.geometry?.dispose?.();
      if (Array.isArray(c.material)) c.material.forEach(m => m?.dispose?.());
      else c.material?.dispose?.();
    });
    obj?.parent?.remove(obj);
  }
  function refreshProfileOutline(profile) {
    const meta = rs(profile);
    if (meta?.kind !== 'profile') return;
    const old = profile.getObjectByName?.('__profileOutline');
    if (old) disposeObject(old);
    const pts = meta.params.points || profilePointsFromParams(meta.params || {});
    if (!pts?.length) return;
    const plane = meta.params.plane || 'XY';
    const local = pts.map(p => uvWorld(p, plane, 0.08));
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(local),
      new THREE.LineBasicMaterial({color:0x174f7d, depthTest:true, depthWrite:false})
    );
    line.name = '__profileOutline';
    line.userData.helper = true;
    line.renderOrder = 8;
    profile.add(line);
    if (profile.material) {
      profile.material.color.setHex(0x62a6f6);
      profile.material.opacity = 0.34;
      profile.material.transparent = true;
      profile.material.depthWrite = false;
      profile.material.needsUpdate = true;
    }
  }
  const baseAddProfile = addProfile;
  addProfile = function(...args) {
    const profile = baseAddProfile(...args);
    refreshProfileOutline(profile);
    return profile;
  };
  const baseRebuildParametric = rebuildParametric;
  rebuildParametric = function(obj) {
    const result = baseRebuildParametric(obj);
    if (rs(obj)?.kind === 'profile') refreshProfileOutline(obj);
    return result;
  };
  profileItems().forEach(refreshProfileOutline);
  const baseRestoreState = restoreState;
  restoreState = async function(...args) {
    const result = await baseRestoreState(...args);
    profileItems().forEach(refreshProfileOutline);
    return result;
  };

  // Push/Pull direct manipulation: press a face/profile, drag, release to commit.
  // A tap still opens the exact numeric dialog as a fallback.
  let drag = null;
  let preview = null;

  const previousSetTool = setTool;
  setTool = function(tool, prompt) {
    previousSetTool(tool, tool === 'pushPull'
      ? 'Push/Pull: press a face and drag with mouse/finger. Release to finish; tap for exact numeric entry.'
      : prompt);
    document.querySelectorAll('[data-command-target="pushPullBtn"]').forEach(btn => {
      btn.classList.toggle('tool-active', tool === 'pushPull');
      if (tool === 'pushPull') btn.dataset.toolProxy = 'pushPull';
    });
    if (tool === 'pushPull') renderer.domElement.style.cursor = 'ns-resize';
  };

  function unitsPerPixel(point) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.height) return 0.25;
    if (camera.isOrthographicCamera) {
      return Math.abs((camera.top - camera.bottom) / Math.max(camera.zoom, EPS)) / rect.height;
    }
    const distance = camera.position.distanceTo(point);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    return Math.max(0.01, visibleHeight / rect.height);
  }
  function snapDistance(mm) {
    if (!$('snapToggle')?.checked) return mm;
    const step = Math.max(0, safeNum($('moveSnap')?.value, 1));
    return step > EPS ? Math.round(mm / step) * step : mm;
  }
  function formatPushDistance(mm) {
    return unitMode() === 'in' ? `${round(mm / 25.4, 3)} in` : `${round(mm, 2)} mm`;
  }
  function previewMaterial(distance) {
    return new THREE.MeshBasicMaterial({
      color: distance >= 0 ? 0x3f8fe8 : 0xe36a63,
      transparent: true, opacity: 0.38, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false
    });
  }
  function clearPreview() {
    if (preview) disposeObject(preview);
    preview = null;
  }
  function addPreviewEdges(mesh) {
    if (!mesh?.geometry) return;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 20),
      new THREE.LineBasicMaterial({color:0x253747, depthTest:false})
    );
    edges.userData.helper = true;
    edges.renderOrder = 30;
    mesh.add(edges);
  }
  function buildPreview(distance) {
    clearPreview();
    if (!drag || Math.abs(distance) < 0.02) return;
    if (drag.kind === 'profile') {
      const meta = rs(drag.target);
      const shape = profileShape(meta);
      if (!shape) return;
      const geometry = new THREE.ExtrudeGeometry(shape, {depth:Math.abs(distance), bevelEnabled:false, steps:1, curveSegments:48});
      mapGeometryPlane(geometry, meta.params.plane || 'XY', Math.sign(distance) || 1);
      preview = new THREE.Mesh(geometry, previewMaterial(distance));
      preview.position.copy(drag.target.position);
      preview.rotation.copy(drag.target.rotation);
      preview.scale.copy(drag.target.scale);
    } else {
      preview = extrudeWorldPolygon(drag.face.points, drag.face.normal, distance);
      if (!preview) return;
      preview.material?.dispose?.();
      preview.material = previewMaterial(distance);
    }
    preview.userData.helper = true;
    preview.renderOrder = 25;
    addPreviewEdges(preview);
    scene.add(preview);
  }

  renderer.domElement.addEventListener('pointerdown', e => {
    if (app.tool !== 'pushPull') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = hitModel(e);
    if (!hit) {
      setStatus('Push/Pull: press a closed sketch face or a planar solid face.');
      return;
    }
    const kind = rs(hit.root)?.kind;
    let face = null;
    if (kind !== 'profile') {
      if (!hit.root?.isMesh) return setStatus('Push/Pull works on closed sketch faces and planar solid faces.');
      face = extractPlanarFace(hit.root, hit);
      if (!face) return setStatus('That surface is not a planar face that can be Push/Pulled yet.');
    }
    app.lastHit = hit;
    selectObject(hit.root);
    drag = {
      pointerId:e.pointerId, kind:kind === 'profile' ? 'profile' : 'face',
      target:hit.root, hit, face,
      startX:e.clientX, startY:e.clientY,
      distance:0, moved:false,
      scale:unitsPerPixel(hit.point), before:captureState()
    };
    orbit.enabled = false;
    transform.detach();
    renderer.domElement.setPointerCapture?.(e.pointerId);
    $('measurementInput').value = formatPushDistance(0);
    setStatus('Push/Pull: drag up/out or down/in, then release.');
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const pixels = drag.startY - e.clientY;
    drag.moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3;
    drag.distance = snapDistance(pixels * drag.scale);
    buildPreview(drag.distance);
    $('measurementInput').value = formatPushDistance(drag.distance);
    setStatus(`Push/Pull: ${formatPushDistance(drag.distance)} — release to finish.`);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  renderer.domElement.addEventListener('pointerup', async e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    renderer.domElement.releasePointerCapture?.(e.pointerId);
    orbit.enabled = true;
    const state = drag;
    drag = null;
    clearPreview();

    if (!state.moved || Math.abs(state.distance) < 0.02) {
      app.lastHit = state.hit;
      selectObject(state.target);
      if (state.kind === 'profile') doExtrude({pushPull:true});
      else pushPullFace(state.target, state.hit);
      return;
    }

    try {
      if (state.kind === 'profile') {
        const final = extrudeProfileObject(state.target, state.distance);
        if (!final) throw new Error('Could not create extrusion');
        modelRoot.add(final);
        state.target.visible = false;
        selectObject(final);
        addFeature(final, `Direct Push/Pull ${round(state.distance)} mm`);
        pushHistory('Direct Push/Pull', state.before);
        renderSceneList();
      } else {
        const prism = extrudeWorldPolygon(state.face.points, state.face.normal, state.distance);
        if (!prism) throw new Error('Could not create Push/Pull volume');
        const result = await booleanObjects(state.target, prism, state.distance >= 0 ? 'union' : 'cut');
        modelRoot.remove(state.target);
        selectObject(result);
        addFeature(result, `Direct Face Push/Pull ${round(state.distance)} mm`);
        pushHistory('Direct Face Push/Pull', state.before);
        renderSceneList();
      }
      setStatus(`Push/Pull finished: ${formatPushDistance(state.distance)}.`);
    } catch (error) {
      console.error(error);
      setStatus(`Push/Pull failed: ${error?.message || error}`);
    }
  }, true);

  renderer.domElement.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag = null;
    orbit.enabled = true;
    clearPreview();
    setStatus('Push/Pull cancelled.');
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) {
      drag = null;
      orbit.enabled = true;
      clearPreview();
      setStatus('Push/Pull cancelled.');
    }
  });

  const version = document.querySelector('.version');
  if (version) version.textContent = 'v1.0.2';
  const aboutTitle = document.querySelector('#aboutDialog .dialog-header h2');
  if (aboutTitle) aboutTitle.textContent = 'Render Studio CAD v1.0.2';
})();
