import * as THREE from 'three';

const PARTICLE_COUNT = 65000;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uSpin;
uniform float uPixelRatio;
uniform float uRealm;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uJetFlare;
uniform float uWarpDrive;
uniform vec4 uShockwaves[4];

attribute float aRadius;
attribute float aAngle;
attribute float aHeight;
attribute float aSpeed;
attribute float aSize;
attribute float aType; // 0 = disk, 1 = polar jet, 2 = outer halo
attribute float aSeed;

varying vec3 vColor;
varying float vAlpha;

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.2831853 * (c * t + d));
}

void main() {
  vec3 pos = vec3(0.0);
  float alpha = 1.0;
  float size = aSize;
  int realmId = int(uRealm + 0.5);

  if (aType < 0.5) {
    // 0: Relativistic Accretion Disk & Spiral Arms
    float r = aRadius;
    float omega = (1.35 + uSpin * 1.15) * aSpeed / pow(max(r, 1.5), 1.08);
    float ang = aAngle + uTime * omega;

    // Gentle spiral density wave clustering
    float spiral = sin(ang * 2.0 - r * 1.15 + uTime * 0.45) * 0.35;
    r += spiral * 0.25;

    float yWave = sin(ang * 3.0 - uTime * 1.8 + aSeed * 6.28) * (0.08 + uAudioBass * 0.35);
    float y = aHeight * (1.0 + uAudioMid * 0.45) + yWave;

    pos = vec3(cos(ang) * r, y, sin(ang) * r);

    // Realm 2 (Mandelbulb): lift accretion particles into a 3D bioluminescent spore shell!
    if (realmId == 2) {
      float phi = aSeed * 3.14159 - 1.57079;
      float sr = 3.2 + (aRadius - 2.0) * 0.72;
      vec3 spherePos = vec3(
        cos(ang) * cos(phi) * sr,
        sin(phi) * sr + sin(uTime * 0.8 + aSeed * 12.0) * 0.4,
        sin(ang) * cos(phi) * sr
      );
      pos = spherePos;
    }

    // Realm 4 (Stargate): hyper-velocity tunnel streaks
    if (realmId == 4) {
      float tunnelZ = mod(aSeed * 36.0 - uTime * (6.5 + uWarpDrive * 10.0), 36.0) - 18.0;
      float tr = 2.6 + mod(aRadius * 1.3, 9.5);
      pos = vec3(cos(ang * 1.4) * tr, sin(ang * 1.4) * tr, tunnelZ);
      pos.xz = rot2(uTime * 0.12) * pos.xz;
    }

    // Gravitational shockwave displacement pushes the entire particle field!
    float curR = length(pos);
    for (int s = 0; s < 4; s++) {
      vec4 sw = uShockwaves[s];
      if (sw.w > 0.01) {
        float dr = abs(curR - sw.x);
        if (dr < 2.2) {
          float push = exp(-dr * dr * 0.9) * sw.y;
          pos += normalize(pos + vec3(0.0001)) * push * 1.25;
          pos.y += sin(aSeed * 40.0 + uTime * 10.0) * push * 0.45;
          size *= (1.0 + push * 1.1);
        }
      }
    }

    // Color per realm + rich high-contrast temperature gradient
    float normR = clamp((aRadius - 2.0) / 11.5, 0.0, 1.0);
    if (realmId == 0) {
      vec3 inner = vec3(1.0, 0.82, 0.48);
      vec3 mid = vec3(0.96, 0.38, 0.06);
      vec3 outer = vec3(0.26, 0.52, 0.98);
      vColor = mix(inner, mid, smoothstep(0.0, 0.42, normR));
      vColor = mix(vColor, outer, smoothstep(0.55, 1.0, normR) * (0.35 + 0.65 * aSeed));
    } else if (realmId == 1) {
      vColor = palette(normR * 0.7 + aSeed * 0.25 + uTime * 0.08,
        vec3(0.22, 0.32, 0.58), vec3(0.45, 0.38, 0.48), vec3(1.0), vec3(0.05, 0.22, 0.55));
    } else if (realmId == 2) {
      vColor = palette(aSeed * 0.9 + uTime * 0.06,
        vec3(0.14, 0.48, 0.52), vec3(0.42, 0.36, 0.42), vec3(1.0, 0.9, 0.8), vec3(0.05, 0.35, 0.65));
    } else if (realmId == 3) {
      vColor = mix(vec3(0.24, 0.72, 1.0), vec3(0.98, 0.16, 0.36), smoothstep(0.2, 0.85, normR));
    } else {
      vColor = palette(normR + uTime * 0.2 + aSeed * 0.3,
        vec3(0.38, 0.32, 0.48), vec3(0.48, 0.42, 0.45), vec3(1.0), vec3(0.0, 0.33, 0.67));
    }

    alpha = mix(0.24, 0.07, normR) * (0.68 + 0.32 * sin(uTime * 2.5 + aSeed * 62.0));
  } else if (aType < 1.5) {
    // 1: Relativistic Polar Jets (North & South helical plasma beams)
    float side = aSeed > 0.5 ? 1.0 : -1.0;
    float jetSpeed = (5.5 + uJetFlare * 10.0 + uAudioHigh * 4.0) * aSpeed;
    float progress = fract(aHeight + uTime * jetSpeed * 0.045);
    float y = side * (1.85 + progress * 17.5);
    float coneR = (0.12 + progress * 1.65) * (0.35 + aRadius * 0.65);
    float helixAng = aAngle + progress * 14.0 * side - uTime * (2.6 + uSpin * 2.0);

    pos = vec3(cos(helixAng) * coneR, y, sin(helixAng) * coneR);

    // In Pulsar realm, tilt the relativistic jets onto the spinning magnetic axis!
    if (realmId == 3) {
      float tilt = 0.60;
      pos.xy = rot2(tilt) * pos.xy;
      pos.xz = rot2(-(uTime * (3.2 + uSpin * 2.2))) * pos.xz;
    }

    float fade = smoothstep(0.0, 0.10, progress) * pow(1.0 - progress, 1.45);
    float boost = 0.14 + uJetFlare * 0.45 + uAudioHigh * 0.18 + (realmId == 3 ? 0.22 : 0.0);
    alpha = fade * boost;
    size = aSize * (0.68 + uJetFlare * 0.65);

    vColor = mix(
      vec3(0.48, 0.84, 1.0),
      realmId == 1 ? vec3(0.75, 0.18, 1.0) : vec3(0.20, 0.48, 0.98),
      progress
    ) * (0.85 + uJetFlare * 0.65);
  } else {
    // 2: Outer Spherical Dust & Warp Halo
    float ang = aAngle + uTime * 0.035 * aSpeed;
    float r = aRadius;
    pos = vec3(cos(ang) * r, aHeight, sin(ang) * r);
    if (uWarpDrive > 0.01) {
      pos.z = mod(pos.z + uTime * 28.0 * uWarpDrive + 25.0, 50.0) - 25.0;
    }
    vColor = mix(vec3(0.55, 0.72, 1.0), vec3(1.0, 0.72, 0.48), aSeed);
    alpha = 0.24 + uWarpDrive * 0.35;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(-mvPosition.z, 0.5);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(size * uPixelRatio * (52.0 / dist), 1.0, 7.5);
  vAlpha = clamp(alpha, 0.0, 0.85);
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float glow = exp(-r2 * 16.0);
  float core = smoothstep(0.08, 0.0, r2);
  vec3 col = vColor * (glow + core * 0.85);
  gl_FragColor = vec4(col, glow * vAlpha);
}
`;

export function createRelativisticParticles() {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const aRadius = new Float32Array(PARTICLE_COUNT);
  const aAngle = new Float32Array(PARTICLE_COUNT);
  const aHeight = new Float32Array(PARTICLE_COUNT);
  const aSpeed = new Float32Array(PARTICLE_COUNT);
  const aSize = new Float32Array(PARTICLE_COUNT);
  const aType = new Float32Array(PARTICLE_COUNT);
  const aSeed = new Float32Array(PARTICLE_COUNT);

  const diskCount = 46000;
  const jetCount = 14000;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    aSeed[i] = Math.random();
    aAngle[i] = Math.random() * Math.PI * 2;

    if (i < diskCount) {
      // Accretion disk & spiral nebula
      aType[i] = 0;
      const u = Math.random();
      const r = 2.15 + Math.pow(u, 1.65) * 12.2;
      aRadius[i] = r;
      const spread = 0.08 + Math.pow((r - 2.0) / 12.0, 1.2) * 1.15;
      aHeight[i] = (Math.random() - 0.5) * 2.0 * spread * (Math.random() < 0.75 ? 0.55 : 1.8);
      aSpeed[i] = 0.82 + Math.random() * 0.36;
      aSize[i] = 0.32 + Math.pow(Math.random(), 3.0) * 1.45;
    } else if (i < diskCount + jetCount) {
      // Polar relativistic jets
      aType[i] = 1;
      aRadius[i] = Math.random();
      aHeight[i] = Math.random(); // used as initial phase along jet
      aSpeed[i] = 0.7 + Math.random() * 0.65;
      aSize[i] = 0.38 + Math.pow(Math.random(), 2.2) * 1.35;
    } else {
      // Outer deep cosmic dust & warp stars
      aType[i] = 2;
      aRadius[i] = 11.0 + Math.random() * 24.0;
      aHeight[i] = (Math.random() - 0.5) * 26.0;
      aSpeed[i] = 0.4 + Math.random() * 1.1;
      aSize[i] = 0.35 + Math.random() * 1.1;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(aHeight, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geometry.setAttribute('aType', new THREE.BufferAttribute(aType, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSpin: { value: 0.72 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uRealm: { value: 0 },
    uAudioBass: { value: 0 },
    uAudioMid: { value: 0 },
    uAudioHigh: { value: 0 },
    uJetFlare: { value: 0 },
    uWarpDrive: { value: 0 },
    uShockwaves: {
      value: [
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
      ],
    },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return { points, uniforms, count: PARTICLE_COUNT };
}
