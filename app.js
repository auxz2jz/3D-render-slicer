import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $ = id => document.getElementById(id);
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(240, 190, 240);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 35, 0);
orbit.screenSpacePanning = true;

const transform = new TransformControls(camera, renderer.domElement);
const transformHelper = transform.getHelper ? transform.getHelper() : transform;
scene.add(transformHelper);
transform.setMode('translate');
transform.addEventListener('dragging-changed', e => orbit.enabled = !e.value);
transform.addEventListener('mouseDown', () => beginTransformSnapshot());
transform.addEventListener('mouseUp', () => endTransformSnapshot());
transform.addEventListener('objectChange', () => {
  syncPropertiesFromSelection(false);
  updateMeasurements();
  renderSceneList();
});

const ambient = new THREE.HemisphereLight(0xbfd8ff, 0x293048, 2.25);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 3.2);
key.position.set(180, 300, 220);
key.castShadow = true;
scene.add(key);

const models = new THREE.Group();
models.name = 'Models';
scene.add(models);

const previewGroup = new THREE.Group();
previewGroup.name = 'GCode Preview';
previewGroup.visible = false;
scene.add(previewGroup);

const bedGroup = new THREE.Group();
scene.add(bedGroup);
let bedMesh = null;
let grid = null;
let axes = new THREE.AxesHelper(50);
scene.add(axes);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selected = null;
let booleanSelection = [];
let objectCounter = 1;
let currentMode = 'design';
let wireframe = false;
let gcodeText = '';
let gcodeLayers = [];
let transformStartSnapshot = null;
let history = [];
let historyIndex = -1;
let suppressHistory = false;

const defaultMaterial = () => new THREE.MeshStandardMaterial({
  color: new THREE.Color().setHSL((objectCounter * 0.093) % 1, 0.55, 0.58),
  roughness: 0.58,
  metalness: 0.04
});

const printerProfiles = {
  generic220: { name: 'Generic FDM 220 × 220 × 250', x:220, y:220, z:250, nozzle:0.4, originCenter:false },
  k1c: { name: 'Creality K1C 220 × 220 × 250', x:220, y:220, z:250, nozzle:0.4, originCenter:false },
  custom: { name: 'Custom Printer', x:220, y:220, z:250, nozzle:0.4, originCenter:false }
};
const materials = {
  pla: { name:'PLA', nozzle:210, bed:60, fan:100 },
  petg: { name:'PETG', nozzle:240, bed:75, fan:45 },
  abs: { name:'ABS / ASA', nozzle:250, bed:100, fan:15 },
  tpu: { name:'TPU', nozzle:225, bed:50, fan:60 },
  custom: { name:'Custom', nozzle:210, bed:60, fan:100 }
};
const qualities = {
  draft: { name:'Draft / Fast', layer:0.28, walls:2, top:3, bottom:3, infill:12, speed:90 },
  standard: { name:'Standard', layer:0.20, walls:3, top:4, bottom:4, infill:18, speed:60 },
  fine: { name:'Fine', layer:0.12, walls:3, top:5, bottom:5, infill:20, speed:45 },
  strong: { name:'Strong Functional', layer:0.20, walls:5, top:6, bottom:6, infill:35, speed:50 },
  custom: { name:'Custom', layer:0.20, walls:3, top:4, bottom:4, infill:20, speed:60 }
};

function initProfileMenus() {
  Object.entries(printerProfiles).forEach(([key,p]) => $('printerProfile').add(new Option(p.name,key)));
  Object.entries(materials).forEach(([key,p]) => $('materialProfile').add(new Option(p.name,key)));
  Object.entries(qualities).forEach(([key,p]) => $('qualityPreset').add(new Option(p.name,key)));
  $('printerProfile').value = 'k1c';
  $('materialProfile').value = 'pla';
  $('qualityPreset').value = 'standard';
  applyPrinterProfile(); applyMaterialProfile(); applyQualityProfile();
  $('printSpeed').value = 60;
  $('travelSpeed').value = 180;
  $('retractionDistance').value = 0.8;
  $('outerWallSpeed').value = 40;
  $('acceleration').value = 5000;
  $('lineWidth').value = 0.42;
  $('supportAngle').value = 50;
  updateAdvancedVisibility();
}

function applyPrinterProfile() {
  const p = printerProfiles[$('printerProfile').value] || printerProfiles.custom;
  $('bedX').value = p.x; $('bedY').value = p.y; $('bedZ').value = p.z; $('nozzleSize').value = p.nozzle;
  rebuildBed();
}
function applyMaterialProfile() {
  const m = materials[$('materialProfile').value] || materials.custom;
  $('nozzleTemp').value = m.nozzle; $('bedTemp').value = m.bed; $('fanSpeed').value = m.fan;
}
function applyQualityProfile() {
  const q = qualities[$('qualityPreset').value] || qualities.custom;
  $('layerHeight').value = q.layer; $('wallCount').value = q.walls; $('topLayers').value = q.top; $('bottomLayers').value = q.bottom;
  $('infillDensity').value = q.infill; $('printSpeed').value = q.speed;
}

