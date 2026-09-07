import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $ = id => document.getElementById(id);
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const VERSION = '0.2.0';

const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(240,190,240);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0,35,0);
orbit.screenSpacePanning = true;

const transform = new TransformControls(camera, renderer.domElement);
const transformHelper = transform.getHelper ? transform.getHelper() : transform;
scene.add(transformHelper);
transform.setMode('translate');
transform.addEventListener('dragging-changed', e => orbit.enabled = !e.value);
transform.addEventListener('mouseDown', () => { if(selected) transformStartSnapshot = serializeModels(); });
transform.addEventListener('mouseUp', () => { if(selected && transformStartSnapshot){ transformStartSnapshot=null; pushHistory(); syncProperties(false); renderSceneList(); } });
transform.addEventListener('objectChange', () => { syncProperties(false); updateMeasurements(); renderSceneList(); });

const hemi = new THREE.HemisphereLight(0xbfd8ff,0x293048,2.2);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff,3.1);
key.position.set(180,300,220); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
scene.add(key);

const models = new THREE.Group(); models.name='Models'; scene.add(models);
const guides = new THREE.Group(); guides.name='Guides'; scene.add(guides);
const ground = new THREE.Group(); ground.name='Ground'; scene.add(ground);
const axes = new THREE.AxesHelper(60); scene.add(axes);
let grid = null;
rebuildGrid();

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 2;
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);

let selected = null;
let operationSelection = [];
let objectCounter = 1;
let currentTool = 'select';
let wireframe = false;
let transformStartSnapshot = null;
let history = [];
let historyIndex = -1;
let restoring = false;
let measureFirstPoint = null;

const defaultSolidMaterial = () => new THREE.MeshStandardMaterial({
  color:new THREE.Color().setHSL((objectCounter*.093)%1,.55,.58),roughness:.58,metalness:.04,side:THREE.DoubleSide
});
const defaultProfileMaterial = () => new THREE.MeshBasicMaterial({color:0x5b8def,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false});
const defaultPathMaterial = () => new THREE.LineBasicMaterial({color:0xffc857});

function capitalize(s){return String(s).charAt(0).toUpperCase()+String(s).slice(1)}
function round(v){return Math.round(Number(v)*1000)/1000}
function n(id){return Number($(id).value)||0}
function setStatus(s){$('statusText').textContent=s}
function safeName(s){return String(s||'model').trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'model'}
function dateStamp(){return new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)}
function kindOf(o){return o?.userData?.kind || (o?.isLine?'path':o?.isMesh?'mesh':'object')}
function isSolid(o){return !!o?.isMesh && kindOf(o)!=='profile'}
function isProfile(o){return kindOf(o)==='profile'}
function isPath(o){return kindOf(o)==='path'}

function makePrimitiveGeometry(type,p={}){
  switch(type){
    case 'box': return new THREE.BoxGeometry(p.w??30,p.h??30,p.d??30);
    case 'cylinder': return new THREE.CylinderGeometry(p.r??15,p.r??15,p.h??30,64);
    case 'sphere': return new THREE.SphereGeometry(p.r??18,48,32);
    case 'cone': return new THREE.ConeGeometry(p.r??18,p.h??35,64);
    case 'torus': return new THREE.TorusGeometry(p.r??20,p.tube??5,28,80);
    case 'tube': return createTubeGeometry(p.ro??18,p.ri??12,p.h??35);
    default:return new THREE.BoxGeometry(30,30,30);
  }
}
function createTubeGeometry(ro,ri,h){
  const shape=new THREE.Shape();shape.absarc(0,0,ro,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,ri,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:64});
  g.rotateX(Math.PI/2);g.translate(0,h/2,0);return g;
}
function addPrimitive(type){
  const params=type==='box'?{w:30,h:30,d:30}:type==='sphere'?{r:18}:type==='torus'?{r:20,tube:5}:type==='tube'?{ro:18,ri:12,h:35}:{r:type==='cylinder'?15:18,h:type==='cylinder'?30:35};
  const mesh=new THREE.Mesh(makePrimitiveGeometry(type,params),defaultSolidMaterial());
  mesh.name=`${capitalize(type)} ${objectCounter++}`;mesh.userData={kind:'primitive',primitive:type,params};mesh.castShadow=true;mesh.receiveShadow=true;
  models.add(mesh);placeOnGround(mesh,false);selectObject(mesh);pushHistory();renderSceneList();fitCameraToObjects([mesh]);setStatus(`${mesh.name} added.`);
}

