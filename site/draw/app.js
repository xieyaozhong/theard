const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const STORAGE='theard.passdraw.v2';
const LEGACY_STORAGE='theard.passdraw.v1';
const balanced=['GENERAL PASS','GENERAL PASS','GENERAL PASS','GENERAL PASS','GENERAL PASS','GENERAL PASS','EARLY ACCESS','EARLY ACCESS','EARLY ACCESS','CREATOR PASS','CREATOR PASS','PARTNER PASS'];
const rare=['GENERAL PASS','GENERAL PASS','GENERAL PASS','GENERAL PASS','GENERAL PASS','EARLY ACCESS','EARLY ACCESS','EARLY ACCESS','CREATOR PASS','CREATOR PASS','PARTNER PASS','SECRET ACCESS'];
let state={original:[...balanced],remaining:[...balanced],history:[]};
let spinning=false;
let petEngine=null;
const petsReady=import('./pets.js?v=2').then(m=>{petEngine=m.default||m;return petEngine}).catch(err=>{console.warn('Pixel companion module unavailable',err);return null});

const poolCount=$('#poolCount'),drawnCount=$('#drawnCount'),drawBtn=$('#drawBtn'),reelWindow=$('#reelWindow'),reel=$('#reel'),ticketStage=$('#ticketStage'),ticket=$('#ticket'),ticketName=$('#ticketName'),ticketCode=$('#ticketCode'),ticketZone=$('#ticketZone'),stubNo=$('#stubNo'),historyEl=$('#history'),machineMessage=$('#machineMessage'),statusText=$('#statusText'),flash=$('#flash');
const configDialog=$('#configDialog'),configBtn=$('#configBtn'),resetBtn=$('#resetBtn'),poolInput=$('#poolInput'),savePoolBtn=$('#savePoolBtn');

async function load(){
  try{
    const raw=localStorage.getItem(STORAGE)||localStorage.getItem(LEGACY_STORAGE);
    const saved=raw?JSON.parse(raw):null;
    if(saved&&Array.isArray(saved.original)&&Array.isArray(saved.remaining)&&Array.isArray(saved.history))state=saved;
  }catch{}
  const pets=await petsReady;
  if(pets){if(pets.retrofit(state.history))save();pets.bootPet(state.history)}
  render();
}
function save(){localStorage.setItem(STORAGE,JSON.stringify(state))}
function pad(n){return String(n).padStart(2,'0')}
function randIndex(max){if(max<=1)return 0;if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0]%max}return Math.floor(Math.random()*max)}
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<6;i++)out+=chars[randIndex(chars.length)];return `THD-001-${out}`}
function zoneFor(name,index){const map={'GENERAL PASS':'G','EARLY ACCESS':'E','CREATOR PASS':'C','PARTNER PASS':'P','SECRET ACCESS':'X'};const key=map[name]||name.replace(/[^A-Z0-9]/gi,'').slice(0,1).toUpperCase()||'A';return `${key}-${String(index).padStart(2,'0')}`}

function render(){poolCount.textContent=pad(state.remaining.length);drawnCount.textContent=pad(state.history.length);drawBtn.disabled=spinning||state.remaining.length===0;statusText.textContent=state.remaining.length?'SYSTEM READY':'POOL EMPTY';machineMessage.textContent=state.remaining.length?'INSERT INTENTION / RECEIVE ACCESS':'POOL EMPTY / EDIT OR RESET';renderHistory()}
function renderHistory(){if(!state.history.length){historyEl.innerHTML='<div class="history-empty">NO ENTRY RECORDS / WAITING FOR FIRST DRAW</div>';return}historyEl.innerHTML=state.history.slice().reverse().map((item,i)=>`<div class="history-item"><span>${String(state.history.length-i).padStart(2,'0')}</span><b>${escapeHtml(item.name)}${item.pet?`<small class="pet-history">PET / ${escapeHtml(item.pet.name)} · ${escapeHtml(item.pet.species)}</small>`:''}</b><code>${escapeHtml(item.code)}</code><span>${escapeHtml(item.time)}</span></div>`).join('')}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function reelRows(center){const source=state.remaining.length?state.remaining:state.original;const values=[];for(let i=0;i<5;i++)values.push(i===2?center:source[randIndex(source.length)]||'THEARD LIVE');reel.innerHTML=values.map((v,i)=>`<div class="reel-row ${i===2?'active':'ghost'}">${escapeHtml(v)}</div>`).join('')}