function rebuildBed() {
  const x = Math.max(1, Number($('bedX').value) || 220);
  const y = Math.max(1, Number($('bedY').value) || 220);
  if (bedMesh) bedGroup.remove(bedMesh);
  if (grid) bedGroup.remove(grid);
  const geo = new THREE.BoxGeometry(x, 2, y);
  const mat = new THREE.MeshStandardMaterial({ color:0x222d44, roughness:0.9, metalness:0.05, transparent:true, opacity:0.8 });
  bedMesh = new THREE.Mesh(geo, mat);
  bedMesh.position.y = -1.2;
  bedMesh.receiveShadow = true;
  bedGroup.add(bedMesh);
  grid = new THREE.GridHelper(Math.max(x,y), Math.max(10, Math.round(Math.max(x,y)/10)), 0x5d709c, 0x26344f);
  grid.position.y = 0.02;
  grid.scale.x = x / Math.max(x,y);
  grid.scale.z = y / Math.max(x,y);
  bedGroup.add(grid);
}

function makeGeometry(type, p={}) {
  switch(type) {
    case 'box': return new THREE.BoxGeometry(p.w ?? 30, p.h ?? 30, p.d ?? 30);
    case 'cylinder': return new THREE.CylinderGeometry(p.r ?? 15, p.r ?? 15, p.h ?? 30, 64);
    case 'sphere': return new THREE.SphereGeometry(p.r ?? 18, 48, 28);
    case 'cone': return new THREE.ConeGeometry(p.r ?? 18, p.h ?? 35, 64);
    case 'torus': return new THREE.TorusGeometry(p.r ?? 20, p.tube ?? 5, 24, 72);
    case 'tube': return new THREE.CylinderGeometry(p.ro ?? 18, p.ro ?? 18, p.h ?? 35, 64, 1, false);
    default: return new THREE.BoxGeometry(30,30,30);
  }
}

function addPrimitive(type) {
  checkpoint();
  const params = type==='box' ? {w:30,h:30,d:30}
    : type==='cylinder' ? {r:15,h:30}
    : type==='sphere' ? {r:18}
    : type==='cone' ? {r:18,h:35}
    : type==='torus' ? {r:20,tube:5}
    : {ro:18,ri:12,h:35};
  let geometry = makeGeometry(type, params);
  if (type === 'tube') geometry = createTubeGeometry(params.ro, params.ri, params.h);
  const mesh = new THREE.Mesh(geometry, defaultMaterial());
  mesh.name = `${capitalize(type)} ${objectCounter++}`;
  mesh.userData.kind = 'primitive'; mesh.userData.primitive = type; mesh.userData.params = params;
  mesh.castShadow = true; mesh.receiveShadow = true;
  models.add(mesh);
  placeOnBed(mesh); selectObject(mesh); renderSceneList(); fitCameraToObjects([mesh]);
  setStatus(`${mesh.name} added.`);
}

function createTubeGeometry(ro, ri, h) {
  const shape = new THREE.Shape();
  shape.absarc(0,0,ro,0,Math.PI*2,false);
  const hole = new THREE.Path(); hole.absarc(0,0,ri,0,Math.PI*2,true); shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth:h, bevelEnabled:false, curveSegments:64 });
  geo.rotateX(Math.PI/2); geo.translate(0,h/2,0); return geo;
}

function rebuildPrimitive(mesh) {
  if (!mesh?.userData?.primitive) return;
  const p = mesh.userData.params || {};
  let g = mesh.userData.primitive === 'tube' ? createTubeGeometry(p.ro,p.ri,p.h) : makeGeometry(mesh.userData.primitive,p);
  mesh.geometry.dispose(); mesh.geometry = g;
  placeOnBed(mesh, false); updateMeasurements();
}

function selectObject(obj) {
  selected = obj || null;
  if (selected) {
    transform.attach(selected);
    selected.material?.emissive?.setHex(0x152b50);
  } else transform.detach();
  models.children.forEach(o => {
    if (o !== selected && o.material?.emissive) o.material.emissive.setHex(0x000000);
  });
  syncPropertiesFromSelection(); renderSceneList(); updateSelectionInfo();
}

function updateSelectionInfo() {
  $('selectionInfo').textContent = selected ? `${selected.name}` : `${models.children.length} object${models.children.length===1?'':'s'}`;
}