function profileShape(type,p){
  const s=new THREE.Shape();
  if(type==='rectangle'){
    const w=p.w??40,d=p.d??30;s.moveTo(-w/2,-d/2);s.lineTo(w/2,-d/2);s.lineTo(w/2,d/2);s.lineTo(-w/2,d/2);s.closePath();
  }else{
    s.absarc(0,0,p.r??15,0,Math.PI*2,false);
  }
  return s;
}
function profileGeometry(type,p){const g=new THREE.ShapeGeometry(profileShape(type,p),48);g.rotateX(-Math.PI/2);return g}
function addProfile(type){
  const p=type==='rectangle'?{w:40,d:30}:{r:15};
  const mesh=new THREE.Mesh(profileGeometry(type,p),defaultProfileMaterial());
  mesh.name=`${capitalize(type)} Profile ${objectCounter++}`;mesh.userData={kind:'profile',profileType:type,params:p};mesh.position.y=.03;
  models.add(mesh);selectObject(mesh);pushHistory();renderSceneList();fitCameraToObjects([mesh]);setStatus('Profile added. Use Push/Pull to turn it into a solid.');
}
function rebuildProfile(mesh){mesh.geometry.dispose();mesh.geometry=profileGeometry(mesh.userData.profileType,mesh.userData.params);updateMeasurements()}
function pushPullSelected(){
  if(!isProfile(selected)){alert('Select a Rectangle or Circle Profile first.');return;}
  const d=n('pushPullDistance');if(!d){alert('Enter a non-zero Push/Pull distance.');return;}
  const depth=Math.abs(d),shape=profileShape(selected.userData.profileType,selected.userData.params);
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:64});g.rotateX(-Math.PI/2);if(d<0)g.translate(0,-depth,0);g.computeVertexNormals();
  const sourceProfile=selected;
  const mesh=new THREE.Mesh(g,defaultSolidMaterial());
  mesh.position.copy(sourceProfile.position);mesh.quaternion.copy(sourceProfile.quaternion);mesh.scale.copy(sourceProfile.scale);
  mesh.name=`${sourceProfile.name.replace(/ Profile/i,'')} Extrusion ${objectCounter++}`;mesh.userData={kind:'solid',source:'pushpull',distance:d,profileType:sourceProfile.userData.profileType,profileParams:structuredClone(sourceProfile.userData.params)};mesh.castShadow=true;mesh.receiveShadow=true;
  models.add(mesh);sourceProfile.visible=false;selectObject(mesh);pushHistory();renderSceneList();setStatus(`Push/Pull created a ${round(d)} mm extrusion.`);
}
function offsetSelected(){
  if(!isProfile(selected)){alert('Select a Rectangle or Circle Profile first.');return;}
  const d=n('offsetDistance');if(!d){alert('Enter a non-zero offset distance.');return;}
  const p=structuredClone(selected.userData.params),t=selected.userData.profileType;
  if(t==='rectangle'){p.w=Math.max(.1,p.w+2*d);p.d=Math.max(.1,p.d+2*d);}else p.r=Math.max(.1,p.r+d);
  const mesh=new THREE.Mesh(profileGeometry(t,p),defaultProfileMaterial());
  mesh.name=`Offset ${selected.name} ${objectCounter++}`;mesh.userData={kind:'profile',profileType:t,params:p};mesh.position.copy(selected.position);mesh.quaternion.copy(selected.quaternion);mesh.scale.copy(selected.scale);
  models.add(mesh);selectObject(mesh);pushHistory();renderSceneList();setStatus(`Created an offset profile at ${round(d)} mm.`);
}

