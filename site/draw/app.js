const $=(selector,parent=document)=>parent.querySelector(selector);
const STORAGE='theard.passdraw.v3',LATEST='theard.passdraw.latest',LEGACY=['theard.passdraw.v2','theard.passdraw.v1'];
const CHANNEL='theard-pass-sync';
const RARITIES=['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
const PASS_CATALOG={
  'GENERAL PASS':{rarity:'COMMON',zone:'G'},'DAY PASS':{rarity:'COMMON',zone:'D'},
  'EARLY ACCESS':{rarity:'UNCOMMON',zone:'E'},'EXPLORER PASS':{rarity:'UNCOMMON',zone:'X'},
  'CREATOR PASS':{rarity:'RARE',zone:'C'},'WORKSHOP PASS':{rarity:'RARE',zone:'W'},
  'PARTNER PASS':{rarity:'EPIC',zone:'P'},'BACKSTAGE PASS':{rarity:'EPIC',zone:'B'},
  'FOUNDER PASS':{rarity:'LEGENDARY',zone:'F'},'SECRET ACCESS':{rarity:'LEGENDARY',zone:'S'},
  'ZERO PASS':{rarity:'MYTHIC',zone:'Z'},'BLACK SIGNAL':{rarity:'MYTHIC',zone:'Q'}
};
const DISPLAY_PASSES=Object.keys(PASS_CATALOG);
const api=window.TheardAPI;
let state={history:[]},activeCode='',activeSession=null,codeClaimed=false,spinning=false,requesting=false,petEngine=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

const petsReady=import('./pets.js?v=4').then(module=>{petEngine=module.default||module;return petEngine}).catch(error=>{console.warn('Pixel companion module unavailable',error);return null});
function ensureCss(href){if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}}ensureCss('rarity.css?v=4');

const els={
  form:$('#inviteForm'),code:$('#inviteCode'),attendee:$('#attendeeName'),lookup:$('#lookupBtn'),feedback:$('#codeFeedback'),preview:$('#sessionPreview'),
  sessionEvent:$('#sessionEvent'),sessionEventCode:$('#sessionEventCode'),sessionCode:$('#sessionCodeValue'),sessionDateTime:$('#sessionDateTime'),sessionVenue:$('#sessionVenue'),sessionAvailable:$('#sessionAvailable'),sessionStatus:$('#sessionStatus'),sessionNote:$('#sessionNote'),
  changeCode:$('#changeCodeBtn'),changeCodeMachine:$('#changeCodeMachineBtn'),resetView:$('#resetViewBtn'),poolCount:$('#poolCount'),drawnCount:$('#drawnCount'),sessionStat:$('#sessionStat'),draw:$('#drawBtn'),
  reelWindow:$('#reelWindow'),reel:$('#reel'),ticketStage:$('#ticketStage'),ticket:$('#ticket'),ticketBrand:$('#ticketBrand'),ticketState:$('#ticketState'),ticketName:$('#ticketName'),ticketEvent:$('#ticketEvent'),ticketSession:$('#ticketSession'),ticketZone:$('#ticketZone'),ticketCode:$('#ticketCode'),stubNo:$('#stubNo'),ticketStubLabel:$('#ticketStubLabel'),
  history:$('#history'),message:$('#machineMessage'),status:$('#statusText'),flash:$('#flash'),machine:$('#machine'),hudEvent:$('#hudEvent')
};
let rarityBadge=null,rarityReadout=null;