function renderSceneList() {
  const root = $('sceneList'); root.innerHTML = '';
  if (!models.children.length) { root.innerHTML = '<div class="empty-state">No objects yet.</div>'; return; }
  models.children.forEach(obj => {
    const row = document.createElement('div'); row.className = `scene-row${obj===selected?' active':''}`;
    const check = document.createElement('input'); check.type='checkbox'; check.checked = booleanSelection.includes(obj);
    check.addEventListener('change', () => {
      if (check.checked) { if (!booleanSelection.includes(obj)) booleanSelection.push(obj); }
      else booleanSelection = booleanSelection.filter(x=>x!==obj);
      updateBooleanButtons();
    });
    const name = document.createElement('div'); name.className='scene-name'; name.textContent=obj.name; name.title=obj.name;
    name.addEventListener('click', ()=>selectObject(obj));
    const eye = document.createElement('button'); eye.className='scene-eye'; eye.textContent = obj.visible ? '●' : '○'; eye.title='Show/hide object';
    eye.addEventListener('click', e=>{e.stopPropagation(); obj.visible=!obj.visible; renderSceneList();});
    row.append(check,name,eye); root.appendChild(row);
  });
  updateBooleanButtons();
}
function updateBooleanButtons(){ const ok=booleanSelection.length===2; ['unionBtn','subtractBtn','intersectBtn'].forEach(id=>$(id).disabled=!ok); }

function syncPropertiesFromSelection(updatePrimitive=true) {
  const show = !!selected;
  $('noSelectionMessage').hidden = show; $('propertiesForm').hidden = !show;
  if (!show) return;
  $('objectName').value = selected.name;
  $('posX').value = round(selected.position.x); $('posY').value = round(selected.position.y); $('posZ').value = round(selected.position.z);
  $('rotX').value = round(selected.rotation.x*DEG); $('rotY').value = round(selected.rotation.y*DEG); $('rotZ').value = round(selected.rotation.z*DEG);
  $('scaleX').value = round(selected.scale.x); $('scaleY').value = round(selected.scale.y); $('scaleZ').value = round(selected.scale.z);
  if (updatePrimitive) renderPrimitiveParams();
  updateMeasurements();
}

function renderPrimitiveParams() {
  const wrap = $('primitiveParams'); wrap.innerHTML='';
  if (!selected?.userData?.primitive) return;
  const p = selected.userData.params || {};
  const defs = selected.userData.primitive==='box' ? [['w','Width'],['h','Height'],['d','Depth']]
    : selected.userData.primitive==='sphere' ? [['r','Radius']]
    : selected.userData.primitive==='torus' ? [['r','Major radius'],['tube','Tube radius']]
    : selected.userData.primitive==='tube' ? [['ro','Outer radius'],['ri','Inner radius'],['h','Height']]
    : [['r','Radius'],['h','Height']];
  const title=document.createElement('h3'); title.textContent='Parametric dimensions'; wrap.appendChild(title);
  defs.forEach(([key,label])=>{
    const lab=document.createElement('label'); lab.textContent=label;
    const inp=document.createElement('input'); inp.type='number'; inp.step='0.1'; inp.min='0.1'; inp.value=p[key];
    inp.addEventListener('change',()=>{ checkpoint(); p[key]=Math.max(0.1,Number(inp.value)||0.1); if(selected.userData.primitive==='tube' && p.ri>=p.ro) p.ri=Math.max(.1,p.ro-.5); rebuildPrimitive(selected); checkpoint(); });
    lab.appendChild(inp); wrap.appendChild(lab);
  });
}

function updateMeasurements() {
  if (!selected) { $('measurements').textContent=''; return; }
  const box=new THREE.Box3().setFromObject(selected); const s=new THREE.Vector3(); box.getSize(s);
  $('measurements').innerHTML = `X: <strong>${round(s.x)} mm</strong><br>Y: <strong>${round(s.y)} mm</strong><br>Z: <strong>${round(s.z)} mm</strong>`;
}

function placeOnBed(obj=selected, record=true) {
  if (!obj) return; if(record) checkpoint();
  obj.updateMatrixWorld(true); const box=new THREE.Box3().setFromObject(obj); obj.position.y -= box.min.y; obj.updateMatrixWorld(true);
  if(record) checkpoint(); syncPropertiesFromSelection(false);
}
function centerOnBed(obj=selected) {
  if (!obj) return; checkpoint(); obj.updateMatrixWorld(true); const box=new THREE.Box3().setFromObject(obj); const c=new THREE.Vector3(); box.getCenter(c); obj.position.x -= c.x; obj.position.z -= c.z; placeOnBed(obj,false); checkpoint(); syncPropertiesFromSelection(false);
}

