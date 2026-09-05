const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];
const api=window.TheardAPI;

let state={sessions:[]};
let selectedSessionId=null;
let visibleTickets=[];
let latestBatch=null;
let authenticated=false;
let syncing=false;
let pollTimer=null;
let authEpoch=0;
let pendingIssueId=null;
let activeSyncPromise=null;
let editingSession=null;
let deletingSession=null;
let dialogReturnFocus=null;
const pendingSessionIds=new Set();

const els={
  authGate:$('#authGate'),authForm:$('#authForm'),adminKey:$('#adminKey'),authSubmit:$('#authSubmit'),authError:$('#authError'),
  shell:$('#adminShell'),connection:$('#connectionStatus span'),logout:$('#logoutBtn'),syncedAt:$('#syncedAt'),
  form:$('#sessionForm'),formError:$('#formError'),issueBtn:$('#issueBtn'),eventName:$('#eventName'),eventCode:$('#eventCode'),sessionCode:$('#sessionCode'),
  sessionDate:$('#sessionDate'),sessionTime:$('#sessionTime'),venue:$('#venue'),passType:$('#passType'),quantity:$('#quantity'),startNumber:$('#startNumber'),
  expires:$('#drawExpiresAt'),note:$('#note'),clearForm:$('#clearForm'),sessionList:$('#sessionList'),ledger:$('#ticketLedger'),search:$('#searchInput'),
  kpiSessions:$('#kpiSessions'),kpiIssued:$('#kpiIssued'),kpiClaimed:$('#kpiClaimed'),kpiAvailable:$('#kpiAvailable'),
  syncNow:$('#syncNow'),exportAll:$('#exportAll'),exportVisible:$('#exportVisible'),detail:$('#detailDialog'),detailBody:$('#detailBody'),closeDetail:$('#closeDialog'),
  batch:$('#batchDialog'),batchBody:$('#batchBody'),closeBatch:$('#closeBatch'),copyBatch:$('#copyBatch'),downloadBatch:$('#downloadBatch'),toast:$('#toast'),
  editDialog:$('#sessionEditDialog'),editForm:$('#sessionEditForm'),closeEdit:$('#closeSessionEdit'),cancelEdit:$('#cancelSessionEdit'),saveEdit:$('#saveSessionEdit'),editError:$('#sessionEditError'),
  editEventName:$('#editEventName'),editEventCode:$('#editEventCode'),editSessionCode:$('#editSessionCode'),editDate:$('#editSessionDate'),editTime:$('#editSessionTime'),editVenue:$('#editVenue'),editNote:$('#editNote'),
  deleteDialog:$('#sessionDeleteDialog'),deleteForm:$('#sessionDeleteForm'),closeDelete:$('#closeSessionDelete'),cancelDelete:$('#cancelSessionDelete'),confirmDelete:$('#confirmSessionDelete'),deleteError:$('#sessionDeleteError'),
  deleteSummary:$('#sessionDeleteSummary'),deletePhrase:$('#sessionDeletePhrase'),deleteConfirm:$('#sessionDeleteConfirm')
};

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function sanitizeCode(value,max=12){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,max)}
function compactDate(value){return String(value||'').replaceAll('-','').slice(2)}
function formatDate(value){if(!value)return'—';try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(`${value}T00:00:00`))}catch{return value}}
function formatDateTime(value){if(!value)return'—';try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))}catch{return value}}
function showToast(message,isError=false){els.toast.textContent=message;els.toast.classList.toggle('is-error',isError);els.toast.classList.add('show');setTimeout(()=>els.toast.classList.remove('show'),2200)}
function setConnection(label,tone=''){els.connection.textContent=label;els.connection.parentElement.dataset.tone=tone}
function currentSession(){return state.sessions.find(session=>session.id===selectedSessionId)||null}
function allTickets(){return state.sessions.flatMap(session=>session.tickets.map(ticket=>({...ticket,session})))}
function setBusy(element,busy){if(!element)return;element.disabled=busy;element.setAttribute('aria-busy',String(busy))}
function localDateValue(value=new Date()){return`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`}
function isExpired(ticket){return Boolean(ticket.expiresAt&&new Date(ticket.expiresAt).valueOf()<=Date.now())}
function isAvailable(session,ticket){return session?.status==='OPEN'&&ticket.status==='ACTIVE'&&!ticket.claimedAt&&!isExpired(ticket)}
function makeRequestId(){return globalThis.crypto?.randomUUID?.()||`issue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`}

