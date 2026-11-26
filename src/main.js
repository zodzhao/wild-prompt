import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRaymarchCore } from './shaders/raymarchCore.js';
import { createHypercubeCage } from './scene/HypercubeCage.js';
import { createRelativisticParticles } from './scene/RelativisticParticles.js';
import { createTidalStarSystem } from './scene/TidalStarSystem.js';
import { createPostProcessing } from './scene/PostProcessing.js';
import { createSingularityAudio } from './audio/SingularityAudio.js';

const REALMS = [
  { id: 0, name: 'Gargantua', subtitle: 'REALM I // GARGANTUA KERR SINGULARITY' },
  { id: 1, name: '4D Lattice', subtitle: 'REALM II // HYPER-TESSERACT QUANTUM LATTICE' },
  { id: 2, name: 'Mandelbulb', subtitle: 'REALM III // 3D RAYMARCHED MANDELBULB ABYSS' },
  { id: 3, name: 'Pulsar', subtitle: 'REALM IV // MILLISECOND MAGNETAR SUPERNOVA' },
  { id: 4, name: 'Stargate', subtitle: 'REALM V // NON-EUCLIDEAN EINSTEIN-ROSEN WORMHOLE' },
];

// ---------- Feature-Detected Top-Layer Exit Fallback (animate-to-from-top-layer) ----------

let supportsDisplayTransition;
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

async function closeTopLayerPopover(el) {
  if (!supportsTopLayerExit()) {
    el.setAttribute('data-closing', '');
    const animations = el.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    }
    if (!el.hasAttribute('data-closing')) return;
    el.removeAttribute('data-closing');
  }
  el.hidePopover?.();
}

// ---------- Roving Tabindex Fallback (ONLY when native focusgroup is unsupported) ----------

function setupToolbarFallback(toolbar) {
  if ('focusGroup' in HTMLElement.prototype) return;
  const items = Array.from(toolbar.querySelectorAll('button'));
  if (!items.length) return;

  items.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
  });

  toolbar.addEventListener('focusin', ({ target }) => {
    if (items.includes(target)) {
      items.forEach((b) => {
        b.tabIndex = b === target ? 0 : -1;
      });
    }
  });

  toolbar.addEventListener('keydown', (event) => {
    const idx = items.indexOf(document.activeElement);
    if (idx === -1) return;
    const rtl = getComputedStyle(toolbar).direction === 'rtl';
    let nextIdx = -1;

    if (event.key === 'ArrowRight') nextIdx = (idx + (rtl ? -1 : 1) + items.length) % items.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx + (rtl ? 1 : -1) + items.length) % items.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = items.length - 1;

    if (nextIdx !== -1) {
      event.preventDefault();
      items[nextIdx].focus();
    }
  });
}

// ---------- Main Application ----------

const canvas = document.getElementById('singularity-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(0, 3.6, 14.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 4.2;
controls.maxDistance = 32.0;
controls.rotateSpeed = 0.72;

// Build visual & audio subsystems
const raymarchCore = createRaymarchCore();
scene.add(raymarchCore.mesh);

const hypercubeCage = createHypercubeCage();
scene.add(hypercubeCage.group);

const particles = createRelativisticParticles();
scene.add(particles.points);

const audio = createSingularityAudio();
const post = createPostProcessing(renderer, scene, camera);

// Simulation State
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  realm: 0,
  prevRealm: 0,
  realmBlend: 1.0,
  spin: 0.72,
  lensing: 1.0,
  diskDensity: 1.0,
  rot4DSpeed: reducedMotionQuery.matches ? 0.18 : 0.55,
  bloomStrength: 0.48,
  timeScale: reducedMotionQuery.matches ? 0.45 : 1.0,
  warpDrive: false,
  warpAmount: 0,
  timeDilationHeld: false,
  timeDilationAmount: 0,
  autoCam: !reducedMotionQuery.matches,
  autoSpawn: true,
  paused: false,
  solarMassMillions: 4.30,
  jetFlare: 0,
  simTime: 0,
  autoSpawnTimer: 5.5,
  userInteracting: false,
};

// UI DOM References
const hudRoot = document.getElementById('hud-root');
const hudStatus = document.getElementById('hud-status');
const eventToast = document.getElementById('event-toast');
const realmSubtitle = document.getElementById('realm-subtitle');
const statMass = document.getElementById('stat-mass');
const statPhase = document.getElementById('stat-phase');
const statStars = document.getElementById('stat-stars');
const statFps = document.getElementById('stat-fps');
const showHudBtn = document.getElementById('btn-show-hud');