function duplicateSelected() {
  if(!selected) return; checkpoint(); const c=selected.clone(); c.geometry=selected.geometry.clone(); c.material=selected.material.clone(); c.position.x+=10; c.position.z+=10; c.name=`${selected.name} Copy`; models.add(c); selectObject(c); checkpoint();
}
function deleteSelected() { if(!selected)return; checkpoint(); const old=selected; transform.detach(); models.remove(old); booleanSelection=booleanSelection.filter(x=>x!==old); selected=null; checkpoint(); syncPropertiesFromSelection(); renderSceneList(); setStatus('Object deleted.'); }

function transformInputChanged() {
  if(!selected)return; checkpoint();
  selected.position.set(n('posX'),n('posY'),n('posZ'));
  selected.rotation.set(n('rotX')*RAD,n('rotY')*RAD,n('rotZ')*RAD);
  selected.scale.set(Math.max(.001,n('scaleX')),Math.max(.001,n('scaleY')),Math.max(.001,n('scaleZ')));
  selected.updateMatrixWorld(true); updateMeasurements(); renderSceneList(); checkpoint();
}

function beginTransformSnapshot(){ if(selected) transformStartSnapshot = serializeModels(); }
function endTransformSnapshot(){ if(!selected||!transformStartSnapshot)return; history=history.slice(0,historyIndex+1); history.push(transformStartSnapshot); history.push(serializeModels()); historyIndex=history.length-1; transformStartSnapshot=null; updateUndoButtons(); }

function serializeModels(){ return JSON.stringify(models.toJSON()); }
function checkpoint() {
  if(suppressHistory)return;
  const snap=serializeModels();
  if(history[historyIndex]===snap)return;
  history=history.slice(0,historyIndex+1); history.push(snap); historyIndex=history.length-1;
  if(history.length>35){history.shift();historyIndex--;}
  updateUndoButtons();
}
function restoreSnapshot(snap){
  suppressHistory=true; try{
    const loader=new THREE.ObjectLoader(); const parsed=loader.parse(JSON.parse(snap));
    transform.detach(); selected=null; booleanSelection=[];
    while(models.children.length) models.remove(models.children[0]);
    parsed.children.forEach(o=>models.add(o));
    renderSceneList(); syncPropertiesFromSelection(); updateSelectionInfo(); fitCameraToObjects(models.children);
  } finally{suppressHistory=false;}
}
function undo(){if(historyIndex<=0)return;historyIndex--;restoreSnapshot(history[historyIndex]);updateUndoButtons();}
function redo(){if(historyIndex>=history.length-1)return;historyIndex++;restoreSnapshot(history[historyIndex]);updateUndoButtons();}
function updateUndoButtons(){$('undoBtn').disabled=historyIndex<=0;$('redoBtn').disabled=historyIndex>=history.length-1;}

async function performBoolean(op) {
  if(booleanSelection.length!==2)return;
  const [a,b]=booleanSelection;
  setStatus('Computing boolean…');
  try{
    const mod=await import('https://esm.sh/three-bvh-csg@0.0.18?external=three');
    const { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION }=mod;
    checkpoint();
    const brushA=new Brush(a.geometry.clone(),a.material.clone()); brushA.matrix.copy(a.matrixWorld); brushA.matrix.decompose(brushA.position,brushA.quaternion,brushA.scale); brushA.updateMatrixWorld(true);
    const brushB=new Brush(b.geometry.clone(),b.material.clone()); brushB.matrix.copy(b.matrixWorld); brushB.matrix.decompose(brushB.position,brushB.quaternion,brushB.scale); brushB.updateMatrixWorld(true);
    const evaluator=new Evaluator(); const code=op==='union'?ADDITION:op==='subtract'?SUBTRACTION:INTERSECTION;
    const result=evaluator.evaluate(brushA,brushB,code); result.name=`${capitalize(op)} Result ${objectCounter++}`; result.userData={kind:'boolean',operation:op};
    result.material=defaultMaterial(); result.castShadow=true; result.receiveShadow=true;
    models.remove(a,b); models.add(result); booleanSelection=[]; selectObject(result); placeOnBed(result,false); checkpoint(); renderSceneList(); setStatus(`${capitalize(op)} complete.`);
  }catch(err){ console.error(err); setStatus('Boolean failed. Try simpler watertight solids or slightly separate coincident faces.'); alert('Boolean operation could not be completed. This tool works best with watertight solid meshes.'); }
}