function rawPathPoints(type,p){
  if(type==='line')return [new THREE.Vector3(0,0,0),new THREE.Vector3(p.length??80,0,0)];
  if(type==='arc'){
    const r=p.radius??50,a=(p.angle??90)*RAD,pts=[];for(let i=0;i<=48;i++){const t=a*i/48;pts.push(new THREE.Vector3(Math.cos(t)*r-r,0,Math.sin(t)*r));}return pts;
  }
  const r=p.radius??45,pts=[];for(let i=0;i<96;i++){const t=Math.PI*2*i/96;pts.push(new THREE.Vector3(Math.cos(t)*r,0,Math.sin(t)*r));}return pts;
}
function pathGeometry(type,p){return new THREE.BufferGeometry().setFromPoints(rawPathPoints(type,p))}
function addPath(type){
  const p=type==='line'?{length:80}:type==='arc'?{radius:50,angle:90}:{radius:45};
  const line=type==='circle'?new THREE.LineLoop(pathGeometry(type,p),defaultPathMaterial()):new THREE.Line(pathGeometry(type,p),defaultPathMaterial());line.name=`${capitalize(type)} Path ${objectCounter++}`;line.userData={kind:'path',pathType:type,params:p};
  models.add(line);selectObject(line);pushHistory();renderSceneList();fitCameraToObjects([line]);setStatus('Path added. Check it together with a profile to use Follow Me.');
}
function rebuildPath(line){line.geometry.dispose();line.geometry=pathGeometry(line.userData.pathType,line.userData.params);updateMeasurements()}
function worldCurveForPath(path){
  path.updateMatrixWorld(true);const pts=rawPathPoints(path.userData.pathType,path.userData.params).map(v=>v.applyMatrix4(path.matrixWorld));
  if(path.userData.pathType==='line')return new THREE.LineCurve3(pts[0],pts[1]);
  return new THREE.CatmullRomCurve3(pts,path.userData.pathType==='circle','centripetal');
}
function followMe(){
  const profile=operationSelection.find(isProfile),path=operationSelection.find(isPath);
  if(!profile||!path||operationSelection.length!==2){alert('Check exactly one profile and one path in the Scene list.');return;}
  try{
    const shape=profileShape(profile.userData.profileType,profile.userData.params);const curve=worldCurveForPath(path);
    const steps=path.userData.pathType==='line'?24:path.userData.pathType==='arc'?96:160;
    const g=new THREE.ExtrudeGeometry(shape,{steps,bevelEnabled:false,extrudePath:curve,curveSegments:48});g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,defaultSolidMaterial());mesh.name=`Follow Me ${objectCounter++}`;mesh.userData={kind:'followme',profile:profile.name,path:path.name};mesh.castShadow=true;mesh.receiveShadow=true;
    models.add(mesh);selectObject(mesh);pushHistory();renderSceneList();fitCameraToObjects([mesh]);setStatus('Follow Me sweep created.');
  }catch(e){console.error(e);alert('Follow Me could not build this sweep. Try a smaller profile or simpler path.');}
}

async function performBoolean(op){
  if(operationSelection.length!==2||!operationSelection.every(isSolid))return;
  const [a,b]=operationSelection;setStatus('Computing boolean…');
  try{
    const mod=await import('https://esm.sh/three-bvh-csg@0.0.18?external=three');
    const {Brush,Evaluator,ADDITION,SUBTRACTION,INTERSECTION}=mod;
    a.updateMatrixWorld(true);b.updateMatrixWorld(true);
    const brushA=new Brush(a.geometry.clone(),a.material.clone());brushA.matrix.copy(a.matrixWorld);brushA.matrix.decompose(brushA.position,brushA.quaternion,brushA.scale);brushA.updateMatrixWorld(true);
    const brushB=new Brush(b.geometry.clone(),b.material.clone());brushB.matrix.copy(b.matrixWorld);brushB.matrix.decompose(brushB.position,brushB.quaternion,brushB.scale);brushB.updateMatrixWorld(true);
    const evaluator=new Evaluator(),code=op==='union'?ADDITION:op==='subtract'?SUBTRACTION:INTERSECTION;
    const result=evaluator.evaluate(brushA,brushB,code);result.name=`${capitalize(op)} Result ${objectCounter++}`;result.userData={kind:'boolean',operation:op};result.material=defaultSolidMaterial();result.castShadow=true;result.receiveShadow=true;
    models.remove(a,b);models.add(result);operationSelection=[];selectObject(result);placeOnGround(result,false);pushHistory();renderSceneList();setStatus(`${capitalize(op)} complete.`);
  }catch(e){console.error(e);alert('Boolean failed. It works best with watertight solid meshes that overlap cleanly.');setStatus('Boolean failed.');}
}

