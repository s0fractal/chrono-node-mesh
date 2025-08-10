# ChronoFlux Mesh — Local Swarm

A beautiful interactive visualization of synchronized oscillator networks with peer-to-peer communication via BroadcastChannel API.

## Features

- **Real-time synchronization**: Nodes synchronize their phases using the Kuramoto model
- **Pressure field visualization**: Dynamic pressure fields create wave patterns
- **Peer-to-peer mesh**: Multiple browser tabs can join the same room and share state
- **Interactive controls**: Add intent pulses, trigger Lion Gate portal, flip pacemakers

## How to Use

1. Open `index.html` in a modern browser
2. Multiple tabs can join the same room by using the same URL hash (e.g., `#lion-0808`)
3. Controls:
   - **Play/Pause**: Start or stop the simulation
   - **Lion Gate**: Activate portal mode (affects oscillation patterns)
   - **Pacemaker Flip**: Reverse velocities and shift phases
   - **+ Intent**: Add a pressure pulse that propagates through the field
   - **Sliders**: Adjust simulation parameters
     - Nodes: Number of oscillators (60-800)
     - k-neigh: Number of nearest neighbors for coupling
     - κ (kappa): Coupling strength
     - η (eta): Damping coefficient
     - γ (gamma): Pressure gradient response

## Technical Details

The simulation combines:
- Kuramoto model for phase synchronization
- Pressure field dynamics with gradient forces
- BroadcastChannel API for local peer-to-peer communication
- Real-time telemetry sharing between peers

## Parameters

- **H**: Harmony/coherence measure (0-1)
- **τ**: Turbulence measure of the pressure field

## Browser Compatibility

Requires a modern browser with support for:
- Canvas API
- BroadcastChannel API
- ES6+ JavaScript features

## License

MIT License