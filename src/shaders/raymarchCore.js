import * as THREE from 'three';

const vertexShader = /* glsl */ `
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform mat4 uCamWorld;
uniform mat4 uInvProj;
uniform mat4 uViewProj;

uniform int uRealm;
uniform int uPrevRealm;
uniform float uRealmBlend;

uniform float uSpin;
uniform float uLensing;
uniform float uDiskDensity;
uniform float uWarpDrive;
uniform float uJetFlare;

uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;

// Up to 4 concurrent gravitational shockwaves: xy = unused, or vec4(radius, strength, hueShift, active)
uniform vec4 uShockwaves[4];

#define PI 3.14159265359
#define TAU 6.28318530718

// ---------- Fast Procedural Noise ----------

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.52;
  mat3 rot = mat3(
    0.80,  0.60, 0.00,
   -0.60,  0.80, 0.00,
    0.00,  0.00, 1.00
  );
  for (int i = 0; i < 4; i++) {
    v += a * noise3D(p);
    p = rot * p * 2.07 + vec3(13.7, 7.1, 29.3);
    a *= 0.5;
  }
  return v;
}

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Cosine iridescence palette (Inigo Quilez)
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

// ---------- Deep Space Starfield & Galactic Nebula ----------

vec3 sampleDeepSpace(vec3 dir, int realmId) {
  vec3 d = normalize(dir);
  vec3 col = vec3(0.003, 0.004, 0.010);

  // Subtle galactic plane tilt
  vec3 gd = d;
  gd.yz = rot2(0.42) * gd.yz;
  gd.xz = rot2(0.35) * gd.xz;

  float band = exp(-abs(gd.y) * 3.8);
  float neb1 = fbm(gd * 3.2 + vec3(0.0, 0.0, uTime * 0.015));
  float neb2 = fbm(gd * 6.8 - vec3(uTime * 0.01, 4.1, 1.9));
  float dust = smoothstep(0.38, 0.78, neb1 * 0.7 + neb2 * 0.5);

  vec3 nebTintA = vec3(0.14, 0.22, 0.48);
  vec3 nebTintB = vec3(0.55, 0.24, 0.12);

  if (realmId == 1) {
    nebTintA = vec3(0.05, 0.35, 0.62);
    nebTintB = vec3(0.48, 0.08, 0.58);
  } else if (realmId == 2) {
    nebTintA = vec3(0.04, 0.32, 0.36);
    nebTintB = vec3(0.38, 0.10, 0.45);
  } else if (realmId == 3) {
    nebTintA = vec3(0.10, 0.28, 0.65);
    nebTintB = vec3(0.75, 0.16, 0.26);
  } else if (realmId == 4) {
    nebTintA = vec3(0.18, 0.06, 0.52);
    nebTintB = vec3(0.08, 0.52, 0.62);
  }

  col += mix(nebTintA, nebTintB, neb2) * dust * (0.28 + 0.75 * band) * (0.85 + 0.35 * uAudioMid);
  // Dark cosmic dust lane cutting across galaxy
  float lane = smoothstep(0.45, 0.72, fbm(gd * 5.2 + vec3(2.1, -1.7, 0.4)));
  col *= (1.0 - 0.58 * band * lane);

  // Crisp multi-scale 3D starfield
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 115.0 : 230.0;
    vec3 p = d * scale;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    vec3 rnd = hash33(cell + float(layer) * 91.7);
    if (rnd.x > (layer == 0 ? 0.92 : 0.955)) {
      vec3 offset = (rnd - 0.5) * 0.62;
      float dist = length(f - offset);
      float size = mix(0.03, 0.085, rnd.y);
      float star = smoothstep(size, 0.0, dist);
      float twinkle = 0.78 + 0.22 * sin(uTime * (2.5 + rnd.z * 5.0) + rnd.x * 80.0);
      // Blackbody star color temperature
      vec3 starCol = mix(
        vec3(0.68, 0.84, 1.0),
        mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.72, 0.45), rnd.z),
        rnd.y
      );
      col += starCol * pow(star, 2.2) * (layer == 0 ? 1.55 : 0.95) * twinkle;
    }
  }

  return col;
}

// ---------- Realm 0 & 1: Relativistic Kerr Black Hole & Quantum Singularity ----------

struct RayResult {
  vec3 color;
  float depthDist;
  bool hitCore;
};

RayResult traceSingularity(vec3 ro, vec3 rd, bool isQuantum) {
  float Rs = (1.58 + uAudioBass * 0.14) * (isQuantum ? 0.96 : 1.0);
  vec3 p = ro;
  vec3 dir = normalize(rd);

  vec3 accum = vec3(0.0);
  float transmittance = 1.0;
  float totalDist = 0.0;
  float minR = 1e6;
  bool hitHorizon = false;
  float hitDist = 1e5;

  // Stochastic per-pixel ray-start dithering eliminates volumetric step banding
  float jitter = hash12(gl_FragCoord.xy + fract(uTime * 0.61) * 131.7);
  float startOffset = jitter * 0.34;
  p += dir * startOffset;
  totalDist += startOffset;

  // Angular momentum squared for exact Schwarzschild null geodesic deflection:
  // d2x/dl2 = -1.5 * Rs * |x x v|^2 * x / |x|^5
  float lensFactor = (1.42 * uLensing) * (isQuantum ? 1.15 : 1.0);

  const int STEPS = 84;
  for (int i = 0; i < STEPS; i++) {
    float r = length(p);
    minR = min(minR, r);

    if (r < Rs) {
      hitHorizon = true;
      hitDist = totalDist;
      break;
    }

    if (r > 38.0 && dot(p, dir) > 0.0) {
      break;
    }

    // Adaptive step size: fine near photon sphere and accretion plane
    float distToPlane = abs(p.y);
    float stepSize = clamp(r * 0.085, 0.048, 1.15);
    if (r < 11.8 && distToPlane < 2.2) {
      stepSize = min(stepSize, max(0.045, distToPlane * 0.26 + 0.036));
    }
    if (r < Rs * 2.3) {
      stepSize = min(stepSize, 0.055);
    }

    // Exact Schwarzschild gravitational bending + frame dragging spin twist
    vec3 L = cross(p, dir);
    float h2 = dot(L, L);
    float invR5 = 1.0 / (r * r * r * r * r + 0.0001);
    vec3 gravAcc = -lensFactor * Rs * h2 * p * invR5;

    // Kerr frame-dragging azimuthal swirl near horizon
    vec3 drag = vec3(-p.z, 0.0, p.x) * (uSpin * 0.22 * Rs * Rs / (r * r * r * r + 0.05));
    dir = normalize(dir + (gravAcc + drag) * stepSize);

    // Gravitational shockwave shells distort light & shimmer!
    for (int s = 0; s < 4; s++) {
      vec4 sw = uShockwaves[s];
      if (sw.w > 0.01) {
        float dr = abs(r - sw.x);
        float shellW = 0.55 + sw.x * 0.045;
        if (dr < shellW) {
          float wave = exp(-dr * dr / (shellW * shellW * 0.25)) * sw.y;
          dir = normalize(dir + normalize(p) * sin((r - sw.x) * 8.0) * wave * 0.035);
          vec3 swCol = isQuantum
            ? vec3(0.3, 0.95, 1.0)
            : mix(vec3(1.0, 0.72, 0.32), vec3(0.45, 0.78, 1.0), sw.z);
          accum += swCol * wave * 0.095 * stepSize * transmittance;
        }
      }
    }

    // Volumetric Accretion Disk sampling
    float innerR = Rs * 1.38;
    float outerR = 11.2;
    if (r > innerR && r < outerR) {
      float diskH = mix(0.08, 0.58, smoothstep(innerR, outerR, r)) * (1.0 + uAudioBass * 0.28);
      float yFactor = exp(-(p.y * p.y) / (diskH * diskH));

      if (yFactor > 0.015) {
        float radialNorm = (r - innerR) / (outerR - innerR);
        float radialMask = smoothstep(0.0, 0.08, radialNorm) * pow(1.0 - radialNorm, 1.35);

        // Keplerian differential rotation
        float angle = atan(p.z, p.x);
        float keplerOmega = (1.6 + uSpin * 1.15) / pow(r, 1.15);
        float swirl = angle - uTime * keplerOmega + 4.4 / sqrt(r);

        vec3 samplePos = vec3(
          cos(swirl) * r * 0.48,
          p.y * 2.2,
          sin(swirl) * r * 0.48
        );
        float n1 = fbm(samplePos * 1.45 + vec3(0.0, uTime * 0.18, 0.0));
        float n2 = fbm(samplePos * 3.1 - vec3(uTime * 0.32, 0.0, uTime * 0.24));

        // Spiral plasma filaments
        float filaments = smoothstep(0.24, 0.85, n1 * 0.65 + n2 * 0.52);
        float rings = 0.65 + 0.35 * sin(r * (isQuantum ? 8.5 : 4.2) - uTime * 2.2 + n1 * 4.5);

        float density = yFactor * radialMask * filaments * rings * uDiskDensity;

        // Relativistic Doppler beaming
        vec3 orbVel = normalize(vec3(-p.z, 0.0, p.x)) * clamp(sqrt(Rs / r) * 0.72 * sign(uSpin + 0.001), -0.68, 0.68);
        float doppler = dot(orbVel, -dir);
        float beaming = pow(clamp(1.0 + doppler * 0.62, 0.42, 1.95), 2.75);

        // Blackbody temperature gradient (hot white-blue inner -> fiery molten orange -> crimson outer)
        float heat = clamp(1.0 - radialNorm * 0.95 + doppler * 0.22 + n2 * 0.16, 0.0, 1.0);
        vec3 diskCol;
        if (!isQuantum) {
          vec3 coolCol = vec3(0.55, 0.06, 0.01);
          vec3 midCol = vec3(1.0, 0.36, 0.04);
          vec3 hotCol = vec3(1.0, 0.78, 0.34);
          vec3 ultraCol = vec3(0.68, 0.88, 1.0);
          diskCol = mix(coolCol, midCol, smoothstep(0.0, 0.48, heat));
          diskCol = mix(diskCol, hotCol, smoothstep(0.48, 0.84, heat));
          diskCol = mix(diskCol, ultraCol, smoothstep(0.84, 1.0, heat) * (0.4 + 0.6 * max(doppler, 0.0)));
        } else {
          // 4D Quantum Lattice palette: neon cyan, electric violet, hyper-magenta, holographic grid
          float gridR = smoothstep(0.88, 0.98, abs(sin(r * 6.0 - uTime * 3.0)));
          float gridA = smoothstep(0.92, 0.99, abs(sin(angle * 12.0 + uTime * 0.8)));
          float quantumGrid = max(gridR, gridA) * 0.85;
          diskCol = palette(
            heat * 0.75 + uTime * 0.08 + doppler * 0.2,
            vec3(0.18, 0.16, 0.42),
            vec3(0.45, 0.42, 0.55),
            vec3(1.0, 1.0, 1.0),
            vec3(0.05, 0.22, 0.52)
          );
          diskCol += vec3(0.18, 0.88, 1.0) * quantumGrid;
          density += quantumGrid * yFactor * radialMask * 0.42;
        }

        // Polar jet flare boosts disk glow when feeding on a shredded star
        float flareBoost = 0.85 + uJetFlare * 0.65 + uAudioMid * 0.28;
        vec3 emission = diskCol * density * beaming * flareBoost * 0.48 * stepSize;
        accum += emission * transmittance;
        transmittance *= exp(-density * stepSize * 0.42);
        if (transmittance < 0.015) break;
      }
    }

    // Subtle volumetric corona / relativistic polar jet glow along Y-axis
    float cylR = length(p.xz);
    float absY = abs(p.y);
    if (absY > Rs * 0.9 && absY < 16.0 && cylR < 0.8 + absY * 0.22) {
      float jetRadius = 0.20 + absY * 0.10;
      float jetCore = exp(-(cylR * cylR) / (jetRadius * jetRadius));
      float jetFade = smoothstep(Rs * 0.9, Rs * 2.2, absY) * exp(-absY * 0.15);
      float jetTurb = 0.6 + 0.4 * noise3D(vec3(p.xz * 2.5, absY * 1.4 - uTime * 5.2));
      float jetPower = (0.08 + uJetFlare * 0.65 + uAudioHigh * 0.25) * (isQuantum ? 1.3 : 1.0);
      vec3 jetCol = isQuantum ? vec3(0.32, 0.82, 1.0) : vec3(0.28, 0.62, 1.0);
      accum += jetCol * jetCore * jetFade * jetTurb * jetPower * 0.07 * stepSize * transmittance;
    }

    p += dir * stepSize;
    totalDist += stepSize;
  }

  // Razor-sharp Photon Sphere / Einstein Ring glow
  float photonR = Rs * 1.50;
  float photonGlow = exp(-abs(minR - photonR) * (isQuantum ? 9.0 : 12.0));
  vec3 photonCol = isQuantum
    ? vec3(0.25, 0.92, 1.0) * 1.2 + vec3(0.75, 0.18, 1.0) * 0.6
    : vec3(1.0, 0.62, 0.22) * 1.15;

  if (!hitHorizon) {
    vec3 bg = sampleDeepSpace(dir, isQuantum ? 1 : 0);
    accum += bg * transmittance;
    accum += photonCol * photonGlow * (0.42 + uAudioBass * 0.25 + uJetFlare * 0.35) * transmittance;
  } else {
    // Keep the Event Horizon core deep obsidian black, with only a razor-fine edge gleam
    float rim = exp(-abs(minR - Rs) * 26.0);
    accum += photonCol * rim * (isQuantum ? 0.35 : 0.10) * transmittance;
  }

  RayResult res;
  res.color = accum;
  res.depthDist = hitDist;
  res.hitCore = hitHorizon;
  return res;
}

// ---------- Realm 2: 3D Raymarched Living Mandelbulb Cathedral ----------

vec2 mapMandelbulb(vec3 p) {
  // Slowly rotate & breathe the fractal
  vec3 q = p;
  q.xz = rot2(uTime * 0.18) * q.xz;
  q.yz = rot2(sin(uTime * 0.13) * 0.35) * q.yz;

  float scale = 2.65;
  vec3 z = q / scale;
  float dr = 1.0;
  float r = 0.0;
  float orbitTrap = 1e6;
  float power = 8.0 + sin(uTime * 0.32) * 1.4 + uAudioBass * 0.9;

  for (int i = 0; i < 6; i++) {
    r = length(z);
    if (r > 2.2) break;

    float theta = acos(clamp(z.z / max(r, 0.0001), -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    float zr = pow(r, power);
    theta = theta * power + uTime * 0.12;
    phi = phi * power;

    z = zr * vec3(
      sin(theta) * cos(phi),
      sin(phi) * sin(theta),
      cos(theta)
    );
    z += q / scale;

    orbitTrap = min(orbitTrap, length(z.xz) + abs(z.y) * 0.35);
  }

  float d = 0.5 * log(max(r, 0.0001)) * r / max(dr, 0.0001) * scale;
  return vec2(d, orbitTrap);
}

vec3 calcMandelbulbNormal(vec3 p) {
  vec2 e = vec2(0.004, -0.004);
  return normalize(
    e.xyy * mapMandelbulb(p + e.xyy).x +
    e.yyx * mapMandelbulb(p + e.yyx).x +
    e.yxy * mapMandelbulb(p + e.yxy).x +
    e.xxx * mapMandelbulb(p + e.xxx).x
  );
}

RayResult traceMandelbulb(vec3 ro, vec3 rd) {
  // Quick bounding sphere test (radius ~ 4.4)
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 4.6 * 4.6;
  float disc = b * b - c;

  vec3 bg = sampleDeepSpace(rd, 2);
  RayResult res;
  res.color = bg;
  res.depthDist = 1e5;
  res.hitCore = false;

  // Ambient aura around fractal core
  float closest = length(ro - rd * max(0.0, -b));
  float aura = exp(-closest * 0.42);
  vec3 auraCol = mix(vec3(0.08, 0.72, 0.78), vec3(0.75, 0.22, 0.95), 0.5 + 0.5 * sin(uTime * 0.4 + closest));
  res.color += auraCol * aura * (0.28 + uAudioMid * 0.35 + uJetFlare * 0.45);

  if (disc < 0.0) return res;

  float tStart = max(0.05, -b - sqrt(disc));
  float tEnd = -b + sqrt(disc);
  float t = tStart;
  float glowAccum = 0.0;
  float trap = 0.0;
  bool hit = false;

  for (int i = 0; i < 68; i++) {
    vec3 p = ro + rd * t;
    vec2 m = mapMandelbulb(p);
    float d = m.x;
    trap = m.y;

    glowAccum += exp(-abs(d) * 14.0) * 0.022;

    if (d < 0.0045 * (1.0 + t * 0.08)) {
      hit = true;
      break;
    }
    t += d * 0.78;
    if (t > tEnd) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcMandelbulbNormal(p);
    vec3 v = -rd;

    // 3-tap AO
    float ao = 0.0;
    float sca = 1.0;
    for (int k = 1; k <= 3; k++) {
      float hr = 0.08 * float(k);
      float dd = mapMandelbulb(p + n * hr).x;
      ao += (hr - dd) * sca;
      sca *= 0.6;
    }
    ao = clamp(1.0 - 2.6 * ao, 0.08, 1.0);

    vec3 lightDir1 = normalize(vec3(0.6, 0.8, 0.4));
    vec3 lightDir2 = normalize(vec3(-0.7, -0.3, -0.6));
    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.2);
    float spec = pow(max(dot(reflect(-lightDir1, n), v), 0.0), 28.0);

    vec3 baseCol = palette(
      trap * 0.85 + uTime * 0.07 + uAudioHigh * 0.15,
      vec3(0.18, 0.24, 0.34),
      vec3(0.48, 0.42, 0.46),
      vec3(1.0, 0.9, 0.8),
      vec3(0.08, 0.34, 0.62)
    );

    vec3 rimCol = mix(vec3(0.12, 0.95, 0.85), vec3(1.0, 0.58, 0.18), 0.5 + 0.5 * sin(trap * 4.0 + uTime));
    vec3 innerEmissive = vec3(1.0, 0.35, 0.85) * smoothstep(0.55, 0.05, trap) * (0.45 + uAudioBass * 0.8 + uJetFlare);

    vec3 col = baseCol * (0.22 + diff1 * 0.95 + diff2 * 0.35) * ao;
    col += rimCol * fresnel * (1.25 + uAudioMid * 0.55);
    col += vec3(1.0, 0.95, 0.88) * spec * 0.85;
    col += innerEmissive * ao;
    col += auraCol * glowAccum * 0.7;

    res.color = col;
    res.depthDist = t;
    res.hitCore = true;
  } else {
    res.color += auraCol * glowAccum * 1.15;
  }

  return res;
}

// ---------- Realm 3: Millisecond Pulsar & Supernova Remnant ----------

RayResult tracePulsar(vec3 ro, vec3 rd) {
  vec3 bg = sampleDeepSpace(rd, 3);
  vec3 accum = vec3(0.0);
  float transmittance = 1.0;

  // Spinning magnetic axis tilted at 34 degrees
  float spinAng = uTime * (3.2 + uSpin * 2.2);
  vec3 magAxis = normalize(vec3(
    sin(0.60) * cos(spinAng),
    cos(0.60),
    sin(0.60) * sin(spinAng)
  ));

  float starR = 1.18 + uAudioBass * 0.12;
  // Ray-sphere test for blazing neutron star core
  float b = dot(ro, rd);
  float c = dot(ro, ro) - starR * starR;
  float disc = b * b - c;
  bool hitStar = false;
  float maxT = 26.0;
  float hitDist = 1e5;

  if (disc > 0.0 && -b - sqrt(disc) > 0.0) {
    hitStar = true;
    hitDist = -b - sqrt(disc);
    maxT = hitDist;
  }

  // Volumetric supernova shell + twin pulsar lighthouse beams
  float t = max(0.2, -b - 13.0);
  float endT = min(maxT, -b + 13.0);
  const int PSTEPS = 48;
  float dt = max(0.08, (endT - t) / float(PSTEPS));

  for (int i = 0; i < PSTEPS; i++) {
    vec3 p = ro + rd * (t + dt * 0.5);
    float r = length(p);

    if (r < 13.5 && r > starR * 1.02) {
      vec3 pn = p / r;

      // Twin relativistic lighthouse beams aligned with magAxis
      float align = abs(dot(pn, magAxis));
      float cone = pow(align, 26.0) * exp(-r * 0.085);
      float beamNoise = 0.72 + 0.28 * noise3D(p * 1.3 - magAxis * uTime * 9.0);
      vec3 beamCol = vec3(0.42, 0.85, 1.0) * 2.8 + vec3(0.9, 0.95, 1.0);
      accum += beamCol * cone * beamNoise * (1.2 + uAudioHigh * 0.65 + uJetFlare * 1.4) * dt * 0.42 * transmittance;

      // Expanding volumetric supernova filament shell (r ~ 4.5 to 11.5)
      float shellEnv = exp(-pow((r - 6.8) / 2.9, 2.0));
      if (shellEnv > 0.04) {
        vec3 sp = p * 0.42;
        sp.xz = rot2(uTime * 0.08) * sp.xz;
        float n = fbm(sp * 1.6 + vec3(0.0, uTime * 0.06, 0.0));
        float filament = smoothstep(0.42, 0.82, n);
        // Beams dynamically light up the nebula clouds as they sweep past!
        float beamLit = 0.35 + 2.8 * pow(align, 6.0);
        vec3 nebCol = mix(
          vec3(0.95, 0.16, 0.32),
          vec3(0.18, 0.68, 1.0),
          smoothstep(0.35, 0.72, fbm(sp * 2.4 + 3.1))
        );
        nebCol += vec3(1.0, 0.72, 0.24) * smoothstep(0.68, 0.88, n);
        float dens = shellEnv * filament * 0.11;
        accum += nebCol * dens * beamLit * (0.9 + uAudioMid * 0.5) * dt * transmittance;
        transmittance *= exp(-dens * dt * 0.65);
      }

      // Inner magnetic dipole ring glow
      float equator = 1.0 - align * align;
      float dipole = exp(-pow(r - (2.4 + 1.4 * equator), 2.0) * 3.5) * equator;
      accum += vec3(0.35, 0.62, 1.0) * dipole * 0.085 * dt * transmittance;
    }

    t += dt;
    if (t >= maxT || transmittance < 0.02) break;
  }

  if (hitStar) {
    vec3 hitP = ro + rd * hitDist;
    vec3 n = normalize(hitP);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    float surface = fbm(n * 5.0 + vec3(uTime * 1.2, 0.0, -uTime * 0.8));
    vec3 coreCol = mix(vec3(0.75, 0.92, 1.0), vec3(1.0, 1.0, 1.0), surface) * 2.2;
    coreCol += vec3(0.25, 0.65, 1.0) * fres * 1.5;
    accum += coreCol * transmittance;
  } else {
    // Corona glow around neutron star
    float closest = length(ro - rd * max(0.0, -b));
    float corona = exp(-max(0.0, closest - starR) * 1.85);
    accum += vec3(0.55, 0.85, 1.0) * corona * (1.2 + uAudioBass * 0.5) * transmittance;
    accum += bg * transmittance;
  }

  RayResult res;
  res.color = accum;
  res.depthDist = hitDist;
  res.hitCore = hitStar;
  return res;
}

// ---------- Realm 4: Stargate Hyperspace / Non-Euclidean Wormhole ----------

RayResult traceStargate(vec3 ro, vec3 rd) {
  vec3 accum = vec3(0.0);
  vec3 dir = normalize(rd);

  // Camera-aligned + world-warped non-Euclidean tunnel
  vec3 p = ro;
  float totalT = 0.0;
  bool hitCore = false;
  float hitDist = 1e5;
  float coreR = 1.35 + uAudioBass * 0.18;

  const int WSTEPS = 54;
  for (int i = 0; i < WSTEPS; i++) {
    float r = length(p);
    if (r < coreR) {
      hitCore = true;
      hitDist = totalT;
      break;
    }

    // Non-Euclidean space twist along radial depth
    float twist = 0.14 * sin(r * 0.35 - uTime * 1.4) + 0.06 * uSpin;
    vec3 q = p;
    q.xz = rot2(twist * r * 0.25 + uTime * 0.22) * q.xz;
    q.xy = rot2(uTime * 0.12) * q.xy;

    // 10-fold kaleidoscopic angular folding
    float ang = atan(q.z, q.x);
    float sector = TAU / 10.0;
    float foldAng = abs(mod(ang + sector * 0.5, sector) - sector * 0.5);
    vec3 kPos = vec3(cos(foldAng) * length(q.xz), q.y, sin(foldAng) * length(q.xz));

    // Infinite concentric dimensional ribs & luminous plasma ribbons
    float wave = sin(r * 1.35 - uTime * (3.6 + uWarpDrive * 5.0));
    float rib = exp(-abs(wave) * 7.5);
    float ribbon = exp(-abs(kPos.z - 0.65 - 0.35 * sin(r * 0.7 - uTime * 2.1)) * 6.0);
    float planeFold = exp(-abs(kPos.y) * 1.6);

    float energy = (rib * 0.45 + ribbon * planeFold * 0.85) * exp(-r * 0.072);

    vec3 col = palette(
      r * 0.09 - uTime * 0.24 + foldAng * 1.4,
      vec3(0.45, 0.32, 0.58),
      vec3(0.55, 0.48, 0.50),
      vec3(1.0, 1.0, 0.9),
      vec3(0.00, 0.28, 0.62)
    );

    float dt = clamp(0.18 + r * 0.055, 0.12, 0.95);
    accum += col * energy * (0.28 + uAudioMid * 0.42 + uJetFlare * 0.45) * dt;

    // Gentle wormhole vortex lensing around center
    dir = normalize(dir - p * (0.35 / (r * r * r + 0.5)) * dt);
    p += dir * dt;
    totalT += dt;
    if (totalT > 34.0) break;
  }

  if (hitCore) {
    // Iridescent Einstein-Rosen throat mirror core
    vec3 n = normalize(ro + rd * hitDist);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
    vec3 throat = palette(
      fres * 1.5 - uTime * 0.4,
      vec3(0.2, 0.1, 0.4),
      vec3(0.7, 0.6, 0.8),
      vec3(1.0, 1.0, 1.0),
      vec3(0.1, 0.35, 0.65)
    );
    accum += throat * (0.65 + fres * 1.8);
  } else {
    accum += sampleDeepSpace(dir, 4) * 0.85;
  }

  RayResult res;
  res.color = accum;
  res.depthDist = hitDist;
  res.hitCore = hitCore;
  return res;
}

RayResult traceRealm(int id, vec3 ro, vec3 rd) {
  if (id == 0) return traceSingularity(ro, rd, false);
  if (id == 1) return traceSingularity(ro, rd, true);
  if (id == 2) return traceMandelbulb(ro, rd);
  if (id == 3) return tracePulsar(ro, rd);
  return traceStargate(ro, rd);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;

  // Warp-drive FOV stretch & subtle radial barrel pulse during realm morph
  float morphPulse = sin(uRealmBlend * PI);
  float warpStretch = 1.0 + uWarpDrive * 0.22 + morphPulse * 0.14;
  vec4 viewRay = uInvProj * vec4(ndc / warpStretch, -1.0, 1.0);
  viewRay.xyz /= viewRay.w;
  vec3 rd = normalize((uCamWorld * vec4(viewRay.xyz, 0.0)).xyz);
  vec3 ro = uCamPos;

  RayResult cur = traceRealm(uRealm, ro, rd);
  vec3 finalCol = cur.color;
  bool hitCore = cur.hitCore;
  float depthDist = cur.depthDist;

  // Smooth cross-realm transition morphing
  if (uRealmBlend < 0.999 && uPrevRealm != uRealm) {
    RayResult prev = traceRealm(uPrevRealm, ro, rd);
    float blend = smoothstep(0.0, 1.0, uRealmBlend);
    finalCol = mix(prev.color, cur.color, blend);
    // Dimensional shift flash ring
    float rScreen = length(ndc);
    float ring = exp(-pow(abs(rScreen - blend * 1.7), 2.0) * 28.0) * morphPulse;
    finalCol += vec3(0.45, 0.85, 1.0) * ring * 0.85;
    if (blend < 0.5) {
      hitCore = prev.hitCore;
      depthDist = prev.depthDist;
    }
  }

  // Hyper-warp radial star streak overlay when Warp Drive is engaged
  if (uWarpDrive > 0.01) {
    float ang = atan(ndc.y, ndc.x);
    float rad = length(ndc);
    float streak = pow(hash12(vec2(floor(ang * 48.0), floor(rad * 6.0 - uTime * 14.0))), 8.0);
    finalCol += vec3(0.55, 0.85, 1.0) * streak * smoothstep(0.12, 0.85, rad) * uWarpDrive * 1.4;
  }

  // Exact per-pixel WebGL2 depth write so Three.js 3D meshes intersect cleanly!
  if (hitCore) {
    vec3 hitPos = ro + rd * depthDist;
    vec4 clipPos = uViewProj * vec4(hitPos, 1.0);
    float ndcZ = clipPos.z / clipPos.w;
    gl_FragDepth = clamp(ndcZ * 0.5 + 0.5, 0.0001, 0.99998);
  } else {
    gl_FragDepth = 0.99999;
  }

  fragColor = vec4(max(finalCol, vec3(0.0)), 1.0);
}
`;

