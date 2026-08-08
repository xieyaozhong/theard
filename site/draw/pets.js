const PET_CSS='pets.css?v=2';
if(!document.querySelector(`link[href="${PET_CSS}"]`)){const l=document.createElement('link');l.rel='stylesheet';l.href=PET_CSS;document.head.appendChild(l)}

const SPECIES=['VOID CAT','SPARK BUN','MOSS BLOB','ORB MOTH','TINY GOLEM','GLITCH FOX'];
const ELEMENTS=['SIGNAL','EMBER','TIDE','MOSS','VOID','STATIC'];
const TEMPERAMENTS=['好奇','冷靜','黏人','勇敢','貪睡','機警','愛搗蛋','慢熟'];
const PREFIX=['PIX','MIMI','NOVA','BIBI','MOCHI','KIKI','LUMI','TOTO','NINI','ZUZU','PICO','MOMO'];
const SUFFIX=['-01','-X','-MI','-KO','-BYTE','-POP','-LU','-ON','-PI','-NOVA','-Q','-NE'];
const PALETTES=[
  ['#d9ff3f','#85a32a','#182014','#f4ffe2'],['#85d8ff','#31749b','#101c28','#e7f8ff'],['#ff916f','#a74431','#291510','#fff1e8'],['#d5a2ff','#724b96','#1b1225','#f7edff'],['#f6e47a','#958529','#26220f','#fffbea'],['#9cffbd','#3b8154','#0d2115','#eafff0'],['#ff9bd2','#98466f','#28121f','#ffeaf6'],['#d0d4d0','#656b65','#171a17','#ffffff']
];

