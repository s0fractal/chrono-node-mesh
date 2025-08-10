#!/usr/bin/env node

/**
 * Headless ChronoFlux Node
 * Runs without canvas for autonomous operation and telemetry logging
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class HeadlessChronoNode {
  constructor(config = {}) {
    this.room = config.room || 'headless-swarm';
    this.nodeId = config.nodeId || `headless-${Date.now()}`;
    this.nodeCount = config.nodeCount || 100;
    
    // Simulation state
    this.nodes = [];
    this.intents = [];
    this.portal = false;
    this.t = 0;
    this.running = true;
    
    // Parameters
    this.params = {
      kappa: 0.7,
      eta: 0.18,
      gamma: 0.55,
      kneigh: 8
    };
    
    // Telemetry
    this.telemetryLog = [];
    this.logFile = path.join(__dirname, 'logs', `chrono-${this.nodeId}-${Date.now()}.json`);
    
    // Ensure logs directory exists
    if (!fs.existsSync(path.join(__dirname, 'logs'))) {
      fs.mkdirSync(path.join(__dirname, 'logs'));
    }
    
    // WebRTC peers simulation
    this.peers = new Map();
    
    this.initialize();
  }
  
  initialize() {
    console.log(`🤖 Headless ChronoFlux Node starting...`);
    console.log(`   Room: ${this.room}`);
    console.log(`   Node ID: ${this.nodeId}`);
    console.log(`   Nodes: ${this.nodeCount}`);
    
    // Initialize nodes
    for (let i = 0; i < this.nodeCount; i++) {
      this.nodes.push({
        id: i,
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: 0,
        vy: 0,
        p: 0,
        phi: Math.random() * Math.PI * 2
      });
    }
    
    // Connect to signaling server if available
    this.connectSignaling();
    
    // Start simulation loop
    this.startLoop();
    
    // Schedule events
    this.scheduleEvents();
  }
  
  connectSignaling() {
    try {
      this.ws = new WebSocket('ws://localhost:8089');
      
      this.ws.on('open', () => {
        console.log('✅ Connected to signaling server');
        this.ws.send(JSON.stringify({
          type: 'join-room',
          room: this.room,
          metadata: {
            nodeId: this.nodeId,
            headless: true,
            nodeCount: this.nodeCount
          }
        }));
      });
      
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        this.handleMessage(msg);
      });
      
      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
      });
      
      this.ws.on('close', () => {
        console.log('Disconnected from signaling server');
        // Continue running offline
      });
    } catch (err) {
      console.log('Running in offline mode (no signaling server)');
    }
  }
  
  handleMessage(msg) {
    switch (msg.type) {
      case 'telemetry':
        if (msg.from !== this.nodeId) {
          this.peers.set(msg.from, msg.telemetry);
        }
        break;
        
      case 'broadcast':
        if (msg.data.type === 'intent') {
          this.intents.push(msg.data.intent);
          this.logEvent('remote_intent', msg.data.intent);
        } else if (msg.data.type === 'portal') {
          this.portal = true;
          this.logEvent('remote_portal', {});
        }
        break;
    }
  }
  
  startLoop() {
    const dt = 0.016; // 60 FPS equivalent
    
    setInterval(() => {
      if (this.running) {
        this.t += dt;
        this.step(dt);
        
        // Log telemetry every second
        if (Math.floor(this.t) % 1 === 0 && Math.floor(this.t) !== this.lastTelemetryTime) {
          this.lastTelemetryTime = Math.floor(this.t);
          this.logTelemetry();
        }
      }
    }, dt * 1000);
    
    console.log('🔄 Simulation loop started');
  }
  
  scheduleEvents() {
    // Random intents
    setInterval(() => {
      if (this.running && Math.random() > 0.7) {
        this.addIntent();
      }
    }, 5000);
    
    // Occasional portal activation
    setTimeout(() => {
      this.activatePortal();
    }, 30000);
    
    // Pacemaker flip
    setTimeout(() => {
      this.pacemakerFlip();
    }, 60000);
    
    // Auto-save telemetry
    setInterval(() => {
      this.saveTelemetry();
    }, 30000);
  }
  
  // Simulation mechanics (simplified from visual version)
  pressureAt(x, y) {
    const dir = { x: Math.cos(0.35), y: Math.sin(0.35) };
    const spacing = 140, M = 2.2;
    const cx = 160, cy = 468; // 20% and 78% of default size
    const rx = x - cx, ry = y - cy;
    const s = rx * dir.x + ry * dir.y;
    const d = Math.abs(-dir.y * rx + dir.x * ry);
    const k = (Math.PI * 2) / spacing;
    const phase = this.portal ? 0 : (k * s - 1.4 * this.t * M);
    
    let p = 0.55 + 0.45 * Math.sin(phase) * Math.exp(-d * d / (2 * Math.pow(spacing * 0.33, 2)));
    
    // Add intent pressures
    for (const intent of this.intents) {
      const dx = x - intent.x, dy = y - intent.y;
      const r2 = dx * dx + dy * dy;
      p += intent.E * Math.exp(-r2 / (2 * Math.pow(intent.sigma || 80, 2)));
    }
    
    return Math.max(0, Math.min(1.3, p));
  }
  
  step(dt) {
    const { kappa, eta, gamma, kneigh } = this.params;
    
    // Update intents
    this.intents = this.intents.filter(i => (i.E *= 0.985) > 0.02);
    
    // Update nodes
    for (const n of this.nodes) {
      const p = this.pressureAt(n.x, n.y);
      const eps = 1.5;
      
      // Pressure gradients
      const gx = (this.pressureAt(n.x + eps, n.y) - this.pressureAt(n.x - eps, n.y)) / (2 * eps);
      const gy = (this.pressureAt(n.x, n.y + eps) - this.pressureAt(n.x, n.y - eps)) / (2 * eps);
      
      // Update velocity
      n.vx += (-gamma * gx - eta * n.vx) * dt;
      n.vy += (-gamma * gy - eta * n.vy) * dt;
      
      // Update position (with wrapping)
      n.x = (n.x + n.vx * dt * 60 + 800) % 800;
      n.y = (n.y + n.vy * dt * 60 + 600) % 600;
      n.p = p;
    }
    
    // Update phases (Kuramoto model)
    for (let i = 0; i < this.nodes.length; i++) {
      const me = this.nodes[i];
      const neighbors = this.knn(i, kneigh);
      
      let sum = 0;
      for (const nb of neighbors) {
        sum += Math.sin(nb.phi - me.phi);
      }
      
      const omega = (this.portal ? 0.9 : 1.2) * Math.PI * 2;
      me.phi += (omega + (kappa / neighbors.length) * sum) * dt;
    }
  }
  
  knn(index, k) {
    const me = this.nodes[index];
    const distances = this.nodes
      .map((n, i) => ({
        node: n,
        dist: i === index ? Infinity : Math.pow(n.x - me.x, 2) + Math.pow(n.y - me.y, 2)
      }))
      .sort((a, b) => a.dist - b.dist);
    
    return distances.slice(0, k).map(d => d.node);
  }
  
  calculateHarmony() {
    let sx = 0, sy = 0;
    for (const n of this.nodes) {
      sx += Math.cos(n.phi);
      sy += Math.sin(n.phi);
    }
    return Math.sqrt(sx * sx + sy * sy) / this.nodes.length;
  }
  
  calculateTurbulence() {
    // Simplified turbulence calculation
    let sum = 0;
    const samples = 20;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.random() * 800;
      const y = Math.random() * 600;
      const eps = 2;
      
      const px1 = this.pressureAt(x + eps, y);
      const px2 = this.pressureAt(x - eps, y);
      const py1 = this.pressureAt(x, y + eps);
      const py2 = this.pressureAt(x, y - eps);
      
      sum += Math.abs((px1 - px2) - (py1 - py2));
    }
    
    return sum / samples;
  }
  
  // Event handlers
  addIntent() {
    const intent = {
      x: Math.random() * 800,
      y: Math.random() * 600,
      E: 0.35,
      sigma: 80
    };
    
    this.intents.push(intent);
    this.logEvent('intent', intent);
    
    // Broadcast if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'broadcast',
        data: { type: 'intent', intent }
      }));
    }
  }
  
  activatePortal() {
    this.portal = true;
    this.logEvent('lion_gate', { portal: true });
    console.log('🌀 Portal activated!');
  }
  
  pacemakerFlip() {
    for (const n of this.nodes) {
      n.vx *= -0.6;
      n.vy *= -0.6;
      n.phi += Math.PI / 2;
    }
    this.logEvent('pacemaker_flip', {});
    console.log('⚡ Pacemaker flip executed!');
  }
  
  // Logging functions
  logEvent(type, data) {
    const event = {
      timestamp: Date.now(),
      t: this.t,
      type,
      data,
      metrics: {
        H: this.calculateHarmony(),
        tau: this.calculateTurbulence()
      }
    };
    
    this.telemetryLog.push(event);
    console.log(`📊 Event: ${type} | H: ${event.metrics.H.toFixed(3)} | τ: ${event.metrics.tau.toFixed(3)}`);
  }
  
  logTelemetry() {
    const telemetry = {
      timestamp: Date.now(),
      t: this.t,
      type: 'telemetry',
      metrics: {
        H: this.calculateHarmony(),
        tau: this.calculateTurbulence(),
        nodes: this.nodes.length,
        intents: this.intents.length,
        peers: this.peers.size
      }
    };
    
    this.telemetryLog.push(telemetry);
    
    // Broadcast telemetry
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'telemetry',
        telemetry: telemetry.metrics
      }));
    }
  }
  
  saveTelemetry() {
    fs.writeFileSync(this.logFile, JSON.stringify(this.telemetryLog, null, 2));
    console.log(`💾 Telemetry saved to ${this.logFile} (${this.telemetryLog.length} entries)`);
  }
  
  // Graceful shutdown
  shutdown() {
    console.log('\n🛑 Shutting down headless node...');
    this.running = false;
    this.saveTelemetry();
    
    if (this.ws) {
      this.ws.close();
    }
    
    console.log('   Node stopped. Final metrics:');
    console.log(`   H: ${this.calculateHarmony().toFixed(3)}`);
    console.log(`   τ: ${this.calculateTurbulence().toFixed(3)}`);
    console.log(`   Total events: ${this.telemetryLog.length}`);
    
    process.exit(0);
  }
}

// CLI interface
const args = process.argv.slice(2);
const config = {
  room: args[0] || 'headless-swarm',
  nodeCount: parseInt(args[1]) || 100,
  nodeId: args[2] || undefined
};

console.log('🚀 ChronoFlux Headless Runner');
console.log('   Usage: node headless-runner.js [room] [nodeCount] [nodeId]');
console.log('   Press Ctrl+C to stop\n');

const node = new HeadlessChronoNode(config);

// Handle shutdown
process.on('SIGINT', () => node.shutdown());
process.on('SIGTERM', () => node.shutdown());