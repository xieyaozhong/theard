const root=document.querySelector('[data-activities-root]');

if(root){
  const shell=root.querySelector('[data-public-sessions]');
  const list=root.querySelector('[data-public-sessions-list]');
  const status=root.querySelector('[data-public-sessions-status]');
  const sync=root.querySelector('[data-public-sessions-sync]');
  const template=root.querySelector('[data-public-session-template]');

  const setStatus=(message,{error=false}={})=>{
    if(status){status.textContent=message;status.classList.toggle('is-error',error)}
  };

  const formatDate=(value)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return String(value||'日期待公布');
    const date=new Date(`${value}T00:00:00+08:00`);
    if(Number.isNaN(date.valueOf()))return String(value);
    return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',weekday:'short',timeZone:'Asia/Taipei'}).format(date);
  };

  const normalizedCount=(value)=>Math.max(0,Number.parseInt(value,10)||0);

  function renderSession(session){
    if(!template?.content)return null;
    const fragment=template.content.cloneNode(true);
    const card=fragment.querySelector('[data-public-session-card]');
    const eventName=String(session?.eventName||session?.eventCode||'THEARD LIVE');
    const eventCode=String(session?.eventCode||'THEARD');
    const sessionCode=String(session?.sessionCode||'SESSION');
    const available=normalizedCount(session?.totals?.available);
    const claimed=normalizedCount(session?.totals?.claimed);
    const meta=[formatDate(session?.date),session?.time,session?.venue].filter(Boolean).join(' / ');

    fragment.querySelector('[data-session-kicker]').textContent=`${eventCode} / ${sessionCode}`;
    fragment.querySelector('[data-session-title]').textContent=eventName;
    fragment.querySelector('[data-session-meta]').textContent=meta;
    fragment.querySelector('[data-session-availability]').textContent=available>0
      ? `AVAILABLE ${String(available).padStart(2,'0')} / CLAIMED ${String(claimed).padStart(2,'0')}`
      : `FULL / CLAIMED ${String(claimed).padStart(2,'0')}`;
    const action=fragment.querySelector('[data-session-action]');
    action.textContent=available>0?'輸入抽取碼 ↗':'查看／恢復票券 ↗';
    action.setAttribute('aria-label',`${eventName} ${sessionCode}：${action.textContent.replace(' ↗','')}`);
    card?.classList.toggle('is-full',available===0);
    if(session?.note){
      const note=document.createElement('p');
      note.className='activity-session-card__note';
      note.textContent=String(session.note);
      fragment.querySelector('[data-session-meta]').after(note);
    }
    return fragment;
  }

  async function loadSessions(){
    if(!shell||!list)return;
    shell.setAttribute('aria-busy','true');
    setStatus('正在同步後台公開場次…');
    if(sync)sync.textContent='BACKSTAGE SYNC / CONNECTING';
    try{
      const api=window.TheardAPI;
      if(!api?.listPublicSessions)throw new Error('PUBLIC_SESSION_API_UNAVAILABLE');
      const result=await api.listPublicSessions();
      const sessions=Array.isArray(result?.sessions)?result.sessions:[];
      const fragment=document.createDocumentFragment();
      sessions.forEach((session)=>{const card=renderSession(session);if(card)fragment.append(card)});
      list.replaceChildren(fragment);
      if(sessions.length){
        setStatus(`已同步 ${sessions.length} 個公開場次。入場券抽取碼由活動後台發行。`);
      }else{
        setStatus('目前沒有開放中的公開場次；Prompt Lab 仍可直接進入預覽與練習。');
      }
      if(sync){
        const syncedAt=result?.syncedAt?new Date(result.syncedAt):new Date();
        const time=Number.isNaN(syncedAt.valueOf())?'READY':new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(syncedAt);
        sync.textContent=`BACKSTAGE SYNC / ${time}`;
      }
    }catch(error){
      console.warn('THEARD public sessions unavailable; static activity experience remains active.',error);
      list.replaceChildren();
      setStatus('場次同步暫時無法連線；你仍可先進入 Prompt Lab，或稍後再回來查看。',{error:true});
      if(sync)sync.textContent='BACKSTAGE SYNC / OFFLINE';
    }finally{
      shell.setAttribute('aria-busy','false');
    }
  }

  loadSessions();
  addEventListener('online',loadSessions);
}
