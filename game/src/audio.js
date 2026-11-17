// audio.js — all sound is synthesized with WebAudio; no audio assets.
export function createAudio() {
  const A = {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenTimer: 0, sirenOn: false,
    padStarted: false, enabled: true,
  };

  A.init = () => {
    if (A.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.enabled = false; return; }
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.35;
      A.master.connect(A.ctx.destination);
      // Engine hum: sawtooth through a lowpass, pitch follows speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(lp); lp.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Police siren: two alternating tones.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 720;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start();
    } catch (err) { A.enabled = false; }
  };

  A.resume = () => {
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  };

  A.setEngine = (speedNorm, driving) => {
    if (!A.ctx || !A.enabled) return;
    const t = A.ctx.currentTime;
    A.engineGain.gain.setTargetAtTime(driving ? 0.05 + 0.09 * speedNorm : 0.015, t, 0.1);
    A.engineOsc.frequency.setTargetAtTime(55 + 130 * speedNorm, t, 0.1);
  };

  A.setSiren = (on) => {
    if (!A.ctx || !A.enabled) return;
    A.sirenOn = on;
    A.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, A.ctx.currentTime, 0.2);
  };

  A.update = (dt) => {
    if (!A.ctx || !A.enabled) return;
    if (A.sirenOn) {
      A.sirenTimer += dt;
      const hi = Math.floor(A.sirenTimer / 0.45) % 2 === 0;
      A.sirenOsc.frequency.setTargetAtTime(hi ? 720 : 540, A.ctx.currentTime, 0.05);
    }
  };

  A._noiseBurst = (dur, freq, gainVal) => {
    if (!A.ctx || !A.enabled) return;
    try {
      const len = Math.floor(A.ctx.sampleRate * dur);
      const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      const f = A.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq;
      const g = A.ctx.createGain(); g.gain.value = gainVal;
      src.connect(f); f.connect(g); g.connect(A.master);
      src.start();
    } catch (err) { /* audio is best-effort */ }
  };

  A._tone = (freq, dur, type, gainVal, slideTo) => {
    if (!A.ctx || !A.enabled) return;
    try {
      const o = A.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, A.ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, A.ctx.currentTime + dur);
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(gainVal, A.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
      o.connect(g); g.connect(A.master);
      o.start(); o.stop(A.ctx.currentTime + dur);
    } catch (err) { /* audio is best-effort */ }
  };

  A.gunshot = () => A._noiseBurst(0.16, 1800, 0.5);
  A.honk = () => { A._tone(370, 0.28, 'square', 0.12); A._tone(466, 0.28, 'square', 0.1); };
  A.chime = () => { A._tone(880, 0.14, 'sine', 0.22); setTimeout(() => A._tone(1320, 0.22, 'sine', 0.2), 110); };
  A.crash = () => A._noiseBurst(0.25, 500, 0.4);
  A.sirenBlip = () => A._tone(880, 0.12, 'triangle', 0.15, 660);

  A.startAmbientPad = () => {
    if (!A.ctx || !A.enabled || A.padStarted) return;
    A.padStarted = true;
    try {
      [110, 164.8, 220].forEach((f, i) => {
        const o = A.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        const g = A.ctx.createGain(); g.gain.value = i === 0 ? 0.02 : 0.012;
        const lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03;
        const lg = A.ctx.createGain(); lg.gain.value = 0.008;
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(A.master);
        o.start(); lfo.start();
      });
    } catch (err) { /* audio is best-effort */ }
  };

  return A;
}
