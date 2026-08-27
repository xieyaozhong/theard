(function bootstrapTheardApi(global) {
  'use strict';

  const DEFAULT_API_BASE='https://theard-event-ops.yao1230.chatgpt.site';
  let adminKey='';
  const configured=document.querySelector('meta[name="theard-api-base"]')?.content||global.THEARD_API_BASE||DEFAULT_API_BASE;
  const apiBase=String(configured).replace(/\/+$/,'');

  class TheardApiError extends Error {
    constructor(message,{code='REQUEST_FAILED',status=0}={}){
      super(message);this.name='TheardApiError';this.code=code;this.status=status;
    }
  }

  function normalizeCode(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,40)}
  function getAdminKey(){return adminKey}
  function setAdminKey(value){adminKey=String(value||'').trim();return adminKey}
  function clearAdminKey(){setAdminKey('')}

  async function request(path,{method='GET',body,admin=false,timeout=15000}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    const headers={Accept:'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(admin){const key=getAdminKey();if(!key)throw new TheardApiError('請先輸入後台金鑰。',{code:'ADMIN_KEY_REQUIRED',status:401});headers.Authorization=`Bearer ${key}`}
    try{
      const response=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',signal:controller.signal});
      let payload=null;try{payload=await response.json()}catch{}
      if(!response.ok||!payload?.ok){
        const error=payload?.error||{};
        if(response.status===401&&admin)global.dispatchEvent(new CustomEvent('theard:admin-auth-required'));
        throw new TheardApiError(error.message||`資料服務回應錯誤 (${response.status})`,{code:error.code||'REQUEST_FAILED',status:response.status});
      }
      return payload.data;
    }catch(error){
      if(error instanceof TheardApiError)throw error;
      if(error?.name==='AbortError')throw new TheardApiError('連線逾時，請確認網路後再試一次。',{code:'TIMEOUT'});
      throw new TheardApiError('目前無法連上票券資料服務，請稍後再試。',{code:'NETWORK_ERROR'});
    }finally{clearTimeout(timer)}
  }

  async function connectAdmin(key){setAdminKey(key);try{return await request('/api/admin/state',{admin:true})}catch(error){clearAdminKey();throw error}}

  global.TheardAPI=Object.freeze({
    apiBase,
    normalizeCode,
    getAdminKey,
    setAdminKey,
    clearAdminKey,
    connectAdmin,
    health:()=>request('/api/health'),
    lookupDrawCode:(code)=>request('/api/public/lookup',{method:'POST',body:{code:normalizeCode(code)}}),
    claimDrawCode:(code,{attendeeName=''}={})=>request('/api/public/claim',{method:'POST',body:{code:normalizeCode(code),attendeeName}}),
    verifyTicket:(serial,token)=>request('/api/public/verify',{method:'POST',body:{serial,token}}),
    getAdminState:()=>request('/api/admin/state',{admin:true}),
    issueSession:(payload)=>request('/api/admin/issue',{method:'POST',body:payload,admin:true,timeout:30000}),
    updateTicketStatus:(ticketId,status)=>request(`/api/admin/tickets/${encodeURIComponent(ticketId)}`,{method:'PATCH',body:{status},admin:true}),
    regenerateDrawCode:(ticketId)=>request(`/api/admin/tickets/${encodeURIComponent(ticketId)}/regenerate`,{method:'POST',body:{},admin:true}),
    updateSessionStatus:(sessionId,status)=>request(`/api/admin/sessions/${encodeURIComponent(sessionId)}`,{method:'PATCH',body:{status},admin:true}),
    TheardApiError
  });
})(window);
