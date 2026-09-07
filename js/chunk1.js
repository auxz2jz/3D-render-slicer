
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = id => document.getElementById(id);
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const EPS = 1e-5;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const round = (v,n=3) => Number(Number(v||0).toFixed(n));
const safeNum = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;

const app = {
  workspace:'model', tool:'select', drawPoints:[], hoverPoint:null, drawing:false,
  selected:null, checked:[], lastHit:null, sectionPlane:null,
  tags:[{id:'untagged',name:'Untagged',visible:true}], scenes:[],
  history:[], historyIndex:-1, restoring:false,
  csg:null, objectCounter:1, activeOperation:null,
  boxSelectStart:null, boxSelectEnd:null, freehandPoints:[],
};

// ---------- Scene / renderer ----------
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1020');
const perspectiveCamera = new THREE.PerspectiveCamera(45,1,0.1,20000);
perspectiveCamera.up.set(0,0,1); perspectiveCamera.position.set(220,-220,170);
const orthoCamera = new THREE.OrthographicCamera(-150,150,150,-150,-20000,20000);
orthoCamera.up.set(0,0,1); orthoCamera.position.copy(perspectiveCamera.position);
let camera = perspectiveCamera;
const orbit = new OrbitControls(camera,renderer.domElement);
orbit.target.set(0,0,30); orbit.enableDamping=true; orbit.screenSpacePanning=true;

const modelRoot = new THREE.Group(); modelRoot.name='Model'; scene.add(modelRoot);
const guideRoot = new THREE.Group(); guideRoot.name='Guides'; scene.add(guideRoot);
const constructionRoot = new THREE.Group(); constructionRoot.name='Construction'; scene.add(constructionRoot);
const lightRoot = new THREE.Group(); lightRoot.name='Lights'; scene.add(lightRoot);

const hemi = new THREE.HemisphereLight(0xdceaff,0x27334a,2.2); scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff,3.2); keyLight.position.set(180,-140,260); keyLight.castShadow=true; scene.add(keyLight);

const axes = new THREE.AxesHelper(80); axes.name='Axes'; scene.add(axes);
let grid = null;
function rebuildGrid(){
  if(grid) scene.remove(grid);
  const spacing=Math.max(.1,safeNum($('gridSpacing').value,10));
  const size=Math.max(200,spacing*50), divisions=Math.round(size/spacing);
  grid=new THREE.GridHelper(size,divisions,0x506282,0x25324b);
  grid.rotation.x=Math.PI/2; grid.position.z=-0.01; grid.name='Grid'; scene.add(grid);
}
rebuildGrid();

const transform = new TransformControls(camera,renderer.domElement);
const transformHelper = transform.getHelper ? transform.getHelper() : transform;
scene.add(transformHelper);
transform.addEventListener('dragging-changed',e=>orbit.enabled=!e.value);
let transformBefore=null;
transform.addEventListener('mouseDown',()=>{if(app.selected&&!isLocked(app.selected))transformBefore=captureState();});
transform.addEventListener('mouseUp',()=>{if(transformBefore){pushHistory('Transform',transformBefore);transformBefore=null;} syncInspector();});
transform.addEventListener('objectChange',()=>syncInspector(false));

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
function resize(){
  const r=viewport.getBoundingClientRect(); if(!r.width||!r.height)return;
  renderer.setSize(r.width,r.height,false);const aspect=r.width/r.height;perspectiveCamera.aspect=aspect;perspectiveCamera.updateProjectionMatrix();const halfH=orthoCamera.userData.halfH||150;orthoCamera.left=-halfH*aspect;orthoCamera.right=halfH*aspect;orthoCamera.top=halfH;orthoCamera.bottom=-halfH;orthoCamera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize();
function animate(){requestAnimationFrame(animate);orbit.update();renderer.render(scene,camera);} animate();

function defaultMaterial(color){
  const c=color||new THREE.Color().setHSL((app.objectCounter*.117)%1,.58,.58);
  return new THREE.MeshStandardMaterial({color:c,roughness:.6,metalness:.05,side:THREE.DoubleSide,clippingPlanes:app.sectionPlane?[app.sectionPlane]:[]});
}
function profileMaterial(){return new THREE.MeshBasicMaterial({color:0x4f8cff,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false});}
function lineMaterial(color=0x77a7ff){return new THREE.LineBasicMaterial({color});}

function itemMeta(obj,kind,params={}){
  obj.userData ||= {};
  obj.userData.rs = {id:uid(),kind,params,tag:'untagged',locked:false,componentId:null,features:[`Create ${kind}`]};
  obj.name ||= `${kind} ${app.objectCounter++}`;
  return obj;
}
function rs(obj){return obj?.userData?.rs||null;}
function isLocked(obj){return !!rs(obj)?.locked;}
function allItems(){return modelRoot.children.filter(o=>rs(o));}
function solidItems(){return allItems().filter(o=>['solid','primitive','import','group','component'].includes(rs(o)?.kind));}
function profileItems(){return allItems().filter(o=>rs(o)?.kind==='profile');}
function pathItems(){return allItems().filter(o=>rs(o)?.kind==='path');}

function addItem(obj,kind,params={},name){itemMeta(obj,kind,params);if(name)obj.name=name;modelRoot.add(obj);selectObject(obj);renderSceneList();return obj;}
function materialMeshes(obj){const out=[];obj?.traverse?.(c=>{if(c.isMesh)out.push(c)});return out;}
function updateClipping(){materialMeshes(modelRoot).forEach(m=>{const mats=Array.isArray(m.material)?m.material:[m.material];mats.forEach(mat=>{if(mat){mat.clippingPlanes=app.sectionPlane?[app.sectionPlane]:[];mat.needsUpdate=true;}})});}

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
