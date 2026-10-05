const $ = (s) => document.querySelector(s);
let scene3d, camera3d, renderer3d, raycaster3d, pointer3d;
let tokenMeshes3d = [], currentTokens = [], currentTags = [], currentData = null;
let sentenceData = null, statusData = null, selectedModel = "HMM", autoRotate = true;
let drag = false, lastX = 0, lastY = 0, targetRotX = 0, targetRotY = 0;

const sentence = $("#sentence"), tokenMap = $("#tokenMap"), systemState = $("#systemState");
const MODEL_META = {
  "Rule-Based": {short:"R", icon:"R", tone:"rule", title:"Rules", label:"Rule-Based"},
  "Statistical": {short:"U", icon:"U", tone:"stat", title:"Unigram", label:"Statistical"},
  "HMM": {short:"H", icon:"H", tone:"hmm", title:"HMM", label:"HMM"},
  "Transformation-Based": {short:"B", icon:"B", tone:"brill", title:"Brill", label:"Transformation-Based"}
};

sentence.addEventListener("input", () => $("#charCount").textContent = `${sentence.value.length} chars`);

document.querySelectorAll(".examples button").forEach(btn => btn.addEventListener("click", () => {
  sentence.value = btn.dataset.example; sentence.dispatchEvent(new Event("input")); analyze();
}));

async function loadStatus(){
  try{
    const res = await fetch("/api/status"); statusData = await res.json();
    systemState.textContent = "ENGINE READY";
    renderTaggers();
    setActiveModel(selectedModel, false);
  }catch(e){ systemState.textContent = "ENGINE ERROR"; console.error(e); }
}

function renderTaggers(){
  const grid = $("#taggerGrid");
  grid.innerHTML = Object.entries(statusData.accuracies).map(([name, score], i) => {
    const m = MODEL_META[name] || MODEL_META.HMM;
    const active = name === selectedModel ? "selected" : "";
    return `<button class="tagger-card ${m.tone} ${active}" data-model="${escapeAttr(name)}">
      <span class="tagger-top"><span class="model-number">0${i+1}</span><span class="check">${active ? "✓ ACTIVE" : "SELECT"}</span></span>
      <span class="tagger-icon">${m.icon}</span>
      <span class="tagger-name">${escapeHtml(name)}</span>
      <span class="tagger-title">${m.title}</span>
      <span class="tagger-desc">${escapeHtml(statusData.descriptions[name])}</span>
      <span class="tagger-score"><strong>${score.toFixed(1)}%</strong><span>accuracy</span></span>
      <span class="score-line"><i style="width:${score}%"></i></span>
    </button>`;
  }).join("");
  grid.querySelectorAll(".tagger-card").forEach(card => card.addEventListener("click", () => {
    setActiveModel(card.dataset.model, true);
  }));
}

function setActiveModel(name, rerun=true){
  if(!statusData?.accuracies[name]) return;
  selectedModel = name;
  renderTaggers();
  const meta = MODEL_META[name] || MODEL_META.HMM;
  $("#engineIcon").textContent = meta.icon;
  $("#activeModelName").textContent = name;
  $("#activeModelDesc").textContent = statusData.descriptions[name];
  $("#activeModelScore").textContent = `${statusData.accuracies[name].toFixed(1)}%`;
  const selection = $("#selectionLabel"); if(selection) selection.textContent = `${name.toUpperCase()} ACTIVE`;
  const mascotStatus = $("#mascotStatus"); if(mascotStatus) mascotStatus.textContent = `READING WITH ${name.toUpperCase()}`;
  if(mascotGroup) mascotGroup.userData.model = name;
  if(rerun) analyze();
}

function tagToken(t, i){
  return `<div class="token ${tagClass(t.tag)}" data-index="${i}"><span class="token-index">${String(i+1).padStart(2,"0")}</span><span class="word">${escapeHtml(t.word)}</span><span class="tag">${escapeHtml(t.tag)}</span></div>`;
}

