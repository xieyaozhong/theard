const TREND_VERSION='1';
const trendCss=document.createElement('link');trendCss.rel='stylesheet';trendCss.href=`trend.css?v=${TREND_VERSION}`;document.head.appendChild(trendCss);

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v,location.href);return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return'#'}};
const fmtTime=v=>{if(!v)return'WAITING FOR SIGNAL';try{return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(new Date(v))}catch{return String(v)}};

function mount(){
  const live=document.getElementById('live');if(!live||document.getElementById('trend'))return null;
  const section=document.createElement('section');section.id='trend';section.className='trend-engine';section.innerHTML=`
    <div class="trend-engine__label">//04 TREND INTELLIGENCE / AUTO EDITORIAL ENGINE</div>
    <div class="trend-engine__head">
      <h2>TREND<br><span>TO</span><br>THOUGHT.</h2>
      <div class="trend-engine__intro"><strong>LIVE SIGNAL → DEEP ARTICLE</strong>系統定期收集公開趨勢訊號，先判斷哪些主題正在加速，再把「發生了什麼」往下追成背景、結構、二階影響與反方觀點。這裡不是熱搜摘要，而是一台自動把熱度轉成可讀觀點的編輯器。</div>
    </div>
    <div class="trend-engine__deck">
      <aside class="trend-signals">
        <div class="trend-signals__top"><span>SIGNAL BOARD</span><span class="trend-live"><i></i>LIVE FEED</span></div>
        <div class="trend-signal-list" id="trendSignalList"><button class="trend-signal is-active"><span class="trend-signal__n">01</span><span class="trend-signal__body"><b>正在同步最新趨勢…</b><small>BOOTSTRAPPING</small></span><span class="trend-signal__score">--</span></button></div>
        <div class="trend-controls"><button class="trend-btn trend-btn--primary" id="trendGenerate" type="button">GENERATE ARTICLE</button><button class="trend-btn" id="trendRefresh" type="button">REFRESH SIGNALS</button></div>
      </aside>
      <article class="trend-article">
        <div class="trend-article__top"><span>EDITORIAL OUTPUT</span><button class="trend-btn" id="trendCopy" type="button">COPY ARTICLE</button></div>
        <div class="trend-article__body" id="trendArticleBody"><div class="trend-article__meta"><span class="trend-chip trend-chip--acid">AUTO / INITIALIZING</span></div><h3 class="trend-article__title">正在建立最新趨勢文章。</h3><p class="trend-article__dek">先收集訊號，再決定什麼值得寫。</p></div>
      </article>
    </div>
    <div class="trend-engine__foot"><span id="trendUpdated">LAST SYNC / --</span><span>PUBLIC TREND SIGNALS / EDITORIAL SYNTHESIS / NO AUTO-PUBLISH</span></div>
    <div class="trend-toast" id="trendToast">COPIED</div>`;
  live.parentNode.insertBefore(section,live);

  const nav=document.querySelector('.menu__nav');
  if(nav&&!nav.querySelector('a[href="#trend"]')){
    const liveLink=nav.querySelector('a[href="#live"]'),ticketLink=nav.querySelector('a[href="ticket.html"]');
    liveLink?.querySelector('span')&&(liveLink.querySelector('span').textContent='//05');
    ticketLink?.querySelector('span')&&(ticketLink.querySelector('span').textContent='//06');
    const a=document.createElement('a');a.href='#trend';a.innerHTML='<span>//04</span><b>TREND</b><em>OPEN ↗</em>';a.addEventListener('click',()=>{document.getElementById('menu')?.classList.remove('open');document.body.classList.remove('menu-open')});
    liveLink?nav.insertBefore(a,liveLink):nav.appendChild(a);
  }
  return section;
}

const root=mount();
if(!root)throw new Error('Trend generator mount point missing');
const list=root.querySelector('#trendSignalList'),body=root.querySelector('#trendArticleBody'),updated=root.querySelector('#trendUpdated'),generateBtn=root.querySelector('#trendGenerate'),refreshBtn=root.querySelector('#trendRefresh'),copyBtn=root.querySelector('#trendCopy'),toast=root.querySelector('#trendToast');
let payload={signals:[],articles:[]},activeSignal=0,activeArticle=0;

function fallbackArticle(signal={}){
  const title=signal.title||'一個正在上升的訊號';
  return{topic:title,title:`當「${title}」成為趨勢，真正值得看的不是熱度`,dek:'趨勢的價值不在於它今天排第幾，而在於它暴露了哪些正在改變的成本、權力與行為。',angle:'STRUCTURAL READING',mode:'LOCAL SYNTHESIS',sections:[
    {label:'01 / WHAT CHANGED',text:`「${title}」之所以值得注意，不只是因為搜尋或討論量上升，而是它開始跨出單一事件，碰到更廣泛的使用者行為、產業決策或公共討論。熱度是表面訊號，真正需要追的是：誰因此改變了選擇？哪些原本昂貴或困難的事情突然變得容易？`},
    {label:'02 / UNDER THE SURFACE',text:'當一個主題快速擴散，通常代表背後至少有一項結構正在鬆動：成本下降、工具普及、規則改變、信任重新分配，或新的入口讓更多人能參與。與其預測它會不會繼續紅，更有用的是辨認這項結構改變是否可逆。'},
    {label:'03 / SECOND ORDER',text:'第二層影響往往不是「更多人使用」，而是周邊角色開始重新定位。平台會改規則、品牌會改預算、工作流程會重新拆分，甚至原本不在這個市場的人也會進場。真正的機會與風險，通常都出現在這些二階反應。'},
    {label:'04 / COUNTERPOINT',text:'但熱門本身也會放大錯覺。短期注意力可能來自單一事件、媒體集中報導或社群情緒，而不是長期需求。因此判斷趨勢時，需要同時找反證：如果熱度明天消失，哪些改變仍然會留下？留下來的部分，才值得投入。'},
    {label:'05 / THE QUESTION',text:'與其問「這是不是下一個風口」，更值得問的是：如果這個訊號代表的結構真的成立，六個月後人們會停止做哪件事，又會開始把什麼視為理所當然？'}
  ],sources:signal.url?[{title:signal.title,url:signal.url,source:signal.source||'PUBLIC SIGNAL'}]:[]};
}

