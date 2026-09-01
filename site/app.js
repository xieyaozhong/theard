const $=(s,p=document)=>p.querySelector(s);const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const coarse=matchMedia('(pointer:coarse)').matches;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

const boot=$('#boot');
setTimeout(()=>{boot?.classList.add('done');document.documentElement.classList.add('entered')},1380);

const menu=$('#menu'),openBtn=$('#menuBtn'),closeBtn=$('#menuClose');
const menuNav=$('.menu__nav');if(menuNav&&!menuNav.querySelector('a[href="affiliate/"]')){const affiliateLink=document.createElement('a');affiliateLink.href='affiliate/';affiliateLink.innerHTML='<span>//07</span><b>AFFILIATE</b><em>ENGINE ↗</em>';menuNav.appendChild(affiliateLink)}
function setMenu(open){menu?.classList.toggle('open',open);menu?.setAttribute('aria-hidden',String(!open));if(menu)menu.inert=!open;openBtn?.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open)}
openBtn?.addEventListener('click',()=>{setMenu(true);closeBtn?.focus()});closeBtn?.addEventListener('click',()=>{setMenu(false);openBtn?.focus()});$$('.menu__nav a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.classList.contains('open')){setMenu(false);openBtn?.focus()}});

const cursor=$('#cursor');
if(!coarse){
  addEventListener('pointermove',e=>{if(cursor){cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'}},{passive:true});
  $$('a,button,.case__visual').forEach(el=>{el.addEventListener('pointerenter',()=>cursor?.classList.add('hot'));el.addEventListener('pointerleave',()=>cursor?.classList.remove('hot'))});
}

function setViewportUnit(){const h=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--app-vh',`${h*.01}px`)}
setViewportUnit();addEventListener('resize',setViewportUnit,{passive:true});window.visualViewport?.addEventListener('resize',setViewportUnit,{passive:true});

const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('visible')}),{threshold:.08,rootMargin:'0px 0px -8% 0px'});
$$('.scene__label,.statement__grid,.work__head,.case__grid,.case__meta,.activities__head,.activities__journey,.activities__play,.activities__schedule,.live__grid,.ticket,.finale h2,.finale__bottom').forEach(el=>{el.classList.add('reveal');revealObserver.observe(el)});

const scenes=$$('.scene'),cases=$$('.case'),hudMeta=$('.hud__meta'),progress=$('#progress'),drift=$('[data-drift]');
const sceneNames=new Map([[document.getElementById('home'),'HOME / ATTENTION FIELD'],[document.getElementById('system'),'SYSTEM / TECHNICAL DEPTH'],[document.getElementById('work'),'WORK / SELECTED SYSTEMS'],[document.getElementById('activities'),'ACTIVITY / PROMPT LAB'],[document.getElementById('live'),'LIVE / 001']]);
let targetY=scrollY,currentY=scrollY,lastY=scrollY,lastT=performance.now(),rafPending=false,scrollTimer=0,activeScene=null,activeCase=null;

function setHudLabel(label){if(!hudMeta||hudMeta.textContent===label)return;hudMeta.classList.add('changing');setTimeout(()=>{hudMeta.textContent=label;hudMeta.classList.remove('changing')},120)}

function updateScrollState(){
  rafPending=false;const now=performance.now(),y=scrollY,dt=Math.max(now-lastT,16),velocity=clamp(Math.abs(y-lastY)/dt,0,2.4);lastY=y;lastT=now;targetY=y;
  document.documentElement.style.setProperty('--scroll-velocity',velocity.toFixed(3));document.body.classList.add('is-scrolling');clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>document.body.classList.remove('is-scrolling'),120);
  const max=Math.max(document.documentElement.scrollHeight-innerHeight,1),page=clamp(y/max);if(progress)progress.style.height=`${page*100}%`;document.documentElement.style.setProperty('--scroll-progress',page.toFixed(4));
  const center=innerHeight*.5;let bestScene=null,bestSceneDist=Infinity;
  scenes.forEach(scene=>{const r=scene.getBoundingClientRect(),local=clamp((innerHeight-r.top)/(innerHeight+r.height));scene.style.setProperty('--scene-progress',local.toFixed(4));const d=Math.abs((r.top+r.height*.5)-center);if(r.bottom>0&&r.top<innerHeight&&d<bestSceneDist){bestSceneDist=d;bestScene=scene}});
  if(bestScene!==activeScene){activeScene=bestScene;scenes.forEach(scene=>scene.classList.toggle('is-active',scene===activeScene));if(activeScene)setHudLabel(sceneNames.get(activeScene)||'THEARD / 2026')}
  let bestCase=null,bestCaseDist=Infinity;
  cases.forEach(card=>{const r=card.getBoundingClientRect(),p=clamp((innerHeight-r.top)/(innerHeight+r.height)),d=Math.abs((r.top+r.height*.48)-center),yy=(.5-p)*22,scale=.982+Math.sin(p*Math.PI)*.018;card.style.setProperty('--case-y',`${yy.toFixed(2)}px`);card.style.setProperty('--case-scale',scale.toFixed(4));if(r.bottom>0&&r.top<innerHeight&&d<bestCaseDist){bestCaseDist=d;bestCase=card}});
  if(bestCase!==activeCase){activeCase=bestCase;cases.forEach(card=>card.classList.toggle('is-current',card===activeCase))}
}
function requestScrollUpdate(){if(!rafPending){rafPending=true;requestAnimationFrame(updateScrollState)}}
addEventListener('scroll',requestScrollUpdate,{passive:true});addEventListener('resize',requestScrollUpdate,{passive:true});updateScrollState();

function driftFrame(){currentY+=(targetY-currentY)*.07;if(drift&&!coarse&&!reduced){const x=Math.min(currentY*.006,14),yy=currentY*-.004;drift.style.transform=`translate3d(${x}px,${yy}px,0)`}requestAnimationFrame(driftFrame)}driftFrame();

if(!coarse&&!reduced){$$('.case__visual').forEach(panel=>{panel.addEventListener('pointermove',e=>{const r=panel.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;panel.style.setProperty('--rx',`${(-y*3.3).toFixed(2)}deg`);panel.style.setProperty('--ry',`${(x*4.5).toFixed(2)}deg`)});panel.addEventListener('pointerleave',()=>{panel.style.setProperty('--rx','0deg');panel.style.setProperty('--ry','0deg')})})}

const hero=$('.hero');if(hero&&!$('.matter-readout',hero)){const readout=document.createElement('div');readout.className='matter-readout';readout.innerHTML='<span>THREE.JS / GLSL / SCROLL TIMELINE</span><b>PERSISTENT MATTER ACTIVE</b>';hero.appendChild(readout)}

import('./matter.js?v=20260807-3').catch(err=>{document.documentElement.classList.add('webgl-fallback');console.warn('THEARD WebGL enhancement unavailable; base experience remains active.',err)});
import('./trend.js?v=2').catch(err=>console.warn('THEARD trend generator unavailable; main experience remains active.',err));
import('./pass-sync.js?v=2').catch(err=>console.warn('THEARD pass sync unavailable; main experience remains active.',err));
import('./activity.js?v=1').catch(err=>console.warn('THEARD public activity sync unavailable; static activity experience remains active.',err));