function selectObject(obj){
  if(selected?.material?.emissive)selected.material.emissive.setHex(0);
  selected=obj||null;
  if(selected?.material?.emissive)selected.material.emissive.setHex(0x152b50);
  if(selected && !selected.userData.locked && ['move','rotate','scale'].includes(currentTool))transform.attach(selected);else transform.detach();
  syncProperties();renderSceneList();updateSelectionInfo();
}
function updateSelectionInfo(){$('selectionInfo').textContent=selected?selected.name:`${models.children.length} object${models.children.length===1?'':'s'}`}
function renderSceneList(){
  const root=$('sceneList');root.innerHTML='';
  if(!models.children.length){root.innerHTML='<div class="empty-state">No objects yet.</div>';updateOperationButtons();return;}
  models.children.forEach(obj=>{
    const row=document.createElement('div');row.className=`scene-row${obj===selected?' active':''}`;
    const check=document.createElement('input');check.type='checkbox';check.checked=operationSelection.includes(obj);check.title='Select for Boolean / Follow Me';
    check.onchange=()=>{if(check.checked){if(!operationSelection.includes(obj))operationSelection.push(obj)}else operationSelection=operationSelection.filter(x=>x!==obj);updateOperationButtons()};
    const name=document.createElement('div');name.className='scene-name';name.textContent=obj.name;name.onclick=()=>selectObject(obj);
    const type=document.createElement('span');type.className='type-chip';type.textContent=kindOf(obj);
    const eye=document.createElement('button');eye.className='scene-eye';eye.textContent=obj.visible?'●':'○';eye.title='Show / hide';eye.onclick=e=>{e.stopPropagation();obj.visible=!obj.visible;renderSceneList()};
    const lock=document.createElement('button');lock.className='scene-lock';lock.textContent=obj.userData.locked?'🔒':'🔓';lock.title='Lock / unlock';lock.onclick=e=>{e.stopPropagation();obj.userData.locked=!obj.userData.locked;if(obj===selected)selectObject(obj);pushHistory();renderSceneList()};
    row.append(check,name,type,eye,lock);root.appendChild(row);
  });updateOperationButtons();
}
function updateOperationButtons(){
  const two=operationSelection.length===2,solids=two&&operationSelection.every(isSolid),follow=two&&operationSelection.some(isProfile)&&operationSelection.some(isPath);
  ['unionBtn','subtractBtn','intersectBtn'].forEach(id=>$(id).disabled=!solids);$('followMeBtn').disabled=!follow;
}

