// ---------- Workspace / UI wiring ----------
function switchWorkspace(ws){app.workspace=ws;document.querySelectorAll('.workspace-tab').forEach(b=>b.classList.toggle('active',b.dataset.workspace===ws));document.querySelectorAll('.workspace-panel').forEach(p=>p.hidden=p.dataset.workspace!==ws);}
document.querySelectorAll('.workspace-tab').forEach(b=>b.addEventListener('click',()=>switchWorkspace(b.dataset.workspace)));
document.querySelectorAll('[data-primitive]').forEach(b=>b.addEventListener('click',()=>makePrimitive(b.dataset.primitive)));
document.querySelectorAll('[data-sketch]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.sketch)));
document.querySelectorAll('[data-constraint]').forEach(b=>b.addEventListener('click',()=>applyConstraint(b.dataset.constraint)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

$('selectTool').onclick=()=>setTool('select');$('moveTool').onclick=()=>setTool('move');$('rotateTool').onclick=()=>setTool('rotate');$('scaleTool').onclick=()=>setTool('scale');$('lassoTool').onclick=()=>setTool('boxSelect');$('orbitTool').onclick=()=>setTool('orbit');$('panTool').onclick=()=>setTool('pan');$('zoomTool').onclick=()=>setTool('zoom');
$('duplicateBtn').onclick=duplicateSelected;$('mirrorBtn').onclick=mirrorSelected;$('alignBtn').onclick=alignChecked;$('placeGroundBtn').onclick=()=>placeOnGround(app.selected);
$('offsetSketchBtn').onclick=offsetSelectedProfile;$('trimSketchBtn').onclick=trimSketch;$('extendSketchBtn').onclick=extendSketch;$('mirrorSketchBtn').onclick=mirrorSketch;
$('pushPullBtn').onclick=()=>doExtrude({pushPull:true});$('extrudeBtn').onclick=()=>doExtrude();$('revolveBtn').onclick=doRevolve;$('sweepBtn').onclick=doSweep;$('loftBtn').onclick=doLoft;$('ribBtn').onclick=doRib;$('holeBtn').onclick=doHole;$('threadBtn').onclick=doThread;$('filletBtn').onclick=()=>doFillet(false);$('chamferBtn').onclick=()=>doFillet(true);$('shellBtn').onclick=doShell;$('draftBtn').onclick=doDraft;$('offsetFaceBtn').onclick=doOffsetFace;$('splitBodyBtn').onclick=doSplitBody;
$('unionBtn').onclick=()=>doBoolean('union');$('subtractBtn').onclick=()=>doBoolean('cut');$('intersectBtn').onclick=()=>doBoolean('intersect');$('rectPatternBtn').onclick=rectangularPattern;$('circularPatternBtn').onclick=circularPattern;$('pathPatternBtn').onclick=pathPattern;
$('guideBtn').onclick=()=>setTool('guide');$('measureBtn').onclick=()=>setTool('measure');$('protractorBtn').onclick=()=>setTool('protractor');$('offsetPlaneBtn').onclick=()=>addConstructionPlane('offset');$('anglePlaneBtn').onclick=()=>addConstructionPlane('angle');$('midPlaneBtn').onclick=()=>addConstructionPlane('mid');$('axisBtn').onclick=addConstructionAxis;$('pointBtn').onclick=addConstructionPoint;$('clearGuidesBtn').onclick=clearGuides;
$('sectionBtn').onclick=toggleSectionPlane;$('massPropsBtn').onclick=doMassProps;$('meshCheckBtn').onclick=()=>meshCheck();$('repairMeshBtn').onclick=repairMesh;$('interferenceBtn').onclick=interferenceCheck;
$('groupBtn').onclick=groupChecked;$('ungroupBtn').onclick=ungroupSelected;$('makeComponentBtn').onclick=makeComponent;$('instanceComponentBtn').onclick=newComponentInstance;$('lockBtn').onclick=toggleLock;$('hideBtn').onclick=toggleHide;$('addTagBtn').onclick=addTag;$('addSceneBtn').onclick=addSceneView;
$('addPointLightBtn').onclick=()=>addLight('point');$('addSpotLightBtn').onclick=()=>addLight('spot');
$('fitViewBtn').onclick=fitView;
$('orthoToggleBtn').onclick=toggleProjection;
$('axesToggle').onchange=()=>axes.visible=$('axesToggle').checked;
$('gridSpacing').onchange=rebuildGrid;
$('unitsSelect').onchange=()=>{syncInspector();setStatus(`Display units: ${unitMode()==='in'?'inches':'millimeters'}. Internal CAD units remain millimeters.`);};
$('snapToggle').onchange=applyTransformSnaps;$('moveSnap').onchange=applyTransformSnaps;$('angleSnap').onchange=applyTransformSnaps;
function applyTransformSnaps(){const on=$('snapToggle').checked;transform.setTranslationSnap(on?Math.max(0,safeNum($('moveSnap').value,1)):null);transform.setRotationSnap(on?Math.max(0,safeNum($('angleSnap').value,15))*RAD:null);}
applyTransformSnaps();

$('displayMode').onchange=applyDisplayMode;$('backgroundColor').oninput=()=>scene.background.set($('backgroundColor').value);$('ambientIntensity').oninput=()=>hemi.intensity=safeNum($('ambientIntensity').value,2.2);$('keyIntensity').oninput=()=>keyLight.intensity=safeNum($('keyIntensity').value,3.2);
$('deleteBtn').onclick=deleteSelected;$('zeroPositionBtn').onclick=()=>{if(app.selected){const before=captureState();app.selected.position.set(0,0,0);pushHistory('Zero Position',before);syncInspector(false);}};
$('objectName').onchange=()=>{if(app.selected){const before=captureState();app.selected.name=$('objectName').value.trim()||app.selected.name;pushHistory('Rename',before);renderSceneList();}};
$('objectTag').onchange=()=>{if(app.selected){const before=captureState();rs(app.selected).tag=$('objectTag').value;pushHistory('Change Tag',before);}};
['posX','posY','posZ','rotX','rotY','rotZ','scaleX','scaleY','scaleZ'].forEach(id=>$(id).addEventListener('change',updateTransformFromInspector));
['materialColor','roughness','metalness','smoothShading'].forEach(id=>$(id).addEventListener('change',updateMaterial));

$('saveProjectBtn').onclick=saveProject;$('openProjectBtn').onclick=()=>$('openProjectInput').click();$('openProjectInput').onchange=e=>{const f=e.target.files?.[0];if(f)openProjectFile(f);e.target.value='';};$('newProjectBtn').onclick=newProject;$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;
$('stlInput').onchange=e=>{const f=e.target.files?.[0];if(f)importSTL(f);e.target.value='';};$('exportStlBtn').onclick=()=>exportScene('stl');$('exportObjBtn').onclick=()=>exportScene('obj');
$('commandSearchBtn').onclick=showToolSearch;$('toolSearchInput').oninput=e=>renderToolSearch(e.target.value);$('searchCloseBtn').onclick=()=>$('searchDialog').close();
$('aboutBtn').onclick=()=>$('aboutDialog').showModal();$('aboutCloseBtn').onclick=()=>$('aboutDialog').close();
$('operationCloseBtn').onclick=closeOperation;$('operationCancelBtn').onclick=closeOperation;$('operationForm').addEventListener('submit',async e=>{e.preventDefault();const fn=app.activeOperation?.onApply,vals=operationValues();closeOperation();try{await fn?.(vals);}catch(err){console.error(err);setStatus(`Operation failed: ${err.message||err}`);}});
$('measurementInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!applyTypedMeasurement(e.currentTarget.value))setStatus('That exact value does not apply to the current tool yet.');}});

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown',e=>{
  const tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();showToolSearch();return;}
  const k=e.key.toLowerCase();if(k===' '||k==='v'){e.preventDefault();setTool('select');}else if(k==='m')setTool('move');else if(k==='q')setTool('rotate');else if(k==='s')setTool('scale');else if(k==='l'){switchWorkspace('sketch');setTool('line')}else if(k==='r'){switchWorkspace('sketch');setTool('rectangle')}else if(k==='c'){switchWorkspace('sketch');setTool('circle')}else if(k==='p'){switchWorkspace('solid');doExtrude({pushPull:true})}else if(k==='t'){switchWorkspace('construct');setTool('guide')}else if(k==='o')setTool('orbit');else if(k==='h')setTool('pan');else if(k==='z')setTool('zoom');else if(k==='f'){switchWorkspace('sketch');offsetSelectedProfile()}else if(e.key==='Delete'||e.key==='Backspace')deleteSelected();else if(e.key==='Escape'){setTool('select');closeOperation();}
});

// ---------- Start ----------
refreshTagSelect();renderTags();renderScenes();renderSceneList();renderFeatureHistory();setTool('select');pushHistory('Initial');fitView();
