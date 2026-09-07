(() => {
  const workspace = document.getElementById('workspace');
  if (!workspace || workspace.dataset.uiReady === '1') return;
  workspace.dataset.uiReady = '1';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'renderStudioCad.ui.v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { saved = {}; }

  const narrowScreen = () => window.matchMedia?.('(max-width:800px)').matches;
  const updateDockOffsets = () => {
    const left = $('dockLeft'); const right = $('dockRight'); const top = $('dockTop');
    if (!left || !right || !top) return;
    const visibleWidth = zone => [...zone.children].some(el => !el.classList.contains('toolbar-hidden')) ? zone.getBoundingClientRect().width : 0;
    top.style.left = `${Math.ceil(visibleWidth(left))}px`;
    top.style.right = `${Math.ceil(visibleWidth(right))}px`;
  };

  const saveLayout = () => {
    const state = { toolbars: {}, trays: {} };
    document.querySelectorAll('.floating-toolbar').forEach(el => {
      state.toolbars[el.id] = {
        hidden: el.classList.contains('toolbar-hidden'),
        dock: el.dataset.dock || el.dataset.defaultDock || 'top',
        floating: el.dataset.floating === 'true',
        left: el.style.left || '', top: el.style.top || ''
      };
    });
    document.querySelectorAll('.tool-tray').forEach(el => {
      state.trays[el.id] = {
        hidden: el.classList.contains('tray-hidden'), collapsed: el.classList.contains('collapsed'),
        dock: el.dataset.trayDock || el.dataset.defaultTrayDock || 'right',
        floating: el.dataset.floating === 'true', left: el.style.left || '', top: el.style.top || ''
      };
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  };

  const closeMenus = except => {
    document.querySelectorAll('.menu-popup.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
    document.querySelectorAll('.menu-trigger.open').forEach(b => { if (!except || b.dataset.menu !== except.id) b.classList.remove('open'); });
  };
  document.querySelectorAll('.menu-trigger').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation(); const menu = $(btn.dataset.menu); const willOpen = !menu.classList.contains('open'); closeMenus();
    if (willOpen) { menu.classList.add('open'); btn.classList.add('open'); }
  }));
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu-root')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

  document.addEventListener('click', e => {
    const proxy = e.target.closest('[data-command-target]'); if (!proxy) return;
    const target = $(proxy.dataset.commandTarget); if (!target) return;
    e.preventDefault(); target.click(); closeMenus();
  });

  function dockToolbar(el, dock) {
    const zone = dock === 'left' ? $('dockLeft') : dock === 'right' ? $('dockRight') : $('dockTop');
    el.dataset.dock = dock; el.dataset.floating = 'false'; el.style.left = ''; el.style.top = '';
    el.classList.toggle('vertical', dock === 'left' || dock === 'right');
    el.classList.toggle('horizontal', dock === 'top'); zone.appendChild(el); updateDockOffsets(); saveLayout();
  }
  function floatToolbar(el, x, y) {
    workspace.appendChild(el); el.dataset.floating = 'true'; el.dataset.dock = 'float';
    el.classList.add('horizontal'); el.classList.remove('vertical');
    const r = workspace.getBoundingClientRect();
    el.style.left = `${Math.max(2, Math.min(r.width - 60, x - r.left))}px`;
    el.style.top = `${Math.max(2, Math.min(r.height - 45, y - r.top))}px`;
  }
  function finishToolbarDrag(el, x, y) {
    const r = workspace.getBoundingClientRect(); const edge = 48;
    if (y - r.top < edge) dockToolbar(el, 'top');
    else if (x - r.left < edge) dockToolbar(el, 'left');
    else if (r.right - x < edge) dockToolbar(el, 'right');
    else { floatToolbar(el, x - 25, y - 12); saveLayout(); }
  }
  document.querySelectorAll('.floating-toolbar').forEach(el => {
    const cfg = saved.toolbars?.[el.id];
    if (cfg?.hidden) el.classList.add('toolbar-hidden'); else if (cfg && !cfg.hidden) el.classList.remove('toolbar-hidden');
    if (cfg?.floating) { floatToolbar(el, workspace.getBoundingClientRect().left + (parseFloat(cfg.left)||100), workspace.getBoundingClientRect().top + (parseFloat(cfg.top)||70)); el.style.left=cfg.left; el.style.top=cfg.top; }
    else dockToolbar(el, cfg?.dock && cfg.dock !== 'float' ? cfg.dock : el.dataset.defaultDock || 'top');
    const handle = el.querySelector('.toolbar-handle'); if (!handle) return;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); handle.setPointerCapture?.(e.pointerId); const start = {x:e.clientX,y:e.clientY}; let moved=false;
      const move = ev => { if (!moved && Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>4) moved=true; if (moved) floatToolbar(el, ev.clientX-20, ev.clientY-12); };
      const up = ev => { handle.removeEventListener('pointermove',move); handle.removeEventListener('pointerup',up); if(moved) finishToolbarDrag(el,ev.clientX,ev.clientY); };
      handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',up);
    });
  });

  function dockTray(el, dock) {
    const zone = dock === 'left' ? $('trayDockLeft') : $('trayDockRight');
    el.dataset.trayDock=dock; el.dataset.floating='false'; el.style.left=''; el.style.top=''; zone.appendChild(el); saveLayout();
  }
  function floatTray(el, x, y) {
    workspace.appendChild(el); el.dataset.floating='true'; el.dataset.trayDock='float';
    const r=workspace.getBoundingClientRect(); el.style.left=`${Math.max(4,Math.min(r.width-220,x-r.left))}px`; el.style.top=`${Math.max(4,Math.min(r.height-50,y-r.top))}px`;
  }
  function finishTrayDrag(el,x,y){const r=workspace.getBoundingClientRect(),edge=78;if(x-r.left<edge)dockTray(el,'left');else if(r.right-x<edge)dockTray(el,'right');else{floatTray(el,x-140,y-14);saveLayout();}}
  document.querySelectorAll('.tool-tray').forEach(el => {
    const cfg=saved.trays?.[el.id];
    if(cfg?.hidden)el.classList.add('tray-hidden');else if(cfg&&!cfg.hidden)el.classList.remove('tray-hidden');else if(!cfg&&narrowScreen())el.classList.add('tray-hidden');
    if(cfg?.collapsed)el.classList.add('collapsed');
    if(cfg?.floating){floatTray(el,workspace.getBoundingClientRect().left+(parseFloat(cfg.left)||120),workspace.getBoundingClientRect().top+(parseFloat(cfg.top)||80));el.style.left=cfg.left;el.style.top=cfg.top;}
    else dockTray(el,cfg?.dock&&cfg.dock!=='float'?cfg.dock:el.dataset.defaultTrayDock||'right');
    const head=el.querySelector('.tray-header'); if(head) head.addEventListener('pointerdown',e=>{
      if(e.target.closest('button'))return;e.preventDefault();head.setPointerCapture?.(e.pointerId);const s={x:e.clientX,y:e.clientY};let moved=false;
      const move=ev=>{if(!moved&&Math.hypot(ev.clientX-s.x,ev.clientY-s.y)>4)moved=true;if(moved)floatTray(el,ev.clientX-140,ev.clientY-14)};
      const up=ev=>{head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',up);if(moved)finishTrayDrag(el,ev.clientX,ev.clientY)};head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);
    });
    el.querySelector('[data-collapse-tray]')?.addEventListener('click',()=>{el.classList.toggle('collapsed');saveLayout();});
    el.querySelector('[data-close-tray]')?.addEventListener('click',()=>{el.classList.add('tray-hidden');syncChecks();saveLayout();});
  });

  function syncChecks(){
    document.querySelectorAll('[data-toggle-toolbar]').forEach(c=>c.checked=!$(c.dataset.toggleToolbar)?.classList.contains('toolbar-hidden'));
    document.querySelectorAll('[data-toggle-tray]').forEach(c=>c.checked=!$(c.dataset.toggleTray)?.classList.contains('tray-hidden'));
  }
  document.querySelectorAll('[data-toggle-toolbar]').forEach(c=>c.addEventListener('change',()=>{const el=$(c.dataset.toggleToolbar);if(!el)return;el.classList.toggle('toolbar-hidden',!c.checked);updateDockOffsets();saveLayout();}));
  document.querySelectorAll('[data-toggle-tray]').forEach(c=>c.addEventListener('change',()=>{const el=$(c.dataset.toggleTray);if(!el)return;el.classList.toggle('tray-hidden',!c.checked);saveLayout();}));
  syncChecks(); updateDockOffsets();

  window.addEventListener('resize',()=>{updateDockOffsets();document.querySelectorAll('[data-floating="true"]').forEach(el=>{const r=workspace.getBoundingClientRect(),er=el.getBoundingClientRect();const left=Math.max(2,Math.min(r.width-er.width-2,parseFloat(el.style.left)||2));const top=Math.max(2,Math.min(r.height-er.height-2,parseFloat(el.style.top)||2));el.style.left=`${left}px`;el.style.top=`${top}px`;});});
})();