async function copyText(value){
  try{await navigator.clipboard.writeText(String(value));return true}catch{}
  const area=document.createElement('textarea');area.value=String(value);area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();
  let copied=false;try{copied=document.execCommand('copy')}catch{}area.remove();return copied;
}

function lockAdmin(message=''){
  authEpoch+=1;authenticated=false;syncing=false;stopPolling();state={sessions:[]};selectedSessionId=null;latestBatch=null;pendingIssueId=null;
  editingSession=null;deletingSession=null;dialogReturnFocus=null;pendingSessionIds.clear();
  api?.clearAdminKey();els.adminKey.value='';els.detailBody.textContent='';els.batchBody.textContent='';els.editError.textContent='';els.deleteError.textContent='';els.deleteConfirm.value='';if(els.detail.open)els.detail.close();if(els.batch.open)els.batch.close();if(els.editDialog.open)els.editDialog.close();if(els.deleteDialog.open)els.deleteDialog.close();els.sessionList.innerHTML='';els.ledger.innerHTML='';
  setBusy(els.authSubmit,false);setBusy(els.syncNow,false);setBusy(els.issueBtn,false);els.shell.hidden=true;els.authGate.hidden=false;els.authError.textContent=message;setConnection('LOCKED','locked');
  setTimeout(()=>els.adminKey.focus(),50);
}

function unlockAdmin(data){
  authenticated=true;els.authGate.hidden=true;els.shell.hidden=false;els.authError.textContent='';state=data&&Array.isArray(data.sessions)?data:{sessions:[]};
  if(!selectedSessionId||!state.sessions.some(session=>session.id===selectedSessionId))selectedSessionId=state.sessions[0]?.id||null;
  render();setConnection('SECURE SYNC','online');startPolling();
}

async function authenticate(key){
  if(!api){els.authError.textContent='票券 API 尚未載入，請重新整理頁面。';return}
  const epoch=++authEpoch;
  setBusy(els.authSubmit,true);els.authError.textContent='';
  try{const data=await api.connectAdmin(key);if(epoch!==authEpoch)return;unlockAdmin(data);showToast('ADMIN CONNECTED')}
  catch(error){if(epoch===authEpoch)lockAdmin(error.message||'後台金鑰不正確。')}
  finally{if(epoch===authEpoch||!authenticated)setBusy(els.authSubmit,false)}
}

function syncState({quiet=false,force=false}={}){
  if(!authenticated||(document.visibilityState==='hidden'&&!force))return Promise.resolve(null);
  if(activeSyncPromise)return activeSyncPromise;
  const epoch=authEpoch;
  syncing=true;setConnection('SYNCING…','syncing');setBusy(els.syncNow,true);
  const task=(async()=>{
    try{
      const fresh=await api.getAdminState();if(epoch!==authEpoch||!authenticated)return null;state=fresh&&Array.isArray(fresh.sessions)?fresh:{sessions:[]};
      if(!selectedSessionId||!state.sessions.some(session=>session.id===selectedSessionId))selectedSessionId=state.sessions[0]?.id||null;
      render();els.syncedAt.textContent=`SYNCED / ${formatDateTime(fresh.syncedAt)}`;setConnection('SECURE SYNC','online');if(!quiet)showToast('DATA SYNCED');return fresh;
    }catch(error){
      if(epoch!==authEpoch||!authenticated)return null;setConnection('SYNC ERROR','error');if(error.status===401)lockAdmin(error.message);else if(!quiet)showToast(error.message||'同步失敗',true);return null;
    }finally{if(activeSyncPromise===task)activeSyncPromise=null;if(epoch===authEpoch){syncing=false;setBusy(els.syncNow,false)}}
  })();
  activeSyncPromise=task;return task;
}

