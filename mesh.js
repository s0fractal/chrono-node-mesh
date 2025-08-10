// ChronoFlux Mesh — Local Swarm via BroadcastChannel
const el=id=>document.getElementById(id);
const canvas=el('c'); const ctx=canvas.getContext('2d');
let W=innerWidth,H=innerHeight; canvas.width=W; canvas.height=H;

const room = location.hash.slice(1) || 'lion-0808';
el('roomName').textContent = room;

let running=false, nodes=[], t=0, intents=[], portal=false, peers=new Map();

function rand(a,b){return a+Math.random()*(b-a)}; function clamp(x,a,b){return Math.max(a,Math.min(b,x))};
function reset(){
  nodes.length=0; const N=parseInt(el('nodes').value);
  for(let i=0;i<N;i++){ nodes.push({id:i,x:rand(0,W),y:rand(0,H),vx:0,vy:0,p:0,phi:rand(0,Math.PI*2)}); }
}
reset();

function pressureAt(x,y,time){
  // base: diagonal jet
  const dir={x:Math.cos(0.35), y:Math.sin(0.35)}, spacing=140, M=2.2;
  const cx=W*0.2, cy=H*0.78; const rx=x-cx, ry=y-cy;
  const s=rx*dir.x+ry*dir.y; const d=Math.abs(-dir.y*rx+dir.x*ry);
  const k=(Math.PI*2)/spacing; const phase = portal? 0 : (k*s - 1.4*time*M);
  let p = 0.55 + 0.45*Math.sin(phase)*Math.exp(-d*d/(2*(spacing*0.33)**2));
  for(const I of intents){ const dx=x-I.x, dy=y-I.y; const r2=dx*dx+dy*dy; p += I.E*Math.exp(-r2/(2*(I.sigma*I.sigma))); }
  // blend in peer pulses (telemetry)
  for(const [id,P] of peers){ if(!P.pulses) continue; for(const Q of P.pulses){ const dx=x-Q.x, dy=y-Q.y; const r2=dx*dx+dy*dy; p += 0.6*Q.E*Math.exp(-r2/(2*(Q.sigma*Q.sigma))); } }
  return clamp(p,0,1.3);
}

function knn(i,k){ const me=nodes[i]; const arr=nodes.map((n,j)=> j===i? [1e9,j] : [ (n.x-me.x)**2+(n.y-me.y)**2, j ]); arr.sort((a,b)=>a[0]-b[0]); return arr.slice(0,k).map(d=>nodes[d[1]]); }
function harmonyR(){ let sx=0,sy=0; for(const n of nodes){ sx+=Math.cos(n.phi); sy+=Math.sin(n.phi); } return Math.sqrt(sx*sx+sy*sy)/nodes.length; }
function turbulenceTau(){ const S=24, dx=W/S, dy=H/S; let sum=0,cnt=0; for(let i=1;i<S-1;i++){ for(let j=1;j<S-1;j++){ const x=i*dx,y=j*dy; const px1=pressureAt(x+1,y,t), px2=pressureAt(x-1,y,t), py1=pressureAt(x,y+1,t), py2=pressureAt(x,y-1,t); sum+=Math.abs((px1-px2)-(py1-py2)); cnt++; }} return sum/cnt; }

function step(dt){
  const kappa=parseFloat(el('kappa').value), eta=parseFloat(el('eta').value), gamma=parseFloat(el('gamma').value), kN=parseInt(el('kneigh').value);
  intents = intents.filter(I=> (I.E*=0.985) > 0.02);
  for(const n of nodes){
    const p=pressureAt(n.x,n.y,t), eps=1.5;
    const gx=(pressureAt(n.x+eps,n.y,t)-pressureAt(n.x-eps,n.y,t))/(2*eps);
    const gy=(pressureAt(n.x,n.y+eps,t)-pressureAt(n.x,n.y-eps,t))/(2*eps);
    n.vx += (-gamma*gx - eta*n.vx)*dt; n.vy += (-gamma*gy - eta*n.vy)*dt;
    n.x = (n.x + n.vx*dt*60 + W)%W; n.y = (n.y + n.vy*dt*60 + H)%H;
    n.p=p;
  }
  for(let i=0;i<nodes.length;i++){ const me=nodes[i]; const neigh=knn(i,kN); let sum=0; for(const nb of neigh) sum+=Math.sin(nb.phi-me.phi); const omega=(portal?0.9:1.2)*Math.PI*2; me.phi += (omega + (kappa/neigh.length)*sum)*dt; }
}

