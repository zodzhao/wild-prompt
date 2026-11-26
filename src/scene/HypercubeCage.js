import * as THREE from 'three';

function buildTesseract() {
  const verts = [];
  for (let i = 0; i < 16; i++) {
    verts.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const diff = i ^ j;
      if (diff && (diff & (diff - 1)) === 0) {
        edges.push([i, j]);
      }
    }
  }
  return { name: 'Tesseract (8-Cell)', verts, edges, baseScale: 5.2, wDist: 3.15 };
}

function build16Cell() {
  const verts = [
    [1.6, 0, 0, 0], [-1.6, 0, 0, 0],
    [0, 1.6, 0, 0], [0, -1.6, 0, 0],
    [0, 0, 1.6, 0], [0, 0, -1.6, 0],
    [0, 0, 0, 1.6], [0, 0, 0, -1.6],
  ];
  const edges = [];
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      // Connect all non-antipodal pairs
      if (Math.floor(i / 2) !== Math.floor(j / 2)) {
        edges.push([i, j]);
      }
    }
  }
  return { name: 'Hyperoctahedron (16-Cell)', verts, edges, baseScale: 6.2, wDist: 3.3 };
}

function build24Cell() {
  // Unique to 4D: all permutations of (±1, ±1, 0, 0)
  const verts = [];
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const v = [0, 0, 0, 0];
          v[a] = sa;
          v[b] = sb;
          verts.push(v);
        }
      }
    }
  }
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) {
        const d = verts[i][k] - verts[j][k];
        d2 += d * d;
      }
      if (Math.abs(d2 - 2.0) < 0.01) {
        edges.push([i, j]);
      }
    }
  }
  return { name: 'Icositetrachoron (24-Cell)', verts, edges, baseScale: 5.8, wDist: 3.25 };
}

const POLYTOPES = [buildTesseract(), build24Cell(), build16Cell()];
const MAX_VERTS = 24;
const MAX_EDGES = 96;
const ARC_COUNT = 6;
const ARC_SEGMENTS = 10;

const REALM_PALETTES = [
  [new THREE.Color(0xffb454), new THREE.Color(0x52c8ff)], // Gargantua: molten gold <-> electric blue
  [new THREE.Color(0x00f6ff), new THREE.Color(0xd938ff)], // Hyper-Tesseract: cyan <-> hyper-magenta
  [new THREE.Color(0x20f5c4), new THREE.Color(0xff9a3c)], // Mandelbulb: bioluminescent teal <-> amber
  [new THREE.Color(0x63b8ff), new THREE.Color(0xff3864)], // Pulsar: neutron blue <-> supernova crimson
  [new THREE.Color(0xb86bff), new THREE.Color(0x00ffda)], // Stargate: ultraviolet <-> prism cyan
];