function normalizeCode(value){return String(value||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,40)}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function pad(value){return String(value).padStart(2,'0')}
function randomIndex(max){if(max<=1)return 0;if(globalThis.crypto?.getRandomValues){const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]%max}return Math.floor(Math.random()*max)}
function serialNumber(serial){const match=String(serial||'').match(/(\d+)$/);return Number(match?.[1]||1)}
function sessionLabel(session){return [session?.sessionCode,session?.date,session?.time].filter(Boolean).join(' / ')||'—'}
function formatDateTime(date,time){if(!date)return'—';try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:time?'2-digit':undefined,minute:time?'2-digit':undefined,hour12:false}).format(new Date(`${date}T${time||'00:00'}:00`))}catch{return`${date}${time?` / ${time}`:''}`}}
function passMeta(passType,rarity){const name=String(passType||'GENERAL PASS').toUpperCase(),catalog=PASS_CATALOG[name]||PASS_CATALOG['GENERAL PASS'],normalized=String(rarity||catalog.rarity).toUpperCase();return{name,rarity:RARITIES.includes(normalized)?normalized:catalog.rarity,zone:catalog.zone}}
function safeString(value,max=160){return String(value??'').slice(0,max)}
function safePet(value){if(!value||typeof value!=='object'||!Number.isFinite(Number(value.seed)))return null;const number=(key,min,max)=>Math.max(min,Math.min(max,Number(value[key])||0));return{version:2,id:safeString(value.id,40),name:safeString(value.name,40),species:safeString(value.species,40),element:safeString(value.element,30),temperament:safeString(value.temperament,30),rarity:RARITIES.includes(String(value.rarity).toUpperCase())?String(value.rarity).toUpperCase():'COMMON',paletteIndex:number('paletteIndex',0,11),eye:number('eye',0,5),mark:number('mark',0,6),accessory:number('accessory',0,7),variant:number('variant',0,4),seed:Number(value.seed)}}
function normalizeHistoryEntry(value){if(!value||typeof value!=='object')return null;const ticket=value.ticket&&typeof value.ticket==='object'?value.ticket:{},session=value.session&&typeof value.session==='object'?value.session:{};const serial=safeString(ticket.serial||value.serial||value.code,80),verifyToken=safeString(ticket.verifyToken||value.verifyToken,128);if(!serial||!verifyToken)return null;const meta=passMeta(ticket.passType||value.passType||value.name,ticket.rarity||value.rarity);return{id:safeString(value.id,120),claimId:safeString(value.claimId,120),claimedAt:safeString(value.claimedAt,40),recovered:Boolean(value.recovered),attendeeName:safeString(value.attendeeName,60),name:meta.name,rarity:meta.rarity,code:serial,zone:safeString(ticket.zone||value.zone,30),time:safeString(value.time,20),pet:safePet(value.pet),sessionId:safeString(session.id||value.sessionId,100),ticketId:safeString(ticket.id||value.ticketId,100),serial,passType:meta.name,verifyToken,eventName:safeString(session.eventName||value.eventName,80),eventCode:safeString(session.eventCode||value.eventCode,20),sessionCode:safeString(session.sessionCode||value.sessionCode,20),date:safeString(session.date||value.date,12),sessionTime:safeString(session.time||value.sessionTime,8),venue:safeString(session.venue||value.venue,100),session:{id:safeString(session.id||value.sessionId,100),eventName:safeString(session.eventName||value.eventName,80),eventCode:safeString(session.eventCode||value.eventCode,20),sessionCode:safeString(session.sessionCode||value.sessionCode,20),date:safeString(session.date||value.date,12),time:safeString(session.time||value.sessionTime,8),venue:safeString(session.venue||value.venue,100),note:safeString(session.note,180),status:safeString(session.status,20)},ticket:{id:safeString(ticket.id||value.ticketId,100),serial,passType:meta.name,rarity:meta.rarity,zone:safeString(ticket.zone||value.zone,30),verifyToken,status:safeString(ticket.status||value.status||'ACTIVE',20),attendeeName:safeString(ticket.attendeeName||value.attendeeName,60)}}}

function ensureRarityUI(){
  if(rarityBadge)return;const title=$('.ticket-title');rarityBadge=document.createElement('span');rarityBadge.className='pass-rarity-badge';rarityBadge.textContent='VERIFIED / ENTRY';title?.appendChild(rarityBadge);
  rarityReadout=document.createElement('div');rarityReadout.className='rarity-readout';rarityReadout.innerHTML='<div class="c"><span>COMMON</span><b>STANDARD</b></div><div class="u"><span>UNCOMMON</span><b>ACCESS+</b></div><div class="r"><span>RARE</span><b>CREATOR</b></div><div class="e"><span>EPIC</span><b>BACKSTAGE</b></div><div class="l"><span>LEGENDARY</span><b>FOUNDER</b></div><div class="m"><span>MYTHIC</span><b>ZERO</b></div>';$('.machine-top')?.after(rarityReadout);
}

function loadState(){
  let saved=null;for(const key of [STORAGE,...LEGACY]){try{const raw=localStorage.getItem(key);if(raw){saved=JSON.parse(raw);break}}catch{}}
  state.history=Array.isArray(saved?.history)?saved.history.map(normalizeHistoryEntry).filter(Boolean).slice(-50):[];
}
function saveState(){try{localStorage.setItem(STORAGE,JSON.stringify({history:state.history}))}catch{}}
function publishLatest(entry){try{localStorage.setItem(LATEST,JSON.stringify(entry))}catch{}try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage({type:'PASS_DRAWN',entry});channel.close()}catch{}}