function renderSignals(){
  const signals=payload.signals?.length?payload.signals:[{title:'等待最新公開趨勢資料',source:'SYSTEM',score:0}];
  activeSignal=Math.min(activeSignal,signals.length-1);
  list.innerHTML=signals.slice(0,8).map((s,i)=>`<button class="trend-signal ${i===activeSignal?'is-active':''}" data-i="${i}" type="button"><span class="trend-signal__n">${String(i+1).padStart(2,'0')}</span><span class="trend-signal__body"><b>${esc(s.title)}</b><small>${esc((s.source||'PUBLIC SIGNAL').toUpperCase())}${s.traffic?` / ${esc(s.traffic)}`:''}</small></span><span class="trend-signal__score">${esc(s.score??'--')}</span></button>`).join('');
  list.querySelectorAll('.trend-signal').forEach(btn=>btn.addEventListener('click',()=>{activeSignal=Number(btn.dataset.i)||0;renderSignals();const sig=signals[activeSignal];const match=payload.articles?.findIndex(a=>a.topic===sig.title);activeArticle=match>=0?match:activeArticle;renderArticle(match>=0?payload.articles[match]:fallbackArticle(sig))}));
}

function renderArticle(article){
  const a=article||payload.articles?.[activeArticle]||fallbackArticle(payload.signals?.[activeSignal]);
  const sections=(a.sections||[]).map(s=>`<section class="trend-article__section"><h3>${esc(s.label||'ANALYSIS')}</h3><p>${esc(s.text||'')}</p></section>`).join('');
  const sources=(a.sources||[]).filter(s=>s?.url).map(s=>`<a class="trend-source" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">↗ ${esc(s.source||'SOURCE')} / ${esc(s.title||s.url)}</a>`).join('');
  body.innerHTML=`<div class="trend-article__meta"><span class="trend-chip trend-chip--acid">${esc(a.mode||payload.mode||'AUTO')}</span><span class="trend-chip">${esc(a.angle||'DEEP ANALYSIS')}</span></div><h3 class="trend-article__title">${esc(a.title||'Untitled')}</h3><p class="trend-article__dek">${esc(a.dek||'')}</p><div class="trend-article__content">${sections}</div>${sources?`<div class="trend-article__sources"><span>SOURCE SIGNALS</span>${sources}</div>`:''}`;
  root.dataset.currentTitle=a.title||'';
  root._currentArticle=a;
}

function articleText(a){if(!a)return'';return [a.title,a.dek,...(a.sections||[]).flatMap(s=>[s.label,s.text]),...(a.sources||[]).map(s=>`${s.source||'SOURCE'} — ${s.title||''} ${s.url||''}`)].filter(Boolean).join('\n\n')}
function showToast(text){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1200)}

async function loadData(force=false){
  root.classList.add('is-loading');refreshBtn.disabled=true;
  try{
    const res=await fetch(`data/trend-article.json?ts=${force?Date.now():'1'}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();payload=data&&typeof data==='object'?data:{signals:[],articles:[]};activeSignal=0;activeArticle=0;renderSignals();renderArticle(payload.articles?.[0]||fallbackArticle(payload.signals?.[0]));updated.textContent=`LAST SYNC / ${fmtTime(payload.generated_at)}`;
  }catch(err){console.warn('Trend feed unavailable',err);payload={signals:[{title:'趨勢資料暫時無法連線',source:'LOCAL FALLBACK',score:'--'}],articles:[]};renderSignals();renderArticle(fallbackArticle(payload.signals[0]));updated.textContent='LAST SYNC / FALLBACK MODE'}finally{root.classList.remove('is-loading');refreshBtn.disabled=false}
}

generateBtn.addEventListener('click',()=>{const articles=payload.articles||[];if(articles.length){activeArticle=(activeArticle+1)%articles.length;const a=articles[activeArticle];const idx=(payload.signals||[]).findIndex(s=>s.title===a.topic);if(idx>=0)activeSignal=idx;renderSignals();renderArticle(a)}else renderArticle(fallbackArticle(payload.signals?.[activeSignal]));body.animate?.([{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.16,.84,.2,1)'})});
refreshBtn.addEventListener('click',()=>loadData(true));
copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(articleText(root._currentArticle));showToast('ARTICLE COPIED')}catch{showToast('COPY UNAVAILABLE')}});

loadData();
