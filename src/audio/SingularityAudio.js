// Zero-asset procedural Web Audio space synthesizer & real-time FFT analyzer

const REALM_CHORDS = [
  [65.41, 98.00, 130.81, 155.56, 196.00], // 0: Gargantua (C minor / Interstellar cathedral)
  [73.42, 110.00, 146.83, 185.00, 220.00], // 1: Hyper-Tesseract (D Lydian crystal)
  [61.74, 92.50, 123.47, 146.83, 185.00],  // 2: Mandelbulb (B minor mystical)
  [55.00, 82.41, 110.00, 130.81, 164.81],  // 3: Pulsar (A minor tension)
  [65.41, 98.00, 146.83, 196.00, 246.94],  // 4: Stargate (C Maj9 / cosmic transcendence)
];

export function createSingularityAudio() {
  let ctx = null;
  let masterGain = null;
  let droneFilter = null;
  let analyser = null;
  let fftData = null;
  let oscVoices = [];
  let lfo = null;
  let micStream = null;
  let micSource = null;

  let isAudioOn = false;
  let isMicOn = false;
  let currentRealm = 0;

  // Smoothed bands
  const bands = { bass: 0, mid: 0, high: 0, energy: 0 };

  function ensureContext() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0001;

    // Warm resonant low-pass filter (also modulated by Time Dilation)
    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 920;
    droneFilter.Q.value = 2.4;

    // Procedural cosmic shimmer feedback delay
    const delayL = ctx.createDelay(1.0);
    const delayR = ctx.createDelay(1.0);
    delayL.delayTime.value = 0.37;
    delayR.delayTime.value = 0.53;

    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.42;
    fbR.gain.value = 0.40;

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.42;

    const merger = ctx.createChannelMerger(2);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(fbR);
    fbR.connect(delayL);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(wetGain);

    // Master FFT analyser
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    fftData = new Uint8Array(analyser.frequencyBinCount);

    droneFilter.connect(masterGain);
    droneFilter.connect(delayL);
    wetGain.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    // Slow breathing LFO on filter cutoff
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 340;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();

    // Build 5-voice cathedral drone + sub-bass
    const chord = REALM_CHORDS[currentRealm];
    chord.forEach((freq, idx) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const voiceGain = ctx.createGain();

      oscA.type = idx === 0 ? 'sine' : idx < 3 ? 'sawtooth' : 'triangle';
      oscB.type = idx === 0 ? 'triangle' : 'sawtooth';

      oscA.frequency.value = idx === 0 ? freq * 0.5 : freq;
      oscB.frequency.value = (idx === 0 ? freq : freq) * (1.0 + (idx % 2 === 0 ? 0.0045 : -0.0045));

      voiceGain.gain.value = idx === 0 ? 0.16 : idx < 3 ? 0.048 : 0.032;

      oscA.connect(voiceGain);
      oscB.connect(voiceGain);
      voiceGain.connect(droneFilter);

      oscA.start();
      oscB.start();
      oscVoices.push({ oscA, oscB, voiceGain });
    });
  }

  async function toggleAudio() {
    ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    isAudioOn = !isAudioOn;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(isAudioOn ? 0.42 : 0.0001, now, 0.35);
    return isAudioOn;
  }

  async function toggleMic() {
    ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (isMicOn) {
      if (micSource) {
        micSource.disconnect();
        micSource = null;
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
      }
      isMicOn = false;
      return false;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micSource = ctx.createMediaStreamSource(micStream);
      // Connect mic to analyser ONLY (not destination, avoiding feedback!)
      micSource.connect(analyser);
      isMicOn = true;
      return true;
    } catch {
      isMicOn = false;
      return false;
    }
  }

  function setRealm(realmIdx) {
    currentRealm = realmIdx;
    if (!ctx || !oscVoices.length) return;
    const chord = REALM_CHORDS[realmIdx] || REALM_CHORDS[0];
    const now = ctx.currentTime;
    oscVoices.forEach((v, idx) => {
      const f = chord[idx] || chord[0];
      v.oscA.frequency.setTargetAtTime(idx === 0 ? f * 0.5 : f, now, 0.55);
      v.oscB.frequency.setTargetAtTime(f * (1.0 + (idx % 2 === 0 ? 0.0045 : -0.0045)), now, 0.55);
    });
    if (isAudioOn) {
      playChime(chord[3] * 2.0, 0.14, 1.4);
    }
  }

  function setTimeDilation(amount) {
    if (!ctx || !droneFilter) return;
    const targetCutoff = 920 - amount * 680;
    droneFilter.frequency.setTargetAtTime(Math.max(180, targetCutoff), ctx.currentTime, 0.18);
  }

  function playChime(freq, volume = 0.12, duration = 1.1) {
    if (!ctx || !isAudioOn) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.985, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(droneFilter);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function playStarLaunch() {
    if (!ctx || !isAudioOn) return;
    const chord = REALM_CHORDS[currentRealm];
    const f = chord[2 + Math.floor(Math.random() * 3)] * 2.0;
    playChime(f, 0.11, 0.85);
  }

  function playRocheDisruption() {
    if (!ctx || !isAudioOn) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    osc.connect(gain);
    gain.connect(droneFilter);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  function playConsumptionBoom(intensity = 1.0) {
    if (!ctx || !isAudioOn) return;
    const now = ctx.currentTime;

    // Massive sub-bass gravitational impact drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(98, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 1.45);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(Math.min(0.45, 0.28 * intensity), now + 0.025);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.75);

    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start(now);
    sub.stop(now + 1.8);

    // Shimmer harmonic bloom
    const chord = REALM_CHORDS[currentRealm];
    playChime(chord[4] * 2.0, 0.14 * intensity, 1.9);
    playChime(chord[2] * 3.0, 0.08 * intensity, 2.2);
  }

  function update(time) {
    if (analyser && (isAudioOn || isMicOn)) {
      analyser.getByteFrequencyData(fftData);
      let b = 0, m = 0, h = 0;
      for (let i = 0; i < 10; i++) b += fftData[i];
      for (let i = 10; i < 42; i++) m += fftData[i];
      for (let i = 42; i < 96; i++) h += fftData[i];

      const rawBass = b / (10 * 255);
      const rawMid = m / (32 * 255);
      const rawHigh = h / (54 * 255);

      bands.bass += (rawBass - bands.bass) * 0.22;
      bands.mid += (rawMid - bands.mid) * 0.22;
      bands.high += (rawHigh - bands.high) * 0.22;
      bands.energy = (bands.bass * 0.5 + bands.mid * 0.35 + bands.high * 0.15);
    } else {
      // Subtle organic synthetic breathing even when audio is muted
      const b = 0.14 + 0.10 * Math.sin(time * 0.9) + 0.05 * Math.sin(time * 2.1);
      const m = 0.12 + 0.08 * Math.sin(time * 1.3 + 1.1);
      const h = 0.10 + 0.07 * Math.sin(time * 1.7 + 2.4);
      bands.bass += (b - bands.bass) * 0.1;
      bands.mid += (m - bands.mid) * 0.1;
      bands.high += (h - bands.high) * 0.1;
      bands.energy = bands.bass * 0.5 + bands.mid * 0.35 + bands.high * 0.15;
    }
    return bands;
  }

  return {
    toggleAudio,
    toggleMic,
    setRealm,
    setTimeDilation,
    playStarLaunch,
    playRocheDisruption,
    playConsumptionBoom,
    update,
    isAudioOn: () => isAudioOn,
    isMicOn: () => isMicOn,
  };
}