function syncProperties(rebuildParams=true){
  const show=!!selected;$('noSelectionMessage').hidden=show;$('propertiesForm').hidden=!show;if(!show)return;
  $('objectName').value=selected.name;$('objectLocked').checked=!!selected.userData.locked;$('objectType').textContent=`Type: ${kindOf(selected)}`;
  $('posX').value=round(selected.position.x);$('posY').value=round(selected.position.y);$('posZ').value=round(selected.position.z);
  $('rotX').value=round(selected.rotation.x*DEG);$('rotY').value=round(selected.rotation.y*DEG);$('rotZ').value=round(selected.rotation.z*DEG);
  $('scaleX').value=round(selected.scale.x);$('scaleY').value=round(selected.scale.y);$('scaleZ').value=round(selected.scale.z);
  if(selected.material?.color)$('objectColor').value='#'+selected.material.color.getHexString();
  const std=selected.material?.isMeshStandardMaterial;$('appearancePanel').hidden=!selected.isMesh;
  $('roughness').disabled=!std;$('metalness').disabled=!std;if(std){$('roughness').value=selected.material.roughness;$('metalness').value=selected.material.metalness;$('smoothShading').checked=!selected.material.flatShading}
  if(rebuildParams)renderParametricParams();updateMeasurements();
}
function renderParametricParams(){
  const wrap=$('parametricParams');wrap.innerHTML='';if(!selected)return;
  const kind=kindOf(selected),defs=[];let p=null;
  if(kind==='primitive'){p=selected.userData.params;const t=selected.userData.primitive;
    if(t==='box')defs.push(['w','Width'],['h','Height'],['d','Depth']);else if(t==='sphere')defs.push(['r','Radius']);else if(t==='torus')defs.push(['r','Major radius'],['tube','Tube radius']);else if(t==='tube')defs.push(['ro','Outer radius'],['ri','Inner radius'],['h','Height']);else defs.push(['r','Radius'],['h','Height']);
  }else if(kind==='profile'){p=selected.userData.params;if(selected.userData.profileType==='rectangle')defs.push(['w','Width'],['d','Depth']);else defs.push(['r','Radius']);
  }else if(kind==='path'){p=selected.userData.params;if(selected.userData.pathType==='line')defs.push(['length','Length']);else if(selected.userData.pathType==='arc')defs.push(['radius','Radius'],['angle','Angle °']);else defs.push(['radius','Radius']);}
  if(!p)return;const h=document.createElement('h3');h.textContent='Parametric dimensions';wrap.appendChild(h);const grid=document.createElement('div');grid.className='param-grid';
  defs.forEach(([key,label])=>{const lab=document.createElement('label');lab.textContent=label;const inp=document.createElement('input');inp.type='number';inp.step=key==='angle'?'1':'.1';inp.min=key==='angle'?'-360':'.1';inp.value=p[key];inp.onchange=()=>{p[key]=key==='angle'?Number(inp.value):Math.max(.1,Number(inp.value)||.1);if(kind==='primitive'){if(selected.userData.primitive==='tube'&&p.ri>=p.ro)p.ri=Math.max(.1,p.ro-.5);rebuildPrimitive(selected)}else if(kind==='profile')rebuildProfile(selected);else rebuildPath(selected);pushHistory();renderSceneList()};lab.appendChild(inp);grid.appendChild(lab)});wrap.appendChild(grid);
}
function rebuildPrimitive(mesh){mesh.geometry.dispose();mesh.geometry=makePrimitiveGeometry(mesh.userData.primitive,mesh.userData.params);updateMeasurements()}
function updateMeasurements(){if(!selected){$('measurements').textContent='';return}const b=new THREE.Box3().setFromObject(selected),s=new THREE.Vector3();b.getSize(s);$('measurements').innerHTML=`X: <strong>${round(s.x)} mm</strong><br>Y: <strong>${round(s.y)} mm</strong><br>Z: <strong>${round(s.z)} mm</strong>`}
function transformInputsChanged(){if(!selected||selected.userData.locked)return;selected.position.set(n('posX'),n('posY'),n('posZ'));selected.rotation.set(n('rotX')*RAD,n('rotY')*RAD,n('rotZ')*RAD);selected.scale.set(Math.max(.001,n('scaleX')),Math.max(.001,n('scaleY')),Math.max(.001,n('scaleZ')));selected.updateMatrixWorld(true);pushHistory();updateMeasurements();renderSceneList()}
function placeOnGround(obj=selected,record=true){if(!obj)return;obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj);obj.position.y-=b.min.y;obj.updateMatrixWorld(true);if(record)pushHistory();syncProperties(false)}
function centerAtOrigin(obj=selected){if(!obj)return;obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj),c=new THREE.Vector3();b.getCenter(c);obj.position.x-=c.x;obj.position.z-=c.z;placeOnGround(obj,false);pushHistory();syncProperties(false)}
function duplicateSelected(){if(!selected)return;const c=selected.clone();if(selected.geometry)c.geometry=selected.geometry.clone();if(selected.material)c.material=selected.material.clone();c.position.x+=10;c.position.z+=10;c.name=`${selected.name} Copy ${objectCounter++}`;models.add(c);selectObject(c);pushHistory();renderSceneList()}
function deleteSelected(){if(!selected)return;const old=selected;transform.detach();models.remove(old);operationSelection=operationSelection.filter(x=>x!==old);selected=null;pushHistory();syncProperties();renderSceneList();updateSelectionInfo();setStatus('Object deleted.')}

function serializeModels(){return JSON.stringify(models.toJSON())}
function pushHistory(){if(restoring)return;const snap=serializeModels();if(history[historyIndex]===snap)return;history=history.slice(0,historyIndex+1);history.push(snap);historyIndex=history.length-1;if(history.length>40){history.shift();historyIndex--}updateUndoButtons()}
function restoreSnapshot(snap){restoring=true;try{transform.detach();selected=null;operationSelection=[];while(models.children.length)models.remove(models.children[0]);const parsed=new THREE.ObjectLoader().parse(JSON.parse(snap));parsed.children.forEach(o=>models.add(o));renderSceneList();syncProperties();updateSelectionInfo();fitCameraToObjects(models.children)}finally{restoring=false}}
function undo(){if(historyIndex<=0)return;historyIndex--;restoreSnapshot(history[historyIndex]);updateUndoButtons();setStatus('Undo.')}
function redo(){if(historyIndex>=history.length-1)return;historyIndex++;restoreSnapshot(history[historyIndex]);updateUndoButtons();setStatus('Redo.')}
function updateUndoButtons(){$('undoBtn').disabled=historyIndex<=0;$('redoBtn').disabled=historyIndex>=history.length-1}

