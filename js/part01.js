
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
