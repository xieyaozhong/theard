import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas=document.getElementById('field');
if(!canvas) throw new Error('THEARD WebGL stage missing');

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer:coarse)').matches;
const mobile=innerWidth<700||coarse;
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!mobile,powerPreference:'high-performance'});
const pixelCap=mobile?1.05:1.5;
renderer.setPixelRatio(Math.min(devicePixelRatio||1,pixelCap));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(mobile?49:43,1,.1,100);
const root=new THREE.Group();scene.add(root);
const clock=new THREE.Clock();
const pointer={target:new THREE.Vector2(),current:new THREE.Vector2()};
let targetState=0,currentState=0,energyTarget=.05,stageW=innerWidth,stageH=innerHeight,visible=!document.hidden;

const count=mobile?960:2400;
const attrs={home:new Float32Array(count*3),system:new Float32Array(count*3),content:new Float32Array(count*3),product:new Float32Array(count*3),publish:new Float32Array(count*3),live:new Float32Array(count*3),finale:new Float32Array(count*3),scatter:new Float32Array(count*3),seed:new Float32Array(count)};
const golden=Math.PI*(3-Math.sqrt(5));
const rnd=(i,k=1)=>{const x=Math.sin((i+1)*12.9898*k)*43758.5453123;return x-Math.floor(x)};
const write=(arr,i,x,y,z)=>{arr[i*3]=x;arr[i*3+1]=y;arr[i*3+2]=z};

for(let i=0;i<count;i++){
  const u=i/Math.max(count-1,1),y=1-u*2,rr=Math.sqrt(Math.max(0,1-y*y)),theta=golden*i;
  const nx=Math.cos(theta)*rr,ny=y,nz=Math.sin(theta)*rr,seed=rnd(i,2.31);attrs.seed[i]=seed;
  const homeR=2.38+(seed-.5)*.18;write(attrs.home,i,nx*homeR,ny*homeR,nz*homeR);

  const torusA=theta,torusB=golden*i*2.17,R=2.35,r=.48+(seed-.5)*.16;
  write(attrs.system,i,(R+r*Math.cos(torusB))*Math.cos(torusA),(r*Math.sin(torusB))*.9,(R+r*Math.cos(torusB))*Math.sin(torusA));

  const sx=(u-.5)*5.5,phase=u*Math.PI*9.0,band=(rnd(i,4.6)-.5)*.58;
  write(attrs.content,i,sx,Math.sin(phase)*.82+band,Math.cos(phase*.83)*.65+(seed-.5)*.75);

  const g=i%4,cx=(g%2?1:-1)*1.55,cy=(g>1?-1:1)*1.05,mini=.72+(seed-.5)*.14;
  write(attrs.product,i,cx+nx*mini,cy+ny*mini,nz*mini*.9);

  const fy=(u-.5)*4.8,fr=.26+Math.pow(Math.abs(u-.5)*2,.85)*2.25,fa=theta*1.7;
  write(attrs.publish,i,Math.cos(fa)*fr,fy,Math.sin(fa)*fr);

  const pa=theta,pr=2.55+(rnd(i,7.4)-.5)*.38,pdepth=(rnd(i,8.2)-.5)*.58;
  write(attrs.live,i,Math.cos(pa)*pr,Math.sin(pa)*pr,pdepth);

  const finaleR=2.75+.42*Math.sin(theta*3.0)+(seed-.5)*.18;
  write(attrs.finale,i,nx*finaleR,ny*finaleR,nz*finaleR);

  const sr=5.5+rnd(i,9.7)*6.5,sa=rnd(i,10.3)*Math.PI*2,sp=Math.acos(rnd(i,11.1)*2-1);
  write(attrs.scatter,i,Math.sin(sp)*Math.cos(sa)*sr,Math.cos(sp)*sr,Math.sin(sp)*Math.sin(sa)*sr);
}