async function analyze(){
  const text = sentence.value.trim(); if(!text) return;
  const btn = $("#analyzeBtn"); btn.disabled=true; btn.innerHTML="ANALYZING <span class='spinner'></span>";
  try{
    const res = await fetch("/api/analyze", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sentence:text})});
    const data = await res.json(); if(!res.ok) throw new Error(data.error);
    sentenceData = data; currentData = data;
    const active = data.results[selectedModel];
    currentTokens = data.tokens; currentTags = active;
    tokenMap.innerHTML = active.map(tagToken).join("");
    tokenMap.querySelectorAll(".token").forEach(el => el.addEventListener("click", () => select3d(Number(el.dataset.index))));
    build3D(data.tokens, active);
    $("#resultTitle").textContent = `${selectedModel} reading`;
    $("#threeModelLabel").textContent = selectedModel.toUpperCase();
    $("#sceneCount").textContent = `${data.token_count} TOKENS`;
    const disagreements = data.rows.filter(r => !r.agreement).length;
    const agreement = data.rows.length ? ((data.rows.length-disagreements)/data.rows.length)*100 : 0;
    $("#analysisSummary").innerHTML = `<span><strong>${data.token_count}</strong> TOKENS</span><span><strong>${disagreements}</strong> CONFLICT${disagreements===1?"":"S"}</span><span>ENGINE <strong>${escapeHtml(selectedModel)}</strong></span>`;
    const names = Object.keys(data.results);
    $("#comparisonTable").innerHTML = `<table class="compare-table"><thead><tr><th>WORD</th>${names.map(n=>`<th>${escapeHtml(n)}</th>`).join("")}</tr></thead><tbody>${data.rows.map(row=>`<tr class="${row.agreement?"":"disagree"}"><td>${escapeHtml(row.word)}</td>${names.map(n=>`<td class="${n===selectedModel?"active-cell":""}">${escapeHtml(row.tags[n])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("#agreementValue").textContent=`${agreement.toFixed(0)}%`; $("#agreementFill").style.width=`${agreement}%`;
    $("#insightTitle").textContent=disagreements?`${disagreements} tagging conflict${disagreements===1?"":"s"}`:"Full model agreement";
    $("#insightText").textContent=disagreements?"The models disagree on highlighted tokens. Switch the active engine above and compare how the 3D scene changes.":"All four taggers assigned the same POS tag to every token in this sentence.";
  }catch(e){ console.error(e); systemState.textContent="ENGINE ERROR"; const msg=document.querySelector("#errorMessage"); const msgText=document.querySelector("#errorMessageText"); if(msg){if(msgText) msgText.textContent=e.message||"Something went wrong. Please try again.";msg.classList.add("show");} }
  finally{btn.disabled=false; btn.innerHTML='ANALYZE SENTENCE <span>↗</span>';}
}

function tagClass(tag){ return `tag-${String(tag).toLowerCase().replace(/[^a-z]/g,"")}`; }
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/`/g,"&#096;");}