let toastTimer = null;
function showToast(text, announce = true) {
  eventToast.textContent = text;
  eventToast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => eventToast.classList.remove('visible'), 2300);
  if (announce && hudStatus) {
    hudStatus.textContent = text;
  }
}

// Tidal Star & Gravity Sandbox
const tidalStars = createTidalStarSystem({
  onRocheDisruption: (starClass) => {
    audio.playRocheDisruption();
    showToast(`TIDAL DISRUPTION // ${starClass.name.toUpperCase()} SPAGHETTIFYING`, false);
  },
  onStarConsumed: (starClass) => {
    state.solarMassMillions += starClass.mass * 0.01;
    state.jetFlare = Math.min(2.2, state.jetFlare + 1.15);
    raymarchCore.triggerShockwave(1.15, starClass.hueShift);
    post.triggerScreenShockwave(0.95);
    audio.playConsumptionBoom(1.0);
    statMass.textContent = `${state.solarMassMillions.toFixed(2)}M M☉`;
    showToast(`SINGULARITY CONSUMED ${starClass.name.toUpperCase()} (+${starClass.mass.toFixed(1)} M☉)`);
  },
});
scene.add(tidalStars.group);

// Spawn 2 dramatic orbital stars immediately on load
tidalStars.spawnRandomOrbitalStar(state.spin);
tidalStars.spawnRandomOrbitalStar(state.spin);

// ---------- Realm & Action Controllers ----------

const realmButtons = Array.from(document.querySelectorAll('.realm-btn'));
function setRealm(newId) {
  if (newId === state.realm) return;
  state.prevRealm = state.realm;
  state.realm = newId;
  state.realmBlend = 0.0;

  raymarchCore.uniforms.uPrevRealm.value = state.prevRealm;
  raymarchCore.uniforms.uRealm.value = state.realm;
  raymarchCore.uniforms.uRealmBlend.value = 0.0;
  particles.uniforms.uRealm.value = state.realm;

  realmButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.realm) === newId));
  });

  const info = REALMS[newId];
  realmSubtitle.textContent = info.subtitle;
  audio.setRealm(newId);
  raymarchCore.triggerShockwave(0.9, newId * 0.25);
  post.triggerScreenShockwave(0.65);
  showToast(`SHIFTED TO ${info.subtitle}`);
}

function triggerSupernovaPulse() {
  state.jetFlare = Math.min(2.5, state.jetFlare + 1.8);
  raymarchCore.triggerShockwave(1.65, Math.random());
  post.triggerScreenShockwave(1.35);
  audio.playConsumptionBoom(1.45);
  // Spawn a burst of 2 fleeing/plunging stars for chaos
  tidalStars.spawnRandomOrbitalStar(state.spin);
  showToast('GRAVITATIONAL SHOCKWAVE PULSE DETONATED');
}

function flingStar() {
  const star = tidalStars.spawnRandomOrbitalStar(state.spin);
  audio.playStarLaunch();
  showToast(`LAUNCHED ${star.starClass.name.toUpperCase()} INTO GRAVITY WELL`);
}

// ---------- Shift + Drag Interactive 3D Slingshot Star Launcher ----------

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragStartWorld = new THREE.Vector3();
const dragCurrentWorld = new THREE.Vector3();
const slingshotVel = new THREE.Vector3();
let isSlingshotDragging = false;

function getWorldPointOnCameraPlane(clientX, clientY, targetVec) {
  pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  dragPlane.setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(0, 0, 0));
  return raycaster.ray.intersectPlane(dragPlane, targetVec);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.shiftKey && e.button === 0) {
    if (getWorldPointOnCameraPlane(e.clientX, e.clientY, dragStartWorld)) {
      if (dragStartWorld.length() < 3.2) {
        dragStartWorld.normalize().multiplyScalar(3.8);
      }
      isSlingshotDragging = true;
      controls.enabled = false;
      canvas.classList.add('slingshot-mode');
      slingshotVel.set(0, 0, 0);
      tidalStars.updateTrajectoryPreview(dragStartWorld, slingshotVel, state.spin);
    }
  } else {
    state.userInteracting = true;
  }
});