const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.BufferAttribute(attrs.home,3));
geometry.setAttribute('aSystem',new THREE.BufferAttribute(attrs.system,3));
geometry.setAttribute('aContent',new THREE.BufferAttribute(attrs.content,3));
geometry.setAttribute('aProduct',new THREE.BufferAttribute(attrs.product,3));
geometry.setAttribute('aPublish',new THREE.BufferAttribute(attrs.publish,3));
geometry.setAttribute('aLive',new THREE.BufferAttribute(attrs.live,3));
geometry.setAttribute('aFinale',new THREE.BufferAttribute(attrs.finale,3));
geometry.setAttribute('aScatter',new THREE.BufferAttribute(attrs.scatter,3));
geometry.setAttribute('aSeed',new THREE.BufferAttribute(attrs.seed,1));

const vertexShader=`
attribute vec3 aSystem;
attribute vec3 aContent;
attribute vec3 aProduct;
attribute vec3 aPublish;
attribute vec3 aLive;
attribute vec3 aFinale;
attribute vec3 aScatter;
attribute float aSeed;
uniform float uTime;
uniform float uState;
uniform float uIntro;
uniform float uEnergy;
uniform vec2 uPointer;
varying float vPulse;
varying float vSeed;
vec3 morphState(float s){
  if(s<1.0){float t=smoothstep(0.0,1.0,s);return mix(position,aSystem,t);}
  if(s<2.0){float t=smoothstep(0.0,1.0,s-1.0);return mix(aSystem,aContent,t);}
  if(s<3.0){float t=smoothstep(0.0,1.0,s-2.0);return mix(aContent,aProduct,t);}
  if(s<4.0){float t=smoothstep(0.0,1.0,s-3.0);return mix(aProduct,aPublish,t);}
  if(s<5.0){float t=smoothstep(0.0,1.0,s-4.0);return mix(aPublish,aLive,t);}
  float t=smoothstep(0.0,1.0,clamp(s-5.0,0.0,1.0));return mix(aLive,aFinale,t);
}
void main(){
  vec3 target=morphState(clamp(uState,0.0,6.0));
  float intro=smoothstep(0.0,1.0,uIntro);
  vec3 p=mix(aScatter,target,intro);
  vec3 n=normalize(p+vec3(.0001));
  float wave=(sin(p.x*1.55+uTime*.82+aSeed*4.0)+sin(p.y*2.1-uTime*.61))*0.045;
  p+=n*wave;
  vec2 q=p.xy/3.3;
  float d=distance(q,uPointer*.78);
  float disturb=smoothstep(.72,.02,d)*uEnergy;
  p+=n*disturb*.42;
  p.xy+=(q-uPointer*.78)*disturb*.055;
  vPulse=disturb+abs(wave)*2.0;
  vSeed=aSeed;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=(1.65+aSeed*1.35+disturb*2.4)*(8.5/max(1.0,-mv.z));
}`;

const fragmentShader=`
uniform vec3 uColor;
varying float vPulse;
varying float vSeed;
void main(){
  vec2 c=gl_PointCoord-.5;
  float a=smoothstep(.5,.08,length(c));
  vec3 color=uColor+vec3(vSeed*.055+vPulse*.13);
  a*=.34+vSeed*.22+vPulse*.35;
  gl_FragColor=vec4(color,a);
}`;

const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uState:{value:0},uIntro:{value:0},uEnergy:{value:0},uPointer:{value:new THREE.Vector2()},uColor:{value:new THREE.Color('#d9ff3f')}},vertexShader,fragmentShader});
const matter=new THREE.Points(geometry,material);root.add(matter);

const starGeo=new THREE.BufferGeometry(),starCount=mobile?120:360,starPos=new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){const r=8+rnd(i,12.4)*12,a=rnd(i,13.7)*Math.PI*2,p=Math.acos(rnd(i,14.9)*2-1);starPos[i*3]=Math.sin(p)*Math.cos(a)*r;starPos[i*3+1]=Math.cos(p)*r;starPos[i*3+2]=Math.sin(p)*Math.sin(a)*r-5}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xaeb8aa,size:.018,transparent:true,opacity:.16,depthWrite:false}));scene.add(stars);

