// ChronoFlux Mesh with WebRTC — Cross-browser/machine swarm
const el=id=>document.getElementById(id);
const canvas=el('c'); const ctx=canvas.getContext('2d');
let W=innerWidth,H=innerHeight; canvas.width=W; canvas.height=H;

const room = location.hash.slice(1) || 'chrono-default';
el('roomName').textContent = room;

let running=false, nodes=[], t=0, intents=[], portal=false, peers=new Map();
let telemetryLog = [];
let webrtcPeers = new Map();
let signalingWs = null;
let myPeerId = null;

// SimplePeer configuration
const peerConfig = {
  initiator: false,
  trickle: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

// Initialize nodes
function rand(a,b){return a+Math.random()*(b-a)}; 
function clamp(x,a,b){return Math.max(a,Math.min(b,x))};

function reset(){
  nodes.length=0; const N=parseInt(el('nodes').value);
  for(let i=0;i<N;i++){ 
    nodes.push({id:i,x:rand(0,W),y:rand(0,H),vx:0,vy:0,p:0,phi:rand(0,Math.PI*2)}); 
  }
}
reset();

// Connect to signaling server
function connectSignaling() {
  const wsUrl = 'ws://localhost:8089';
  console.log(`🔌 Connecting to signaling server: ${wsUrl}`);
  
  signalingWs = new WebSocket(wsUrl);
  
  signalingWs.onopen = () => {
    console.log('✅ Connected to signaling server');
    // Join room
    signalingWs.send(JSON.stringify({
      type: 'join-room',
      room: room,
      metadata: {
        nodeCount: nodes.length,
        version: '1.0'
      }
    }));
  };
  
  signalingWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleSignalingMessage(msg);
  };
  
  signalingWs.onerror = (err) => {
    console.error('❌ Signaling error:', err);
  };
  
  signalingWs.onclose = () => {
    console.log('🔌 Disconnected from signaling server');
    // Attempt reconnect after 5s
    setTimeout(connectSignaling, 5000);
  };
}

function handleSignalingMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      myPeerId = msg.peerId;
      console.log(`🆔 My peer ID: ${myPeerId}`);
      el('peers').textContent = msg.peers.length;
      break;
      
    case 'room-peers':
      console.log(`👥 Peers in room: ${msg.peers.length}`);
      // Connect to each peer
      msg.peers.forEach(peerInfo => {
        connectToPeer(peerInfo.id, true);
      });
      break;
      
    case 'peer-joined-room':
      console.log(`➕ New peer joined: ${msg.peerId}`);
      connectToPeer(msg.peerId, false);
      break;
      
    case 'peer-left':
      console.log(`➖ Peer left: ${msg.peerId}`);
      if (webrtcPeers.has(msg.peerId)) {
        webrtcPeers.get(msg.peerId).destroy();
        webrtcPeers.delete(msg.peerId);
        peers.delete(msg.peerId);
      }
      updatePeerCount();
      break;
      
    case 'signal':
      handleWebRTCSignal(msg.from, msg.signal);
      break;
      
    case 'telemetry':
      // Update remote peer telemetry
      if (!peers.has(msg.from)) {
        peers.set(msg.from, {});
      }
      peers.set(msg.from, msg.telemetry);
      break;
  }
}

function connectToPeer(peerId, initiator) {
  if (webrtcPeers.has(peerId)) return;
  
  console.log(`🤝 Connecting to peer ${peerId} (initiator: ${initiator})`);
  
  const peer = new SimplePeer({
    ...peerConfig,
    initiator: initiator
  });
  
  peer.on('signal', data => {
    // Send signaling data through WebSocket
    signalingWs.send(JSON.stringify({
      type: 'signal',
      to: peerId,
      signal: data
    }));
  });
  
  peer.on('connect', () => {
    console.log(`✅ Connected to peer ${peerId}`);
    webrtcPeers.set(peerId, peer);
    updatePeerCount();
    
    // Send initial state
    peer.send(JSON.stringify({
      type: 'state',
      nodes: nodes.length,
      portal: portal,
      t: t
    }));
  });
  
  peer.on('data', data => {
    try {
      const msg = JSON.parse(data.toString());
      handlePeerMessage(peerId, msg);
    } catch (err) {
      console.error('Invalid peer message:', err);
    }
  });
  
  peer.on('error', err => {
    console.error(`❌ Peer ${peerId} error:`, err);
  });
  
  peer.on('close', () => {
    console.log(`🔌 Peer ${peerId} disconnected`);
    webrtcPeers.delete(peerId);
    peers.delete(peerId);
    updatePeerCount();
  });
  
  webrtcPeers.set(peerId, peer);
}