let mascotScene, mascotCamera, mascotRenderer, mascotGroup, mascotClock;
function initMascot(){
  const host=$("#mascotCanvas"); if(!host || typeof THREE === "undefined") return;
  mascotScene=new THREE.Scene();
  mascotCamera=new THREE.PerspectiveCamera(35,1,.1,100); mascotCamera.position.set(0,.15,8.6);
  mascotRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  mascotRenderer.setPixelRatio(Math.min(devicePixelRatio,2));
  mascotRenderer.outputColorSpace=THREE.SRGBColorSpace;
  mascotRenderer.toneMapping=THREE.ACESFilmicToneMapping; mascotRenderer.toneMappingExposure=1.12;
  host.appendChild(mascotRenderer.domElement);

  // Soft pastel studio lighting.
  mascotScene.add(new THREE.HemisphereLight(0xfff6fb,0x17142a,2.3));
  const key=new THREE.PointLight(0x8be9ff,6.5,15); key.position.set(-3,3,5); mascotScene.add(key);
  const fill=new THREE.PointLight(0xff9ed8,5.5,13); fill.position.set(3,1,4); mascotScene.add(fill);
  const top=new THREE.PointLight(0xb9a0ff,4,11); top.position.set(0,4,1); mascotScene.add(top);

  mascotGroup=new THREE.Group(); mascotScene.add(mascotGroup);
  mascotGroup.position.y=-.15;

  // Cute floating "Mimo" — a soft AI companion with a cat/fox silhouette.
  const shell=new THREE.MeshStandardMaterial({color:0xf7efff,roughness:.38,metalness:.08});
  const shell2=new THREE.MeshStandardMaterial({color:0xdccaff,roughness:.42,metalness:.06});
  const dark=new THREE.MeshStandardMaterial({color:0x29233f,roughness:.3,metalness:.12});
  const mint=new THREE.MeshBasicMaterial({color:0x8be9ff});
  const pink=new THREE.MeshBasicMaterial({color:0xff8fca});
  const violet=new THREE.MeshBasicMaterial({color:0xa98cff});
  const white=new THREE.MeshBasicMaterial({color:0xffffff});

  // Main squishy body and belly.
  const body=new THREE.Mesh(new THREE.SphereGeometry(1.02,40,32),shell);
  body.scale.set(1,.98,.82); body.position.y=-.15; mascotGroup.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(.53,32,24),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.5}));
  belly.scale.set(1,.92,.25); belly.position.set(0,-.28,.78); mascotGroup.add(belly);

  // Big soft ears.
  [-1,1].forEach(side=>{
    const ear=new THREE.Mesh(new THREE.ConeGeometry(.42,.82,32),side<0?shell2:shell);
    ear.position.set(side*.64,.72,.05); ear.rotation.z=side*.38; ear.rotation.x=-.08; mascotGroup.add(ear);
    const inner=new THREE.Mesh(new THREE.ConeGeometry(.23,.52,32),pink);
    inner.position.set(side*.64,.72,.38); inner.rotation.z=side*.38; inner.rotation.x=-.08; mascotGroup.add(inner);
  });

  // Rounded face plate + shiny expressive eyes.
  const face=new THREE.Mesh(new THREE.SphereGeometry(.78,36,28),shell);
  face.scale.set(1,.78,.55); face.position.set(0,.34,.48); mascotGroup.add(face);
  [-.27,.27].forEach(x=>{
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.14,20,20),dark);
    eye.scale.z=.42; eye.position.set(x,.43,.89); eye.userData.eye=true; mascotGroup.add(eye);
    const sparkle=new THREE.Mesh(new THREE.SphereGeometry(.045,12,12),white);
    sparkle.position.set(x-.045,.49,.94); sparkle.userData.sparkle=true; mascotGroup.add(sparkle);
  });

  // Tiny happy mouth + blush cheeks.
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(.13,.025,8,24,Math.PI),dark);
  mouth.position.set(0,.19,.9); mouth.rotation.x=Math.PI; mascotGroup.add(mouth);
  [-1,1].forEach(side=>{
    const cheek=new THREE.Mesh(new THREE.SphereGeometry(.10,18,18),new THREE.MeshBasicMaterial({color:0xff9fcf,transparent:true,opacity:.62}));
    cheek.scale.set(1.35,.65,.35); cheek.position.set(side*.52,.20,.88); mascotGroup.add(cheek);
  });

  // Small glowing heart-shaped-ish core (two lobes + ring) on belly.
  const core=new THREE.Group(); core.position.set(0,-.30,1.01); core.userData.core=true; mascotGroup.add(core);
  [-.09,.09].forEach(x=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.11,18,18),mint); dot.position.set(x,.03,0); core.add(dot);});
  const coreBase=new THREE.Mesh(new THREE.ConeGeometry(.16,.25,3),mint); coreBase.rotation.z=Math.PI; coreBase.position.set(0,-.08,0); core.add(coreBase);
  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(.25,.012,8,40),new THREE.MeshBasicMaterial({color:0x8be9ff,transparent:true,opacity:.7}));
  coreRing.position.set(0,0,.02); coreRing.rotation.x=Math.PI/2; mascotGroup.add(coreRing); coreRing.userData.coreRing=true;

  // Tiny waving paws.
  const arms=new THREE.Group(); mascotGroup.add(arms);
  [-1,1].forEach(side=>{
    const arm=new THREE.Group(); arm.position.set(side*.88,-.05,.20); arm.userData.arm=side;
    const paw=new THREE.Mesh(new THREE.SphereGeometry(.20,22,20),shell); paw.scale.set(.8,1.15,.65); paw.position.set(side*.12,-.18,.18); arm.add(paw);
    const pad=new THREE.Mesh(new THREE.SphereGeometry(.07,14,14),pink); pad.scale.z=.35; pad.position.set(side*.12,-.18,.34); arm.add(pad);
    arms.add(arm);
  });

  // Little hover feet + tail.
  [-.38,.38].forEach(x=>{
    const foot=new THREE.Mesh(new THREE.SphereGeometry(.20,22,18),shell2); foot.scale.set(1,.55,.9); foot.position.set(x,-1.02,.10); mascotGroup.add(foot);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.07,14,14),mint); glow.position.set(x,-1.10,.22); mascotGroup.add(glow);
  });
  const tail=new THREE.Mesh(new THREE.TorusGeometry(.42,.10,12,28,Math.PI*1.25),shell2);
  tail.position.set(.91,-.30,-.12); tail.rotation.y=Math.PI/2; tail.rotation.z=-.35; tail.userData.tail=true; mascotGroup.add(tail);

  // Floating stars / language sparks.
  const orbiters=new THREE.Group(); mascotGroup.add(orbiters);
  const orbColors=[0x8be9ff,0xa98cff,0xff8fca,0xbaffd8];
  for(let i=0;i<12;i++){
    const size=.035+(i%3)*.015;
    const o=new THREE.Mesh(new THREE.OctahedronGeometry(size,0),new THREE.MeshBasicMaterial({color:orbColors[i%4],transparent:true,opacity:.82}));
    const a=(i/12)*Math.PI*2, r=1.65+(i%2)*.22;
    o.position.set(Math.cos(a)*r,.05+Math.sin(a*1.7)*.48,Math.sin(a)*.7);
    o.userData.angle=a; o.userData.radius=r; o.userData.phase=i*.55; orbiters.add(o);
  }
  mascotGroup.userData.orbiters=orbiters;

  const halo=new THREE.Mesh(new THREE.RingGeometry(1.12,1.65,64),new THREE.MeshBasicMaterial({color:0xa98cff,transparent:true,opacity:.17,side:THREE.DoubleSide}));
  halo.rotation.x=-Math.PI/2; halo.position.y=-1.30; mascotGroup.add(halo); halo.userData.halo=true;

  mascotClock=new THREE.Clock(); window.addEventListener('resize',resizeMascot); resizeMascot(); animateMascot();
}
function resizeMascot(){const host=$("#mascotCanvas"); if(!mascotRenderer)return; const w=Math.max(280,host.clientWidth),h=Math.max(280,host.clientHeight); mascotRenderer.setSize(w,h,false); mascotCamera.aspect=w/h; mascotCamera.updateProjectionMatrix();}
function animateMascot(){
  requestAnimationFrame(animateMascot); if(!mascotRenderer)return;
  const t=mascotClock.getElapsedTime(); const model=mascotGroup.userData.model||"HMM";
  const speed={"Rule-Based":1.05,"Statistical":1.35,"HMM":1.7,"Transformation-Based":2.05}[model]||1.5;
  mascotGroup.position.y=Math.sin(t*speed)*.13; mascotGroup.rotation.y=Math.sin(t*.55)*.16; mascotGroup.rotation.z=Math.sin(t*.9)*.025;
  mascotGroup.children.forEach((o)=>{
    if(o.userData?.eye){const blink=Math.sin(t*1.35+o.position.x*5); o.scale.y=blink>.97?.18:1;}
    if(o.userData?.signal){o.rotation.x=t*1.8;o.rotation.y=t*2.1;o.scale.setScalar(1+.12*Math.sin(t*2.8));}
    if(o.userData?.signalRing)o.rotation.z=t*.8;
    if(o.userData?.core)o.rotation.y=t*.8;
    if(o.userData?.coreRing)o.rotation.z=-t*.7;
    if(o.userData?.arm){o.rotation.z=o.userData.arm*(.18+.10*Math.sin(t*speed*1.4+o.userData.arm));}
    if(o.userData?.halo)o.scale.setScalar(1+.035*Math.sin(t*1.4));
  });
  const orbiters=mascotGroup.userData.orbiters;
  if(orbiters) orbiters.children.forEach((o,i)=>{const a=o.userData.angle+t*(.18+.035*(i%3)); const r=o.userData.radius; o.position.x=Math.cos(a)*r; o.position.z=Math.sin(a)*.65; o.position.y=.05+Math.sin(a*1.7+o.userData.phase)*.42;});
  mascotRenderer.render(mascotScene,mascotCamera);
}