function importStl(file){
  const reader=new FileReader(); reader.onload=()=>{
    try{checkpoint();const geo=new STLLoader().parse(reader.result); geo.computeVertexNormals(); geo.center(); const mesh=new THREE.Mesh(geo,defaultMaterial()); mesh.name=file.name.replace(/\.stl$/i,'')||`Imported ${objectCounter++}`; mesh.userData={kind:'imported',source:'stl'}; mesh.castShadow=true; mesh.receiveShadow=true; models.add(mesh); placeOnBed(mesh,false); selectObject(mesh); checkpoint(); fitCameraToObjects([mesh]); setStatus(`${file.name} imported.`);}catch(e){console.error(e);alert('Could not read this STL file.');}
  }; reader.readAsArrayBuffer(file);
}
function exportStl(){
  const targets=selected?[selected]:models.children.filter(o=>o.visible); if(!targets.length){alert('There is nothing to export.');return;}
  const group=new THREE.Group(); targets.forEach(o=>{const c=o.clone(); c.geometry=o.geometry.clone(); c.applyMatrix4(o.matrixWorld); c.position.set(0,0,0);c.rotation.set(0,0,0);c.scale.set(1,1,1); group.add(c);});
  const data=new STLExporter().parse(group,{binary:true}); downloadBlob(new Blob([data],{type:'model/stl'}),`${safeName(selected?.name||'render-slicer-scene')}.stl`); setStatus('STL exported.');
}

function saveProject(){
  const project={app:'RenderSlicer Studio',version:'0.1.0',savedAt:new Date().toISOString(),models:JSON.parse(serializeModels()),slicer:readSlicerUi()};
  downloadBlob(new Blob([JSON.stringify(project)],{type:'application/json'}),`renderslicer-${dateStamp()}.json`);
}
function openProject(file){
  file.text().then(text=>{try{const p=JSON.parse(text);if(!p.models)throw 0;checkpoint();restoreSnapshot(JSON.stringify(p.models));applySlicerUi(p.slicer||{});checkpoint();setStatus('Project opened.');}catch{alert('This is not a valid RenderSlicer project file.');}});
}

function readSlicerUi(){return {
  printer:$('printerProfile').value,bedX:n('bedX'),bedY:n('bedY'),bedZ:n('bedZ'),nozzle:n('nozzleSize'),material:$('materialProfile').value,
  nozzleTemp:n('nozzleTemp'),bedTemp:n('bedTemp'),fan:n('fanSpeed'),quality:$('qualityPreset').value,layer:n('layerHeight'),walls:n('wallCount'),top:n('topLayers'),bottom:n('bottomLayers'),
  infill:n('infillDensity'),pattern:$('infillPattern').value,supports:$('supportsEnabled').checked,supportAngle:n('supportAngle'),brim:$('brimEnabled').checked,
  speed:n('printSpeed'),travel:n('travelSpeed'),retract:n('retractionDistance'),outer:n('outerWallSpeed'),accel:n('acceleration'),lineWidth:n('lineWidth'),ironing:$('ironingEnabled').checked,vase:$('vaseMode').checked
};}
function applySlicerUi(s={}){Object.entries({bedX:'bedX',bedY:'bedY',bedZ:'bedZ',nozzle:'nozzleSize',nozzleTemp:'nozzleTemp',bedTemp:'bedTemp',fan:'fanSpeed',layer:'layerHeight',walls:'wallCount',top:'topLayers',bottom:'bottomLayers',infill:'infillDensity',supportAngle:'supportAngle',speed:'printSpeed',travel:'travelSpeed',retract:'retractionDistance',outer:'outerWallSpeed',accel:'acceleration',lineWidth:'lineWidth'}).forEach(([k,id])=>{if(s[k]!=null)$(id).value=s[k]}); if(s.printer)$('printerProfile').value=s.printer;if(s.material)$('materialProfile').value=s.material;if(s.quality)$('qualityPreset').value=s.quality;if(s.pattern)$('infillPattern').value=s.pattern;['supports','brim','ironing','vase'].forEach(k=>{const map={supports:'supportsEnabled',brim:'brimEnabled',ironing:'ironingEnabled',vase:'vaseMode'};if(s[k]!=null)$(map[k]).checked=!!s[k]});rebuildBed();}

