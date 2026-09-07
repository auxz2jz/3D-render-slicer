// ---------- Selection / inspector ----------
function selectObject(obj){
  if(app.selected===obj)return;
  if(app.selected) setSelectedVisual(app.selected,false);
  app.selected=obj||null;
  if(app.selected){setSelectedVisual(app.selected,true);if(!isLocked(app.selected)&&['mesh','solid','primitive','import','group','component'].includes(objectSelectionKind(app.selected)))transform.attach(app.selected);else transform.detach();}
  else transform.detach();
  syncInspector(); renderSceneList();
}
function objectSelectionKind(o){return o?.isGroup?'group':o?.isMesh?'mesh':rs(o)?.kind;}
function setSelectedVisual(obj,on){materialMeshes(obj).forEach(m=>{if(m.material?.emissive)m.material.emissive.setHex(on?0x10294e:0x000000)});}
function setChecked(obj,on){if(on){if(!app.checked.includes(obj))app.checked.push(obj)}else app.checked=app.checked.filter(x=>x!==obj);renderSceneList();}

function renderSceneList(){
  const root=$('sceneList');root.innerHTML='';
  if(!allItems().length){root.innerHTML='<div class="empty-state">No model objects yet.</div>';return;}
  allItems().forEach(obj=>{
    const row=document.createElement('div');row.className=`scene-row${obj===app.selected?' active':''}`;
    const check=document.createElement('input');check.type='checkbox';check.checked=app.checked.includes(obj);check.title='Use for multi-object tools';check.addEventListener('change',()=>setChecked(obj,check.checked));
    const name=document.createElement('div');name.className='scene-name';name.textContent=obj.name;name.addEventListener('click',()=>selectObject(obj));
    const badges=document.createElement('div');badges.className='scene-badges';
    const kind=document.createElement('span');kind.className='badge';kind.textContent=rs(obj)?.kind||'object';badges.append(kind);
    if(rs(obj)?.locked){const b=document.createElement('span');b.className='badge';b.textContent='locked';badges.append(b)}
    if(!obj.visible){const b=document.createElement('span');b.className='badge';b.textContent='hidden';badges.append(b)}
    row.append(check,name,badges);root.append(row);
  });
}

function syncInspector(full=true){
  const o=app.selected; $('noSelection').hidden=!!o;$('properties').hidden=!o;
  $('selectionInfo').textContent=o?o.name:'No selection'; if(!o)return;
  $('objectName').value=o.name;
  refreshTagSelect(); $('objectTag').value=rs(o)?.tag||'untagged';
  $('posX').value=round(lengthFromInternal(o.position.x));$('posY').value=round(lengthFromInternal(o.position.y));$('posZ').value=round(lengthFromInternal(o.position.z));
  $('rotX').value=round(o.rotation.x*DEG);$('rotY').value=round(o.rotation.y*DEG);$('rotZ').value=round(o.rotation.z*DEG);
  $('scaleX').value=round(o.scale.x);$('scaleY').value=round(o.scale.y);$('scaleZ').value=round(o.scale.z);
  const mesh=firstMesh(o);if(mesh?.material){$('materialColor').value=`#${mesh.material.color.getHexString()}`;$('roughness').value=mesh.material.roughness??.6;$('metalness').value=mesh.material.metalness??.05;}
  if(full) renderParametricProperties();
  renderMeasurements();
  renderFeatureHistory();
}
function firstMesh(o){let found=null;o?.traverse?.(c=>{if(!found&&c.isMesh)found=c});return found;}

