// ---------- Sketch interaction ----------
function currentSketchPlane(){return $('sketchPlane').value||'XY';}
function sketchPlane3D(name=currentSketchPlane()){
  if(name==='XY')return new THREE.Plane(new THREE.Vector3(0,0,1),0);
  if(name==='XZ')return new THREE.Plane(new THREE.Vector3(0,1,0),0);
  return new THREE.Plane(new THREE.Vector3(1,0,0),0);
}
function planeUV(world,plane=currentSketchPlane()){if(plane==='XY')return [world.x,world.y];if(plane==='XZ')return [world.x,world.z];return [world.y,world.z];}
function uvWorld(uv,plane=currentSketchPlane(),normalOffset=0){if(plane==='XY')return new THREE.Vector3(uv[0],uv[1],normalOffset);if(plane==='XZ')return new THREE.Vector3(uv[0],normalOffset,uv[1]);return new THREE.Vector3(normalOffset,uv[0],uv[1]);}
function snapWorld(p){
  if(!$('snapToggle').checked)return p.clone();const step=Math.max(0,safeNum($('moveSnap').value,1));let out=p.clone();
  if(step>0){out.x=Math.round(out.x/step)*step;out.y=Math.round(out.y/step)*step;out.z=Math.round(out.z/step)*step;}
  let best=null,bestD=Math.max(step*2,2);
  allItems().forEach(o=>{if(o.isMesh){const pos=o.geometry?.attributes?.position;if(!pos)return;const max=Math.min(pos.count,800);for(let i=0;i<max;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);const d=v.distanceTo(p);if(d<bestD){bestD=d;best=v;}}}});
  return best||out;
}
function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);}
function pointerOnSketch(e){pointerRay(e);const p=new THREE.Vector3();if(!raycaster.ray.intersectPlane(sketchPlane3D(),p))return null;return snapWorld(p);}
function hitModel(e){pointerRay(e);const hits=raycaster.intersectObjects(allItems(),true).filter(h=>!h.object.userData?.helper);if(!hits.length)return null;let obj=hits[0].object;while(obj.parent&&obj.parent!==modelRoot&&!rs(obj))obj=obj.parent;while(obj.parent&&obj.parent!==modelRoot&&rs(obj.parent))obj=obj.parent;return {...hits[0],root:obj};}

function setTool(tool,prompt){
  app.tool=tool;app.drawPoints=[];app.freehandPoints=[];app.hoverPoint=null;app.drawing=false;
  ['selectTool','moveTool','rotateTool','scaleTool','lassoTool','orbitTool','panTool','zoomTool'].forEach(id=>$(id)?.classList.remove('tool-active'));
  document.querySelectorAll('[data-tool-proxy]').forEach(b=>b.classList.toggle('tool-active',b.dataset.toolProxy===tool));
  const map={select:'selectTool',move:'moveTool',rotate:'rotateTool',scale:'scaleTool',boxSelect:'lassoTool',orbit:'orbitTool',pan:'panTool',zoom:'zoomTool'};if(map[tool])$(map[tool])?.classList.add('tool-active');
  orbit.mouseButtons.LEFT = tool==='orbit' ? THREE.MOUSE.ROTATE : tool==='pan' ? THREE.MOUSE.PAN : tool==='zoom' ? THREE.MOUSE.DOLLY : -1;
  orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  orbit.touches.ONE = tool==='orbit' ? THREE.TOUCH.ROTATE : tool==='pan' ? THREE.TOUCH.PAN : -1;
  orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  if(['move','rotate','scale'].includes(tool)){transform.setMode(tool==='move'?'translate':tool);if(app.selected&&!isLocked(app.selected))transform.attach(app.selected);}else if(tool!=='select')transform.detach();
  const cursors={select:'default',move:'move',rotate:'crosshair',scale:'nwse-resize',boxSelect:'crosshair',line:'crosshair',freehand:'crosshair',rectangle:'crosshair',rotatedRectangle:'crosshair',circle:'crosshair',polygon:'crosshair',arc2:'crosshair',arc3:'crosshair',pie:'crosshair',measure:'crosshair',guide:'crosshair',protractor:'crosshair',orbit:'grab',pan:'grab',zoom:'zoom-in'};
  renderer.domElement.style.cursor=cursors[tool]||'crosshair';
  $('toolPrompt').textContent=prompt||toolPrompt(tool);viewport.focus();
}
function toolPrompt(tool){const m={select:'Click an object to select.',move:'Drag the move gizmo. Type an exact distance when needed.',rotate:'Drag to rotate. Angle snapping is available.',scale:'Drag to scale.',boxSelect:'Drag a selection box.',orbit:'Drag to orbit around the model. Middle mouse also orbits temporarily.',pan:'Drag to pan the camera.',zoom:'Drag to zoom. Mouse wheel also zooms.',line:'Pencil: click start and end. Type an exact length after the first point.',freehand:'Press and drag to draw a freehand path.',rectangle:'Click opposite corners, or type width,height after the first point.',rotatedRectangle:'Click origin, direction point, then width point.',circle:'Click center and radius, or type radius after center.',polygon:'Click center and radius.',arc2:'Click start, end, then bulge point.',arc3:'Click three points on the arc.',pie:'Click center, start, then end.',measure:'Click two points to measure.',guide:'Click two points to create a guide.',protractor:'Click vertex, first ray, second ray.'};return m[tool]||'Choose points in the viewport.';}

