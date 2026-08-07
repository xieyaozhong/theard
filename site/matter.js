import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas=document.getElementById('field');
const hero=document.getElementById('home');
if(!canvas||!hero) throw new Error('THEARD WebGL stage missing');

const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer:coarse)').matches;
const mobile=innerWidth<700||coarse;
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!mobile,powerPreference:'high-performance'});
const pixelCap=mobile?1.15:1.5;
renderer.setPixelRatio(Math.min(devicePixelRatio||1,pixelCap));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(mobile?48:44,1,.1,100);
camera.position.set(0,0,mobile?9.8:9.1);

const root=new THREE.Group();scene.add(root);
const pointer={target:new THREE.Vector2(),current:new THREE.Vector2()};
const clock=new THREE.Clock();
let heroVisible=true,heroProgress=0,energyTarget=.07,baseX=0,baseScale=1,stageW=innerWidth,stageH=innerHeight;

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
  p+=n*(wave+disturb*.50);
  p.xy+=(local-uPointer*0.62)*disturb*.06;
  p*=1.0+sin(uTime*.55)*.016+uScroll*.018;
  vPulse=disturb+wave*1.35;
  vDepth=p.z;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  gl_PointSize=(2.0+disturb*2.2)*(8.0/-gl_Position.z);
}`;
const fragmentShader=`
uniform vec3 uColor;
varying float vPulse;
varying float vDepth;
void main(){
  vec2 c=gl_PointCoord-.5;
  float alpha=smoothstep(.5,.08,length(c));
  vec3 color=uColor+vec3(max(vPulse,0.0)*.12);
  alpha*=.42+max(vPulse,0.0)*.22+clamp(vDepth*.018,-.05,.05);
  gl_FragColor=vec4(color,alpha);
}`;

const detail=mobile?3:4;
const geo=new THREE.IcosahedronGeometry(2.5,detail);
const pointsMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uPointer:{value:new THREE.Vector2()},uScroll:{value:0},uEnergy:{value:0},uColor:{value:new THREE.Color('#d9ff3f')}},vertexShader,fragmentShader});
const matter=new THREE.Points(geo,pointsMat);root.add(matter);

const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(2.58,mobile?2:3),new THREE.MeshBasicMaterial({color:0x7d8b77,wireframe:true,transparent:true,opacity:mobile?.04:.055,depthWrite:false}));root.add(shell);
const halo=new THREE.Mesh(new THREE.SphereGeometry(3.28,mobile?18:28,mobile?14:20),new THREE.MeshBasicMaterial({color:0xd9ff3f,transparent:true,opacity:mobile?.014:.022,side:THREE.BackSide,depthWrite:false}));root.add(halo);

const starGeo=new THREE.BufferGeometry();const starCount=reduceMotion?120:(mobile?170:420);const starPos=new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){const r=7+Math.random()*12,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);starPos[i*3]=r*Math.sin(phi)*Math.cos(theta);starPos[i*3+1]=r*Math.sin(phi)*Math.sin(theta);starPos[i*3+2]=r*Math.cos(phi)-4;}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xb9c4b4,size:mobile?.014:.017,transparent:true,opacity:mobile?.15:.22,depthWrite:false}));scene.add(stars);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function viewportHeight(){return window.visualViewport?.height||innerHeight;}
function updateHeroState(){const r=hero.getBoundingClientRect();heroVisible=r.bottom>0&&r.top<viewportHeight();heroProgress=clamp(-r.top/Math.max(r.height,1),0,1);canvas.classList.toggle('matter-hidden',!heroVisible);if(!heroVisible){pointer.target.set(0,0);energyTarget=.04;}}

const heroObserver=new IntersectionObserver(entries=>{heroVisible=entries.some(e=>e.isIntersecting);canvas.classList.toggle('matter-hidden',!heroVisible)},{threshold:.02});heroObserver.observe(hero);

if(!coarse){addEventListener('pointermove',e=>{if(!heroVisible)return;const r=hero.getBoundingClientRect();const x=clamp((e.clientX-r.left)/r.width,0,1)*2-1;const y=-(clamp((e.clientY-r.top)/Math.max(r.height,1),0,1)*2-1);pointer.target.set(x,y);energyTarget=.38},{passive:true});addEventListener('pointerleave',()=>{pointer.target.set(0,0);energyTarget=.07})}
addEventListener('scroll',updateHeroState,{passive:true});

function resize(){stageW=innerWidth;stageH=viewportHeight();baseX=stageW>1100?1.05:stageW>800?.45:0;baseScale=stageW<640?.76:stageW<980?.9:1;renderer.setPixelRatio(Math.min(devicePixelRatio||1,pixelCap));renderer.setSize(stageW,stageH,false);camera.aspect=stageW/stageH;camera.fov=stageW<640?50:stageW<980?47:44;camera.updateProjectionMatrix();updateHeroState()}
addEventListener('resize',resize,{passive:true});window.visualViewport?.addEventListener('resize',resize,{passive:true});

function animate(){const t=reduceMotion?0:clock.getElapsedTime();pointer.current.lerp(pointer.target,coarse?.04:.07);pointsMat.uniforms.uTime.value=t;pointsMat.uniforms.uPointer.value.copy(pointer.current);pointsMat.uniforms.uScroll.value=heroProgress;pointsMat.uniforms.uEnergy.value+=(energyTarget-pointsMat.uniforms.uEnergy.value)*.065;energyTarget+=(.07-energyTarget)*.035;
  const px=pointer.current.x,py=pointer.current.y,idleYaw=reduceMotion?0:Math.sin(t*.16)*.085;
  root.rotation.y+=(idleYaw+px*.08-root.rotation.y)*.04;root.rotation.x+=(py*.055-root.rotation.x)*.04;root.rotation.z+=(px*-.024-root.rotation.z)*.035;
  root.position.x+=(baseX+px*.08-root.position.x)*.045;root.position.y+=(py*.045-root.position.y)*.045;root.scale.setScalar(baseScale*(1+heroProgress*.012));
  shell.rotation.y=reduceMotion?0:t*.014;shell.rotation.x=reduceMotion?0:t*.009;halo.scale.setScalar(1+(reduceMotion?0:Math.sin(t*.3)*.014));stars.rotation.y=reduceMotion?0:t*.0018;camera.position.z=mobile?9.8:9.1;
  if(heroVisible||!mobile)renderer.render(scene,camera);requestAnimationFrame(animate)}

resize();animate();window.__THEARD_WEBGL__={renderer,scene,camera};