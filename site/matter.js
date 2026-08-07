import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas=document.getElementById('field');
if(!canvas) throw new Error('THEARD WebGL canvas missing');

const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.setSize(innerWidth,innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,100);
camera.position.set(0,0,8.4);

const root=new THREE.Group();scene.add(root);
const pointer={target:new THREE.Vector2(0,0),current:new THREE.Vector2(0,0)};
const scroll={target:0,current:0};
const clock=new THREE.Clock();

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
  float wave=sin(p.x*2.15+uTime*1.05)*0.11+sin(p.y*2.8-uTime*.78)*0.08+sin(p.z*3.3+uTime*.55)*0.06;
  vec2 local=p.xy/3.0;
  float d=distance(local,uPointer*0.72);
  float disturb=smoothstep(.95,.0,d)*uEnergy;
  p+=n*(wave+disturb*.85);
  p.xy+=(local-uPointer*0.72)*disturb*.18;
  float breathe=1.0+sin(uTime*.55)*.025+uScroll*.055;
  p*=breathe;
  vPulse=disturb+wave*1.7;
  vDepth=p.z;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  gl_PointSize=(2.2+disturb*3.8)*(8.0/-gl_Position.z);
}`;
const fragmentShader=`
uniform vec3 uColor;
varying float vPulse;
varying float vDepth;
void main(){
  vec2 c=gl_PointCoord-.5;
  float alpha=smoothstep(.5,.08,length(c));
  vec3 color=uColor+vec3(max(vPulse,0.0)*.18);
  alpha*=.47+max(vPulse,0.0)*.34+clamp(vDepth*.025,-.06,.08);
  gl_FragColor=vec4(color,alpha);
}`;

const geo=new THREE.IcosahedronGeometry(2.55,4);
const pointsMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uPointer:{value:new THREE.Vector2()},uScroll:{value:0},uEnergy:{value:0},uColor:{value:new THREE.Color('#d9ff3f')}},vertexShader,fragmentShader});
const matter=new THREE.Points(geo,pointsMat);root.add(matter);

const wireMat=new THREE.MeshBasicMaterial({color:0x7d8b77,wireframe:true,transparent:true,opacity:.065,depthWrite:false});
const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(2.64,3),wireMat);root.add(shell);

const haloMat=new THREE.MeshBasicMaterial({color:0xd9ff3f,transparent:true,opacity:.025,side:THREE.BackSide,depthWrite:false});
const halo=new THREE.Mesh(new THREE.SphereGeometry(3.45,32,24),haloMat);root.add(halo);

const starGeo=new THREE.BufferGeometry();const starCount=reduceMotion?240:620;const starPos=new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){const r=7+Math.random()*13,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);starPos[i*3]=r*Math.sin(phi)*Math.cos(theta);starPos[i*3+1]=r*Math.sin(phi)*Math.sin(theta);starPos[i*3+2]=r*Math.cos(phi)-4;}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xb9c4b4,size:.018,transparent:true,opacity:.28,depthWrite:false}));scene.add(stars);

let energyTarget=.08;let activeScene='home';
const sceneObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){activeScene=entry.target.id||entry.target.className;energyTarget=entry.target.matches('.case,.work')?.22:entry.target.matches('.live')?.05:.11;}}},{threshold:.42});
document.querySelectorAll('.scene,.case').forEach(el=>sceneObserver.observe(el));

addEventListener('pointermove',e=>{pointer.target.x=(e.clientX/innerWidth)*2-1;pointer.target.y=-((e.clientY/innerHeight)*2-1);energyTarget=Math.max(energyTarget,.75);},{passive:true});
addEventListener('pointerleave',()=>{pointer.target.set(0,0);energyTarget=.1});
addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;scroll.target=max>0?scrollY/max:0},{passive:true});

function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);

function animate(){
  const t=reduceMotion?0:clock.getElapsedTime();
  pointer.current.lerp(pointer.target,.07);scroll.current+=(scroll.target-scroll.current)*.045;
  pointsMat.uniforms.uTime.value=t;pointsMat.uniforms.uPointer.value.copy(pointer.current);pointsMat.uniforms.uScroll.value=scroll.current;
  pointsMat.uniforms.uEnergy.value+=(energyTarget-pointsMat.uniforms.uEnergy.value)*.055;
  energyTarget+=(0.08-energyTarget)*.018;
  const px=pointer.current.x,py=pointer.current.y;
  root.rotation.y+=reduceMotion?0:.0017;root.rotation.x+=(py*.18-root.rotation.x)*.028;root.rotation.z+=(px*-.08-root.rotation.z)*.025;
  root.position.x+=(px*.48-root.position.x)*.03;root.position.y+=(py*.26-root.position.y)*.03;
  const stage=Math.sin(scroll.current*Math.PI*3.0);
  root.scale.setScalar(1+stage*.035);
  shell.rotation.y=-root.rotation.y*.55+t*.02;shell.rotation.x=t*.015;
  halo.scale.setScalar(1+Math.sin(t*.35)*.035);
  stars.rotation.y=t*.0035+scroll.current*.18;
  camera.position.z=8.4-scroll.current*.55;
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
animate();
window.__THEARD_WEBGL__={renderer,scene,camera,activeScene};