function finishSketchTool(){app.drawPoints=[];$('measurementInput').value='';}
function executeSketchClick(p){const plane=currentSketchPlane(),uv=planeUV(p,plane);app.drawPoints.push(uv);
  if(app.tool==='line'&&app.drawPoints.length===2){addPath(app.drawPoints.map(q=>uvWorld(q,plane)),'line');finishSketchTool();}
  else if(app.tool==='rectangle'&&app.drawPoints.length===2){const [a,b]=app.drawPoints;addProfile([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]],plane,'rectangle',{w:Math.abs(b[0]-a[0]),h:Math.abs(b[1]-a[1])});finishSketchTool();}
  else if(app.tool==='rotatedRectangle'&&app.drawPoints.length===3){const [a,b,c]=app.drawPoints;const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,nx=-uy,ny=ux;const w=(c[0]-a[0])*nx+(c[1]-a[1])*ny;addProfile([a,b,[b[0]+nx*w,b[1]+ny*w],[a[0]+nx*w,a[1]+ny*w]],plane,'custom',{points:[a,b,c]});finishSketchTool();}
  else if(['circle','polygon'].includes(app.tool)&&app.drawPoints.length===2){const [a,b]=app.drawPoints,r=Math.hypot(b[0]-a[0],b[1]-a[1]),n=app.tool==='circle'?64:clamp(parseInt($('polygonSides').value)||6,3,128),pts=[];for(let i=0;i<n;i++){const t=i/n*Math.PI*2;pts.push([a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)]);}const obj=addProfile(pts,plane,app.tool,{r,sides:n});obj.position.copy(uvWorld([0,0],plane));finishSketchTool();}
  else if(['arc2','arc3'].includes(app.tool)&&app.drawPoints.length===3){const pts=arcThroughThree(app.drawPoints[0],app.drawPoints[1],app.drawPoints[2],app.tool==='arc2');addPath(pts.map(q=>uvWorld(q,plane)),app.tool);finishSketchTool();}
  else if(app.tool==='pie'&&app.drawPoints.length===3){const [c,a,b]=app.drawPoints,r=Math.hypot(a[0]-c[0],a[1]-c[1]),a0=Math.atan2(a[1]-c[1],a[0]-c[0]),a1=Math.atan2(b[1]-c[1],b[0]-c[0]);let d=a1-a0;if(d<=0)d+=Math.PI*2;const pts=[[...c]];for(let i=0;i<=40;i++){const t=a0+d*i/40;pts.push([c[0]+r*Math.cos(t),c[1]+r*Math.sin(t)]);}addProfile(pts,plane,'pie',{r});finishSketchTool();}
}
function arcThroughThree(a,b,c,bulgeMode=false){
  const x1=a[0],y1=a[1],x2=b[0],y2=b[1],x3=c[0],y3=c[1],d=2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));if(Math.abs(d)<EPS)return [a,b,c];
  const ux=((x1*x1+y1*y1)*(y2-y3)+(x2*x2+y2*y2)*(y3-y1)+(x3*x3+y3*y3)*(y1-y2))/d;
  const uy=((x1*x1+y1*y1)*(x3-x2)+(x2*x2+y2*y2)*(x1-x3)+(x3*x3+y3*y3)*(x2-x1))/d;
  const r=Math.hypot(x1-ux,y1-uy);let t1=Math.atan2(y1-uy,x1-ux),t2=Math.atan2(y2-uy,x2-ux),t3=Math.atan2(y3-uy,x3-ux);
  const norm=t=>{while(t<0)t+=Math.PI*2;while(t>=Math.PI*2)t-=Math.PI*2;return t};t1=norm(t1);t2=norm(t2);t3=norm(t3);
  const ccw=((t2-t1+Math.PI*2)%(Math.PI*2))<((t3-t1+Math.PI*2)%(Math.PI*2));let delta=ccw?((t3-t1+Math.PI*2)%(Math.PI*2)):-((t1-t3+Math.PI*2)%(Math.PI*2));
  const out=[];for(let i=0;i<=48;i++){const t=t1+delta*i/48;out.push([ux+r*Math.cos(t),uy+r*Math.sin(t)]);}return out;
}
function applyTypedMeasurement(text){
  const p=currentSketchPlane();if(!app.drawPoints.length)return false;
  if(app.tool==='line'){const len=parseUnitValue(text);if(!(len>0)||!app.hoverPoint)return false;const a=app.drawPoints[0],h=planeUV(app.hoverPoint,p),dx=h[0]-a[0],dy=h[1]-a[1],m=Math.hypot(dx,dy)||1;app.drawPoints.push([a[0]+dx/m*len,a[1]+dy/m*len]);addPath(app.drawPoints.map(q=>uvWorld(q,p)),'line');finishSketchTool();return true;}
  if(app.tool==='rectangle'){const parts=text.split(/[,x]/i).map(parseUnitValue);if(parts.length<2||!parts.every(v=>v>0))return false;const a=app.drawPoints[0];app.drawPoints.push([a[0]+parts[0],a[1]+parts[1]]);executeSketchClick(uvWorld(app.drawPoints.pop(),p));return true;}
  if(['circle','polygon'].includes(app.tool)){const r=parseUnitValue(text);if(!(r>0))return false;const a=app.drawPoints[0];executeSketchClick(uvWorld([a[0]+r,a[1]],p));return true;}
  return false;
}
function parseUnitValue(s){s=String(s).trim().toLowerCase();const n=parseFloat(s);if(!Number.isFinite(n))return NaN;if(s.includes('in')||s.includes('"'))return n*25.4;return n;}