function setFeedback(message,error=false){els.feedback.textContent=message;els.feedback.classList.toggle('is-error',error)}
function setRequesting(value){requesting=value;renderControls()}
function renderControls(){const verified=Boolean(activeCode&&activeSession),busy=spinning||requesting;els.lookup.disabled=busy;els.code.disabled=busy;els.attendee.disabled=busy;els.form.setAttribute('aria-busy',String(busy));els.draw.disabled=busy||!verified;els.changeCode.disabled=busy||!verified;els.changeCodeMachine.disabled=busy||!verified;els.resetView.disabled=busy||!verified;els.draw.querySelector('.btn-sub').textContent=verified?(codeClaimed?'RECOVER VERIFIED PASS':'PRESS / ENTER'):'VERIFY CODE FIRST'}

function renderSession(session){
  activeSession=session;els.preview.hidden=false;els.sessionEvent.textContent=session.eventName||session.eventCode||'THEARD EVENT';els.sessionEventCode.textContent=session.eventCode||'—';els.sessionCode.textContent=session.sessionCode||'—';els.sessionDateTime.textContent=formatDateTime(session.date,session.time);els.sessionVenue.textContent=session.venue||'—';els.sessionAvailable.textContent=String(session.availableCount??'—');els.sessionStatus.textContent=session.status||'OPEN';els.sessionNote.textContent=session.note||'抽取碼已驗證，可前往機台揭曉票券。';els.poolCount.textContent=session.availableCount==null?'—':pad(session.availableCount);els.sessionStat.textContent=session.sessionCode||'—';els.hudEvent.textContent=session.eventName||session.eventCode||'THEARD LIVE';els.message.textContent='SESSION VERIFIED / READY TO DRAW';els.status.textContent='CODE VERIFIED';renderControls();
}

async function lookup(event){
  event?.preventDefault();if(requesting||spinning)return;const raw=els.code.value,code=normalizeCode(raw);if(code.length<12){setFeedback('請輸入完整抽取碼。',true);els.code.focus();return}
  if(!api?.lookupDrawCode){setFeedback('票券資料服務尚未載入，請重新整理頁面。',true);return}
  setRequesting(true);setFeedback('正在確認抽取碼與活動場次…');els.status.textContent='VERIFYING CODE';
  try{
    const result=await api.lookupDrawCode(code);if(!result?.session)throw new Error('找不到抽取碼對應的活動場次。');activeCode=code;codeClaimed=Boolean(result.code?.claimed||result.claimed);renderSession(result.session);setFeedback(codeClaimed?'此抽取碼已領取，可恢復原票券。':'抽取碼有效，活動與場次已鎖定。');
  }catch(error){activeCode='';activeSession=null;codeClaimed=false;els.preview.hidden=true;els.status.textContent='CODE REJECTED';els.message.textContent='INVALID / EXPIRED / CLOSED';setFeedback(error.message||'抽取碼無效、已停用或已過期。',true)}
  finally{setRequesting(false)}
}

function reelRows(center='',rarity=''){
  const values=[];for(let index=0;index<5;index+=1){const name=index===2?center:DISPLAY_PASSES[randomIndex(DISPLAY_PASSES.length)];values.push({name,rarity:index===2?rarity:''})}
  els.reel.innerHTML=values.map((pass,index)=>`<div class="reel-row ${index===2?'active':'ghost'}">${escapeHtml(pass.name)}${pass.rarity?` <small>/ ${escapeHtml(pass.rarity)}</small>`:''}</div>`).join('');
}

let audioContext=null;
function tone(freq=440,duration=.045,type='square',gain=.018,delay=0){if(reducedMotion)return;try{audioContext||=new(window.AudioContext||window.webkitAudioContext)();const oscillator=audioContext.createOscillator(),volume=audioContext.createGain();oscillator.type=type;oscillator.frequency.value=freq;volume.gain.setValueAtTime(0,audioContext.currentTime+delay);volume.gain.linearRampToValueAtTime(gain,audioContext.currentTime+delay+.005);volume.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+delay+duration);oscillator.connect(volume);volume.connect(audioContext.destination);oscillator.start(audioContext.currentTime+delay);oscillator.stop(audioContext.currentTime+delay+duration+.01)}catch{}}
function printSound(){tone(720,.07,'square',.02);tone(910,.06,'square',.014,.08);tone(1220,.09,'square',.012,.15)}
function hatchSound(){tone(360,.08,'square',.012);tone(540,.07,'square',.012,.09);tone(820,.09,'triangle',.013,.18);tone(1180,.12,'triangle',.01,.29)}
function raritySound(rarity){const map={COMMON:[520],UNCOMMON:[620,820],RARE:[700,940,1180],EPIC:[520,760,1050,1380],LEGENDARY:[440,660,880,1320,1760],MYTHIC:[330,495,742,1110,1665,2220]};(map[rarity]||map.COMMON).forEach((frequency,index)=>tone(frequency,.09,index%2?'triangle':'square',.012,index*.07))}