function init3D(){
  const host=$("#threeCanvas"); if(!host || typeof THREE === "undefined") return;
  scene3d=new THREE.Scene(); scene3d.fog=new THREE.FogExp2(0x07090e,.035);
  camera3d=new THREE.PerspectiveCamera(45,1,.1,100); camera3d.position.set(0,0.5,13);
  renderer3d=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer3d.setPixelRatio(Math.min(devicePixelRatio,2)); renderer3d.outputColorSpace=THREE.SRGBColorSpace; host.appendChild(renderer3d.domElement);
  raycaster3d=new THREE.Raycaster(); pointer3d=new THREE.Vector2();
  scene3d.add(new THREE.AmbientLight(0xffffff,1.2));
  const l1=new THREE.PointLight(0xe7ff5a,4,18); l1.position.set(-4,5,7); scene3d.add(l1);
  const l2=new THREE.PointLight(0x69c8ff,3,16); l2.position.set(5,-2,5); scene3d.add(l2);
  const grid=new THREE.GridHelper(18,36,0x303843,0x11161d); grid.position.y=-3; grid.material.transparent=true; grid.material.opacity=.38; scene3d.add(grid);
  const starGeo=new THREE.BufferGeometry(), pos=[]; for(let i=0;i<450;i++) pos.push((Math.random()-.5)*28,(Math.random()-.5)*16,(Math.random()-.5)*18); starGeo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); scene3d.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x7d8794,size:.025,transparent:true,opacity:.65})));
  host.addEventListener("pointerdown",e=>{drag=true;lastX=e.clientX;lastY=e.clientY;host.setPointerCapture?.(e.pointerId);});
  host.addEventListener("pointerup",()=>drag=false); host.addEventListener("pointerleave",()=>drag=false);
  host.addEventListener("pointermove",e=>{ if(drag){targetRotY+=(e.clientX-lastX)*.008; targetRotX+=(e.clientY-lastY)*.005; targetRotX=Math.max(-.7,Math.min(.7,targetRotX));lastX=e.clientX;lastY=e.clientY;} hover3D(e); });
  host.addEventListener("click",()=>{raycaster3d.setFromCamera(pointer3d,camera3d);const hit=raycaster3d.intersectObjects(tokenMeshes3d)[0];if(hit)select3d(hit.object.userData.index);});
  host.addEventListener("wheel",e=>{e.preventDefault();camera3d.position.z=Math.max(7,Math.min(19,camera3d.position.z+e.deltaY*.008));},{passive:false});
  $("#reset3d").addEventListener("click",()=>{targetRotX=0;targetRotY=0;camera3d.position.set(0,.5,13);});
  $("#autoRotate").addEventListener("click",()=>{autoRotate=!autoRotate;$("#autoRotate").classList.toggle("active",autoRotate);});
  window.addEventListener("resize",resize3D); resize3D();
  animate3D();
}

