// ---------- Tool-first usability refinements ----------
(() => {
  const baseSetTool = setTool;
  setTool = function(tool, prompt) {
    const resolvedPrompt = tool === 'pushPull'
      ? 'Push/Pull: click a closed sketch profile or a planar solid face, then enter the exact distance.'
      : prompt;
    baseSetTool(tool, resolvedPrompt);
    document.querySelectorAll('[data-command-target="pushPullBtn"]').forEach(btn => {
      btn.classList.toggle('tool-active', tool === 'pushPull');
    });
    if (tool === 'pushPull') renderer.domElement.style.cursor = 'ns-resize';
  };

  // Push/Pull behaves like a selected modeling tool instead of immediately
  // acting on whatever happened to be selected before the button was pressed.
  $('pushPullBtn').onclick = () => setTool('pushPull');

  renderer.domElement.addEventListener('pointerup', e => {
    if (app.tool !== 'pushPull') return;
    const moved = pointerDownScreen && Math.hypot(e.clientX - pointerDownScreen.x, e.clientY - pointerDownScreen.y) > 5;
    if (moved) return;

    const hit = hitModel(e);
    if (!hit) {
      setStatus('Push/Pull: click a closed sketch profile or a planar solid face.');
      return;
    }

    app.lastHit = hit;
    selectObject(hit.root);
    const kind = rs(hit.root)?.kind;
    if (kind === 'profile') {
      doExtrude({pushPull:true});
      return;
    }
    if (hit.root?.isMesh) {
      pushPullFace(hit.root, hit);
      return;
    }
    setStatus('Push/Pull currently works on closed profiles and planar faces of solid meshes.');
  });

  const version = document.querySelector('.version');
  if (version) version.textContent = 'v1.0.1';
  const aboutTitle = document.querySelector('#aboutDialog .dialog-header h2');
  if (aboutTitle) aboutTitle.textContent = 'Render Studio CAD v1.0.1';
})();