function applyRarity(pass){ensureRarityUI();els.ticket.className='ticket';els.ticket.classList.add(`rarity-${pass.rarity.toLowerCase()}`);rarityBadge.textContent=`${pass.rarity} / VERIFIED`;[...els.machine.classList].filter(className=>className.startsWith('rarity-hit-')).forEach(className=>els.machine.classList.remove(className));if(pass.rarity!=='COMMON')els.machine.classList.add(`rarity-hit-${pass.rarity.toLowerCase()}`)}

async function animateResult(result,submittedAttendee=''){
  const session=result.session||activeSession,ticket=result.ticket,claim=result.claim||{};const pass=passMeta(ticket.passType,ticket.rarity);const number=serialNumber(ticket.serial),zone=ticket.zone||`${pass.zone}-${String(number).padStart(2,'0')}`;
  els.ticketStage.classList.remove('open');els.ticket.setAttribute('aria-hidden','true');els.reelWindow.classList.add('spinning');els.reelWindow.setAttribute('aria-busy','true');els.message.textContent='SERVER RESULT RECEIVED / REVEALING…';els.status.textContent='DRAWING';tone(180,.08,'square',.014);
  const duration=reducedMotion?0:1500,start=performance.now();let last=0;if(duration)await new Promise(resolve=>{function frame(now){const progress=Math.min((now-start)/duration,1),gap=40+Math.pow(progress,2.5)*155;if(now-last>gap){last=now;reelRows(DISPLAY_PASSES[randomIndex(DISPLAY_PASSES.length)]);tone(210+Math.random()*170,.028,'square',.006)}progress<1?requestAnimationFrame(frame):resolve()}requestAnimationFrame(frame)});
  const pets=await petsReady,pet=pets?.generatePet(ticket.serial,pass.name,number)||null;const claimedAt=claim.claimedAt||new Date().toISOString();
  const attendeeName=ticket.attendeeName||claim.attendeeName||submittedAttendee;const entry={id:claim.id||`${session.id}:${ticket.id}`,claimId:claim.id||'',claimedAt,recovered:Boolean(claim.recovered),attendeeName,name:pass.name,rarity:pass.rarity,code:ticket.serial,zone,time:new Date(claimedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}),pet,sessionId:session.id,ticketId:ticket.id,serial:ticket.serial,passType:pass.name,verifyToken:ticket.verifyToken,eventName:session.eventName,eventCode:session.eventCode,sessionCode:session.sessionCode,date:session.date,sessionTime:session.time,venue:session.venue,session:{...session},ticket:{...ticket,attendeeName,passType:pass.name,rarity:pass.rarity,zone}};
  const existing=state.history.findIndex(item=>(entry.claimId&&item.claimId===entry.claimId)||(item.sessionId===entry.sessionId&&item.ticketId===entry.ticketId));if(existing>=0)state.history.splice(existing,1);state.history.push(entry);state.history=state.history.slice(-50);saveState();publishLatest(entry);
  reelRows(pass.name,pass.rarity);els.reelWindow.classList.remove('spinning');els.reelWindow.setAttribute('aria-busy','false');els.ticketBrand.textContent=session.eventName||session.eventCode||'THEARD EVENT';els.ticketState.textContent=ticket.status||'ACTIVE';els.ticketName.textContent=pass.name;els.ticketEvent.textContent=session.eventCode||'—';els.ticketSession.textContent=sessionLabel(session);els.ticketZone.textContent=zone;els.ticketCode.textContent=ticket.serial;els.stubNo.textContent=String(number).padStart(3,'0');els.ticketStubLabel.textContent='PASS / VERIFIED';applyRarity(pass);renderSession(session);renderHistory();els.drawnCount.textContent=pad(state.history.length);
  els.message.textContent=pet?`${pass.rarity} PASS / HATCHING COMPANION`:`${pass.rarity} PASS / PRINTING`;els.flash.classList.remove('fire');void els.flash.offsetWidth;els.flash.classList.add('fire');printSound();raritySound(pass.rarity);if(pet&&pets)setTimeout(()=>{pets.revealPet(pet,{animate:true});hatchSound()},110);
  setTimeout(()=>{els.ticketStage.classList.add('open');els.ticket.setAttribute('aria-hidden','false');els.message.textContent=claim.recovered?'VERIFIED PASS RECOVERED':`${pass.rarity} PASS BONDED / TAKE YOUR TICKET`;els.status.textContent=claim.recovered?'PASS RECOVERED':'PASS CLAIMED'},190);
}

