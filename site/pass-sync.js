const PASS_SYNC_VERSION='1';
const PASS_SYNC_KEY='theard.passdraw.latest';
const PASS_STATE_KEYS=['theard.passdraw.v3','theard.passdraw.v2','theard.passdraw.v1'];
const CHANNEL_NAME='theard-pass-sync';

const css=document.createElement('link');css.rel='stylesheet';css.href=`pass-sync.css?v=${PASS_SYNC_VERSION}`;document.head.appendChild(css);

const ticket=document.querySelector('.live .ticket');
const liveCopyLink=document.querySelector('.live__copy a.dark-link');
const menuTicket=[...document.querySelectorAll('.menu__nav a')].find(a=>a.getAttribute('href')==='ticket.html');
if(ticket)ticket.href='draw/';
if(liveCopyLink){liveCopyLink.href='draw/';liveCopyLink.textContent='OPEN PASS DRAW ↗'}
if(menuTicket){menuTicket.href='draw/';const b=menuTicket.querySelector('b');if(b)b.textContent='PASS DRAW'}

function readLatest(){
  try{
    const direct=localStorage.getItem(PASS_SYNC_KEY);
    if(direct){const parsed=JSON.parse(direct);if(parsed&&parsed.code)return parsed}
  }catch{}
  for(const key of PASS_STATE_KEYS){
    try{
      const raw=localStorage.getItem(key);if(!raw)continue;
      const state=JSON.parse(raw),history=Array.isArray(state?.history)?state.history:[];
      const last=history.at?.(-1)||history[history.length-1];
      if(last?.code)return last;
    }catch{}
  }
  return null;
}

function clearRarityClasses(){if(!ticket)return;[...ticket.classList].filter(c=>c.startsWith('pass-rarity-')).forEach(c=>ticket.classList.remove(c))}
function safeText(v,fallback='—'){return String(v??fallback)}

function ensureStateLabel(){
  const copy=document.querySelector('.live__copy');if(!copy)return null;
  let el=copy.querySelector('.pass-sync-state');
  if(!el){el=document.createElement('div');el.className='pass-sync-state';el.innerHTML='<i></i><span>PASS DRAW READY / NO BOND YET</span>';copy.appendChild(el)}
  return el;
}

function render(entry){
  if(!ticket)return;
  const mainStrong=ticket.querySelector('.ticket__main > strong');
  const top=ticket.querySelector('.ticket__top');
  const bottom=ticket.querySelector('.ticket__bottom');
  const stubB=ticket.querySelector('.ticket__stub b');
  const stubSmall=ticket.querySelector('.ticket__stub small');
  const stateLabel=ensureStateLabel();
  clearRarityClasses();

  ticket.classList.toggle('pass-sync-bonded',Boolean(entry));
  if(!entry){
    if(mainStrong)mainStrong.innerHTML='DRAW<br>YOUR PASS';
    if(top){const spans=top.querySelectorAll('span');if(spans[1])spans[1].textContent='SYNC READY'}
    if(bottom)bottom.innerHTML='<span>PASS × PET / COLLECTIBLE ENTRY</span><span>OPEN DRAW SYSTEM</span>';
    if(stubB)stubB.textContent='---';
    if(stubSmall)stubSmall.textContent='DRAW / READY';
    if(stateLabel){stateLabel.classList.remove('is-bonded');stateLabel.querySelector('span').textContent='PASS DRAW READY / NO BOND YET'}
    return;
  }

  const rarity=safeText(entry.rarity,'COMMON').toUpperCase();
  const name=safeText(entry.name,'GENERAL PASS').toUpperCase();
  const code=safeText(entry.code,'THD-001-XXXXXX');
  const zone=safeText(entry.zone,'A-00');
  const pet=entry.pet||null;
  ticket.classList.add(`pass-rarity-${rarity.toLowerCase()}`);
  if(mainStrong)mainStrong.innerHTML=name.replace(/\s+/g,'<br>');
  if(top){const spans=top.querySelectorAll('span');if(spans[1])spans[1].textContent=rarity}
  if(bottom)bottom.innerHTML=`<span class="pass-sync-code">${code}</span><span>${zone}${pet?`<small class="pass-sync-pet">PET / ${safeText(pet.name)} · ${safeText(pet.rarity)}</small>`:''}</span>`;
  if(stubB)stubB.textContent=zone;
  if(stubSmall)stubSmall.textContent=pet?`PET / ${safeText(pet.name)}`:'PASS / BONDED';
  if(stateLabel){stateLabel.classList.add('is-bonded');stateLabel.querySelector('span').textContent=`SYNCED / ${name} / ${rarity}`}
}

render(readLatest());

addEventListener('storage',e=>{
  if(e.key===PASS_SYNC_KEY||PASS_STATE_KEYS.includes(e.key))render(readLatest());
});

try{
  const channel=new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener('message',e=>{
    if(e.data?.type==='PASS_DRAWN'&&e.data.entry)render(e.data.entry);
    if(e.data?.type==='PASS_RESET')render(null);
  });
}catch{}

addEventListener('pageshow',()=>render(readLatest()));
