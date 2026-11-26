import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const RelativisticOpticsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uChromatic: { value: 0.0022 },
    uShockRadius: { value: -1.0 },
    uShockAmp: { value: 0.0 },
    uTimeDilation: { value: 0.0 },
    uExposure: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uChromatic;
    uniform float uShockRadius;
    uniform float uShockAmp;
    uniform float uTimeDilation;
    uniform float uExposure;

    varying vec2 vUv;

    vec3 acesFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float dist = length(centered);
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);

      // Expanding gravitational screen-space shockwave ripple
      float waveOffset = 0.0;
      if (uShockAmp > 0.001 && uShockRadius > 0.0) {
        float dr = dist - uShockRadius;
        float ring = exp(-dr * dr * 95.0) * uShockAmp;
        waveOffset = sin(dr * 48.0) * ring * 0.035;
        uv -= dir * waveOffset;
      }

      // Radial relativistic chromatic aberration
      float caStrength = uChromatic + abs(waveOffset) * 1.4 + uTimeDilation * 0.0055;
      vec2 offset = dir * dist * caStrength;

      float r = texture2D(tDiffuse, clamp(uv + offset, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).g;
      float b = texture2D(tDiffuse, clamp(uv - offset, 0.0, 1.0)).b;

      vec3 col = vec3(r, g, b);

      // Subtle cool-indigo tint shift during relativistic time dilation
      if (uTimeDilation > 0.01) {
        vec3 dilatedTint = mix(col, col * vec3(0.84, 0.96, 1.18), uTimeDilation * 0.65);
        col = dilatedTint;
      }

      // ACES filmic tone mapping preserving deep obsidian blacks and vivid highlights
      col = acesFilm(col * uExposure);
      col = pow(max(col, vec3(0.0)), vec3(1.06));

      // Cinematic optical vignette
      float vig = smoothstep(0.98, 0.30, dist);
      col *= mix(0.62, 1.0, vig);

      // Micro film grain to eliminate dark-space color banding
      float grain = (rand(vUv + fract(uTime * 0.37)) - 0.5) * 0.012;
      col = clamp(col + grain, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.48, // strength
    0.45, // radius
    0.68  // threshold: keep blacks pitch-black, bloom only true hot highlights
  );
  composer.addPass(bloomPass);

  const opticsPass = new ShaderPass(RelativisticOpticsShader);
  composer.addPass(opticsPass);

  let shockRadius = -1.0;
  let shockAmp = 0.0;

  function triggerScreenShockwave(amplitude = 1.0) {
    shockRadius = 0.02;
    shockAmp = Math.max(shockAmp, amplitude);
  }

  function update(time, dt, { warpDrive = 0, timeDilation = 0, bloomStrength = 0.48, audioBass = 0 }) {
    bloomPass.strength = bloomStrength + audioBass * 0.16 + shockAmp * 0.25;

    if (shockAmp > 0.002) {
      shockRadius += dt * 1.15;
      shockAmp *= Math.exp(-dt * 2.4);
      if (shockRadius > 1.35 || shockAmp <= 0.002) {
        shockAmp = 0;
        shockRadius = -1;
      }
    }

    opticsPass.uniforms.uTime.value = time;
    opticsPass.uniforms.uChromatic.value = 0.0022 + warpDrive * 0.011 + audioBass * 0.0025;
    opticsPass.uniforms.uShockRadius.value = shockRadius;
    opticsPass.uniforms.uShockAmp.value = shockAmp;
    opticsPass.uniforms.uTimeDilation.value = timeDilation;
  }

  function setSize(width, height) {
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
  }

  return {
    composer,
    bloomPass,
    opticsPass,
    triggerScreenShockwave,
    update,
    setSize,
  };
}