async function refreshAfterMutation(epoch){const prior=activeSyncPromise;if(prior)await prior;if(epoch!==authEpoch||!authenticated)return null;return syncState({quiet:true,force:true})}

function startPolling(){stopPolling();pollTimer=setInterval(()=>syncState({quiet:true}),5000)}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}

function render(){
  const sessions=state.sessions||[];const tickets=allTickets();
  els.kpiSessions.textContent=String(sessions.length).padStart(2,'0');
  els.kpiIssued.textContent=String(tickets.length).padStart(3,'0');
  els.kpiClaimed.textContent=String(tickets.filter(ticket=>ticket.claimedAt).length).padStart(3,'0');
  els.kpiAvailable.textContent=String(sessions.reduce((sum,session)=>sum+Number(session.totals?.available||0),0)).padStart(3,'0');
  renderSessions();renderLedger();
}

function renderSessions(){
  if(!state.sessions.length){els.sessionList.innerHTML='<div class="adm-empty">NO SESSION ISSUED / CREATE THE FIRST BATCH</div>';return}
  els.sessionList.innerHTML=state.sessions.map(session=>{const deleteBlocked=Number(session.totals?.claimed||0)>0||Number(session.totals?.used||0)>0,pending=pendingSessionIds.has(session.id);return`<article class="adm-session ${session.id===selectedSessionId?'is-active':''}" data-id="${esc(session.id)}">
    <button class="adm-session__main" data-act="select" type="button" aria-pressed="${session.id===selectedSessionId?'true':'false'}" style="width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:0;font:inherit;cursor:pointer">
      <div class="adm-session__date">${esc(compactDate(session.date))}<br>${esc(session.time||'—')}</div>
      <div class="adm-session__title"><b>${esc(session.eventName)}</b><span>${esc(session.eventCode)} / SESSION ${esc(session.sessionCode)} / ${esc(session.venue||'VENUE TBA')}</span></div>
      <div class="adm-session__meta"><b>${session.totals?.claimed||0}/${session.totals?.issued||0}</b><span>${session.totals?.available||0} AVAILABLE</span></div>
    </button>
    <div class="adm-session__foot"><span>${esc(formatDate(session.date))} / ${esc(session.status)}${deleteBlocked?` / <i class="adm-session__lock">${session.totals.claimed} CLAIMED · DELETE LOCKED</i>`:''}</span><div class="adm-session__actions"><button type="button" data-act="edit-session" aria-label="編輯 ${esc(session.eventName)} 場次 ${esc(session.sessionCode)}" ${pending?'disabled':''}>EDIT</button><button type="button" data-act="toggle-session" aria-label="${session.status==='OPEN'?'關閉':'開啟'} ${esc(session.eventName)} 場次 ${esc(session.sessionCode)} 抽取" ${pending?'disabled':''}>${session.status==='OPEN'?'CLOSE DRAW':'OPEN DRAW'}</button><button class="is-danger" type="button" data-act="delete-session" aria-label="刪除 ${esc(session.eventName)} 場次 ${esc(session.sessionCode)}" title="${deleteBlocked?'已有領票紀錄，請改為關閉場次':'刪除場次與停用未領取碼'}" ${pending||deleteBlocked?'disabled':''}>DELETE</button></div></div>
  </article>`}).join('');
}

