// ---------- Object edits ----------
function deleteSelected(){const o=app.selected;if(!o)return;const before=captureState();modelRoot.remove(o);app.checked=app.checked.filter(x=>x!==o);selectObject(null);pushHistory('Delete',before);renderSceneList();}
function duplicateSelected(){const o=app.selected;if(!o)return;const before=captureState(),c=cloneModelObject(o);c.position.x+=10;c.position.y+=10;modelRoot.add(c);selectObject(c);pushHistory('Duplicate',before);renderSceneList();}
function updateTransformFromInspector(){const o=app.selected;if(!o||isLocked(o))return;const before=captureState();o.position.set(lengthToInternal($('posX').value),lengthToInternal($('posY').value),lengthToInternal($('posZ').value));o.rotation.set(safeNum($('rotX').value)*RAD,safeNum($('rotY').value)*RAD,safeNum($('rotZ').value)*RAD);o.scale.set(safeNum($('scaleX').value,1),safeNum($('scaleY').value,1),safeNum($('scaleZ').value,1));pushHistory('Numeric Transform',before);renderMeasurements();}
function updateMaterial(){const o=app.selected;if(!o)return;const before=captureState();materialMeshes(o).forEach(m=>{if(!m.material?.color)return;m.material.color.set($('materialColor').value);m.userData.originalColor=$('materialColor').value;m.material.roughness=safeNum($('roughness').value,.6);m.material.metalness=safeNum($('metalness').value,.05);m.material.flatShading=!$('smoothShading').checked;m.material.needsUpdate=true;});pushHistory('Material',before);}

// ---------- Pointer events ----------
let pointerDownScreen=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  pointerDownScreen={x:e.clientX,y:e.clientY};
  if(app.tool==='boxSelect'){app.boxSelectStart={x:e.clientX,y:e.clientY};app.boxSelectEnd={...app.boxSelectStart};$('selectionRect').hidden=false;updateSelectionRect();return;}
  if(app.tool==='freehand'){const p=pointerOnSketch(e);if(p){app.drawing=true;app.freehandPoints=[p];renderer.domElement.setPointerCapture?.(e.pointerId);}return;}
});
renderer.domElement.addEventListener('pointermove',e=>{
  app.hoverPoint=pointerOnSketch(e);
  if(app.tool==='boxSelect'&&app.boxSelectStart){app.boxSelectEnd={x:e.clientX,y:e.clientY};updateSelectionRect();}
  if(app.tool==='freehand'&&app.drawing){const p=pointerOnSketch(e);if(p&&(!app.freehandPoints.length||p.distanceTo(app.freehandPoints.at(-1))>.5))app.freehandPoints.push(p);}
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(app.tool==='boxSelect'&&app.boxSelectStart){finishBoxSelect();return;}
  if(app.tool==='freehand'&&app.drawing){app.drawing=false;if(app.freehandPoints.length>1)addPath(app.freehandPoints,'freehand');app.freehandPoints=[];return;}
  if(transform.dragging)return;const moved=pointerDownScreen&&Math.hypot(e.clientX-pointerDownScreen.x,e.clientY-pointerDownScreen.y)>5;if(moved)return;
  if(['line','rectangle','rotatedRectangle','circle','polygon','arc2','arc3','pie'].includes(app.tool)){const p=pointerOnSketch(e);if(p)executeSketchClick(p);return;}
  if(['measure','guide','protractor'].includes(app.tool)){const p=guidePointFromEvent(e);if(p)handleMeasureClick(p,app.tool);return;}
  if(app.tool==='select'||['move','rotate','scale'].includes(app.tool)){const hit=hitModel(e);app.lastHit=hit;if(hit){selectObject(hit.root);setStatus(`${hit.root.name} selected.`);}else{selectObject(null);setStatus('Selection cleared.');}}
});
function updateSelectionRect(){const a=app.boxSelectStart,b=app.boxSelectEnd;if(!a||!b)return;const r=$('selectionRect');r.style.left=`${Math.min(a.x,b.x)}px`;r.style.top=`${Math.min(a.y,b.y)}px`;r.style.width=`${Math.abs(a.x-b.x)}px`;r.style.height=`${Math.abs(a.y-b.y)}px`;}
function finishBoxSelect(){const a=app.boxSelectStart,b=app.boxSelectEnd;app.boxSelectStart=null;$('selectionRect').hidden=true;if(!a||!b)return;const rect=renderer.domElement.getBoundingClientRect(),minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);app.checked=[];allItems().forEach(o=>{const c=new THREE.Vector3();new THREE.Box3().setFromObject(o).getCenter(c);c.project(camera);const x=rect.left+(c.x+1)/2*rect.width,y=rect.top+(1-c.y)/2*rect.height;if(x>=minX&&x<=maxX&&y>=minY&&y<=maxY)app.checked.push(o);});renderSceneList();setStatus(`${app.checked.length} object(s) box-selected.`);}

// ---------- Tool search ----------
const toolCatalog=[
  ['Push / Pull','solid','pushPullBtn'],['Extrude','solid','extrudeBtn'],['Revolve','solid','revolveBtn'],['Sweep / Follow Me','solid','sweepBtn'],['Loft','solid','loftBtn'],['Fillet','solid','filletBtn'],['Chamfer','solid','chamferBtn'],['Shell','solid','shellBtn'],['Hole','solid','holeBtn'],['Thread / Helix','solid','threadBtn'],['Offset Face','solid','offsetFaceBtn'],['Split Body','solid','splitBodyBtn'],['Rectangular Pattern','solid','rectPatternBtn'],['Circular Pattern','solid','circularPatternBtn'],['Line','sketch','sketch:line'],['Rectangle','sketch','sketch:rectangle'],['Circle','sketch','sketch:circle'],['Polygon','sketch','sketch:polygon'],['Arc','sketch','sketch:arc3'],['Offset Sketch','sketch','offsetSketchBtn'],['Measure','inspect','measureBtn'],['Tape / Guide','construct','guideBtn'],['Protractor','construct','protractorBtn'],['Section Plane','inspect','sectionBtn'],['Group','organize','groupBtn'],['Component','organize','makeComponentBtn'],['Tags','organize','addTagBtn'],['Scenes','organize','addSceneBtn'],['STL Import','model','stlInput']
];
function showToolSearch(){renderToolSearch('');$('searchDialog').showModal();setTimeout(()=>$('toolSearchInput').focus(),20);}
function renderToolSearch(q){const root=$('toolSearchResults');root.innerHTML='';q=q.trim().toLowerCase();toolCatalog.filter(x=>!q||x[0].toLowerCase().includes(q)||x[1].includes(q)).slice(0,30).forEach(([name,ws,id])=>{const b=document.createElement('button');b.className='search-result';b.innerHTML=`<span>${escapeHtml(name)}</span><small>${capitalize(ws)}</small>`;b.addEventListener('click',()=>{switchWorkspace(ws);$('searchDialog').close();if(id.startsWith('sketch:'))setTool(id.split(':')[1]);else if(id==='stlInput')$('stlInput').click();else $(id)?.click();});root.append(b);});}