function importStl(file){const r=new FileReader();r.onload=()=>{try{const g=new STLLoader().parse(r.result);g.computeVertexNormals();g.center();const m=new THREE.Mesh(g,defaultSolidMaterial());m.name=file.name.replace(/\.stl$/i,'')||`Imported ${objectCounter++}`;m.userData={kind:'imported',source:'stl'};m.castShadow=true;m.receiveShadow=true;models.add(m);placeOnGround(m,false);selectObject(m);pushHistory();fitCameraToObjects([m]);setStatus(`${file.name} imported.`)}catch(e){console.error(e);alert('Could not read this STL file.')}};r.readAsArrayBuffer(file)}
function exportStl(){const solidTargets=selected&&isSolid(selected)?[selected]:models.children.filter(o=>o.visible&&isSolid(o));if(!solidTargets.length){alert('Select a solid object or add a solid first. Profiles and paths are not exported as STL.');return}const group=new THREE.Group();solidTargets.forEach(o=>{const c=o.clone();c.geometry=o.geometry.clone();c.applyMatrix4(o.matrixWorld);c.position.set(0,0,0);c.rotation.set(0,0,0);c.scale.set(1,1,1);group.add(c)});const data=new STLExporter().parse(group,{binary:true});downloadBlob(new Blob([data],{type:'model/stl'}),`${safeName(selected?.name||'render-studio-scene')}.stl`);setStatus('STL exported.')}
function saveProject(){const p={app:'Render Studio',version:VERSION,savedAt:new Date().toISOString(),models:JSON.parse(serializeModels()),settings:readSettings()};downloadBlob(new Blob([JSON.stringify(p)],{type:'application/json'}),`render-studio-${dateStamp()}.json`)}
function openProject(file){file.text().then(t=>{try{const p=JSON.parse(t);if(!p.models)throw 0;restoreSnapshot(JSON.stringify(p.models));applySettings(p.settings||{});pushHistory();setStatus('Project opened.')}catch(e){console.error(e);alert('This is not a valid Render Studio project file.')}})}
function readSettings(){return{snap:$('snapEnabled').checked,snapStep:n('snapStep'),rotationSnap:n('rotationSnap'),gridSpacing:n('gridSpacing'),background:$('backgroundColor').value,light:Number($('lightIntensity').value),shadows:$('shadowsEnabled').checked,axes:$('axesEnabled').checked,grid:$('gridEnabled').checked}}
function applySettings(s){if(s.snap!=null)$('snapEnabled').checked=!!s.snap;if(s.snapStep){$('snapStep').value=s.snapStep;$('snapStepSide').value=s.snapStep}if(s.rotationSnap)$('rotationSnap').value=s.rotationSnap;if(s.gridSpacing)$('gridSpacing').value=s.gridSpacing;if(s.background)$('backgroundColor').value=s.background;if(s.light)$('lightIntensity').value=s.light;if(s.shadows!=null)$('shadowsEnabled').checked=!!s.shadows;if(s.axes!=null)$('axesEnabled').checked=!!s.axes;if(s.grid!=null)$('gridEnabled').checked=!!s.grid;applyPrecisionSettings();applyRenderingSettings()}

function rebuildGrid(){if(grid)ground.remove(grid);const spacing=Math.max(1,n('gridSpacing')||10),size=1000,div=Math.min(250,Math.max(10,Math.round(size/spacing)));grid=new THREE.GridHelper(size,div,0x53698f,0x273651);grid.position.y=.001;ground.add(grid);grid.visible=$('gridEnabled')?.checked!==false}
function applyPrecisionSettings(){const on=$('snapEnabled').checked,step=Math.max(.1,n('snapStep')||1),rot=Math.max(1,n('rotationSnap')||15)*RAD;transform.setTranslationSnap(on?step:null);transform.setRotationSnap(on?rot:null);transform.setScaleSnap(on ? 0.05 : null);$('snapStepSide').value=step;$('snapStep').value=step;rebuildGrid()}
function applyRenderingSettings(){scene.background=new THREE.Color($('backgroundColor').value);hemi.intensity=Number($('lightIntensity').value)||2.2;key.intensity=(Number($('lightIntensity').value)||2.2)*1.4;renderer.shadowMap.enabled=$('shadowsEnabled').checked;models.traverse(o=>{if(o.isMesh){o.castShadow=$('shadowsEnabled').checked;o.receiveShadow=$('shadowsEnabled').checked}});axes.visible=$('axesEnabled').checked;if(grid)grid.visible=$('gridEnabled').checked}