function renderLedger(){
  const session=currentSession();
  if(!session){visibleTickets=[];els.ledger.innerHTML='<div class="adm-empty">SELECT OR ISSUE A SESSION</div>';return}
  const query=els.search.value.trim().toUpperCase();
  visibleTickets=session.tickets.filter(ticket=>!query||[ticket.serial,ticket.drawCode,ticket.verifyToken,ticket.passType,ticket.rarity,ticket.status,ticket.batchId,ticket.attendeeName,ticket.claimId].some(value=>String(value||'').toUpperCase().includes(query)));
  if(!visibleTickets.length){els.ledger.innerHTML='<div class="adm-empty">NO MATCHING TICKETS</div>';return}
  els.ledger.innerHTML=visibleTickets.map(ticket=>{const available=isAvailable(session,ticket),claimState=ticket.claimedAt?'CLAIMED':isExpired(ticket)?'EXPIRED':session.status!=='OPEN'?'PAUSED':ticket.status==='ACTIVE'?'AVAILABLE':ticket.status;return`<div class="adm-ticket-row" data-id="${esc(ticket.id)}">
    <span class="adm-status ${ticket.status.toLowerCase()}">${esc(ticket.status)}</span>
    <span class="adm-ticket-id"><code>${esc(ticket.serial)}</code><small>${esc(ticket.passType)} / ${esc(ticket.rarity)} / ${esc(ticket.zone)}</small></span>
    <button class="adm-code-copy" type="button" data-act="copy" title="複製抽取碼"><code>${esc(ticket.drawCode)}</code></button>
    <span class="adm-claim ${ticket.claimedAt?'is-claimed':''}"><b>${claimState}</b><small>${ticket.claimedAt?`${esc(ticket.attendeeName||'ANONYMOUS')} / ${esc(formatDateTime(ticket.claimedAt))}`:isExpired(ticket)?`EXPIRED / ${esc(formatDateTime(ticket.expiresAt))}`:'ONE-TIME CODE'}</small></span>
    <span>${esc(session.sessionCode)} / ${esc(compactDate(session.date))}</span>
    <span class="adm-ticket-actions"><button type="button" data-act="view" title="檢視">↗</button><button type="button" data-act="state" title="切換票券狀態" ${ticket.status==='REVOKED'?'disabled':''}>◎</button><button type="button" data-act="regen" title="重新產生抽取碼" ${available?'':'disabled'}>↻</button></span>
  </div>`}).join('');
}

async function issueBatch(event){
  event.preventDefault();els.formError.textContent='';
  const expiryValue=els.expires.value;let drawExpiresAt=null;
  if(expiryValue){const expiry=new Date(expiryValue);if(Number.isNaN(expiry.valueOf())||expiry<=new Date()){els.formError.textContent='抽取碼到期時間必須晚於現在。';els.expires.focus();return}drawExpiresAt=expiry.toISOString()}
  const payload={
    requestId:pendingIssueId||(pendingIssueId=makeRequestId()),
    eventName:els.eventName.value.trim(),eventCode:sanitizeCode(els.eventCode.value),sessionCode:sanitizeCode(els.sessionCode.value,10),
    date:els.sessionDate.value,time:els.sessionTime.value,venue:els.venue.value.trim(),passType:els.passType.value,
    quantity:Math.max(1,Math.min(25,Number(els.quantity.value)||1)),startNumber:Math.max(1,Number(els.startNumber.value)||1),note:els.note.value.trim(),drawExpiresAt
  };
  if(!payload.eventName||!payload.eventCode||!payload.sessionCode||!payload.date||!payload.time){els.formError.textContent='請完整填寫活動名稱、代碼、場次、日期與時間。';return}
  const epoch=authEpoch;setBusy(els.issueBtn,true);els.form.setAttribute('aria-busy','true');
  try{
    const issued=await api.issueSession(payload);if(epoch!==authEpoch||!authenticated)return;latestBatch=issued;pendingIssueId=null;selectedSessionId=latestBatch.session.id;renderBatch(latestBatch);els.batch.showModal();await refreshAfterMutation(epoch);if(epoch===authEpoch)showToast(`${latestBatch.batch.issued} CODES ISSUED`);
  }catch(error){if(epoch===authEpoch&&authenticated)els.formError.textContent=error.message||'發行失敗，請稍後再試。'}
  finally{if(epoch===authEpoch){setBusy(els.issueBtn,false);els.form.setAttribute('aria-busy','false')}}
}

