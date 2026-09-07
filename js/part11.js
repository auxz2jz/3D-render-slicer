// ---------- Camera ----------
function boundsOf(items=allItems().filter(o=>o.visible)){const b=new THREE.Box3();items.forEach(o=>b.expandByObject(o));return b;}
function fitObjects(items){const b=boundsOf(items);if(b.isEmpty())return;const s=new THREE.Vector3(),c=new THREE.Vector3();b.getSize(s);b.getCenter(c);const max=Math.max(s.x,s.y,s.z,10),dir=new THREE.Vector3(1,-1,.75).normalize();orbit.target.copy(c);camera.position.copy(c).addScaledVector(dir,max*2.2);if(camera===orthoCamera){orthoCamera.userData.halfH=max*.75;resize();}else{camera.near=Math.max(.01,max/1000);camera.far=Math.max(2000,max*30);camera.updateProjectionMatrix();}orbit.update();}
function fitView(){fitObjects(allItems().filter(o=>o.visible));}
function toggleProjection(){
  const goingOrtho=camera===perspectiveCamera;const old=camera;const pos=old.position.clone(),target=orbit.target.clone();
  if(goingOrtho){const dist=Math.max(10,pos.distanceTo(target));orthoCamera.position.copy(pos);orthoCamera.quaternion.copy(old.quaternion);orthoCamera.userData.halfH=Math.max(10,Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov*.5))*dist);camera=orthoCamera;$('orthoToggleBtn').textContent='Orthographic';}
  else{perspectiveCamera.position.copy(pos);perspectiveCamera.quaternion.copy(old.quaternion);camera=perspectiveCamera;$('orthoToggleBtn').textContent='Perspective';}
  orbit.object=camera;transform.camera=camera;resize();orbit.update();setStatus(goingOrtho?'Orthographic projection enabled.':'Perspective projection enabled.');
}
function setView(v){const b=boundsOf(allItems().filter(o=>o.visible));const c=new THREE.Vector3();if(!b.isEmpty())b.getCenter(c);else c.set(0,0,0);const s=new THREE.Vector3();if(!b.isEmpty())b.getSize(s);const d=Math.max(s.x,s.y,s.z,100)*2;orbit.target.copy(c);if(v==='top')camera.position.set(c.x,c.y,c.z+d);else if(v==='front')camera.position.set(c.x,c.y-d,c.z);else if(v==='right')camera.position.set(c.x+d,c.y,c.z);else camera.position.set(c.x+d*.75,c.y-d*.75,c.z+d*.6);camera.up.set(0,0,1);camera.lookAt(c);orbit.update();}

// ---------- Helpers ----------
function openOperation(title,fields,onApply){
  app.activeOperation={onApply};$('operationTitle').textContent=title;const root=$('operationFields');root.innerHTML='';fields.forEach(f=>{const wrap=document.createElement('label');wrap.className='operation-field';wrap.textContent=f.label;let input;if(f.type==='select'){input=document.createElement('select');(f.options||[]).forEach(([v,l])=>input.add(new Option(l,v)));input.value=f.value;}else if(f.type==='checkbox'){input=document.createElement('input');input.type='checkbox';input.checked=!!f.value;}else{input=document.createElement('input');input.type=f.type||'number';input.value=f.value??'';if(f.step!=null)input.step=f.step;}input.dataset.key=f.key;wrap.append(input);root.append(wrap);});$('operationDialog').showModal();}
function closeOperation(){$('operationDialog').close();app.activeOperation=null;}
function operationValues(){const out={};$('operationFields').querySelectorAll('[data-key]').forEach(i=>out[i.dataset.key]=i.type==='checkbox'?i.checked:i.type==='number'?safeNum(i.value):i.value);return out;}
function setStatus(s){$('statusText').textContent=s;}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function capitalize(s){return String(s||'').replace(/(^|[-_ ])\w/g,m=>m.toUpperCase()).replace(/[-_]/g,' ');}