async function sliceModel(){
  if(!models.children.length){alert('Add or import a model first.');return;}
  const visible=models.children.filter(o=>o.visible); if(!visible.length){alert('All models are hidden.');return;}
  $('sliceBtn').disabled=true;$('sliceProgress').value=1;$('sliceSummary').textContent='Preparing STL…';setStatus('Preparing model for slicing…');
  try{
    const group=new THREE.Group(); visible.forEach(o=>{const c=o.clone();c.geometry=o.geometry.clone();c.applyMatrix4(o.matrixWorld);c.position.set(0,0,0);c.rotation.set(0,0,0);c.scale.set(1,1,1);group.add(c);});
    const stl=new STLExporter().parse(group,{binary:true});
    const engineModule=await import(/* @vite-ignore */'https://grid.space/code/engine.js');
    const Engine=engineModule.Engine || window.Engine; if(!Engine)throw new Error('Kiri engine did not expose Engine');
    const eng=new Engine();
    eng.setListener(msg=>{ const p=extractProgress(msg); if(p!=null)$('sliceProgress').value=p; });
    await eng.parse(stl); eng.setMode('FDM'); eng.setDevice(buildKiriDevice()); eng.setProcess(buildKiriProcess());
    $('sliceSummary').textContent='Slicing geometry…'; await eng.slice();
    $('sliceSummary').textContent='Preparing toolpaths…'; await eng.prepare();
    $('sliceSummary').textContent='Generating G-code…'; gcodeText=await eng.export();
    if(typeof gcodeText!=='string')gcodeText=String(gcodeText||'');
    $('sliceProgress').value=100; $('downloadGcodeBtn').disabled=!gcodeText;
    parseGcodePreview(gcodeText);
    const stats=analyzeGcode(gcodeText); $('sliceSummary').innerHTML=`<strong>Slice complete</strong><br>${stats.layers} layers · ${stats.lines.toLocaleString()} G-code lines · ${(gcodeText.length/1024/1024).toFixed(2)} MB`;
    $('gcodeStats').innerHTML=$('sliceSummary').innerHTML; setStatus('Slice complete. Open Preview to inspect layers before printing.');
  }catch(err){console.error(err);$('sliceSummary').textContent='Slicing engine could not start or complete. The modeling tools still work. We can bundle a fixed engine version in the repository for dependable offline slicing.';setStatus('Slice failed — see browser console for details.');alert('The browser slicer could not complete this job. This first build uses Kiri:Moto’s browser engine; once the repository is created, the next step is to vendor a fixed engine build so it does not depend on a remote script.');}
  finally{$('sliceBtn').disabled=false;}
}

function buildKiriDevice(){
  const sx=n('bedX'), sy=n('bedY'), sz=n('bedZ'), nozzle=n('nozzleSize');
  return {new:false,mode:'FDM',deviceName:$('printerProfile').selectedOptions[0]?.textContent||'RenderSlicer Printer',bedHeight:2.5,bedWidth:sx,bedDepth:sy,bedRound:false,bedBelt:false,maxHeight:sz,originCenter:false,extrudeAbs:true,
    gcodeFan:['M106 S{fan_speed}'],gcodePre:['M107','G90','M82','M104 S{temp}','M140 S{bed_temp}','G28','M190 S{bed_temp}','M109 S{temp}','G92 E0'],
    gcodePost:['M107','M104 S0','M140 S0','G91','G1 Z10 F600','G90','M84'],gcodePause:[],gcodeDwell:[],gcodeSpindle:[],gcodeChange:[],gcodeFExt:'gcode',gcodeSpace:true,gcodeStrip:false,
    extruders:[{extFilament:1.75,extNozzle:nozzle,extSelect:['T0'],extDeselect:[],extOffsetX:0,extOffsetY:0}]};
}
function buildKiriProcess(){
  const brim=$('brimEnabled').checked; const fan=Math.round(n('fanSpeed')*2.55);
  return {sName:'RenderSlicer',sliceHeight:n('layerHeight'),firstSliceHeight:n('layerHeight'),sliceShells:Math.round(n('wallCount')),sliceShellOrder:'in-out',sliceFillAngle:45,sliceFillOverlap:.3,sliceFillSparse:n('infillDensity')/100,sliceFillType:$('infillPattern').value,
    sliceAdaptive:false,sliceSupportEnable:$('supportsEnabled').checked,sliceSupportDensity:.22,sliceSupportOffset:.4,sliceSupportGap:1,sliceSupportSize:6,sliceSupportArea:1,sliceSupportAngle:n('supportAngle'),sliceBottomLayers:Math.round(n('bottomLayers')),sliceTopLayers:Math.round(n('topLayers')),
    firstLayerRate:Math.max(10,n('printSpeed')*.45),firstLayerFanSpeed:0,firstLayerPrintMult:1.1,firstLayerBrim:brim?6:0,outputTemp:n('nozzleTemp'),outputBedTemp:n('bedTemp'),outputFeedrate:n('printSpeed'),outputFinishrate:n('outerWallSpeed'),outputSeekrate:n('travelSpeed'),outputRetractDist:n('retractionDistance'),outputRetractSpeed:35,outputMinSpeed:10,outputLayerRetract:true,detectThinWalls:true,outputBrimCount:brim?6:0,outputBrimOffset:2,outputFanSpeed:fan,zHopDistance:0};
}
function extractProgress(msg){
  if(typeof msg==='number')return Math.max(0,Math.min(100,msg));
  const candidates=[msg?.progress,msg?.prepare?.update,msg?.slice?.progress,msg?.export?.progress];
  for(const v of candidates){if(Number.isFinite(Number(v))){const n=Number(v);return n<=1?n*100:n;}} return null;
}