function renderBatch(result){
  els.batchBody.innerHTML=`<div class="adm-batch"><p>// ${esc(result.session.eventName)} / SESSION ${esc(result.session.sessionCode)}</p><h2>${result.batch.issued} CODES<br>READY.</h2><p>抽取碼已與本場次票券綁定。可直接複製或下載 CSV 發送給受邀者。</p><div class="adm-batch-list">${result.tickets.map(ticket=>`<div><code>${esc(ticket.drawCode)}</code><span>${esc(ticket.serial)} / ${esc(ticket.passType)}</span></div>`).join('')}</div></div>`;
}

function openDetail(session,ticket){
  const verifyUrl=new URL('../verify.html',location.href);verifyUrl.hash=new URLSearchParams({serial:ticket.serial,token:ticket.verifyToken});
  els.detailBody.innerHTML=`<div class="adm-detail"><span class="adm-status ${ticket.status.toLowerCase()}">${esc(ticket.status)}</span><h2>${esc(ticket.serial)}</h2>
    <div class="adm-detail-grid"><div><span>EVENT</span><b>${esc(session.eventName)}</b></div><div><span>SESSION</span><b>${esc(session.sessionCode)} / ${esc(formatDate(session.date))} ${esc(session.time)}</b></div><div><span>PASS</span><b>${esc(ticket.passType)} / ${esc(ticket.rarity)}</b></div><div><span>ZONE</span><b>${esc(ticket.zone)}</b></div><div><span>CLAIM</span><b>${ticket.claimedAt?`${esc(formatDateTime(ticket.claimedAt))} / ${esc(ticket.attendeeName||'ANONYMOUS')}`:'AVAILABLE'}</b></div><div><span>EXPIRES</span><b>${esc(formatDateTime(ticket.expiresAt))}</b></div></div>
    <div><span class="adm-field-label">DRAW CODE</span><button class="adm-token adm-token--button" data-copy="${esc(ticket.drawCode)}">${esc(ticket.drawCode)}</button></div>
    <div><span class="adm-field-label">VERIFY TOKEN</span><div class="adm-token">${esc(ticket.verifyToken)}</div></div><a class="adm-token" href="${esc(verifyUrl.href)}" target="_blank" rel="noreferrer">${esc(verifyUrl.href)}</a></div>`;
  els.detail.showModal();
}

function rememberDialogTrigger(trigger){dialogReturnFocus=trigger instanceof HTMLElement?trigger:null}
function restoreDialogFocus(){const target=dialogReturnFocus;dialogReturnFocus=null;if(target?.isConnected)setTimeout(()=>target.focus(),0)}

function openSessionEdit(session,trigger){
  editingSession={id:session.id,updatedAt:session.updatedAt};rememberDialogTrigger(trigger);els.editError.textContent='';
  els.editEventName.value=session.eventName||'';els.editEventCode.value=session.eventCode||'';els.editSessionCode.value=session.sessionCode||'';els.editDate.value=session.date||'';els.editTime.value=session.time||'';els.editVenue.value=session.venue||'';els.editNote.value=session.note||'';
  els.editDialog.showModal();setTimeout(()=>els.editTime.focus(),0);
}

function openSessionDelete(session,trigger){
  if(Number(session.totals?.claimed||0)>0||Number(session.totals?.used||0)>0){showToast('已有領票紀錄，請改為關閉場次。',true);return}
  deletingSession={id:session.id,updatedAt:session.updatedAt,phrase:`${session.eventCode}/${session.sessionCode}`};rememberDialogTrigger(trigger);els.deleteError.textContent='';els.deleteConfirm.value='';els.confirmDelete.disabled=true;els.deletePhrase.textContent=deletingSession.phrase;
  els.deleteSummary.innerHTML=`<div><span>EVENT</span><b>${esc(session.eventName)}</b></div><div><span>SESSION</span><b>${esc(session.eventCode)} / ${esc(session.sessionCode)}</b></div><div><span>DATE / TIME</span><b>${esc(formatDate(session.date))} / ${esc(session.time)}</b></div><div><span>ISSUED / AVAILABLE</span><b>${session.totals?.issued||0} / ${session.totals?.available||0}</b></div>`;
  els.deleteDialog.showModal();setTimeout(()=>els.deleteConfirm.focus(),0);
}