function build3D(tokens,active){
  if(!scene3d) return; currentTokens=tokens; currentTags=active;
  function disposeObject3D(obj){
    if(!obj) return;
    obj.traverse(child=>{
      if(child.geometry && typeof child.geometry.dispose === "function") child.geometry.dispose();
      if(child.material){
        const mats=Array.isArray(child.material)?child.material:[child.material];
        mats.forEach(mat=>{
          if(mat && typeof mat.dispose === "function") mat.dispose();
        });
      }
    });
  }
  tokenMeshes3d.forEach(m=>{scene3d.remove(m);disposeObject3D(m);}); tokenMeshes3d=[];
  scene3d.children.filter(o=>o.userData?.dynamic).forEach(o=>{scene3d.remove(o);disposeObject3D(o);});
  const palette={NOUN:0xe7ff5a,VERB:0x61d9ff,ADJ:0xff7fc7,ADV:0xa99bff,DET:0xffbd63,PRON:0x63f5ad,ADP:0xff8d8d,CONJ:0x8fb9ff,PRT:0xd8a2ff,NUM:0xffffff,X:0x929aa8,UNK:0x929aa8};
  const layer={NOUN:1.5,VERB:.8,ADJ:2.1,ADV:1.35,DET:.15,PRON:-.25,ADP:-.9,CONJ:-1.45,PRT:-1.55,NUM:2.25,X:-2,UNK:-2};
  const spacing=Math.max(.85,Math.min(1.5,9.5/Math.max(tokens.length,6))); const points=[];
  tokens.forEach((word,i)=>{
    const tag=active[i]?.tag||"UNK", color=palette[tag]||palette.UNK;
    const x=(i-(tokens.length-1)/2)*spacing, y=(layer[tag]??0)+Math.sin(i*1.4)*.18, z=Math.cos(i*1.1)*.8;
    const group=new THREE.Group(); group.position.set(x,y,z); group.userData={index:i,word,tag,position:i+1};
    const r=Math.min(.38,.16+Math.min(word.length,15)*.014);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,32,32),new THREE.MeshPhysicalMaterial({color,emissive:color,emissiveIntensity:.3,roughness:.2,metalness:.45,clearcoat:1,clearcoatRoughness:.12}));
    mesh.userData=group.userData; group.add(mesh);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*1.35,.012,8,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65})); ring.rotation.x=Math.PI/2; group.add(ring);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(r*1.9,20,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.035,blending:THREE.AdditiveBlending})); group.add(halo);
    group.userData.dynamic=true; scene3d.add(group); tokenMeshes3d.push(group); points.push(new THREE.Vector3(x,y,z));
  });
  const lineGroup=new THREE.Group(); lineGroup.userData.dynamic=true;
  for(let i=0;i<points.length-1;i++){
    const color=palette[active[i]?.tag]||0x39424f; const curve=new THREE.CatmullRomCurve3([points[i],new THREE.Vector3((points[i].x+points[i+1].x)/2,(points[i].y+points[i+1].y)/2+.35,0),points[i+1]]); const geo=new THREE.BufferGeometry().setFromPoints(curve.getPoints(18)); lineGroup.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.48}))); }
  scene3d.add(lineGroup);
  addLayerLabels(layer,palette);
  select3d(0);
}