// ---------- Sketch edit helpers ----------
function rewritePath(obj,pts,label){const before=captureState();const inv=obj.matrixWorld.clone().invert(),local=pts.map(p=>p.clone().applyMatrix4(inv));rs(obj).params.points=local.map(p=>p.toArray());obj.geometry.dispose();obj.geometry=new THREE.BufferGeometry().setFromPoints(local);addFeature(obj,label);pushHistory(label,before);syncInspector();}
function trimSketch(){const o=app.selected,m=rs(o);if(m?.kind!=='path')return setStatus('Select a sketch path to Trim.');const pts=worldPathPoints(o);if(pts.length<=2)return setStatus('This path has no internal segment to trim.');pts.pop();rewritePath(o,pts,'Trim');}
function extendSketch(){const o=app.selected,m=rs(o);if(m?.kind!=='path')return setStatus('Select a sketch path to Extend.');const pts=worldPathPoints(o);if(pts.length<2)return;const d=Math.abs(safeNum($('sketchOffsetDistance').value,2)),last=pts.at(-1),prev=pts.at(-2),dir=last.clone().sub(prev).normalize();pts[pts.length-1]=last.clone().addScaledVector(dir,d);rewritePath(o,pts,`Extend ${round(d)} mm`);}
function mirrorSketch(){const o=app.selected,m=rs(o);if(!['path','profile'].includes(m?.kind))return setStatus('Select a sketch profile/path to Mirror.');openOperation('Mirror Sketch',[{key:'axis',label:'Sketch axis',type:'select',value:'U',options:[['U','U axis'],['V','V axis']]}],v=>{const before=captureState();if(m.kind==='profile'){const pts=(m.params.points||[]).map(p=>v.axis==='U'?[p[0],-p[1]]:[-p[0],p[1]]);const n=addProfile(pts,m.params.plane,m.params.shape,{...m.params,points:pts});n.position.copy(o.position);n.rotation.copy(o.rotation);n.scale.copy(o.scale);selectObject(n);}else{const inv=o.matrixWorld.clone().invert(),plane=m.params.plane||currentSketchPlane(),world=worldPathPoints(o),local=world.map(p=>p.applyMatrix4(inv)),pts=local.map(p=>{const uv=planeUV(p,plane);const mir=v.axis==='U'?[uv[0],-uv[1]]:[-uv[0],uv[1]];return uvWorld(mir,plane)});const n=addPath(pts,'mirrored');n.position.copy(o.position);n.rotation.copy(o.rotation);n.scale.copy(o.scale);selectObject(n);}pushHistory('Mirror Sketch',before);});}
function applyConstraint(type){
  const paths=app.checked.filter(x=>rs(x)?.kind==='path');
  if(type==='fix')return constrainSelected(type);
  if(type==='concentric'){
    const ps=app.checked.filter(x=>rs(x)?.kind==='profile'&&['circle','polygon'].includes(rs(x)?.params?.shape));if(ps.length!==2)return setStatus('Check two circular/polygon profiles for Concentric.');const before=captureState();ps[1].position.copy(ps[0].position);addFeature(ps[1],'Constraint: concentric');pushHistory('Constraint concentric',before);return;
  }
  const o=app.selected,m=rs(o);if(m?.kind!=='path')return setStatus('Select a line/path. For two-object constraints, also check the reference path.');
  const p=worldPathPoints(o);if(p.length<2)return;
  if(type==='horizontal'||type==='vertical'){
    const before=captureState(),plane=m.params.plane||currentSketchPlane();if(type==='horizontal'){if(plane==='XY')p[1].y=p[0].y;else if(plane==='XZ')p[1].z=p[0].z;else p[1].z=p[0].z;}else{if(plane==='XY'||plane==='XZ')p[1].x=p[0].x;else p[1].y=p[0].y;}rewritePathNoHistory(o,p);addFeature(o,`Constraint: ${type}`);pushHistory(`Constraint ${type}`,before);return;
  }
  const ref=paths.find(x=>x!==o);if(!ref)return setStatus(`Check a second path for ${capitalize(type)}.`);const rp=worldPathPoints(ref);if(rp.length<2)return;const before=captureState(),a=p[0],len=p[1].distanceTo(a),rdir=rp[1].clone().sub(rp[0]).normalize();
  if(type==='parallel')p[1]=a.clone().addScaledVector(rdir,len);
  else if(type==='perpendicular'){let normal=new THREE.Vector3(0,0,1);const plane=m.params.plane||currentSketchPlane();if(plane==='XZ')normal.set(0,1,0);else if(plane==='YZ')normal.set(1,0,0);const d=normal.clone().cross(rdir).normalize();p[1]=a.clone().addScaledVector(d,len);}
  else if(type==='equal'){const targetLen=rp[1].distanceTo(rp[0]),dir=p[1].clone().sub(a).normalize();p[1]=a.clone().addScaledVector(dir,targetLen);}
  else if(type==='coincident'){const delta=rp.at(-1).clone().sub(p[0]);p.forEach(q=>q.add(delta));}
  else if(type==='midpoint'){const target=rp[0].clone().add(rp[1]).multiplyScalar(.5),mid=p[0].clone().add(p[1]).multiplyScalar(.5),delta=target.sub(mid);p.forEach(q=>q.add(delta));}
  else return setStatus(`${capitalize(type)} is not applicable to these selected paths.`);
  rewritePathNoHistory(o,p);addFeature(o,`Constraint: ${type}`);pushHistory(`Constraint ${type}`,before);
}
function rewritePathNoHistory(obj,worldPts){const inv=obj.matrixWorld.clone().invert(),local=worldPts.map(p=>p.clone().applyMatrix4(inv));rs(obj).params.points=local.map(p=>p.toArray());obj.geometry.dispose();obj.geometry=new THREE.BufferGeometry().setFromPoints(local);syncInspector();}