async function saveSessionEdit(event){
  event.preventDefault();if(!editingSession||pendingSessionIds.has(editingSession.id))return;els.editError.textContent='';
  const snapshot={...editingSession},payload={time:els.editTime.value,venue:els.editVenue.value.trim(),note:els.editNote.value.trim(),expectedUpdatedAt:editingSession.updatedAt};
  if(!payload.time){els.editError.textContent='請填寫開始時間。';els.editTime.focus();return}
  const epoch=authEpoch;pendingSessionIds.add(snapshot.id);els.editForm.setAttribute('aria-busy','true');setBusy(els.saveEdit,true);els.cancelEdit.disabled=true;els.closeEdit.disabled=true;renderSessions();
  try{
    const result=await api.updateSession(snapshot.id,payload);if(epoch!==authEpoch||!authenticated)return;
    const session=state.sessions.find(item=>item.id===snapshot.id);if(session)Object.assign(session,{time:result.time,venue:result.venue,note:result.note,updatedAt:result.updatedAt});
    editingSession=null;els.editDialog.close();render();showToast(result.unchanged?'SESSION UNCHANGED':'SESSION UPDATED');await refreshAfterMutation(epoch);
  }catch(error){if(epoch===authEpoch&&authenticated)els.editError.textContent=error.message||'場次更新失敗，請稍後再試。'}
  finally{pendingSessionIds.delete(snapshot.id);if(epoch===authEpoch){els.editForm.setAttribute('aria-busy','false');setBusy(els.saveEdit,false);els.cancelEdit.disabled=false;els.closeEdit.disabled=false;renderSessions()}}
}

async function deleteSession(event){
  event.preventDefault();if(!deletingSession||pendingSessionIds.has(deletingSession.id))return;els.deleteError.textContent='';
  if(els.deleteConfirm.value.trim().toUpperCase()!==deletingSession.phrase){els.deleteError.textContent=`請完整輸入 ${deletingSession.phrase}`;els.deleteConfirm.focus();return}
  const snapshot={...deletingSession},epoch=authEpoch;pendingSessionIds.add(snapshot.id);els.deleteForm.setAttribute('aria-busy','true');setBusy(els.confirmDelete,true);els.cancelDelete.disabled=true;els.closeDelete.disabled=true;els.deleteConfirm.disabled=true;renderSessions();
  try{
    const result=await api.deleteSession(snapshot.id,snapshot.updatedAt);if(epoch!==authEpoch||!authenticated)return;
    state.sessions=state.sessions.filter(item=>item.id!==snapshot.id);if(selectedSessionId===snapshot.id)selectedSessionId=state.sessions[0]?.id||null;
    deletingSession=null;els.deleteDialog.close();render();showToast(`SESSION DELETED / ${result.affectedTickets} CODES REVOKED`);await refreshAfterMutation(epoch);
  }catch(error){if(epoch===authEpoch&&authenticated)els.deleteError.textContent=error.message||'場次刪除失敗，請稍後再試。'}
  finally{pendingSessionIds.delete(snapshot.id);if(epoch===authEpoch){els.deleteForm.setAttribute('aria-busy','false');setBusy(els.confirmDelete,false);els.cancelDelete.disabled=false;els.closeDelete.disabled=false;els.deleteConfirm.disabled=false;els.confirmDelete.disabled=els.deleteConfirm.value.trim().toUpperCase()!==snapshot.phrase;renderSessions()}}
}