function analyzeGcode(g){const lines=g.split(/\r?\n/);let layers=0;for(const line of lines){if(/;\s*(LAYER|layer)[^a-z0-9]*[: ]?\s*\d+/i.test(line)||/;\s*layer\s*\d+/i.test(line))layers++;}if(!layers)layers=gcodeLayers.length;return{lines:lines.length,layers};}
function parseGcodePreview(g){
  clearPreview(); const lines=g.split(/\r?\n/); let x=0,y=0,z=0,e=0,abs=true,eAbs=true; const layers=[]; let layerIndex=0; layers[0]={z:0,print:[],travel:[]};
  for(const raw of lines){const line=raw.split(';')[0].trim();if(!line)continue;if(/^G90\b/.test(line)){abs=true;continue}if(/^G91\b/.test(line)){abs=false;continue}if(/^M82\b/.test(line)){eAbs=true;continue}if(/^M83\b/.test(line)){eAbs=false;continue}if(/^G92\b/.test(line)){const ne=word(line,'E');if(ne!=null)e=ne;continue}if(!/^G0?1\b/.test(line))continue;
    const nxv=word(line,'X'),nyv=word(line,'Y'),nzv=word(line,'Z'),nev=word(line,'E'); const nx=nxv==null?x:(abs?nxv:x+nxv), ny=nyv==null?y:(abs?nyv:y+nyv), nz=nzv==null?z:(abs?nzv:z+nzv); let extrude=false;if(nev!=null){const ne=eAbs?nev:e+nev;extrude=ne>e+0.00001;e=ne;}
    if(nz>z+0.0001){layerIndex++;layers[layerIndex]={z:nz,print:[],travel:[]};}
    const arr=extrude?layers[layerIndex].print:layers[layerIndex].travel; arr.push(x,z,y,nx,nz,ny); x=nx;y=ny;z=nz;
  }
  gcodeLayers=layers.filter(l=>l.print.length||l.travel.length); buildPreviewObjects(); $('layerSlider').max=Math.max(0,gcodeLayers.length-1);$('layerSlider').value=Math.max(0,gcodeLayers.length-1);updatePreviewLayer();
}
function buildPreviewObjects(){
  gcodeLayers.forEach((l,i)=>{const grp=new THREE.Group();grp.userData.layer=i; const add=(arr,color,opacity)=>{if(!arr.length)return;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const mat=new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity});grp.add(new THREE.LineSegments(geo,mat));};add(l.travel,0x60708f,.35);add(l.print,0x5ea1ff,1);previewGroup.add(grp);});
}
function clearPreview(){while(previewGroup.children.length){const c=previewGroup.children[0];c.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});previewGroup.remove(c);}gcodeLayers=[];}
function updatePreviewLayer(){const idx=Number($('layerSlider').value)||0;previewGroup.children.forEach((g,i)=>g.visible=i<=idx);$('layerLabel').textContent=gcodeLayers.length?`Layer ${idx+1} / ${gcodeLayers.length} · Z ${round(gcodeLayers[idx]?.z||0)} mm`:'No sliced layers';}

function setMode(mode){currentMode=mode;document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));document.querySelectorAll('[data-workspace]').forEach(el=>el.hidden=el.dataset.workspace!==mode);$('previewControls').hidden=mode!=='preview';previewGroup.visible=mode==='preview';models.visible=mode!=='preview';if(mode==='preview'&&!gcodeLayers.length)setStatus('Slice the model first, then Preview will show the generated toolpath.');resize();}
function updateAdvancedVisibility(){const adv=$('settingsMode').value==='advanced';document.querySelectorAll('.advanced-setting').forEach(el=>el.classList.toggle('is-hidden',!adv));}

function fitCameraToObjects(objects=models.children){if(!objects.length){camera.position.set(240,190,240);orbit.target.set(0,35,0);return;}const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));if(box.isEmpty())return;const size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);const max=Math.max(size.x,size.y,size.z,20);orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(max*1.5,max*1.15,max*1.5));camera.near=Math.max(.1,max/1000);camera.far=Math.max(1000,max*30);camera.updateProjectionMatrix();orbit.update();}
function setView(v){const box=new THREE.Box3().setFromObject(models);const c=new THREE.Vector3();box.getCenter(c);const s=new THREE.Vector3();box.getSize(s);const d=Math.max(s.x,s.y,s.z,120)*1.8;orbit.target.copy(c);if(v==='top')camera.position.set(c.x,c.y+d,c.z+.001);else if(v==='front')camera.position.set(c.x,c.y,c.z+d);else if(v==='right')camera.position.set(c.x+d,c.y,c.z);else camera.position.set(c.x+d,c.y+d*.75,c.z+d);camera.lookAt(c);orbit.update();}
function toggleWire(){wireframe=!wireframe;models.traverse(o=>{if(o.isMesh&&o.material)o.material.wireframe=wireframe});$('toggleWireBtn').classList.toggle('active',wireframe);}