window.addEventListener('pointermove', (e) => {
  if (!isSlingshotDragging) return;
  if (getWorldPointOnCameraPlane(e.clientX, e.clientY, dragCurrentWorld)) {
    // Pull-back slingshot vector: drag opposite to launch direction
    slingshotVel.subVectors(dragStartWorld, dragCurrentWorld).multiplyScalar(1.35);
    if (slingshotVel.length() > 16) slingshotVel.setLength(16);
    tidalStars.updateTrajectoryPreview(dragStartWorld, slingshotVel, state.spin);
  }
});

window.addEventListener('pointerup', () => {
  state.userInteracting = false;
  if (!isSlingshotDragging) return;
  isSlingshotDragging = false;
  controls.enabled = true;
  canvas.classList.remove('slingshot-mode');
  tidalStars.hideTrajectoryPreview();

  if (slingshotVel.length() < 0.6) {
    // Give gentle orbital push if user just shift-clicked
    const tangent = new THREE.Vector3(-dragStartWorld.z, 0, dragStartWorld.x).normalize();
    slingshotVel.copy(tangent).multiplyScalar(Math.sqrt(48.0 / Math.max(dragStartWorld.length(), 3.0)) * 0.68);
  }
  const star = tidalStars.spawnStar(dragStartWorld, slingshotVel);
  audio.playStarLaunch();
  showToast(`SLINGSHOT ${star.starClass.name.toUpperCase()} DEPLOYED`);
});

// ---------- Toolbar & Popover Wiring ----------

setupToolbarFallback(document.getElementById('main-toolbar'));

realmButtons.forEach((btn) => {
  btn.addEventListener('click', () => setRealm(Number(btn.dataset.realm)));
});

document.getElementById('btn-fling').addEventListener('click', flingStar);
document.getElementById('btn-supernova').addEventListener('click', triggerSupernovaPulse);

const polytopeBtn = document.getElementById('btn-polytope');
const shortPolyNames = {
  'Tesseract (8-Cell)': '4D: 8-Cell',
  'Icositetrachoron (24-Cell)': '4D: 24-Cell',
  'Hyperoctahedron (16-Cell)': '4D: 16-Cell',
};
polytopeBtn.addEventListener('click', () => {
  const name = hypercubeCage.cyclePolytope();
  polytopeBtn.textContent = shortPolyNames[name] || '4D Shape';
  showToast(`4D POLYTOPE MORPHED // ${name.toUpperCase()}`);
});

const warpBtn = document.getElementById('btn-warp');
warpBtn.addEventListener('click', () => {
  state.warpDrive = !state.warpDrive;
  warpBtn.setAttribute('aria-pressed', String(state.warpDrive));
  showToast(state.warpDrive ? 'HYPER-WARP DRIVE ENGAGED' : 'HYPER-WARP DISENGAGED');
});

const cageBtn = document.getElementById('btn-cage');
cageBtn.addEventListener('click', () => {
  const next = !hypercubeCage.isVisible();
  hypercubeCage.setVisible(next);
  cageBtn.setAttribute('aria-pressed', String(next));
  showToast(next ? '4D DYSON POLYTOPE ENABLED' : '4D DYSON POLYTOPE HIDDEN');
});

const autoCamBtn = document.getElementById('btn-autocam');
autoCamBtn.setAttribute('aria-pressed', String(state.autoCam));
autoCamBtn.addEventListener('click', () => {
  state.autoCam = !state.autoCam;
  autoCamBtn.setAttribute('aria-pressed', String(state.autoCam));
  showToast(state.autoCam ? 'CINEMATIC AUTO-ORBIT ON' : 'CINEMATIC AUTO-ORBIT OFF');
});

const audioBtn = document.getElementById('btn-audio');
audioBtn.addEventListener('click', async () => {
  const on = await audio.toggleAudio();
  audioBtn.setAttribute('aria-pressed', String(on));
  showToast(on ? 'PROCEDURAL SPACE SYNTH ONLINE' : 'SPACE SYNTH MUTED');
});

const micBtn = document.getElementById('btn-mic');
micBtn.addEventListener('click', async () => {
  const on = await audio.toggleMic();
  micBtn.setAttribute('aria-pressed', String(on));
  showToast(on ? 'LIVE MICROPHONE REACTIVITY ACTIVE' : 'MICROPHONE REACTIVITY OFF');
});