async function handleSessionAction(event){
  const card=event.target.closest('.adm-session');if(!card)return;const session=state.sessions.find(item=>item.id===card.dataset.id);if(!session)return;
  const action=event.target.closest('button[data-act]');
  if(action?.dataset.act==='edit-session'){openSessionEdit(session,action);return}
  if(action?.dataset.act==='delete-session'){openSessionDelete(session,action);return}
  if(action?.dataset.act==='toggle-session'){
    const next=session.status==='OPEN'?'CLOSED':'OPEN';if(next==='CLOSED'&&!confirm(`關閉 ${session.eventName} / ${session.sessionCode} 的抽取功能？未領取的抽取碼將暫時無法使用。`))return;
    if(pendingSessionIds.has(session.id))return;const epoch=authEpoch;pendingSessionIds.add(session.id);renderSessions();
    try{const result=await api.updateSessionStatus(session.id,next,session.updatedAt);if(epoch!==authEpoch||!authenticated)return;Object.assign(session,{status:result.status,updatedAt:result.updatedAt});render();showToast(`SESSION / ${next}`);await refreshAfterMutation(epoch)}catch(error){if(epoch===authEpoch&&authenticated)showToast(error.message,true)}finally{pendingSessionIds.delete(session.id);if(epoch===authEpoch)renderSessions()}return;
  }
  selectedSessionId=session.id;renderSessions();renderLedger();
}

async function handleTicketAction(event){
  const button=event.target.closest('button[data-act]');const row=event.target.closest('.adm-ticket-row');if(!button||!row)return;
  const session=currentSession(),ticket=session?.tickets.find(item=>item.id===row.dataset.id);if(!ticket)return;
  if(button.dataset.act==='copy'){const copied=await copyText(ticket.drawCode);showToast(copied?'DRAW CODE COPIED':'COPY FAILED',!copied);return}
  if(button.dataset.act==='view'){openDetail(session,ticket);return}
  if(button.dataset.act==='state'){
    const next=ticket.status==='ACTIVE'?(ticket.claimedAt?'USED':'REVOKED'):ticket.status==='USED'?'REVOKED':null;if(!next||!confirm(`將 ${ticket.serial} 狀態改為 ${next}？`))return;
    try{await api.updateTicketStatus(ticket.id,next);await syncState({quiet:true});showToast(`TICKET / ${next}`)}catch(error){showToast(error.message,true)}return;
  }
  if(button.dataset.act==='regen'){
    if(!isAvailable(session,ticket)||button.dataset.busy)return;if(!confirm(`重新產生 ${ticket.serial} 的抽取碼？舊碼會立即失效。`))return;button.dataset.busy='true';button.disabled=true;
    try{const result=await api.regenerateDrawCode(ticket.id);const copied=await copyText(result.drawCode);await syncState({quiet:true});showToast(copied?'NEW CODE COPIED':'NEW CODE READY / COPY FAILED',!copied)}catch(error){showToast(error.message,true)}finally{delete button.dataset.busy}
  }
}