export function createRaymarchCore() {
  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uCamPos: { value: new THREE.Vector3() },
    uCamWorld: { value: new THREE.Matrix4() },
    uInvProj: { value: new THREE.Matrix4() },
    uViewProj: { value: new THREE.Matrix4() },

    uRealm: { value: 0 },
    uPrevRealm: { value: 0 },
    uRealmBlend: { value: 1.0 },

    uSpin: { value: 0.72 },
    uLensing: { value: 1.0 },
    uDiskDensity: { value: 1.0 },
    uWarpDrive: { value: 0.0 },
    uJetFlare: { value: 0.0 },

    uAudioBass: { value: 0.0 },
    uAudioMid: { value: 0.0 },
    uAudioHigh: { value: 0.0 },

    uShockwaves: {
      value: [
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(0, 0, 0, 0),
      ],
    },
  };

  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  const viewProj = new THREE.Matrix4();

  function update(camera, time, dt) {
    camera.updateMatrixWorld();
    uniforms.uTime.value = time;
    uniforms.uCamPos.value.copy(camera.position);
    uniforms.uCamWorld.value.copy(camera.matrixWorld);
    uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.uViewProj.value.copy(viewProj);

    // Advance active shockwaves
    for (let i = 0; i < 4; i++) {
      const sw = uniforms.uShockwaves.value[i];
      if (sw.w > 0.001) {
        sw.x += dt * 11.5; // expanding radius
        sw.y *= Math.exp(-dt * 1.15); // fading amplitude
        sw.w = sw.y > 0.015 && sw.x < 34 ? 1.0 : 0.0;
        if (sw.w === 0.0) sw.set(0, 0, 0, 0);
      }
    }
  }

  let nextShockIdx = 0;
  function triggerShockwave(strength = 1.0, hueShift = 0.0) {
    const sw = uniforms.uShockwaves.value[nextShockIdx];
    sw.set(1.8, strength, hueShift, 1.0);
    nextShockIdx = (nextShockIdx + 1) % 4;
  }

  return { mesh, material, uniforms, update, triggerShockwave };
}