let audioCtx=null;
function tone(freq=440,duration=.045,type='square',gain=.018,delay=0){try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),g=audioCtx.createGain();osc.type=type;osc.frequency.value=freq;g.gain.setValueAtTime(0,audioCtx.currentTime+delay);g.gain.linearRampToValueAtTime(gain,audioCtx.currentTime+delay+.005);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+delay+duration);osc.connect(g);g.connect(audioCtx.destination);osc.start(audioCtx.currentTime+delay);osc.stop(audioCtx.currentTime+delay+duration+.01)}catch{}}
function printSound(){tone(720,.07,'square',.02);tone(910,.06,'square',.014,.08);tone(1220,.09,'square',.012,.15);tone(1460,.08,'triangle',.009,.24)}
function hatchSound(){tone(360,.08,'square',.012);tone(540,.07,'square',.012,.09);tone(820,.09,'triangle',.013,.18);tone(1180,.12,'triangle',.01,.29)}

async function draw(){
  if(spinning||!state.remaining.length)return;
  spinning=true;render();ticketStage.classList.remove('open');ticket.setAttribute('aria-hidden','true');reelWindow.classList.add('spinning');machineMessage.textContent='RANDOMIZING ACCESS CLASS...';statusText.textContent='DRAWING';tone(180,.08,'square',.014);
  const duration=1450,start=performance.now();let last=0;
  await new Promise(resolve=>{function frame(now){const elapsed=now-start,progress=Math.min(elapsed/duration,1),gap=42+Math.pow(progress,2.5)*150;if(now-last>gap){last=now;const label=state.remaining[randIndex(state.remaining.length)];reelRows(label);tone(210+Math.random()*150,.028,'square',.006)}if(progress<1)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});

  const index=randIndex(state.remaining.length),name=state.remaining.splice(index,1)[0],serial=state.history.length+1,id=code(),zone=zoneFor(name,serial),time=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
  const pets=await petsReady;
  const pet=pets?.generatePet(id,name,serial)||null;
  const entry={name,code:id,zone,time,pet};state.history.push(entry);save();

  reelRows(name);reelWindow.classList.remove('spinning');ticketName.textContent=name;ticketCode.textContent=id;ticketZone.textContent=zone;stubNo.textContent=String(serial).padStart(3,'0');machineMessage.textContent=pet?'PASS AUTHORIZED / HATCHING COMPANION':'PASS AUTHORIZED / PRINTING';flash.classList.remove('fire');void flash.offsetWidth;flash.classList.add('fire');printSound();
  if(pet&&pets){setTimeout(()=>{pets.revealPet(pet,{animate:true});hatchSound()},90)}
  setTimeout(()=>{ticketStage.classList.add('open');ticket.setAttribute('aria-hidden','false');machineMessage.textContent=pet?'TAKE YOUR PASS / MEET YOUR COMPANION':'TAKE YOUR PASS / GOOD LUCK';statusText.textContent=pet?'PET BONDED':'PASS PRINTED'},180);
  setTimeout(()=>{spinning=false;render()},950);
}

drawBtn.addEventListener('click',draw);
addEventListener('keydown',e=>{if((e.key==='Enter'||e.code==='Space')&&!configDialog.open&&!['TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)){e.preventDefault();draw()}});

configBtn.addEventListener('click',()=>{poolInput.value=state.original.join('\n');configDialog.showModal();tone(520,.04,'square',.01)});
$$('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{poolInput.value=(btn.dataset.preset==='rare'?rare:balanced).join('\n');tone(620,.04,'square',.01)}));
savePoolBtn.addEventListener('click',async e=>{const entries=poolInput.value.split(/\r?\n/).map(v=>v.trim().toUpperCase()).filter(Boolean).slice(0,100);if(!entries.length){e.preventDefault();poolInput.focus();return}state={original:[...entries],remaining:[...entries],history:[]};save();ticketStage.classList.remove('open');reelRows('POOL UPDATED');render();(await petsReady)?.hidePet();tone(760,.05,'square',.015);tone(1020,.06,'square',.01,.07)});
resetBtn.addEventListener('click',async()=>{if(!confirm('重置抽取紀錄並把所有票放回票池？'))return;state.remaining=[...state.original];state.history=[];save();ticketStage.classList.remove('open');reelRows('SYSTEM RESET');render();(await petsReady)?.hidePet();tone(280,.06,'square',.012);tone(190,.08,'square',.01,.08)});

function updateClock(){const now=new Date();$('#clock').textContent=[now.getHours(),now.getMinutes(),now.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':')}
setInterval(updateClock,1000);updateClock();
load();