const pauseBtn = document.getElementById('btn-pause');
function togglePause() {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? 'Play' : 'Pause';
  showToast(state.paused ? 'SIMULATION PAUSED' : 'SIMULATION RESUMED');
}
pauseBtn.addEventListener('click', togglePause);

// Singularity Lab Popover + Sync aria-expanded + Top-layer Exit Fallback
const labPopover = document.getElementById('singularity-lab');
const labBtn = document.getElementById('btn-lab');
const labCloseBtn = document.getElementById('btn-lab-close');

labPopover.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  labBtn.setAttribute('aria-expanded', String(open));
});

labCloseBtn.addEventListener('click', () => {
  closeTopLayerPopover(labPopover);
});

// Range sliders + dynamic WebKit fallback progress bar when accent-color is unsupported
const supportsAccent = window.CSS?.supports?.('accent-color', 'auto');
function bindRange(id, outputId, format, onChange) {
  const input = document.getElementById(id);
  const out = document.getElementById(outputId);
  const syncProgress = () => {
    if (!supportsAccent) {
      const min = Number(input.min);
      const max = Number(input.max);
      const pct = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.setProperty('--progress', `${pct}%`);
    }
  };
  syncProgress();
  input.addEventListener('input', () => {
    const val = Number(input.value);
    out.textContent = format(val);
    syncProgress();
    onChange(val);
  });
}

bindRange('ctrl-spin', 'val-spin', (v) => v.toFixed(2), (v) => {
  state.spin = v;
});
bindRange('ctrl-lensing', 'val-lensing', (v) => v.toFixed(2), (v) => {
  state.lensing = v;
});
bindRange('ctrl-density', 'val-density', (v) => v.toFixed(2), (v) => {
  state.diskDensity = v;
});
bindRange('ctrl-rot4d', 'val-rot4d', (v) => v.toFixed(2), (v) => {
  state.rot4DSpeed = v;
});
bindRange('ctrl-bloom', 'val-bloom', (v) => v.toFixed(2), (v) => {
  state.bloomStrength = v;
});
bindRange('ctrl-time', 'val-time', (v) => `${v.toFixed(2)}x`, (v) => {
  state.timeScale = v;
});

document.getElementById('ctrl-autospawn').addEventListener('change', (e) => {
  state.autoSpawn = e.target.checked;
});

// HUD visibility toggle
function toggleHud() {
  const hidden = hudRoot.classList.toggle('is-hidden');
  showHudBtn.hidden = !hidden;
}
showHudBtn.addEventListener('click', toggleHud);

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;

  if (e.key >= '1' && e.key <= '5') {
    setRealm(Number(e.key) - 1);
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (!state.timeDilationHeld) {
      state.timeDilationHeld = true;
      showToast('RELATIVISTIC TIME DILATION // 0.08x', false);
    }
  } else if (e.key === 'f' || e.key === 'F') {
    flingStar();
  } else if (e.key === 'x' || e.key === 'X') {
    triggerSupernovaPulse();
  } else if (e.key === 't' || e.key === 'T') {
    polytopeBtn.click();
  } else if (e.key === 'w' || e.key === 'W') {
    warpBtn.click();
  } else if (e.key === 'm' || e.key === 'M') {
    audioBtn.click();
  } else if (e.key === 'c' || e.key === 'C') {
    autoCamBtn.click();
  } else if (e.key === 'p' || e.key === 'P') {
    togglePause();
  } else if (e.key === 'h' || e.key === 'H') {
    toggleHud();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    state.timeDilationHeld = false;
  }
});

// Resize & WebGL context recovery
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  post.setSize(w, h);
  raymarchCore.uniforms.uResolution.value.set(w, h);
  particles.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
});

// ---------- Render Loop ----------