function addLayerLabels(layer,palette){
  // subtle horizontal reference rings, positioned behind nodes
  Object.entries(layer).slice(0,6).forEach(([tag,y])=>{
    const geo=new THREE.RingGeometry(4.8,4.82,64); const mat=new THREE.MeshBasicMaterial({color:palette[tag]||0x40464f,transparent:true,opacity:.045,side:THREE.DoubleSide}); const ring=new THREE.Mesh(geo,mat); ring.rotation.x=Math.PI/2; ring.position.y=y; ring.position.z=-1.2; ring.userData.dynamic=true; scene3d.add(ring);
  });
}

function hover3D(e){const r=renderer3d.domElement.getBoundingClientRect();pointer3d.x=((e.clientX-r.left)/r.width)*2-1;pointer3d.y=-((e.clientY-r.top)/r.height)*2+1;raycaster3d.setFromCamera(pointer3d,camera3d);const hit=raycaster3d.intersectObjects(tokenMeshes3d,true)[0];tokenMeshes3d.forEach(g=>g.scale.lerp(new THREE.Vector3(1,1,1),.15));if(hit){let g=hit.object;while(g.parent && !g.userData.index && g!==scene3d)g=g.parent;if(g.userData.index!==undefined)g.scale.lerp(new THREE.Vector3(1.22,1.22,1.22),.25);renderer3d.domElement.style.cursor="pointer";}else renderer3d.domElement.style.cursor=drag?"grabbing":"grab";}
function select3d(i){const d=currentTags[i];if(!d)return;$("#selectedWord").textContent=d.word;$("#selectedTag").textContent=d.tag;$("#selectedPosition").textContent=`Token position ${i+1} / ${currentTags.length}`;tokenMeshes3d.forEach((g,j)=>g.scale.setScalar(j===i?1.18:1));tokenMap.querySelectorAll(".token").forEach((el,j)=>el.classList.toggle("focused",j===i));}
function resize3D(){const host=$("#threeCanvas");if(!renderer3d)return;const w=Math.max(320,host.clientWidth),h=Math.max(320,host.clientHeight);renderer3d.setSize(w,h,false);camera3d.aspect=w/h;camera3d.updateProjectionMatrix();}
function animate3D(){requestAnimationFrame(animate3D);if(autoRotate&&!drag)targetRotY+=.0015;scene3d.rotation.y+=(targetRotY-scene3d.rotation.y)*.07;scene3d.rotation.x+=(targetRotX-scene3d.rotation.x)*.07;tokenMeshes3d.forEach((g,i)=>{const pulse=1+Math.sin(Date.now()*.0015+i)*.025;g.children[0].scale.setScalar(pulse);g.children[1].rotation.z+=.012;});renderer3d.render(scene3d,camera3d);}

const closeError = $("#closeError");
if(closeError) closeError.addEventListener("click",()=>$("#errorMessage")?.classList.remove("show"));
$("#analyzeBtn").addEventListener("click", analyze);
sentence.dispatchEvent(new Event("input"));
initMascot(); init3D(); loadStatus();