export function createHypercubeCage() {
  const group = new THREE.Group();
  let polytopeIndex = 0;
  let visible = true;

  // Instanced laser struts for 4D edges
  const strutGeo = new THREE.CylinderGeometry(0.026, 0.026, 1, 6, 1, true);
  const strutMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const strutMesh = new THREE.InstancedMesh(strutGeo, strutMat, MAX_EDGES);
  strutMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strutMesh.frustumCulled = false;
  group.add(strutMesh);

  // Instanced glowing 4D vertices
  const nodeGeo = new THREE.IcosahedronGeometry(0.11, 1);
  const nodeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, MAX_VERTS);
  nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nodeMesh.frustumCulled = false;
  group.add(nodeMesh);

  // Dynamic plasma siphon lightning arcs from 4D vertices toward singularity core
  const arcPositions = new Float32Array(ARC_COUNT * ARC_SEGMENTS * 2 * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arcMat = new THREE.LineBasicMaterial({
    color: 0x6ae2ff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const arcLines = new THREE.LineSegments(arcGeo, arcMat);
  arcLines.frustumCulled = false;
  group.add(arcLines);

  // Reusable scratch objects (zero per-frame GC allocations)
  const projected = Array.from({ length: MAX_VERTS }, () => new THREE.Vector3());
  const wDepths = new Float32Array(MAX_VERTS);
  const dummyObj = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const dirVec = new THREE.Vector3();
  const midVec = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpQuat = new THREE.Quaternion();
  const zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);

  let rotAngle4D = 0;

  function rotate4D(v, aXW, aYW, aZW, aXY, aXZ) {
    let [x, y, z, w] = v;

    // XW plane (4th-dimension inside-out folding!)
    let c = Math.cos(aXW), s = Math.sin(aXW);
    let nx = x * c - w * s;
    let nw = x * s + w * c;
    x = nx; w = nw;

    // YW plane
    c = Math.cos(aYW); s = Math.sin(aYW);
    let ny = y * c - w * s;
    nw = y * s + w * c;
    y = ny; w = nw;

    // ZW plane
    c = Math.cos(aZW); s = Math.sin(aZW);
    let nz = z * c - w * s;
    nw = z * s + w * c;
    z = nz; w = nw;

    // XY & XZ 3D tumbling
    c = Math.cos(aXY); s = Math.sin(aXY);
    nx = x * c - y * s;
    ny = x * s + y * c;
    x = nx; y = ny;

    c = Math.cos(aXZ); s = Math.sin(aXZ);
    nx = x * c - z * s;
    nz = x * s + z * c;
    x = nx; z = nz;

    return [x, y, z, w];
  }

  function update(time, dt, params) {
    group.visible = visible;
    if (!visible) return;

    const poly = POLYTOPES[polytopeIndex];
    const speed = params.rot4DSpeed ?? 0.55;
    const audioBass = params.audioBass ?? 0;
    const audioMid = params.audioMid ?? 0;
    const jetFlare = params.jetFlare ?? 0;
    const realmId = params.realm ?? 0;

    rotAngle4D += dt * speed * (1.0 + audioMid * 0.65 + (realmId === 1 ? 0.85 : 0.0));

    const aXW = rotAngle4D * 0.92;
    const aYW = rotAngle4D * 0.63 + Math.sin(time * 0.25) * 0.4;
    const aZW = rotAngle4D * 0.41;
    const aXY = time * 0.14 * speed;
    const aXZ = time * 0.21 * speed;

    const palette = REALM_PALETTES[realmId] || REALM_PALETTES[0];
    const realmBoost = realmId === 1 ? 1.05 : realmId === 4 ? 0.92 : 0.72;
    const scalePulse = poly.baseScale * (1.0 + audioBass * 0.10 + jetFlare * 0.08);

    // Project 4D vertices into 3D space
    for (let i = 0; i < poly.verts.length; i++) {
      const [x, y, z, w] = rotate4D(poly.verts[i], aXW, aYW, aZW, aXY, aXZ);
      const perspective = scalePulse / (poly.wDist - w);
      projected[i].set(x * perspective, y * perspective, z * perspective);
      wDepths[i] = THREE.MathUtils.clamp((w + 1.5) / 3.0, 0, 1);

      // Update vertex sphere instance
      const nodeScale = (0.65 + wDepths[i] * 0.95) * (1.0 + audioBass * 0.5 + jetFlare * 0.35);
      dummyObj.position.copy(projected[i]);
      dummyObj.quaternion.identity();
      dummyObj.scale.setScalar(nodeScale);
      dummyObj.updateMatrix();
      nodeMesh.setMatrixAt(i, dummyObj.matrix);

      tmpColor.copy(palette[0]).lerp(palette[1], wDepths[i]);
      tmpColor.multiplyScalar(realmBoost + audioMid * 0.45);
      nodeMesh.setColorAt(i, tmpColor);
    }

    // Hide unused vertex slots
    for (let i = poly.verts.length; i < MAX_VERTS; i++) {
      nodeMesh.setMatrixAt(i, zeroScale);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;

    // Update edge laser strut instances
    for (let i = 0; i < poly.edges.length; i++) {
      const [aIdx, bIdx] = poly.edges[i];
      const va = projected[aIdx];
      const vb = projected[bIdx];

      dirVec.subVectors(vb, va);
      const len = dirVec.length();
      midVec.addVectors(va, vb).multiplyScalar(0.5);

      if (len > 0.0001) {
        dirVec.divideScalar(len);
        tmpQuat.setFromUnitVectors(upVec, dirVec);
      } else {
        tmpQuat.identity();
      }

      const avgW = (wDepths[aIdx] + wDepths[bIdx]) * 0.5;
      const thickness = (0.55 + avgW * 0.95) * (1.0 + audioBass * 0.45 + (realmId === 1 ? 0.35 : 0));

      dummyObj.position.copy(midVec);
      dummyObj.quaternion.copy(tmpQuat);
      dummyObj.scale.set(thickness, len, thickness);
      dummyObj.updateMatrix();
      strutMesh.setMatrixAt(i, dummyObj.matrix);

      tmpColor.copy(palette[0]).lerp(palette[1], avgW);
      tmpColor.multiplyScalar(realmBoost * (0.7 + avgW * 0.55 + jetFlare * 0.4));
      strutMesh.setColorAt(i, tmpColor);
    }

    for (let i = poly.edges.length; i < MAX_EDGES; i++) {
      strutMesh.setMatrixAt(i, zeroScale);
    }
    strutMesh.instanceMatrix.needsUpdate = true;
    if (strutMesh.instanceColor) strutMesh.instanceColor.needsUpdate = true;

    strutMat.opacity = realmId === 1 ? 0.76 : 0.42;
    nodeMat.opacity = realmId === 1 ? 0.90 : 0.68;

    // Update plasma siphon lightning arcs crackling from 4D vertices to event horizon rim
    let ptr = 0;
    const arcEnergy = 0.25 + audioMid * 0.5 + jetFlare * 0.85 + (realmId === 1 ? 0.35 : 0);
    arcMat.opacity = Math.min(0.75, arcEnergy * 0.48);
    arcMat.color.copy(palette[1]).lerp(palette[0], 0.5 + 0.5 * Math.sin(time * 2.1));

    const vertCount = poly.verts.length;
    const safeTick = Math.floor(Math.max(0, time) * 1.4);
    for (let a = 0; a < ARC_COUNT; a++) {
      const vIdx = ((a * 3 + safeTick) % vertCount + vertCount) % vertCount;
      const start = projected[vIdx];
      const endLen = 1.85;
      const startLen = Math.max(start.length(), 0.01);
      const ex = (start.x / startLen) * endLen;
      const ey = (start.y / startLen) * endLen;
      const ez = (start.z / startLen) * endLen;

      let prevX = start.x;
      let prevY = start.y;
      let prevZ = start.z;

      for (let s = 1; s <= ARC_SEGMENTS; s++) {
        const t = s / ARC_SEGMENTS;
        const env = Math.sin(t * Math.PI);
        const jitter = env * (0.28 + jetFlare * 0.35);
        const seed = time * 14.0 + a * 17.3 + s * 5.7;

        const nx = THREE.MathUtils.lerp(start.x, ex, t) + Math.sin(seed * 1.3) * jitter;
        const ny = THREE.MathUtils.lerp(start.y, ey, t) + Math.cos(seed * 1.7) * jitter;
        const nz = THREE.MathUtils.lerp(start.z, ez, t) + Math.sin(seed * 2.1 + 1.4) * jitter;

        arcPositions[ptr++] = prevX;
        arcPositions[ptr++] = prevY;
        arcPositions[ptr++] = prevZ;
        arcPositions[ptr++] = nx;
        arcPositions[ptr++] = ny;
        arcPositions[ptr++] = nz;

        prevX = nx;
        prevY = ny;
        prevZ = nz;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
  }

  function cyclePolytope() {
    polytopeIndex = (polytopeIndex + 1) % POLYTOPES.length;
    return POLYTOPES[polytopeIndex].name;
  }

  function getPolytopeName() {
    return POLYTOPES[polytopeIndex].name;
  }

  function setVisible(v) {
    visible = v;
    group.visible = v;
  }

  function isVisible() {
    return visible;
  }

  function get4DAngleDeg() {
    return Math.round(((rotAngle4D * 180) / Math.PI) % 360);
  }

  return {
    group,
    update,
    cyclePolytope,
    getPolytopeName,
    setVisible,
    isVisible,
    get4DAngleDeg,
  };
}