let lastTime = performance.now();
let fpsFrames = 0;
let fpsAccum = 0;
let telemetryTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const rawDt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
  lastTime = now;

  // Smooth Time Dilation & Warp Drive transitions
  const targetDilate = state.timeDilationHeld ? 1.0 : 0.0;
  state.timeDilationAmount += (targetDilate - state.timeDilationAmount) * Math.min(1, rawDt * 6.5);
  audio.setTimeDilation(state.timeDilationAmount);

  const targetWarp = state.warpDrive ? 1.0 : 0.0;
  state.warpAmount += (targetWarp - state.warpAmount) * Math.min(1, rawDt * 3.5);

  const effectiveTimeScale = state.paused
    ? 0
    : state.timeScale * (1.0 - state.timeDilationAmount * 0.92) * (1.0 + state.warpAmount * 1.35);

  const dt = rawDt * effectiveTimeScale;
  state.simTime += dt;

  // Realm transition crossfade
  if (state.realmBlend < 1.0) {
    state.realmBlend = Math.min(1.0, state.realmBlend + rawDt * 0.85);
    raymarchCore.uniforms.uRealmBlend.value = state.realmBlend;
  }

  // Decay polar jet flare
  state.jetFlare *= Math.exp(-rawDt * 0.9);

  // Audio analysis
  const bands = audio.update(state.simTime);

  // Subtle cinematic auto-orbit camera when user isn't dragging
  if (state.autoCam && !state.userInteracting && !isSlingshotDragging && !state.paused) {
    const orbitSpeed = 0.095 * rawDt * (1.0 - state.timeDilationAmount * 0.7);
    const cosA = Math.cos(orbitSpeed);
    const sinA = Math.sin(orbitSpeed);
    const x = camera.position.x;
    const z = camera.position.z;
    camera.position.x = x * cosA - z * sinA;
    camera.position.z = x * sinA + z * cosA;
    // Gentle vertical breathing arc across the accretion plane so gravitational lensing gleams!
    const targetY = Math.sin(state.simTime * 0.16) * 3.8 + 1.2;
    camera.position.y += (targetY - camera.position.y) * rawDt * 0.35;
  }

  controls.update();

  // Auto-spawn occasional wandering stars to keep cosmic drama alive
  if (state.autoSpawn && !state.paused) {
    state.autoSpawnTimer -= rawDt;
    if (state.autoSpawnTimer <= 0 && tidalStars.getActiveCount() < 3) {
      tidalStars.spawnRandomOrbitalStar(state.spin);
      state.autoSpawnTimer = 7.5 + Math.random() * 5.0;
    }
  }

  // Update GLSL3 Raymarching Singularity Core
  const ru = raymarchCore.uniforms;
  ru.uSpin.value = state.spin;
  ru.uLensing.value = state.lensing;
  ru.uDiskDensity.value = state.diskDensity;
  ru.uWarpDrive.value = state.warpAmount;
  ru.uJetFlare.value = state.jetFlare;
  ru.uAudioBass.value = bands.bass;
  ru.uAudioMid.value = bands.mid;
  ru.uAudioHigh.value = bands.high;
  raymarchCore.update(camera, state.simTime, dt);

  // Sync shockwave uniforms into the 65,000 GPU particles
  const pu = particles.uniforms;
  pu.uTime.value = state.simTime;
  pu.uSpin.value = state.spin;
  pu.uAudioBass.value = bands.bass;
  pu.uAudioMid.value = bands.mid;
  pu.uAudioHigh.value = bands.high;
  pu.uJetFlare.value = state.jetFlare;
  pu.uWarpDrive.value = state.warpAmount;
  for (let i = 0; i < 4; i++) {
    pu.uShockwaves.value[i].copy(ru.uShockwaves.value[i]);
  }

  // Update 4D Polytope Cage & Tidal Gravity Stars
  hypercubeCage.update(state.simTime, dt, {
    rot4DSpeed: state.rot4DSpeed,
    audioBass: bands.bass,
    audioMid: bands.mid,
    jetFlare: state.jetFlare,
    realm: state.realm,
  });

  tidalStars.update(dt, state.spin);

  // Post-processing & Render
  post.update(state.simTime, rawDt, {
    warpDrive: state.warpAmount,
    timeDilation: state.timeDilationAmount,
    bloomStrength: state.bloomStrength,
    audioBass: bands.bass,
  });
  post.composer.render();

  // Telemetry readout update (throttled ~4Hz for zero DOM overhead)
  fpsFrames++;
  fpsAccum += rawDt;
  telemetryTimer += rawDt;
  if (telemetryTimer >= 0.25) {
    const fps = Math.round(fpsFrames / Math.max(fpsAccum, 0.001));
    statFps.textContent = String(fps);
    statPhase.textContent = `${hypercubeCage.get4DAngleDeg()}° XW`;
    statStars.textContent = String(tidalStars.getActiveCount());
    fpsFrames = 0;
    fpsAccum = 0;
    telemetryTimer = 0;
  }
}

requestAnimationFrame(animate);
