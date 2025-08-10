# ChronoFlux Mesh v2.0 — WebRTC Swarm Edition

Enhanced version with WebRTC peer-to-peer connectivity, enabling cross-browser and cross-machine synchronization.

## New Features in v2.0

### 🌐 WebRTC P2P Connectivity
- Direct peer-to-peer connections between browsers
- Works across different machines on same network
- Automatic peer discovery via signaling server
- Graceful fallback to local-only mode

### 🤖 Headless Operation
- Run nodes without UI for autonomous operation
- Continuous telemetry logging to JSON files
- Scheduled events (intents, portal, flips)
- Perfect for overnight experiments

### 📊 Enhanced Telemetry
- Export telemetry logs as JSON
- Automatic snapshots on significant events
- Real-time metrics broadcasting
- Cross-peer synchronization tracking

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Signaling Server
```bash
npm start
# Signaling server runs on ws://localhost:8089
```

### 3. Launch Browser Nodes
Open `index-webrtc.html` in multiple browser tabs/windows:
```bash
npm run serve
# Then open http://localhost:8080/index-webrtc.html
```

Use different room names via URL hash:
- `http://localhost:8080/index-webrtc.html#room1`
- `http://localhost:8080/index-webrtc.html#room2`

### 4. Run Headless Nodes
```bash
npm run headless [room] [nodeCount] [nodeId]

# Examples:
npm run headless                    # Default room, 100 nodes
npm run headless room1 200          # Custom room, 200 nodes
npm run headless room1 150 bot-1    # Named bot in room1
```

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Browser    │◄──────────────────►│  Signaling   │
│  Node A     │                    │  Server      │
└──────┬──────┘                    └──────────────┘
       │                                    ▲
       │ WebRTC                            │
       │ DataChannel                       │
       ▼                                   │
┌─────────────┐                    ┌───────┴──────┐
│  Browser    │◄──────────────────►│  Headless   │
│  Node B     │     WebRTC         │  Node       │
└─────────────┘                    └──────────────┘
```

## Telemetry Format

```json
{
  "timestamp": 1623456789000,
  "t": 45.2,
  "type": "telemetry",
  "metrics": {
    "H": 0.823,      // Harmony (Kuramoto order parameter)
    "tau": 0.045,    // Turbulence measure
    "nodes": 220,    // Active oscillators
    "intents": 3,    // Active pressure points
    "peers": 2       // Connected peers
  }
}
```

## Events

- **intent**: Pressure pulse added to field
- **lion_gate**: Portal mode activated (changes dynamics)
- **pacemaker_flip**: Velocity reversal and phase shift
- **telemetry**: Regular metrics broadcast

## Development

### Project Structure
```
chrono-node-mesh/
├── index.html           # Original single-browser version
├── index-webrtc.html    # WebRTC-enabled version
├── mesh.js              # Original mesh logic
├── mesh-webrtc.js       # Enhanced with P2P
├── signaling-server.js  # WebSocket signaling
├── headless-runner.js   # Autonomous node
└── logs/                # Telemetry outputs
```

### Extending

To add new event types:
1. Add handler in `handlePeerMessage()`
2. Create broadcast function
3. Log event in telemetry
4. Update headless runner if needed

## Use Cases

- **Distributed Consciousness Experiments**: Synchronization across multiple locations
- **Overnight Pattern Analysis**: Headless nodes collecting emergence data
- **Cross-Device Swarms**: Mobile + Desktop synchronized visualization
- **Resilient Mesh Networks**: Continues operating if peers disconnect

## Future Enhancements

- [ ] TURN server support for NAT traversal
- [ ] Persistent state via IndexedDB
- [ ] Replay mode for telemetry logs
- [ ] 3D visualization option
- [ ] Integration with consciousness-mesh

---

*"From local resonance to global synchronization"* 🌊