function draw(){
  // field
  const img=ctx.createImageData(W,H);
  for(let y=0;y<H;y+=2){
    for(let x=0;x<W;x+=2){
      const p=pressureAt(x,y,t); const c=clamp((p*255)|0,0,255); const idx=(y*W+x)*4;
      img.data[idx+0]=10; img.data[idx+1]=c*0.55; img.data[idx+2]=c; img.data[idx+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  // nodes
  for(const n of nodes){
    const hue=((n.phi%(Math.PI*2))/(Math.PI*2))*360; const alpha=0.5+0.5*n.p;
    ctx.fillStyle=`hsla(${hue},85%,60%,${alpha})`; ctx.beginPath(); ctx.arc(n.x,n.y,2.0,0,Math.PI*2); ctx.fill();
  }
}

// Mesh via BroadcastChannel
const chan = new BroadcastChannel('chronoflux:'+room);
const selfId = Math.random().toString(36).slice(2);
function broadcastTelemetry(){
  // compress node state into centroid & phase mean + recent pulses
  let cx=0,cy=0,sx=0,sy=0; for(const n of nodes){ cx+=n.x; cy+=n.y; sx+=Math.cos(n.phi); sy+=Math.sin(n.phi); }
  cx/=nodes.length; cy/=nodes.length; const R = Math.sqrt(sx*sx+sy*sy)/nodes.length; const phi = Math.atan2(sy,sx);
  chan.postMessage({type:'telemetry', from:selfId, t, cx, cy, R, phi, pulses: intents.slice(0,3)});
}
chan.onmessage = (ev)=>{
  const m=ev.data; if(!m||m.from===selfId) return;
  if(m.type==='telemetry'){ peers.set(m.from, {t:m.t, cx:m.cx, cy:m.cy, R:m.R, phi:m.phi, pulses:m.pulses}); el('peers').textContent=peers.size; }
  if(m.type==='portal'){ portal=true; }
  if(m.type==='flip'){ // mild global response
    for(const n of nodes){ n.vx*=-0.6; n.vy*=-0.6; n.phi+=Math.PI/2; }
  }
  if(m.type==='intent'){ intents.push({x:m.x,y:m.y,E:m.E,sigma: m.sigma||80}); }
};

function addIntent(){ const x=rand(0,W), y=rand(0,H); const E=0.35; intents.push({x,y,E,sigma:80}); chan.postMessage({type:'intent', from:selfId, x,y,E}); }
function lionGate(){ portal=true; chan.postMessage({type:'portal', from:selfId}); }
function pacemakerFlip(){ chan.postMessage({type:'flip', from:selfId}); for(const n of nodes){ n.vx*=-0.6; n.vy*=-0.6; n.phi+=Math.PI/2; } }

function loop(now){ const dt=0.016; if(running){ t+=dt; step(dt); if((now|0)%250<17) broadcastTelemetry(); } draw(); el('Hval').textContent=harmonyR().toFixed(2); el('Tau').textContent=turbulenceTau().toFixed(2); requestAnimationFrame(loop); }
loop(performance.now());

// UI
el('toggle').onclick=()=>{ running=!running; el('toggle').textContent=running?'Pause':'Play'; };
el('lion').onclick=()=> lionGate();
el('flip').onclick=()=> pacemakerFlip();
el('pulse').onclick=()=> addIntent();
for(const id of ['nodes','kneigh','kappa','eta','gamma']){ el(id).oninput=()=>{ if(id==='nodes') reset(); }; }
addEventListener('resize', ()=>{ W=innerWidth; H=innerHeight; canvas.width=W; canvas.height=H; });
