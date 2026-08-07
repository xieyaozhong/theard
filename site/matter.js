import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas=document.getElementById('field');
const hero=document.getElementById('home');
if(!canvas||!hero) throw new Error('THEARD WebGL stage missing');

const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
renderer.setSize(innerWidth,innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.1,100);
camera.position.set(0,0,9.1);

const root=new THREE.Group();
scene.add(root);
const pointer={target:new THREE.Vector2(),current:new THREE.Vector2()};
const clock=new THREE.Clock();
let heroVisible=true;
let heroProgress=0;
let energyTarget=.08;
let baseX=innerWidth>980?1.15:0;

const vertexShader=`
uniform float uTime;
uniform vec2 uPointer;
uniform float uScroll;
uniform float uEnergy;
varying float vPulse;
varying float vDepth;
void main(){
  vec3 p=position;
  vec3 n=normalize(position);
  float wave=sin(p.x*2.15+uTime*1.05)*0.10+sin(p.y*2.8-uTime*.78)*0.07+sin(p.z*3.3+uTime*.55)*0.05;
  vec2 local=p.xy/3.0;
  float d=distance(local,uPointer*0.62);
  float disturb=smoothstep(.82,.0,d)*uEnergy;
  p+=n*(wave+disturb*.55);
  p.xy+=(local-uPointer*0.62)*disturb*.08;
  p*=1.0+sin(uTime*.55)*.018+uScroll*.025;
  vPulse=disturb+wave*1.45;
  vDepth=p.z;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  gl_PointSize=(2.1+disturb*2.6)*(8.0/-gl_Position.z);
}`;
const fragmentShader=`
uniform vec3 uColor;
varying float vPulse;
varying float vDepth;
void main(){
  vec2 c=gl_PointCoord-.5;
  float alpha=smoothstep(.5,.08,length(c));
  vec3 color=uColor+vec3(max(vPulse,0.0)*.14);
  alpha*=.44+max(vPulse,0.0)*.26+clamp(vDepth*.02,-.05,.06);
  gl_FragColor=vec4(color,alpha);
}`;

const geo=new THREE.IcosahedronGeometry(2.5,4);
const pointsMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{uTime:{value:0},uPointer:{value:new THREE.Vector2()},uScroll:{value:0},uEnergy:{value:0},uColor:{value:new THREE.Color('#d9ff3f')}},
  vertexShader,fragmentShader
});
const matter=new THREE.Points(geo,pointsMat);root.add(matter);

const shell=new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.58,3),
  new THREE.MeshBasicMaterial({color:0x7d8b77,wireframe:true,transparent:true,opacity:.055,depthWrite:false})
);root.add(shell);

const halo=new THREE.Mesh(
  new THREE.SphereGeometry(3.28,28,20),
  new THREE.MeshBasicMaterial({color:0xd9ff3f,transparent:true,opacity:.022,side:THREE.BackSide,depthWrite:false})
);root.add(halo);

const starGeo=new THREE.BufferGeometry();
const starCount=reduceMotion?180:420;
const starPos=new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  const r=7+Math.random()*12,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);
  starPos[i*3]=r*Math.sin(phi)*Math.cos(theta);
  starPos[i*3+1]=r*Math.sin(phi)*Math.sin(theta);
  starPos[i*3+2]=r*Math.cos(phi)-4;
}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xb9c4b4,size:.017,transparent:true,opacity:.22,depthWrite:false}));
scene.add(stars);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function updateHeroState(){
  const r=hero.getBoundingClientRect();
  heroVisible=r.bottom>0&&r.top<innerHeight;
  const travel=Math.max(r.height-innerHeight,1);
  heroProgress=clamp(-r.top/travel,0,1);
  canvas.classList.toggle('matter-hidden',!heroVisible);
  if(!heroVisible){pointer.target.set(0,0);energyTarget=.05;}
}

const heroObserver=new IntersectionObserver(entries=>{
  heroVisible=entries.some(e=>e.isIntersecting);
  canvas.classList.toggle('matter-hidden',!heroVisible);
},{threshold:.03});
heroObserver.observe(hero);

addEventListener('pointermove',e=>{
  if(!heroVisible) return;
  const r=hero.getBoundingClientRect();
  const x=clamp((e.clientX-r.left)/r.width,0,1)*2-1;
  const y=-(clamp((e.clientY-r.top)/r.height,0,1)*2-1);
  pointer.target.set(x,y);
  energyTarget=.48;
},{passive:true});
addEventListener('pointerleave',()=>{pointer.target.set(0,0);energyTarget=.08;});
addEventListener('scroll',updateHeroState,{passive:true});

function resize(){
  baseX=innerWidth>980?1.15:0;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  updateHeroState();
}
addEventListener('resize',resize);

function animate(){
  const t=reduceMotion?0:clock.getElapsedTime();
  pointer.current.lerp(pointer.target,.075);
  pointsMat.uniforms.uTime.value=t;
  pointsMat.uniforms.uPointer.value.copy(pointer.current);
  pointsMat.uniforms.uScroll.value=heroProgress;
  pointsMat.uniforms.uEnergy.value+=(energyTarget-pointsMat.uniforms.uEnergy.value)*.07;
  energyTarget+=(.08-energyTarget)*.03;

  const px=pointer.current.x,py=pointer.current.y;
  const idleYaw=reduceMotion?0:Math.sin(t*.18)*.11;
  root.rotation.y+=(idleYaw+px*.11-root.rotation.y)*.045;
  root.rotation.x+=(py*.08-root.rotation.x)*.045;
  root.rotation.z+=(px*-.035-root.rotation.z)*.04;
  root.position.x+=(baseX+px*.12-root.position.x)*.05;
  root.position.y+=(py*.07-root.position.y)*.05;
  root.scale.setScalar(1+heroProgress*.018);

  shell.rotation.y=reduceMotion?0:t*.018;
  shell.rotation.x=reduceMotion?0:t*.012;
  halo.scale.setScalar(1+(reduceMotion?0:Math.sin(t*.32)*.018));
  stars.rotation.y=reduceMotion?0:t*.0025;
  camera.position.z=9.1;

  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}

updateHeroState();
animate();
window.__THEARD_WEBGL__={renderer,scene,camera};