function fitCameraToObjects(objects=models.children){const visible=objects.filter(o=>o.visible);if(!visible.length){camera.position.set(240,190,240);orbit.target.set(0,35,0);orbit.update();return}const b=new THREE.Box3();visible.forEach(o=>b.expandByObject(o));if(b.isEmpty())return;const s=new THREE.Vector3(),c=new THREE.Vector3();b.getSize(s);b.getCenter(c);const max=Math.max(s.x,s.y,s.z,20);orbit.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(max*1.5,max*1.15,max*1.5));camera.near=Math.max(.1,max/1000);camera.far=Math.max(1000,max*30);camera.updateProjectionMatrix();orbit.update()}
function setView(v){if(!models.children.length){setStatus('Add or import an object first.');return}const b=new THREE.Box3().setFromObject(models),c=new THREE.Vector3(),s=new THREE.Vector3();b.getCenter(c);b.getSize(s);const d=Math.max(s.x,s.y,s.z,120)*1.8;orbit.target.copy(c);if(v==='top')camera.position.set(c.x,c.y+d,c.z+.001);else if(v==='front')camera.position.set(c.x,c.y,c.z+d);else if(v==='right')camera.position.set(c.x+d,c.y,c.z);else camera.position.set(c.x+d,c.y+d*.75,c.z+d);camera.lookAt(c);orbit.update()}
function toggleWire(){wireframe=!wireframe;models.traverse(o=>{if(o.isMesh&&o.material)o.material.wireframe=wireframe});$('toggleWireBtn').classList.toggle('active',wireframe)}
function setTransformMode(mode,id){currentTool=mode==='translate'?'move':mode;transform.setMode(mode);['selectTool','moveTool','rotateTool','scaleTool','measureTool'].forEach(x=>$(x).classList.toggle('active',x===id));if(selected&&!selected.userData.locked)transform.attach(selected);$('measureReadout').classList.add('hidden')}
function setSelectMode(){currentTool='select';['selectTool','moveTool','rotateTool','scaleTool','measureTool'].forEach(x=>$(x).classList.toggle('active',x==='selectTool'));transform.detach();measureFirstPoint=null}
function setMeasureMode(){currentTool='measure';['selectTool','moveTool','rotateTool','scaleTool','measureTool'].forEach(x=>$(x).classList.toggle('active',x==='measureTool'));transform.detach();measureFirstPoint=null;$('measureReadout').textContent='Click the first point';$('measureReadout').classList.remove('hidden');setStatus('Measure: click two points on geometry or the ground.')}

function pointerFromEvent(e){const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera)}
function pickPoint(e){pointerFromEvent(e);const hits=raycaster.intersectObjects(models.children.filter(o=>o.visible),true);if(hits.length)return hits[0].point.clone();const p=new THREE.Vector3();return raycaster.ray.intersectPlane(groundPlane,p)?p.clone():null}
function handleViewportPointer(e){if(transform.axis)return;if(currentTool==='measure'){const p=pickPoint(e);if(!p)return;if(!measureFirstPoint){measureFirstPoint=p;$('measureReadout').textContent=`First point: ${round(p.x)}, ${round(p.y)}, ${round(p.z)} mm · click second point`;return}const d=measureFirstPoint.distanceTo(p),g=new THREE.BufferGeometry().setFromPoints([measureFirstPoint,p]),line=new THREE.Line(g,new THREE.LineDashedMaterial({color:0x72e0a1,dashSize:4,gapSize:2}));line.computeLineDistances();guides.add(line);$('measureReadout').innerHTML=`Distance: <strong>${round(d)} mm</strong>`;setStatus(`Measured ${round(d)} mm.`);measureFirstPoint=null;return}
  pointerFromEvent(e);const hits=raycaster.intersectObjects(models.children.filter(o=>o.visible),true);if(hits.length){let o=hits[0].object;while(o.parent&&o.parent!==models)o=o.parent;selectObject(o)}else selectObject(null)
}
function clearGuides(){while(guides.children.length){const o=guides.children[0];o.geometry?.dispose?.();o.material?.dispose?.();guides.remove(o)}measureFirstPoint=null;$('measureReadout').classList.add('hidden');setStatus('Measurement guides cleared.')}