function unitMode(){return $('unitsSelect')?.value==='in'?'in':'mm';}
function lengthFromInternal(mm){return unitMode()==='in'?mm/25.4:mm;}
function lengthToInternal(v){return unitMode()==='in'?safeNum(v)*25.4:safeNum(v);}
function lengthLabel(mm,n=3){return unitMode()==='in'?`${round(mm/25.4,n)} in`:`${round(mm,n)} mm`;}
function renderMeasurements(){
  const o=app.selected;if(!o){$('measurements').textContent='';return;} const b=new THREE.Box3().setFromObject(o),s=new THREE.Vector3();b.getSize(s);
  let text=`X ${lengthLabel(s.x)} · Y ${lengthLabel(s.y)} · Z ${lengthLabel(s.z)}`;
  if(o.isMesh){const props=meshProperties(o);if(unitMode()==='in')text+=`<br>Area ${round(props.area/(25.4**2))} in² · Volume ${round(Math.abs(props.volume)/(25.4**3))} in³`;else text+=`<br>Area ${round(props.area)} mm² · Volume ${round(Math.abs(props.volume))} mm³`;}
  $('measurements').innerHTML=text;
}
function renderParametricProperties(){
  const wrap=$('parametricProperties');wrap.innerHTML='';const meta=rs(app.selected);if(!meta)return;const p=meta.params||{};
  const defs=paramDefs(meta.kind,p);if(!defs.length)return;const h=document.createElement('h3');h.textContent='Parameters';wrap.append(h);
  defs.forEach(d=>{const lab=document.createElement('label');lab.textContent=d.label;const input=document.createElement('input');input.type='number';input.step=d.step||'.1';input.value=p[d.key]??d.default??0;input.addEventListener('change',()=>{const before=captureState();p[d.key]=safeNum(input.value,p[d.key]);rebuildParametric(app.selected);pushHistory(`Change ${d.label}`,before);});lab.append(input);wrap.append(lab);});
}
function paramDefs(kind,p){
  if(kind==='primitive'){
    if(p.type==='box')return [['w','Width'],['d','Depth'],['h','Height'],['radius','Corner radius']].map(([key,label])=>({key,label}));
    if(['cylinder','cone'].includes(p.type))return [{key:'r',label:'Radius'},{key:'h',label:'Height'}];
    if(p.type==='sphere')return [{key:'r',label:'Radius'}];
    if(p.type==='torus')return [{key:'r',label:'Major radius'},{key:'tube',label:'Tube radius'}];
    if(p.type==='tube')return [{key:'ro',label:'Outer radius'},{key:'ri',label:'Inner radius'},{key:'h',label:'Height'}];
    if(p.type==='coil')return [{key:'r',label:'Coil radius'},{key:'tube',label:'Wire radius'},{key:'pitch',label:'Pitch'},{key:'turns',label:'Turns'}];
  }
  if(kind==='profile'&&p.shape==='rectangle')return [{key:'w',label:'Width'},{key:'h',label:'Height'}];
  if(kind==='profile'&&['circle','polygon'].includes(p.shape))return [{key:'r',label:'Radius'}];
  return [];
}

function addFeature(obj,label){const meta=rs(obj);if(meta){meta.features||=[];meta.features.push(label);renderFeatureHistory();}}
function renderFeatureHistory(){const root=$('historyList');root.innerHTML='';const meta=rs(app.selected);if(!meta){root.innerHTML='<div class="empty-state">Select an object.</div>';return;} (meta.features||[]).forEach((f,i)=>{const r=document.createElement('div');r.className='history-row';r.innerHTML=`<span class="history-index">${i+1}</span><span>${escapeHtml(f)}</span>`;root.append(r);});}

// ---------- History ----------
function serializeProjectObject(){return {version:1,model:modelRoot.toJSON(),guides:guideRoot.toJSON(),construction:constructionRoot.toJSON(),tags:app.tags,scenes:app.scenes,settings:{gridSpacing:$('gridSpacing').value,moveSnap:$('moveSnap').value,angleSnap:$('angleSnap').value,background:$('backgroundColor').value,units:unitMode()}};}
function captureState(){return JSON.stringify(serializeProjectObject());}
function pushHistory(label,beforeState=null){
  if(app.restoring)return;const state=captureState();
  if(app.historyIndex<app.history.length-1)app.history=app.history.slice(0,app.historyIndex+1);
  if(beforeState&&(!app.history.length||app.history[app.historyIndex]?.state!==beforeState)){app.history.push({label:`Before ${label}`,state:beforeState});app.historyIndex=app.history.length-1;}
  app.history.push({label,state});app.historyIndex=app.history.length-1;if(app.history.length>50){app.history.shift();app.historyIndex--;}
  updateUndoButtons();
}
function updateUndoButtons(){$('undoBtn').disabled=app.historyIndex<=0;$('redoBtn').disabled=app.historyIndex>=app.history.length-1;}
async function restoreState(json){
  app.restoring=true;try{
    const data=typeof json==='string'?JSON.parse(json):json; const loader=new THREE.ObjectLoader();
    modelRoot.clear();guideRoot.clear();constructionRoot.clear();app.checked=[];selectObject(null);
    const loaded=loader.parse(data.model);while(loaded.children.length)modelRoot.add(loaded.children[0]);
    if(data.guides){const g=loader.parse(data.guides);while(g.children.length)guideRoot.add(g.children[0]);}
    if(data.construction){const c=loader.parse(data.construction);while(c.children.length)constructionRoot.add(c.children[0]);}
    app.tags=data.tags||app.tags;app.scenes=data.scenes||[];
    if(data.settings){$('gridSpacing').value=data.settings.gridSpacing||10;$('moveSnap').value=data.settings.moveSnap||1;$('angleSnap').value=data.settings.angleSnap||15;$('backgroundColor').value=data.settings.background||'#0b1020';scene.background.set($('backgroundColor').value);$('unitsSelect').value=data.settings.units||'mm';rebuildGrid();}
    refreshTagSelect();renderTags();renderScenes();renderSceneList();fitView();
  }finally{app.restoring=false;}
}
async function undo(){if(app.historyIndex<=0)return;app.historyIndex--;await restoreState(app.history[app.historyIndex].state);updateUndoButtons();setStatus(`Undo: ${app.history[app.historyIndex].label}`);}
async function redo(){if(app.historyIndex>=app.history.length-1)return;app.historyIndex++;await restoreState(app.history[app.historyIndex].state);updateUndoButtons();setStatus(`Redo: ${app.history[app.historyIndex].label}`);}