function hashString(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function pick(arr,r){return arr[Math.floor(r()*arr.length)%arr.length]}
function rarity(v){if(v>.985)return'MYTHIC';if(v>.90)return'RARE';if(v>.72)return'UNCOMMON';return'COMMON'}

export function generatePet(ticketCode,passName='',serial=1){
  const seed=hashString(`${ticketCode}|${passName}|${serial}`),r=rng(seed);
  const species=pick(SPECIES,r),element=pick(ELEMENTS,r),temperament=pick(TEMPERAMENTS,r),paletteIndex=Math.floor(r()*PALETTES.length),eye=Math.floor(r()*5),mark=Math.floor(r()*6),accessory=Math.floor(r()*6),variant=Math.floor(r()*4),rare=rarity(r());
  const name=`${pick(PREFIX,r)}${pick(SUFFIX,r)}`;
  return{version:1,id:`PET-${ticketCode.replace(/[^A-Z0-9]/gi,'').slice(-6)}`,name,species,element,temperament,rarity:rare,paletteIndex,eye,mark,accessory,variant,seed};
}

function pixel(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}
function dot(ctx,x,y,c){pixel(ctx,x,y,1,1,c)}
function drawBackground(ctx,r,p){for(let i=0;i<16;i++){if(r()>.66)dot(ctx,2+Math.floor(r()*20),2+Math.floor(r()*20),p[1]+'66')}}
function bodyBlob(ctx,p){pixel(ctx,6,9,12,9,p[1]);pixel(ctx,4,12,16,6,p[0]);pixel(ctx,6,18,12,2,p[0])}
function drawSpecies(ctx,pet,r){const p=PALETTES[pet.paletteIndex];drawBackground(ctx,r,p);
  switch(pet.species){
    case'VOID CAT':pixel(ctx,6,7,4,4,p[0]);pixel(ctx,14,7,4,4,p[0]);pixel(ctx,7,5,3,4,p[0]);pixel(ctx,14,5,3,4,p[0]);bodyBlob(ctx,p);pixel(ctx,18,14,3,2,p[1]);pixel(ctx,20,12,2,3,p[0]);break;
    case'SPARK BUN':pixel(ctx,8,3,3,8,p[0]);pixel(ctx,14,3,3,8,p[0]);pixel(ctx,9,4,1,5,p[2]);pixel(ctx,15,4,1,5,p[2]);bodyBlob(ctx,p);pixel(ctx,19,16,3,3,p[3]);break;
    case'MOSS BLOB':pixel(ctx,5,10,14,10,p[0]);pixel(ctx,4,13,16,5,p[0]);pixel(ctx,7,8,3,3,p[1]);pixel(ctx,12,7,3,4,p[1]);pixel(ctx,16,9,2,3,p[1]);break;
    case'ORB MOTH':pixel(ctx,9,8,6,12,p[0]);pixel(ctx,3,10,6,7,p[1]);pixel(ctx,15,10,6,7,p[1]);pixel(ctx,2,12,5,4,p[0]);pixel(ctx,17,12,5,4,p[0]);pixel(ctx,10,5,1,4,p[3]);pixel(ctx,14,5,1,4,p[3]);dot(ctx,9,4,p[3]);dot(ctx,15,4,p[3]);break;
    case'TINY GOLEM':pixel(ctx,7,7,10,7,p[0]);pixel(ctx,5,14,14,6,p[1]);pixel(ctx,3,14,3,5,p[0]);pixel(ctx,18,14,3,5,p[0]);pixel(ctx,7,20,4,2,p[0]);pixel(ctx,13,20,4,2,p[0]);break;
    default:pixel(ctx,6,6,5,5,p[0]);pixel(ctx,13,6,5,5,p[0]);pixel(ctx,7,4,4,4,p[0]);pixel(ctx,14,4,4,4,p[0]);bodyBlob(ctx,p);pixel(ctx,18,13,4,2,p[0]);pixel(ctx,20,11,2,3,p[1]);break;
  }
  const ex=9,ey=12,ex2=15;
  if(pet.eye===0){pixel(ctx,ex,ey,2,2,p[2]);pixel(ctx,ex2,ey,2,2,p[2])}
  else if(pet.eye===1){pixel(ctx,ex,ey,2,1,p[2]);pixel(ctx,ex2,ey,2,1,p[2]);dot(ctx,10,ey,p[3]);dot(ctx,16,ey,p[3])}
  else if(pet.eye===2){pixel(ctx,ex,ey,1,2,p[2]);pixel(ctx,ex2+1,ey,1,2,p[2])}
  else if(pet.eye===3){pixel(ctx,ex,ey,3,1,p[2]);pixel(ctx,ex2,ey,3,1,p[2])}
  else{pixel(ctx,10,ey,1,1,p[3]);pixel(ctx,16,ey,1,1,p[3]);pixel(ctx,9,ey+1,2,1,p[2]);pixel(ctx,15,ey+1,2,1,p[2])}
  if(pet.mark===1)pixel(ctx,11,15,4,1,p[1]);if(pet.mark===2){dot(ctx,8,15,p[3]);dot(ctx,17,15,p[3])}if(pet.mark===3){pixel(ctx,11,9,3,1,p[1]);pixel(ctx,12,8,1,3,p[1])}if(pet.mark===4){pixel(ctx,7,17,3,1,p[2]);pixel(ctx,15,17,3,1,p[2])}if(pet.mark===5){dot(ctx,12,16,p[3]);dot(ctx,13,16,p[3])}
  if(pet.accessory===1){pixel(ctx,11,2,3,2,p[3]);pixel(ctx,12,1,1,4,p[3])}
  if(pet.accessory===2){pixel(ctx,5,8,3,2,p[3]);pixel(ctx,16,8,3,2,p[3])}
  if(pet.accessory===3){pixel(ctx,10,20,5,1,p[3]);pixel(ctx,11,21,3,1,p[3])}
  if(pet.accessory===4){dot(ctx,4,7,p[3]);dot(ctx,20,6,p[3]);dot(ctx,21,18,p[3])}
  if(pet.accessory===5){pixel(ctx,11,4,3,2,p[3]);pixel(ctx,12,3,1,4,p[3])}
}

export function drawPet(canvas,pet){if(!canvas||!pet)return;canvas.width=24;canvas.height=24;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,24,24);const r=rng(pet.seed);drawSpecies(ctx,pet,r)}