const anchorEls=[document.getElementById('home'),document.getElementById('system'),document.querySelector('.case'),document.getElementById('case-product'),document.getElementById('case-publish'),document.getElementById('live'),document.querySelector('.finale')].filter(Boolean);
let anchors=[];
function measureAnchors(){anchors=anchorEls.map(el=>{const r=el.getBoundingClientRect();return r.top+scrollY+r.height*.5});updateTimeline();}
function updateTimeline(){if(!anchors.length)return;const y=scrollY+innerHeight*.5;if(y<=anchors[0]){targetState=0;return}if(y>=anchors[anchors.length-1]){targetState=6;return}for(let i=0;i<anchors.length-1;i++){if(y>=anchors[i]&&y<=anchors[i+1]){const t=(y-anchors[i])/Math.max(anchors[i+1]-anchors[i],1);targetState=i+t;break}}}

if(!coarse&&!reduced){addEventListener('pointermove',e=>{pointer.target.x=(e.clientX/innerWidth)*2-1;pointer.target.y=-((e.clientY/innerHeight)*2-1);energyTarget=.58},{passive:true});addEventListener('pointerleave',()=>{pointer.target.set(0,0);energyTarget=.05})}
addEventListener('scroll',updateTimeline,{passive:true});

function resize(){stageW=innerWidth;stageH=window.visualViewport?.height||innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio||1,pixelCap));renderer.setSize(stageW,stageH,false);camera.aspect=stageW/stageH;camera.updateProjectionMatrix();measureAnchors()}
addEventListener('resize',resize,{passive:true});window.visualViewport?.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>visible=!document.hidden);

const acid=new THREE.Color('#d9ff3f'),ink=new THREE.Color('#151813'),colorTarget=new THREE.Color(),colorCurrent=acid.clone();
const xStates=mobile?[0,0,0,0,0,0,0]:[1.2,1.35,.9,.65,.85,0,.55];
const scaleStates=mobile?[.84,.82,.78,.8,.8,.82,.82]:[1,1,.93,.94,.92,.9,.96];
function sample(arr,s){const a=Math.floor(clamp(s,0,arr.length-1)),b=Math.min(a+1,arr.length-1),t=clamp(s-a);return THREE.MathUtils.lerp(arr[a],arr[b],t)}
function clamp(v,min=0,max=1){return Math.max(min,Math.min(max,v))}

function animate(){
  requestAnimationFrame(animate);if(!visible)return;
  const t=reduced?3:clock.getElapsedTime();
  currentState+=(targetState-currentState)*.045;
  pointer.current.lerp(pointer.target,.07);
  energyTarget+=(.045-energyTarget)*.025;
  material.uniforms.uTime.value=t;
  material.uniforms.uState.value=currentState;
  material.uniforms.uIntro.value=reduced?1:clamp((t-.78)/1.62);
  material.uniforms.uPointer.value.copy(pointer.current);
  material.uniforms.uEnergy.value+=(energyTarget-material.uniforms.uEnergy.value)*.07;

  const liveMix=smoothRange(currentState,4.45,5.35);colorTarget.copy(acid).lerp(ink,liveMix*.92);colorCurrent.lerp(colorTarget,.055);material.uniforms.uColor.value.copy(colorCurrent);
  const px=pointer.current.x,py=pointer.current.y;
  const x=sample(xStates,currentState)+(coarse?0:px*.09),sc=sample(scaleStates,currentState);
  root.position.x+=(x-root.position.x)*.045;root.position.y+=((coarse?0:py*.05)-root.position.y)*.045;root.scale.setScalar(sc);
  root.rotation.y=(reduced?0:t*.028)+Math.sin(t*.22)*.075+currentState*.055+(coarse?0:px*.045);
  root.rotation.x=Math.sin(t*.17)*.035+(coarse?0:py*.035);
  root.rotation.z=Math.sin(currentState*.72)*.045;

  camera.position.x=(reduced?0:Math.sin(t*.19)*.095)+Math.sin(currentState*.62)*.035;
  camera.position.y=reduced?0:Math.cos(t*.16)*.052;
  camera.position.z=(mobile?10.1:9.15)+Math.sin(currentState*.5)*.16;
  camera.lookAt(0,0,0);
  stars.rotation.y=reduced?0:t*.0016+currentState*.018;
  renderer.render(scene,camera);
}
function smoothRange(v,a,b){return clamp((v-a)/(b-a))}

resize();animate();
window.__THEARD_WEBGL__={renderer,scene,camera,get state(){return currentState}};