async function draw(){
  if(spinning||requesting||!activeCode||!activeSession)return;const submittedAttendee=els.attendee.value.trim();spinning=true;renderControls();els.status.textContent='CLAIMING PASS';els.message.textContent='CONTACTING VERIFIED TICKET LEDGER…';
  try{const result=await api.claimDrawCode(activeCode,{attendeeName:submittedAttendee});if(!result?.ticket||!result?.session)throw new Error('票券資料不完整，請重新輸入抽取碼。');codeClaimed=true;await animateResult(result,submittedAttendee);setFeedback(result.claim?.recovered?'已恢復這組抽取碼原本領取的票券。':'票券已領取，後台同步完成。')}
  catch(error){els.status.textContent='CLAIM FAILED';els.message.textContent='NO TICKET WAS CHANGED';setFeedback(error.message||'目前無法領取票券，請稍後再試。',true)}
  finally{setTimeout(()=>{spinning=false;renderControls()},1050)}
}

function renderHistory(){
  if(!state.history.length){els.history.innerHTML='<div class="history-empty">NO VERIFIED PASSES / ENTER YOUR FIRST DRAW CODE</div>';return}
  els.history.innerHTML=state.history.slice().reverse().map((entry,index)=>{const rarity=RARITIES.includes(entry.rarity)?entry.rarity:'COMMON';return`<div class="history-item"><span>${String(state.history.length-index).padStart(2,'0')}</span><b>${escapeHtml(entry.name||entry.passType)} <em class="rarity-history ${rarity.toLowerCase()}">${escapeHtml(rarity)}</em><small class="pet-history">${escapeHtml(entry.eventName||entry.eventCode||'EVENT')} / ${escapeHtml(entry.sessionCode||'—')}${entry.pet?` / PET ${escapeHtml(entry.pet.name)}`:''}</small></b><code>${escapeHtml(entry.serial||entry.code)}</code><span>${escapeHtml(entry.time||'—')}</span></div>`}).join('');
}

function resetView(){els.ticketStage.classList.remove('open');els.ticket.setAttribute('aria-hidden','true');reelRows('READY TO REVEAL');els.message.textContent='SESSION VERIFIED / READY TO DRAW';els.status.textContent='CODE VERIFIED';petEngine?.hidePet?.()}
function changeCode(){activeCode='';activeSession=null;codeClaimed=false;els.preview.hidden=true;els.code.value='';els.poolCount.textContent='—';els.sessionStat.textContent='—';els.hudEvent.textContent='THEARD LIVE';resetView();els.message.textContent='VERIFY INVITATION / RECEIVE ACCESS';els.status.textContent='ENTER DRAW CODE';setFeedback('輸入另一組抽取碼，確認新的活動與場次。');const url=new URL(location.href);url.searchParams.delete('code');history.replaceState(null,'',url);renderControls();els.code.focus()}

els.form.addEventListener('submit',lookup);els.code.addEventListener('input',()=>{els.code.value=els.code.value.toUpperCase();if(activeCode&&normalizeCode(els.code.value)!==activeCode){activeCode='';activeSession=null;codeClaimed=false;els.preview.hidden=true;renderControls()}});els.draw.addEventListener('click',draw);els.changeCode.addEventListener('click',changeCode);els.changeCodeMachine.addEventListener('click',changeCode);els.resetView.addEventListener('click',resetView);
addEventListener('keydown',event=>{if((event.key==='Enter'||event.code==='Space')&&activeSession&&!['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement?.tagName)){event.preventDefault();draw()}});
function updateClock(){const now=new Date();$('#clock').textContent=[now.getHours(),now.getMinutes(),now.getSeconds()].map(value=>String(value).padStart(2,'0')).join(':')}setInterval(updateClock,1000);updateClock();

async function boot(){loadState();ensureRarityUI();const pets=await petsReady;if(pets){try{if(pets.retrofit(state.history))saveState();pets.bootPet(state.history)}catch(error){console.warn('Stored companion data was reset',error);state.history=state.history.map(entry=>({...entry,pet:null}));saveState()}}els.drawnCount.textContent=pad(state.history.length);renderHistory();renderControls();const url=new URL(location.href),code=url.searchParams.get('code');if(code){url.searchParams.delete('code');history.replaceState(null,'',url);els.code.value=code.toUpperCase();lookup()}else els.code.focus()}
boot();