renderer.domElement.addEventListener('pointerdown', ev=>{
  if(currentMode==='preview')return;const r=renderer.domElement.getBoundingClientRect();pointer.x=((ev.clientX-r.left)/r.width)*2-1;pointer.y=-((ev.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(models.children,true);if(hits.length){let o=hits[0].object;while(o.parent&&o.parent!==models)o=o.parent;selectObject(o);}else if(!transform.dragging)selectObject(null);
});

function resize(){const r=viewport.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/Math.max(1,r.height));camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);
function animate(){requestAnimationFrame(animate);orbit.update();renderer.render(scene,camera);}animate();

function bindEvents(){
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>addPrimitive(b.dataset.add)));
  document.querySelectorAll('.mode-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('moveTool').onclick=()=>setTransformMode('translate','moveTool');$('rotateTool').onclick=()=>setTransformMode('rotate','rotateTool');$('scaleTool').onclick=()=>setTransformMode('scale','scaleTool');
  $('fitViewBtn').onclick=()=>fitCameraToObjects();$('toggleWireBtn').onclick=toggleWire;
  $('selectAllBtn').onclick=()=>{booleanSelection=[...models.children];renderSceneList()};$('clearSelectionBtn').onclick=()=>{booleanSelection=[];renderSceneList()};
  $('unionBtn').onclick=()=>performBoolean('union');$('subtractBtn').onclick=()=>performBoolean('subtract');$('intersectBtn').onclick=()=>performBoolean('intersect');
  $('stlInput').onchange=e=>{const f=e.target.files?.[0];if(f)importStl(f);e.target.value=''};$('exportStlBtn').onclick=exportStl;
  $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('saveProjectBtn').onclick=saveProject;$('openProjectInput').onchange=e=>{const f=e.target.files?.[0];if(f)openProject(f);e.target.value=''};
  ['posX','posY','posZ','rotX','rotY','rotZ','scaleX','scaleY','scaleZ'].forEach(id=>$(id).addEventListener('change',transformInputChanged));
  $('objectName').onchange=()=>{if(selected){checkpoint();selected.name=$('objectName').value.trim()||'Object';checkpoint();renderSceneList();updateSelectionInfo();}};
  $('renameBtn').onclick=()=>$('objectName').focus();$('placeOnBedBtn').onclick=()=>placeOnBed();$('centerBedBtn').onclick=()=>centerOnBed();$('duplicateBtn').onclick=duplicateSelected;$('deleteBtn').onclick=deleteSelected;
  $('printerProfile').onchange=applyPrinterProfile;$('materialProfile').onchange=applyMaterialProfile;$('qualityPreset').onchange=applyQualityProfile;['bedX','bedY'].forEach(id=>$(id).onchange=rebuildBed);
  $('settingsMode').onchange=updateAdvancedVisibility;$('sliceBtn').onclick=sliceModel;$('downloadGcodeBtn').onclick=()=>{if(gcodeText)downloadBlob(new Blob([gcodeText],{type:'text/plain'}),`print-${dateStamp()}.gcode`)};$('layerSlider').oninput=updatePreviewLayer;$('backToSliceBtn').onclick=()=>setMode('slice');
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Delete'){e.preventDefault();deleteSelected()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected()}if(e.key.toLowerCase()==='w')toggleWire();if(e.key==='1')setView('front');if(e.key==='3')setView('right');if(e.key==='7')setView('top');});
}
function setTransformMode(mode,id){transform.setMode(mode);['moveTool','rotateTool','scaleTool'].forEach(x=>$(x).classList.toggle('active',x===id));}

function n(id){return Number($(id).value)||0}function round(v){return Math.round(v*1000)/1000}function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1)}function safeName(s){return String(s).trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'model'}function dateStamp(){return new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}function setStatus(s){$('statusText').textContent=s}function word(line,key){const m=line.match(new RegExp(`(?:^|\\s)${key}(-?\\d*\\.?\\d+)`,'i'));return m?Number(m[1]):null}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

initProfileMenus();bindEvents();rebuildBed();checkpoint();updateUndoButtons();renderSceneList();setMode('design');resize();setStatus('Ready — add a primitive or import an STL.');