function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return`"${text.replaceAll('"','""')}"`}
function csvFor(rows){const header=['event_name','event_code','session_code','date','time','venue','session_status','serial','pass_type','rarity','zone','ticket_status','draw_code','verify_token','batch_id','issued_at','expires_at','claim_status','claim_id','claimed_at','attendee_name','used_at','revoked_at'];return[header.join(','),...rows.map(({session,...ticket})=>[session.eventName,session.eventCode,session.sessionCode,session.date,session.time,session.venue,session.status,ticket.serial,ticket.passType,ticket.rarity,ticket.zone,ticket.status,ticket.drawCode,ticket.verifyToken,ticket.batchId,ticket.issuedAt,ticket.expiresAt,ticket.claimedAt?'CLAIMED':'AVAILABLE',ticket.claimId,ticket.claimedAt,ticket.attendeeName,ticket.usedAt,ticket.revokedAt].map(csvCell).join(','))].join('\n')}
function download(content,name,type='text/csv;charset=utf-8'){const blob=new Blob(['\ufeff'+content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

els.authForm.addEventListener('submit',event=>{event.preventDefault();authenticate(els.adminKey.value)});
els.form.addEventListener('submit',issueBatch);
els.editForm.addEventListener('submit',saveSessionEdit);
els.deleteForm.addEventListener('submit',deleteSession);
els.form.addEventListener('input',()=>{if(els.form.getAttribute('aria-busy')!=='true')pendingIssueId=null});
els.sessionList.addEventListener('click',handleSessionAction);
els.ledger.addEventListener('click',handleTicketAction);
els.search.addEventListener('input',renderLedger);
els.syncNow.addEventListener('click',()=>syncState());
els.logout.addEventListener('click',()=>lockAdmin('後台已鎖定。'));
els.clearForm.addEventListener('click',()=>{els.form.reset();pendingIssueId=null;els.eventCode.value='THD001';els.sessionCode.value='A';els.sessionTime.value='19:00';els.quantity.value='20';els.startNumber.value='1';els.sessionDate.value=localDateValue();els.formError.textContent=''});
els.exportAll.addEventListener('click',()=>{const rows=allTickets();if(!rows.length)return showToast('NO DATA',true);download(csvFor(rows),`THEARD_all_tickets_${new Date().toISOString().slice(0,10)}.csv`)});
els.exportVisible.addEventListener('click',()=>{const session=currentSession();if(!session||!visibleTickets.length)return showToast('NO DATA',true);download(csvFor(visibleTickets.map(ticket=>({...ticket,session}))),`THEARD_${session.id}.csv`)});
els.copyBatch.addEventListener('click',async()=>{if(!latestBatch)return;await copyText(latestBatch.tickets.map(ticket=>`${ticket.drawCode}\t${ticket.serial}`).join('\n'));showToast('ALL CODES COPIED')});
els.downloadBatch.addEventListener('click',()=>{if(!latestBatch)return;const header='draw_code,serial,pass_type,rarity,zone';const rows=latestBatch.tickets.map(ticket=>[ticket.drawCode,ticket.serial,ticket.passType,ticket.rarity,ticket.zone].map(csvCell).join(','));download([header,...rows].join('\n'),`THEARD_${latestBatch.batch.id}_draw_codes.csv`)});
els.closeDetail.addEventListener('click',()=>els.detail.close());els.closeBatch.addEventListener('click',()=>els.batch.close());
els.cancelEdit.addEventListener('click',()=>els.editDialog.close());els.closeEdit.addEventListener('click',()=>els.editDialog.close());
els.cancelDelete.addEventListener('click',()=>els.deleteDialog.close());els.closeDelete.addEventListener('click',()=>els.deleteDialog.close());
els.deleteConfirm.addEventListener('input',()=>{els.confirmDelete.disabled=!deletingSession||els.deleteConfirm.value.trim().toUpperCase()!==deletingSession.phrase});
els.detail.addEventListener('click',async event=>{if(event.target===els.detail)els.detail.close();const copy=event.target.closest('[data-copy]');if(copy){await copyText(copy.dataset.copy);showToast('COPIED')}});
els.batch.addEventListener('click',event=>{if(event.target===els.batch)els.batch.close()});
els.editDialog.addEventListener('click',event=>{if(event.target===els.editDialog&&els.editForm.getAttribute('aria-busy')!=='true')els.editDialog.close()});
els.deleteDialog.addEventListener('click',event=>{if(event.target===els.deleteDialog&&els.deleteForm.getAttribute('aria-busy')!=='true')els.deleteDialog.close()});
els.editDialog.addEventListener('cancel',event=>{if(els.editForm.getAttribute('aria-busy')==='true')event.preventDefault()});
els.deleteDialog.addEventListener('cancel',event=>{if(els.deleteForm.getAttribute('aria-busy')==='true')event.preventDefault()});
els.editDialog.addEventListener('close',()=>{editingSession=null;els.editError.textContent='';restoreDialogFocus()});
els.deleteDialog.addEventListener('close',()=>{deletingSession=null;els.deleteError.textContent='';els.deleteConfirm.value='';restoreDialogFocus()});
addEventListener('theard:admin-auth-required',()=>lockAdmin('登入已失效，請重新輸入後台金鑰。'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&authenticated)syncState({quiet:true})});

if(!els.sessionDate.value)els.sessionDate.value=localDateValue();
const savedKey=api?.getAdminKey?.();if(savedKey)authenticate(savedKey);else lockAdmin();