let ui=null;
function ensureUI(){if(ui)return ui;const machine=document.querySelector('.machine'),screenShell=document.querySelector('.screen-shell'),ticketMain=document.querySelector('.ticket-main');if(!machine||!screenShell||!ticketMain)return null;
  const bay=document.createElement('section');bay.className='pet-bay';bay.innerHTML=`<div class="pet-vault"><div class="pet-screen"><canvas class="pet-canvas" id="petCanvas" width="24" height="24"></canvas><span class="pet-placeholder">NO COMPANION SIGNAL</span></div></div><div class="pet-data"><span class="pet-kicker">// PERSONAL DIGITAL COMPANION</span><h3 class="pet-name" id="petName">WAITING...</h3><div class="pet-stats"><div class="pet-stat"><span>SPECIES</span><b id="petSpecies">—</b></div><div class="pet-stat"><span>ELEMENT</span><b id="petElement">—</b></div><div class="pet-stat"><span>PERSONALITY</span><b id="petTemper">—</b></div><div class="pet-stat"><span>RARITY</span><b id="petRarity">—</b></div><div class="pet-stat"><span>BOND</span><b>LV.01</b></div><div class="pet-stat"><span>STATE</span><b>HATCHED</b></div></div><div class="pet-id">COMPANION ID / <b id="petId">—</b></div></div>`;screenShell.after(bay);
  const chip=document.createElement('div');chip.className='ticket-pet-chip';chip.innerHTML='<canvas width="24" height="24"></canvas><div>PET<strong>—</strong></div>';ticketMain.appendChild(chip);
  ui={bay,canvas:bay.querySelector('#petCanvas'),name:bay.querySelector('#petName'),species:bay.querySelector('#petSpecies'),element:bay.querySelector('#petElement'),temper:bay.querySelector('#petTemper'),rarity:bay.querySelector('#petRarity'),id:bay.querySelector('#petId'),chip,chipCanvas:chip.querySelector('canvas'),chipName:chip.querySelector('strong')};return ui}

export function revealPet(pet,{animate=true}={}){const x=ensureUI();if(!x||!pet)return;x.name.textContent=pet.name;x.species.textContent=pet.species;x.element.textContent=pet.element;x.temper.textContent=pet.temperament;x.rarity.textContent=pet.rarity;x.rarity.className=`pet-rarity--${pet.rarity}`;x.id.textContent=pet.id;x.chipName.textContent=pet.name;drawPet(x.canvas,pet);drawPet(x.chipCanvas,pet);x.bay.classList.remove('awake','hatching');void x.bay.offsetWidth;if(animate){x.bay.classList.add('hatching');setTimeout(()=>{x.bay.classList.remove('hatching');x.bay.classList.add('awake')},760)}else{x.bay.classList.add('awake')}}
export function hidePet(){const x=ensureUI();if(!x)return;x.bay.classList.remove('awake','hatching');x.name.textContent='WAITING...';x.species.textContent=x.element.textContent=x.temper.textContent=x.rarity.textContent=x.id.textContent='—';x.chipName.textContent='—';[x.canvas,x.chipCanvas].forEach(c=>c.getContext('2d').clearRect(0,0,c.width,c.height))}
export function retrofit(history=[]){let changed=false;history.forEach((entry,i)=>{if(!entry.pet&&entry.code){entry.pet=generatePet(entry.code,entry.name,i+1);changed=true}});return changed}
export function bootPet(history=[]){ensureUI();if(history.length){const last=history[history.length-1];if(last.pet)revealPet(last.pet,{animate:false})}}

ensureUI();
export default{generatePet,drawPet,revealPet,hidePet,retrofit,bootPet};