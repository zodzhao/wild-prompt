import * as THREE from 'three';

const STAR_CLASSES = [
  { name: 'Blue Supergiant', color: new THREE.Color(0x6ec6ff), core: new THREE.Color(0xeef9ff), mass: 18.4, radius: 0.34, hueShift: 0.9 },
  { name: 'Solar Giant', color: new THREE.Color(0xffaa3b), core: new THREE.Color(0xfff5d6), mass: 4.8, radius: 0.28, hueShift: 0.1 },
  { name: 'Crimson Red Giant', color: new THREE.Color(0xff4229), core: new THREE.Color(0xffc99e), mass: 9.2, radius: 0.38, hueShift: 0.0 },
  { name: 'Neutron Star', color: new THREE.Color(0x4cf7ff), core: new THREE.Color(0xffffff), mass: 2.4, radius: 0.20, hueShift: 0.7 },
  { name: 'Violet Magnetar', color: new THREE.Color(0xc85eff), core: new THREE.Color(0xf7e3ff), mass: 12.6, radius: 0.26, hueShift: 0.5 },
];

const MAX_TRAIL_PARTICLES = 9000;
const GRAVITY_MU = 48.0;
const ROCHE_LIMIT = 6.2;
const HORIZON_RADIUS = 1.78;

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.22, 'rgba(255, 240, 215, 0.85)');
  grad.addColorStop(0.52, 'rgba(255, 180, 110, 0.28)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createTidalStarSystem({ onStarConsumed, onRocheDisruption }) {
  const group = new THREE.Group();
  const glowTex = createGlowTexture();
  const stars = [];

  // Shared star core geometry
  const starGeo = new THREE.SphereGeometry(1, 20, 20);

  // GPU Tidal Disruption Plasma Trail & Burst Debris Pool
  const trailPositions = new Float32Array(MAX_TRAIL_PARTICLES * 3);
  const trailColors = new Float32Array(MAX_TRAIL_PARTICLES * 3);
  const trailSizes = new Float32Array(MAX_TRAIL_PARTICLES);
  const trailLife = new Float32Array(MAX_TRAIL_PARTICLES);
  const trailMaxLife = new Float32Array(MAX_TRAIL_PARTICLES);
  const trailVel = new Float32Array(MAX_TRAIL_PARTICLES * 3);
  let trailCursor = 0;

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  trailGeo.setAttribute('aSize', new THREE.BufferAttribute(trailSizes, 1));

  const trailMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.5);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uPixelRatio * (130.0 / dist), 0.0, 28.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c);
        if (r2 > 0.25) discard;
        float glow = exp(-r2 * 15.0);
        gl_FragColor = vec4(vColor * (glow + smoothstep(0.06, 0.0, r2)), glow);
      }
    `,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const trailPoints = new THREE.Points(trailGeo, trailMat);
  trailPoints.frustumCulled = false;
  group.add(trailPoints);

  // Slingshot trajectory preview line
  const previewPoints = new Float32Array(50 * 3);
  const previewGeo = new THREE.BufferGeometry();
  previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPoints, 3));
  const previewMat = new THREE.LineBasicMaterial({
    color: 0x62e8ff,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const previewLine = new THREE.Line(previewGeo, previewMat);
  previewLine.visible = false;
  previewLine.frustumCulled = false;
  group.add(previewLine);

  function emitTrailParticle(px, py, pz, vx, vy, vz, color, size, life) {
    const i = trailCursor;
    trailCursor = (trailCursor + 1) % MAX_TRAIL_PARTICLES;

    const i3 = i * 3;
    trailPositions[i3] = px;
    trailPositions[i3 + 1] = py;
    trailPositions[i3 + 2] = pz;

    trailVel[i3] = vx;
    trailVel[i3 + 1] = vy;
    trailVel[i3 + 2] = vz;

    trailColors[i3] = color.r;
    trailColors[i3 + 1] = color.g;
    trailColors[i3 + 2] = color.b;

    trailSizes[i] = size;
    trailLife[i] = life;
    trailMaxLife[i] = life;
  }

  function spawnStar(position, velocity, classIdx = Math.floor(Math.random() * STAR_CLASSES.length)) {
    if (stars.length >= 16) {
      // Remove oldest star if at cap
      removeStarAt(0);
    }

    const starClass = STAR_CLASSES[classIdx % STAR_CLASSES.length];
    const starGroup = new THREE.Group();
    starGroup.position.copy(position);

    const coreMat = new THREE.MeshBasicMaterial({ color: starClass.core });
    const coreMesh = new THREE.Mesh(starGeo, coreMat);
    coreMesh.scale.setScalar(starClass.radius);
    starGroup.add(coreMesh);

    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: starClass.color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const corona = new THREE.Sprite(spriteMat);
    corona.scale.setScalar(starClass.radius * 8.5);
    starGroup.add(corona);

    group.add(starGroup);

    const star = {
      mesh: starGroup,
      coreMesh,
      corona,
      pos: position.clone(),
      vel: velocity.clone(),
      starClass,
      disrupted: false,
      age: 0,
      integrity: 1.0,
    };
    stars.push(star);
    return star;
  }

  function spawnRandomOrbitalStar(spin = 0.72) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 9.5 + Math.random() * 5.0;
    const elev = (Math.random() - 0.5) * 4.2;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, elev, Math.sin(angle) * dist);

    // Slightly sub-circular tangential velocity so it spirals into a dramatic tidal disruption!
    const circularSpeed = Math.sqrt(GRAVITY_MU / dist);
    const tangent = new THREE.Vector3(-Math.sin(angle), (Math.random() - 0.5) * 0.25, Math.cos(angle)).normalize();
    const spinDir = spin >= 0 ? 1 : -1;
    const vel = tangent.multiplyScalar(circularSpeed * (0.58 + Math.random() * 0.24) * spinDir);
    return spawnStar(pos, vel);
  }

  function removeStarAt(idx) {
    const s = stars[idx];
    group.remove(s.mesh);
    s.coreMesh.material.dispose();
    s.corona.material.dispose();
    stars.splice(idx, 1);
  }

  function updateTrajectoryPreview(startPos, startVel, spin = 0.72) {
    previewLine.visible = true;
    const p = startPos.clone();
    const v = startVel.clone();
    const stepDt = 0.085;
    for (let i = 0; i < 50; i++) {
      previewPoints[i * 3] = p.x;
      previewPoints[i * 3 + 1] = p.y;
      previewPoints[i * 3 + 2] = p.z;

      const r = Math.max(p.length(), 1.2);
      if (r > HORIZON_RADIUS) {
        const accel = p.clone().multiplyScalar(-GRAVITY_MU / (r * r * r));
        // Frame dragging swirl
        accel.x += (-p.z / (r * r)) * spin * 3.5;
        accel.z += (p.x / (r * r)) * spin * 3.5;
        v.addScaledVector(accel, stepDt);
        p.addScaledVector(v, stepDt);
      }
    }
    previewGeo.attributes.position.needsUpdate = true;
  }

  function hideTrajectoryPreview() {
    previewLine.visible = false;
  }

  const tmpDir = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 1, 0);
  const tmpQuat = new THREE.Quaternion();
  const tmpPlasmaCol = new THREE.Color();

  function update(dt, spin = 0.72) {
    const clampedDt = Math.min(dt, 0.05);

    // Update active stars under relativistic gravity + frame dragging
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      s.age += clampedDt;
      const r = Math.max(s.pos.length(), 0.2);

      // Gravity + subtle relativistic inspiraling drag
      const invR3 = 1.0 / (r * r * r);
      const ax = -s.pos.x * GRAVITY_MU * invR3 + (-s.pos.z / (r * r)) * spin * 4.2 - s.vel.x * (0.045 / (r * 0.25 + 1.0));
      const ay = -s.pos.y * GRAVITY_MU * invR3 - s.vel.y * (0.055 / (r * 0.25 + 1.0));
      const az = -s.pos.z * GRAVITY_MU * invR3 + (s.pos.x / (r * r)) * spin * 4.2 - s.vel.z * (0.045 / (r * 0.25 + 1.0));

      s.vel.x += ax * clampedDt;
      s.vel.y += ay * clampedDt;
      s.vel.z += az * clampedDt;
      s.pos.addScaledVector(s.vel, clampedDt);
      s.mesh.position.copy(s.pos);

      // Roche Limit: Tidal Disruption & Spaghettification!
      const rocheFactor = THREE.MathUtils.clamp((ROCHE_LIMIT - r) / (ROCHE_LIMIT - HORIZON_RADIUS), 0, 1);
      if (rocheFactor > 0.01) {
        if (!s.disrupted) {
          s.disrupted = true;
          onRocheDisruption?.(s.starClass);
        }
        s.integrity = Math.max(0.25, s.integrity - clampedDt * rocheFactor * 0.45);

        // Stretch the star visibly along the tidal gravity vector toward the black hole!
        tmpDir.copy(s.pos).normalize();
        tmpQuat.setFromUnitVectors(tmpUp, tmpDir);
        s.coreMesh.quaternion.copy(tmpQuat);
        const stretch = 1.0 + rocheFactor * 3.8;
        const squeeze = 1.0 / Math.sqrt(stretch);
        const baseR = s.starClass.radius * s.integrity;
        s.coreMesh.scale.set(baseR * squeeze, baseR * stretch, baseR * squeeze);
        s.corona.scale.setScalar(baseR * (8.5 + rocheFactor * 7.0));

        // Rip blazing spaghettified tidal plasma streams off both tidal lobes!
        const emitCount = Math.floor(6 + rocheFactor * 22);
        for (let k = 0; k < emitCount; k++) {
          const lobe = k % 2 === 0 ? 1 : -1;
          const jitter = 0.22 + rocheFactor * 0.45;
          const px = s.pos.x + tmpDir.x * lobe * baseR * stretch * 0.7 + (Math.random() - 0.5) * jitter;
          const py = s.pos.y + tmpDir.y * lobe * baseR * stretch * 0.7 + (Math.random() - 0.5) * jitter;
          const pz = s.pos.z + tmpDir.z * lobe * baseR * stretch * 0.7 + (Math.random() - 0.5) * jitter;

          const pull = lobe < 0 ? 1.4 : -0.4;
          const vx = s.vel.x * 0.92 - tmpDir.x * pull * (2.5 + rocheFactor * 5.0) + (Math.random() - 0.5) * 1.4;
          const vy = s.vel.y * 0.92 - tmpDir.y * pull * (2.5 + rocheFactor * 5.0) + (Math.random() - 0.5) * 1.4;
          const vz = s.vel.z * 0.92 - tmpDir.z * pull * (2.5 + rocheFactor * 5.0) + (Math.random() - 0.5) * 1.4;

          tmpPlasmaCol.copy(s.starClass.color).lerp(s.starClass.core, Math.random() * 0.65);
          emitTrailParticle(px, py, pz, vx, vy, vz, tmpPlasmaCol, 0.45 + Math.random() * 1.15, 1.4 + Math.random() * 1.8);
        }
      } else {
        // Gentle orbital corona trail before Roche limit
        for (let k = 0; k < 2; k++) {
          tmpPlasmaCol.copy(s.starClass.color).multiplyScalar(0.85);
          emitTrailParticle(
            s.pos.x + (Math.random() - 0.5) * 0.18,
            s.pos.y + (Math.random() - 0.5) * 0.18,
            s.pos.z + (Math.random() - 0.5) * 0.18,
            s.vel.x * 0.35 + (Math.random() - 0.5) * 0.4,
            s.vel.y * 0.35 + (Math.random() - 0.5) * 0.4,
            s.vel.z * 0.35 + (Math.random() - 0.5) * 0.4,
            tmpPlasmaCol,
            0.35 + Math.random() * 0.55,
            0.9 + Math.random() * 0.7
          );
        }
      }

      // Event Horizon Consumption!
      if (r < HORIZON_RADIUS || s.age > 45.0) {
        if (r < HORIZON_RADIUS) {
          // Cataclysmic accretion burst along orbital plane + polar ejecta!
          for (let k = 0; k < 220; k++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = 3.5 + Math.random() * 11.5;
            const isPolar = k < 55;
            const vx = isPolar ? (Math.random() - 0.5) * 2.2 : Math.cos(ang) * speed;
            const vy = isPolar ? (k % 2 === 0 ? 1 : -1) * (8.0 + Math.random() * 10.0) : (Math.random() - 0.5) * 3.5;
            const vz = isPolar ? (Math.random() - 0.5) * 2.2 : Math.sin(ang) * speed;
            tmpPlasmaCol.copy(s.starClass.color).lerp(s.starClass.core, Math.random());
            emitTrailParticle(
              s.pos.x * 1.08, s.pos.y * 1.08, s.pos.z * 1.08,
              vx, vy, vz,
              tmpPlasmaCol,
              0.7 + Math.random() * 1.6,
              1.6 + Math.random() * 2.2
            );
          }
          onStarConsumed?.(s.starClass);
        }
        removeStarAt(i);
      }
    }

    // Advect tidal plasma trail particles under singularity gravity
    for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
      if (trailLife[i] <= 0) continue;
      trailLife[i] -= clampedDt;
      if (trailLife[i] <= 0) {
        trailSizes[i] = 0;
        continue;
      }

      const i3 = i * 3;
      const px = trailPositions[i3];
      const py = trailPositions[i3 + 1];
      const pz = trailPositions[i3 + 2];
      const r = Math.sqrt(px * px + py * py + pz * pz) + 0.001;

      if (r < HORIZON_RADIUS * 0.92) {
        trailLife[i] = 0;
        trailSizes[i] = 0;
        continue;
      }

      // Spiral plasma particles into the accretion disk
      const invR3 = 1.0 / (r * r * r);
      const gPull = GRAVITY_MU * 0.72 * invR3;
      const swirl = (spin * 7.5) / (r * r + 1.0);

      trailVel[i3] += (-px * gPull - pz * swirl) * clampedDt;
      trailVel[i3 + 1] += (-py * gPull * 1.35) * clampedDt;
      trailVel[i3 + 2] += (-pz * gPull + px * swirl) * clampedDt;

      trailPositions[i3] += trailVel[i3] * clampedDt;
      trailPositions[i3 + 1] += trailVel[i3 + 1] * clampedDt;
      trailPositions[i3 + 2] += trailVel[i3 + 2] * clampedDt;

      const lifeRatio = trailLife[i] / trailMaxLife[i];
      if (lifeRatio < 0.25) {
        trailSizes[i] *= 0.94;
      }
    }

    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailGeo.attributes.aSize.needsUpdate = true;
  }

  return {
    group,
    spawnStar,
    spawnRandomOrbitalStar,
    updateTrajectoryPreview,
    hideTrajectoryPreview,
    update,
    getActiveCount: () => stars.length,
  };
}