function handleWebRTCSignal(fromPeerId, signal) {
  let peer = webrtcPeers.get(fromPeerId);
  
  if (!peer) {
    // Create new peer connection
    peer = new SimplePeer(peerConfig);
    connectToPeer(fromPeerId, false);
    peer = webrtcPeers.get(fromPeerId);
  }
  
  peer.signal(signal);
}

function handlePeerMessage(peerId, msg) {
  switch (msg.type) {
    case 'state':
      console.log(`📊 Received state from ${peerId}`);
      break;
      
    case 'intent':
      // Add remote intent
      intents.push(msg.intent);
      console.log(`💫 Received intent from ${peerId}`);
      break;
      
    case 'portal':
      if (!portal) {
        portal = true;
        console.log(`🌀 Portal activated by ${peerId}`);
      }
      break;
      
    case 'flip':
      // Apply pacemaker flip
      for(const n of nodes){ 
        n.vx*=-0.6; n.vy*=-0.6; n.phi+=Math.PI/2; 
      }
      console.log(`⚡ Pacemaker flip from ${peerId}`);
      break;
  }
}

function updatePeerCount() {
  el('peers').textContent = webrtcPeers.size;
}

// Broadcast to all WebRTC peers
function broadcastToPeers(message) {
  const data = JSON.stringify(message);
  webrtcPeers.forEach((peer, peerId) => {
    if (peer.connected) {
      peer.send(data);
    }
  });
}

// Original mesh functions with WebRTC integration
function pressureAt(x,y,time){
  const dir={x:Math.cos(0.35), y:Math.sin(0.35)}, spacing=140, M=2.2;
  const cx=W*0.2, cy=H*0.78; const rx=x-cx, ry=y-cy;
  const s=rx*dir.x+ry*dir.y; const d=Math.abs(-dir.y*rx+dir.x*ry);
  const k=(Math.PI*2)/spacing; const phase = portal? 0 : (k*s - 1.4*time*M);
  let p = 0.55 + 0.45*Math.sin(phase)*Math.exp(-d*d/(2*(spacing*0.33)**2));
  for(const I of intents){ 
    const dx=x-I.x, dy=y-I.y; const r2=dx*dx+dy*dy; 
    p += I.E*Math.exp(-r2/(2*(I.sigma*I.sigma))); 
  }
  // Include remote peer pressure (simplified)
  for(const [id,P] of peers){ 
    if(P.intents) {
      for(const I of P.intents) {
        const dx=x-I.x, dy=y-I.y; const r2=dx*dx+dy*dy; 
        p += 0.5*I.E*Math.exp(-r2/(2*(80*80)));
      }
    }
  }
  return clamp(p,0,1.3);
}

function knn(i,k){ 
  const me=nodes[i]; 
  const arr=nodes.map((n,j)=> j===i? [1e9,j] : [(n.x-me.x)**2+(n.y-me.y)**2, j]); 
  arr.sort((a,b)=>a[0]-b[0]); 
  return arr.slice(0,k).map(d=>nodes[d[1]]); 
}

function harmonyR(){ 
  let sx=0,sy=0; 
  for(const n of nodes){ sx+=Math.cos(n.phi); sy+=Math.sin(n.phi); } 
  return Math.sqrt(sx*sx+sy*sy)/nodes.length; 
}

function turbulenceTau(){ 
  const S=24, dx=W/S, dy=H/S; let sum=0,cnt=0; 
  for(let i=1;i<S-1;i++){ 
    for(let j=1;j<S-1;j++){ 
      const x=i*dx,y=j*dy; 
      const px1=pressureAt(x+1,y,t), px2=pressureAt(x-1,y,t), 
            py1=pressureAt(x,y+1,t), py2=pressureAt(x,y-1,t); 
      sum+=Math.abs((px1-px2)-(py1-py2)); cnt++; 
    }
  } 
  return sum/cnt; 
}

function step(dt){
  const kappa=parseFloat(el('kappa').value), eta=parseFloat(el('eta').value), 
        gamma=parseFloat(el('gamma').value), kN=parseInt(el('kneigh').value);
  intents = intents.filter(I=> (I.E*=0.985) > 0.02);
  
  for(const n of nodes){
    const p=pressureAt(n.x,n.y,t), eps=1.5;
    const gx=(pressureAt(n.x+eps,n.y,t)-pressureAt(n.x-eps,n.y,t))/(2*eps);
    const gy=(pressureAt(n.x,n.y+eps,t)-pressureAt(n.x,n.y-eps,t))/(2*eps);
    n.vx += (-gamma*gx - eta*n.vx)*dt; n.vy += (-gamma*gy - eta*n.vy)*dt;
    n.x = (n.x + n.vx*dt*60 + W)%W; n.y = (n.y + n.vy*dt*60 + H)%H;
    n.p=p;
  }
  
  for(let i=0;i<nodes.length;i++){ 
    const me=nodes[i]; const neigh=knn(i,kN); let sum=0; 
    for(const nb of neigh) sum+=Math.sin(nb.phi-me.phi); 
    const omega=(portal?0.9:1.2)*Math.PI*2; 
    me.phi += (omega + (kappa/neigh.length)*sum)*dt; 
  }
}

