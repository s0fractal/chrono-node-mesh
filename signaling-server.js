#!/usr/bin/env node

/**
 * Minimal WebRTC Signaling Server for ChronoFlux Mesh
 * Ephemeral WebSocket relay for peer discovery
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8089;

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ChronoFlux Signaling Server\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Track connected peers
const peers = new Map();
let peerIdCounter = 0;

wss.on('connection', (ws) => {
  const peerId = `peer-${++peerIdCounter}`;
  
  // Store peer connection
  peers.set(peerId, {
    id: peerId,
    ws: ws,
    room: null,
    metadata: {}
  });
  
  console.log(`✅ Peer connected: ${peerId}`);
  
  // Send peer their ID
  ws.send(JSON.stringify({
    type: 'welcome',
    peerId: peerId,
    peers: Array.from(peers.keys()).filter(id => id !== peerId)
  }));
  
  // Notify others of new peer
  broadcast({
    type: 'peer-joined',
    peerId: peerId
  }, peerId);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(peerId, data);
    } catch (err) {
      console.error('Invalid message:', err);
    }
  });
  
  ws.on('close', () => {
    console.log(`❌ Peer disconnected: ${peerId}`);
    peers.delete(peerId);
    
    // Notify others
    broadcast({
      type: 'peer-left',
      peerId: peerId
    });
  });
  
  ws.on('error', (err) => {
    console.error(`Peer ${peerId} error:`, err);
  });
});

function handleMessage(fromPeerId, data) {
  const peer = peers.get(fromPeerId);
  if (!peer) return;
  
  switch (data.type) {
    case 'join-room':
      peer.room = data.room;
      peer.metadata = data.metadata || {};
      console.log(`🏠 ${fromPeerId} joined room: ${data.room}`);
      
      // Send list of peers in same room
      const roomPeers = Array.from(peers.entries())
        .filter(([id, p]) => p.room === data.room && id !== fromPeerId)
        .map(([id, p]) => ({ id, metadata: p.metadata }));
      
      peer.ws.send(JSON.stringify({
        type: 'room-peers',
        peers: roomPeers
      }));
      
      // Notify room members
      broadcastToRoom(data.room, {
        type: 'peer-joined-room',
        peerId: fromPeerId,
        metadata: peer.metadata
      }, fromPeerId);
      break;
      
    case 'signal':
      // Relay WebRTC signaling data
      const targetPeer = peers.get(data.to);
      if (targetPeer) {
        targetPeer.ws.send(JSON.stringify({
          type: 'signal',
          from: fromPeerId,
          signal: data.signal
        }));
      }
      break;
      
    case 'broadcast':
      // Broadcast to room
      if (peer.room) {
        broadcastToRoom(peer.room, {
          type: 'broadcast',
          from: fromPeerId,
          data: data.data
        }, fromPeerId);
      }
      break;
      
    case 'telemetry':
      // Store and relay telemetry
      peer.metadata.telemetry = data.telemetry;
      if (peer.room) {
        broadcastToRoom(peer.room, {
          type: 'telemetry',
          from: fromPeerId,
          telemetry: data.telemetry
        }, fromPeerId);
      }
      break;
  }
}

function broadcast(data, excludePeerId = null) {
  const message = JSON.stringify(data);
  peers.forEach((peer, id) => {
    if (id !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(message);
    }
  });
}

function broadcastToRoom(room, data, excludePeerId = null) {
  const message = JSON.stringify(data);
  peers.forEach((peer, id) => {
    if (peer.room === room && id !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(message);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 ChronoFlux Signaling Server running on port ${PORT}`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`   Rooms are ephemeral - no persistence`);
  console.log(`   Ready for P2P mesh connections...\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down signaling server...');
  wss.close(() => {
    server.close(() => {
      console.log('   Server closed. Goodbye!');
      process.exit(0);
    });
  });
});