const $=(s,p=document)=>p.querySelector(s);const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const coarse=matchMedia('(pointer:coarse)').matches;

const boot=$('#boot');setTimeout(()=>boot?.classList.add('done'),1450);
const menu=$('#menu'),openBtn=$('#menuBtn'),closeBtn=$('#menuClose');
function setMenu(open){menu?.classList.toggle('open',open);menu?.setAttribute('aria-hidden',String(!open));document.body.classList.toggle('menu-open',open)}
openBtn?.addEventListener('click',()=>setMenu(true));closeBtn?.addEventListener('click',()=>setMenu(false));$$('.menu__nav a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});

const cursor=$('#cursor');if(!coarse){addEventListener('pointermove',e=>{if(cursor){cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'}},{passive:true});$$('a,button,.case__visual').forEach(el=>{el.addEventListener('pointerenter',()=>cursor?.classList.add('hot'));el.addEventListener('pointerleave',()=>cursor?.classList.remove('hot'))})}

function setViewportUnit(){const h=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--app-vh',`${h*.01}px`)}
setViewportUnit();addEventListener('resize',setViewportUnit,{passive:true});window.visualViewport?.addEventListener('resize',setViewportUnit,{passive:true});

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('visible')}),{threshold:.1});
$$('.scene__label,.statement__grid,.work__head,.case__grid,.case__meta,.live__grid,.ticket,.finale h2,.finale__bottom').forEach(el=>{el.classList.add('reveal');observer.observe(el)});

const scenes=$$('.scene');const cases=$$('.case');const hudMeta=$('.hud__meta');const progress=$('#progress');const drift=$('[data-drift]');let targetY=scrollY,currentY=scrollY,rafPending=false;
const sceneNames=new Map([[document.getElementById('home'),'HOME / ATTENTION FIELD'],[document.getElementById('system'),'SYSTEM / TECHNICAL DEPTH'],[document.getElementById('work'),'WORK / SELECTED SYSTEMS'],[document.getElementById('live'),'LIVE / 001']]);
function updateScrollState(){rafPending=false;targetY=scrollY;const max=Math.max(document.documentElement.scrollHeight-innerHeight,1),page=clamp(scrollY/max);if(progress)progress.style.height=`${page*100}%`;document.documentElement.style.setProperty('--scroll-progress',page.toFixed(4));
  let active=null,best=Infinity;const center=innerHeight*.5;
  scenes.forEach(scene=>{const r=scene.getBoundingClientRect();const local=clamp((innerHeight-r.top)/(innerHeight+r.height));scene.style.setProperty('--scene-progress',local.toFixed(4));const d=Math.abs((r.top+r.height*.5)-center);if(r.bottom>0&&r.top<innerHeight&&d<best){best=d;active=scene}});
  scenes.forEach(scene=>scene.classList.toggle('is-active',scene===active));if(active&&hudMeta){hudMeta.textContent=sceneNames.get(active)||'THEARD / 2026'}
  cases.forEach(card=>{const r=card.getBoundingClientRect();const p=clamp((innerHeight-r.top)/(innerHeight+r.height));const y=(.5-p)*18;const scale=.985+Math.sin(p*Math.PI)*.015;card.style.setProperty('--case-y',`${y.toFixed(2)}px`);card.style.setProperty('--case-scale',scale.toFixed(4))});
}
function requestScrollUpdate(){if(!rafPending){rafPending=true;requestAnimationFrame(updateScrollState)}}
addEventListener('scroll',requestScrollUpdate,{passive:true});addEventListener('resize',requestScrollUpdate,{passive:true});updateScrollState();

function driftFrame(){currentY+=(targetY-currentY)*.075;if(drift&&!coarse)drift.style.transform=`translate3d(${Math.min(currentY*.009,20)}px,${currentY*-.008}px,0)`;requestAnimationFrame(driftFrame)}driftFrame();

if(!coarse){$$('.case__visual').forEach(panel=>{panel.addEventListener('pointermove',e=>{const r=panel.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;panel.style.setProperty('--rx',`${(-y*3.4).toFixed(2)}deg`);panel.style.setProperty('--ry',`${(x*4.6).toFixed(2)}deg`)});panel.addEventListener('pointerleave',()=>{panel.style.setProperty('--rx','0deg');panel.style.setProperty('--ry','0deg')})})}

const matterCss=document.createElement('link');matterCss.rel='stylesheet';matterCss.href='matter.css';document.head.appendChild(matterCss);
const hero=$('.hero');if(hero){const readout=document.createElement('div');readout.className='matter-readout';readout.innerHTML='<span>THREE.JS / WEBGL / GLSL</span><b>INTERACTIVE MATTER CORE</b>';hero.appendChild(readout)}
import('./matter.js').catch(err=>{document.documentElement.classList.add('webgl-fallback');console.warn('THEARD WebGL enhancement unavailable; base experience remains active.',err)});