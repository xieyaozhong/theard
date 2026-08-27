const $=selector=>document.querySelector(selector);
const LATEST='theard.passdraw.latest',STATE_KEYS=['theard.passdraw.v3','theard.passdraw.v2','theard.passdraw.v1'];

function readJson(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null}catch{return null}}
function normalize(entry){
  if(!entry)return null;const ticket=entry.ticket||{},session=entry.session||{},claim=entry.claim||{};
  const value={
    serial:ticket.serial||entry.serial||entry.code||'',verifyToken:ticket.verifyToken||entry.verifyToken||'',passType:ticket.passType||entry.passType||entry.name||'',rarity:ticket.rarity||entry.rarity||'',zone:ticket.zone||entry.zone||'',status:ticket.status||entry.status||'ACTIVE',
    eventName:session.eventName||entry.eventName||'',eventCode:session.eventCode||entry.eventCode||'',sessionCode:session.sessionCode||entry.sessionCode||'',date:session.date||entry.date||'',time:session.time||entry.sessionTime||'',venue:session.venue||entry.venue||'',
    attendeeName:entry.attendeeName||entry.attendee||claim.attendeeName||'',claimedAt:claim.claimedAt||entry.claimedAt||''
  };
  return value.serial&&value.verifyToken?value:null;
}
function latestClaim(){
  const direct=normalize(readJson(LATEST));if(direct)return direct;
  for(const key of STATE_KEYS){const saved=readJson(key),history=Array.isArray(saved?.history)?saved.history:[];for(let index=history.length-1;index>=0;index-=1){const claim=normalize(history[index]);if(claim)return claim}}
  return null;
}
function formatDateTime(date,time){if(!date)return'—';try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:time?'2-digit':undefined,minute:time?'2-digit':undefined,hour12:false}).format(new Date(`${date}T${time||'00:00'}:00`))}catch{return[date,time].filter(Boolean).join(' / ')}}
function formatInstant(value){if(!value)return'—';try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))}catch{return value}}
function renderVerifyLink(url){const link=$('#verifyLink');link.href=url;link.textContent='VERIFY STATUS ↗'}
function render(claim,live=false){
  const verifyUrl=new URL('verify.html',location.href);verifyUrl.hash=new URLSearchParams({serial:claim.serial,token:claim.verifyToken});
  $('#eventEyebrow').textContent=`${claim.eventCode||'THEARD'} / ${claim.sessionCode||'SESSION'} / VERIFIED`;
  $('#eventName').textContent=claim.eventName||claim.eventCode||'THEARD EVENT';$('#sessionMeta').textContent=[claim.sessionCode,claim.date,claim.time].filter(Boolean).join(' / ')||'—';
  $('#attendee').textContent=claim.attendeeName||'—';$('#tier').textContent=[claim.passType,claim.rarity].filter(Boolean).join(' / ')||'—';$('#ticketDate').textContent=formatDateTime(claim.date,claim.time);$('#venue').textContent=claim.venue||'—';
  $('#ticketStatus').textContent=`STATUS / ${claim.status||'ACTIVE'} / ${live?'LIVE':'CACHED'}`;$('#ticketId').textContent=claim.serial;$('#stubNo').textContent=claim.serial.match(/(\d+)$/)?.[1]||'—';$('#stubId').textContent=claim.serial;$('#claimTime').textContent=formatInstant(claim.claimedAt);renderVerifyLink(verifyUrl.href);
}

const claim=latestClaim();
if(!claim){location.replace('draw/')}
else{
  render(claim);
  (async()=>{try{const live=await window.TheardAPI.verifyTicket(claim.serial,claim.verifyToken);const session=live.session||{},ticket=live.ticket||{};Object.assign(claim,{status:live.status||claim.status,passType:ticket.passType||claim.passType,rarity:ticket.rarity||claim.rarity,zone:ticket.zone||claim.zone,eventName:session.eventName||claim.eventName,eventCode:session.eventCode||claim.eventCode,sessionCode:session.sessionCode||claim.sessionCode,date:session.date||claim.date,time:session.time||claim.time,venue:session.venue||claim.venue});render(claim,true);$('#ticketSync').textContent=`最新狀態：${live.status||'UNKNOWN'} / 已與共用票庫同步`}
  catch(error){$('#ticketSync').textContent=error?.code==='NOT_FOUND'?'驗證失敗：票券不存在或憑證不符':'目前離線：畫面為上次領票快照';$('#ticketStatus').textContent=`STATUS / ${error?.code==='NOT_FOUND'?'NOT FOUND':claim.status||'UNKNOWN'} / SNAPSHOT`}})();
}
$('#printBtn')?.addEventListener('click',()=>print());
