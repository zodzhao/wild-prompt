# AETHERIA // 4D Singularity Engine

An interactive real-time **Three.js + WebGL2 (GLSL3)** relativistic black hole, 4D polytope megastructure, and gravitational tidal-disruption sandbox with zero-asset procedural Web Audio synthesis.

---

## Quick Start

```bash
cd singularity-engine
npm install
npm run dev
```

Open **http://localhost:5842/** in a modern browser with WebGL2 enabled.

Other scripts:
- `npm run build` — Build production bundle into `dist/`
- `npm run preview` — Preview the production build locally on port `4173`

---

## How to Navigate & Play

### Mouse & Trackpad
| Action | Effect |
| --- | --- |
| **Left-Drag** | Orbit around the singularity |
| **Scroll / Pinch** | Zoom in and out (distance `4.2` to `32`) |
| **`Shift` + Left-Drag** | **Slingshot Star** — aim a live 3D predicted gravity trajectory arc and release to launch a rogue star into the gravity well |

### Keyboard Shortcuts
| Key | Action |
| --- | --- |
| `1` – `5` | Morph smoothly between the **5 Realms** |
| **Hold `Space`** | **Relativistic Time Dilation** (slows time to `0.08×` with chromatic shift & low-pass audio sweep) |
| `F` | Launch a random orbital rogue star into the singularity |
| `X` | Detonate a gravitational shockwave **Pulse** & polar jet flare |
| `T` | Morph the **4D Polytope** cage (`8-Cell Tesseract` → `24-Cell Icositetrachoron` → `16-Cell Hyperoctahedron`) |
| `W` | Toggle **Hyper-Warp Drive** |
| `M` | Toggle the procedural **Web Audio Space Synth** |
| `C` | Toggle **Cinematic Auto-Orbit** camera |
| `P` | **Pause / Play** the simulation |
| `H` | Hide or show the HUD overlay for a pure fullscreen view |

---

## The 5 Realms

Switch realms using keys `1`–`5` or the bottom toolbar:

1. **Gargantua (`1`)** — Relativistic Kerr black hole using exact Schwarzschild null-geodesic light bending, Doppler-beamed molten accretion plasma, Einstein photon ring, and gravitational lensing of the background starfield.
2. **4D Lattice (`2`)** — Quantum phase-shifted event horizon with holographic grid caustics and accelerated 4D polytope rotation.
3. **Mandelbulb (`3`)** — True 3D raymarched power-8 animated fractal cathedral with ambient occlusion, orbit-trap iridescence, and per-pixel depth intersection (`gl_FragDepth`) so the 4D cage and particles weave through its crevices.
4. **Pulsar (`4`)** — Rapidly spinning tilted millisecond magnetar with twin sweeping volumetric lighthouse beams lighting up a turbulent supernova remnant shell.
5. **Stargate (`5`)** — 10-fold kaleidoscopic Einstein-Rosen hyperspace manifold with chromatic plasma ribbons and warped dimensional ribs.

---

## Toolbar & Singularity Lab

- **Top-Left Telemetry**: Live black hole **Mass** (grows in Solar Masses as it devours stars), **4D Phase** (`XW` rotation angle), active **Stars** count, and **FPS**.
- **Bottom Toolbar** (keyboard accessible via `Tab` + `ArrowLeft`/`ArrowRight`):
  - **Realms**: `Gargantua`, `4D Lattice`, `Mandelbulb`, `Pulsar`, `Stargate`
  - **Actions**: `+ Fling Star`, `Pulse`, `4D: 8-Cell / 24-Cell / 16-Cell`
  - **Modes**: `Warp`, `4D Cage`, `Orbit`, `Audio`, `Mic` (reacts visuals to live microphone input without echo), `Pause / Play`
  - **`Lab`**: Opens the floating **Singularity Lab** popover with live sliders for:
    - **Kerr Spin (`a*`)** — Direction and intensity of relativistic frame-dragging and disk shear
    - **Gravitational Lensing** — Strength of light bending around the singularity
    - **Accretion Plasma** — Volumetric disk density
    - **4D Rotation Speed** — Speed of 4D `XW`/`YW`/`ZW` hyper-rotation
    - **Relativistic Bloom** — Post-processing bloom intensity
    - **Time Scale** — Global simulation speed (`0.05×` to `2.5×`)
    - **Auto-spawn wandering rogue stars** — Toggle periodic natural star encounters

---

## Fun Things to Try

1. **Tidal Disruption in Slow Motion**: Hold `Shift` + Drag to aim a star slightly off-center so it spirals past the Roche limit, then hold **`Space`** right as it spaghettifies and plunges into the Event Horizon to watch the shockwave ripple through all 65,000 particles.
2. **Audio-Reactive Universe**: Click **Audio** (or press `M`) for the generative cathedral synth, then switch between Realms `1`–`5` to hear the chord voicings shift—or click **Mic** and play music aloud so the black hole, Mandelbulb, and 4D cage pulse with your audio.
3. **4D Inside-Out Geometry**: Press `T` to switch to the **24-Cell** (a regular polytope unique to 4 dimensions), open **Lab**, and crank **4D Rotation Speed** up while orbiting close to the horizon.
4. **Pure Cinema Mode**: Press `H` to hide all UI chrome and let **Orbit** fly around the singularity.

---

## Project Structure

```text
singularity-engine/
├── index.html                      # Semantic HUD, composite toolbar, and Lab popover
├── vite.config.js                  # Vite dev server (localhost:5842) & ESNext build config
├── package.json                    # Dependencies (three, vite) and npm scripts
└── src/
    ├── main.js                     # Scene orchestrator, OrbitControls, Shift+Drag slingshot, shortcuts & loop
    ├── style.css                   # Dark glassmorphic HUD, top-layer popover animation, reduced-motion styles
    ├── shaders/
    │   └── raymarchCore.js         # GLSL3 fullscreen raymarcher (all 5 realms, lensing, shockwaves, gl_FragDepth)
    ├── scene/
    │   ├── HypercubeCage.js        # 4D polytope math (8/16/24-Cell), instanced laser struts & siphon lightning
    │   ├── RelativisticParticles.js # 65,000 GPU-driven accretion disk, helical polar jet & warp halo particles
    │   ├── TidalStarSystem.js      # N-body gravity, Roche-limit spaghettification, trajectory arc & burst debris
    │   └── PostProcessing.js       # EffectComposer, UnrealBloomPass & custom chromatic/shockwave/ACES optics pass
    └── audio/
        └── SingularityAudio.js     # Zero-asset Web Audio cathedral synth, event SFX & live FFT/mic analyzer
```