function draw(){
  // Field visualization
  const img=ctx.createImageData(W,H);
  for(let y=0;y<H;y+=2){
    for(let x=0;x<W;x+=2){
      const p=pressureAt(x,y,t); const c=clamp((p*255)|0,0,255); const idx=(y*W+x)*4;
      img.data[idx+0]=10; img.data[idx+1]=c*0.55; img.data[idx+2]=c; img.data[idx+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  
  // Draw nodes
  for(const n of nodes){
    const hue=((n.phi%(Math.PI*2))/(Math.PI*2))*360; const alpha=0.5+0.5*n.p;
    ctx.fillStyle=`hsla(${hue},85%,60%,${alpha})`; 
    ctx.beginPath(); ctx.arc(n.x,n.y,2.0,0,Math.PI*2); ctx.fill();
  }
}

// Broadcast telemetry with WebRTC
function broadcastTelemetry(){
  const H = harmonyR();
  const tau = turbulenceTau();
  const telemetry = {
    t: t,
    H: H,
    tau: tau,
    nodes: nodes.length,
    intents: intents.slice(0,3).map(i => ({x: i.x, y: i.y, E: i.E}))
  };
  
  // Log telemetry
  telemetryLog.push({
    timestamp: Date.now(),
    ...telemetry
  });
  
  // Broadcast via WebRTC
  broadcastToPeers({
    type: 'telemetry',
    telemetry: telemetry
  });
  
  // Also send via signaling for redundancy
  if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
    signalingWs.send(JSON.stringify({
      type: 'telemetry',
      telemetry: telemetry
    }));
  }
}

// Enhanced intent function
function addIntent(){ 
  const x=rand(0,W), y=rand(0,H); const E=0.35; 
  const intent = {x,y,E,sigma:80};
  intents.push(intent); 
  
  // Broadcast to peers
  broadcastToPeers({
    type: 'intent',
    intent: intent
  });
  
  // Log event
  logEvent('intent', {x,y,E});
}

function lionGate(){ 
  portal=true; 
  broadcastToPeers({type: 'portal'});
  logEvent('lion_gate', {portal: true});
  
  // Take snapshot on significant events
  takeSnapshot('lion_gate');
}

function pacemakerFlip(){ 
  for(const n of nodes){ n.vx*=-0.6; n.vy*=-0.6; n.phi+=Math.PI/2; }
  broadcastToPeers({type: 'flip'});
  logEvent('pacemaker_flip', {});
  
  takeSnapshot('pacemaker_flip');
}

// Logging functions
function logEvent(type, data) {
  const event = {
    timestamp: Date.now(),
    type: type,
    data: data,
    metrics: {
      H: harmonyR(),
      tau: turbulenceTau()
    }
  };
  
  // Store in telemetry log
  telemetryLog.push(event);
  
  // Console log for debugging
  console.log(`📊 Event: ${type}`, event);
}

// Snapshot function
function takeSnapshot(eventType) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chrono-snapshot-${eventType}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Export telemetry log
function exportTelemetry() {
  const blob = new Blob([JSON.stringify(telemetryLog, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chrono-telemetry-${room}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Main loop
function loop(now){ 
  const dt=0.016; 
  if(running){ 
    t+=dt; 
    step(dt); 
    if((now|0)%1000<17) broadcastTelemetry(); // Every second
  } 
  draw(); 
  el('Hval').textContent=harmonyR().toFixed(2); 
  el('Tau').textContent=turbulenceTau().toFixed(2); 
  requestAnimationFrame(loop); 
}

// Initialize
connectSignaling();
loop(performance.now());

// UI handlers
el('toggle').onclick=()=>{ running=!running; el('toggle').textContent=running?'Pause':'Play'; };
el('lion').onclick=()=> lionGate();
el('flip').onclick=()=> pacemakerFlip();
el('pulse').onclick=()=> addIntent();

// Add export button
const exportBtn = document.createElement('button');
exportBtn.textContent = 'Export Telemetry';
exportBtn.onclick = exportTelemetry;
document.querySelector('.row').appendChild(exportBtn);

for(const id of ['nodes','kneigh','kappa','eta','gamma']){ 
  el(id).oninput=()=>{ if(id==='nodes') reset(); }; 
}

addEventListener('resize', ()=>{ W=innerWidth; H=innerHeight; canvas.width=W; canvas.height=H; });

// Add SimplePeer script
const script = document.createElement('script');
script.src = 'https://unpkg.com/simple-peer@9/simplepeer.min.js';
document.head.appendChild(script);