function bindEvents(){
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addPrimitive(b.dataset.add));document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>addProfile(b.dataset.profile));document.querySelectorAll('[data-path]').forEach(b=>b.onclick=()=>addPath(b.dataset.path));document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('pushPullBtn').onclick=pushPullSelected;$('offsetBtn').onclick=offsetSelected;$('followMeBtn').onclick=followMe;$('unionBtn').onclick=()=>performBoolean('union');$('subtractBtn').onclick=()=>performBoolean('subtract');$('intersectBtn').onclick=()=>performBoolean('intersect');
  $('selectTool').onclick=setSelectMode;$('moveTool').onclick=()=>setTransformMode('translate','moveTool');$('rotateTool').onclick=()=>setTransformMode('rotate','rotateTool');$('scaleTool').onclick=()=>setTransformMode('scale','scaleTool');$('measureTool').onclick=setMeasureMode;
  $('fitViewBtn').onclick=()=>fitCameraToObjects();$('toggleWireBtn').onclick=toggleWire;$('clearGuidesBtn').onclick=clearGuides;
  $('selectAllBtn').onclick=()=>{operationSelection=[...models.children];renderSceneList()};$('clearSelectionBtn').onclick=()=>{operationSelection=[];renderSceneList()};
  $('stlInput').onchange=e=>{const f=e.target.files?.[0];if(f)importStl(f);e.target.value=''};$('exportStlBtn').onclick=exportStl;
  $('aboutBtn').onclick=()=>$('aboutDialog').showModal();$('closeAboutBtn').onclick=()=>$('aboutDialog').close();$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('saveProjectBtn').onclick=saveProject;$('openProjectInput').onchange=e=>{const f=e.target.files?.[0];if(f)openProject(f);e.target.value=''};
  ['posX','posY','posZ','rotX','rotY','rotZ','scaleX','scaleY','scaleZ'].forEach(id=>$(id).onchange=transformInputsChanged);
  $('objectName').onchange=()=>{if(selected){selected.name=$('objectName').value.trim()||'Object';pushHistory();renderSceneList();updateSelectionInfo()}};$('renameBtn').onclick=()=>$('objectName').focus();
  $('objectLocked').onchange=()=>{if(selected){selected.userData.locked=$('objectLocked').checked;selectObject(selected);pushHistory();renderSceneList()}};
  $('objectColor').oninput=()=>{if(selected?.material?.color)selected.material.color.set($('objectColor').value)};$('objectColor').onchange=pushHistory;$('roughness').oninput=()=>{if(selected?.material?.isMeshStandardMaterial)selected.material.roughness=Number($('roughness').value)};$('roughness').onchange=pushHistory;$('metalness').oninput=()=>{if(selected?.material?.isMeshStandardMaterial)selected.material.metalness=Number($('metalness').value)};$('metalness').onchange=pushHistory;$('smoothShading').onchange=()=>{if(selected?.material?.isMeshStandardMaterial){selected.material.flatShading=!$('smoothShading').checked;selected.material.needsUpdate=true;pushHistory()}};
  $('placeOnBedBtn').onclick=()=>placeOnGround();$('centerBedBtn').onclick=()=>centerAtOrigin();$('duplicateBtn').onclick=duplicateSelected;$('deleteBtn').onclick=deleteSelected;
  $('snapEnabled').onchange=applyPrecisionSettings;$('snapStep').onchange=()=>{$('snapStepSide').value=$('snapStep').value;applyPrecisionSettings()};$('snapStepSide').onchange=()=>{$('snapStep').value=$('snapStepSide').value;applyPrecisionSettings()};$('rotationSnap').onchange=applyPrecisionSettings;$('gridSpacing').onchange=applyPrecisionSettings;
  ['backgroundColor','lightIntensity','shadowsEnabled','axesEnabled','gridEnabled'].forEach(id=>$(id).oninput=applyRenderingSettings);
  let pickStart=null;renderer.domElement.addEventListener('pointerdown',e=>{pickStart={x:e.clientX,y:e.clientY}});renderer.domElement.addEventListener('pointerup',e=>{if(!pickStart)return;const moved=Math.hypot(e.clientX-pickStart.x,e.clientY-pickStart.y);pickStart=null;if(moved<5)handleViewportPointer(e)});
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Delete'){e.preventDefault();deleteSelected()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected()}if(e.key.toLowerCase()==='w')toggleWire();if(e.key.toLowerCase()==='m')setMeasureMode();if(e.key==='1')setView('front');if(e.key==='3')setView('right');if(e.key==='7')setView('top');if(e.key==='Escape')setSelectMode()});
}

function resize(){const r=viewport.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/Math.max(1,r.height));camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(viewport);
function animate(){requestAnimationFrame(animate);orbit.update();renderer.render(scene,camera)}

bindEvents();applyPrecisionSettings();applyRenderingSettings();pushHistory();updateUndoButtons();renderSceneList();resize();animate();setStatus('Ready — create a solid, sketch a profile, or import an STL.');
