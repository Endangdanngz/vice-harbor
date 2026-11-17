// Vice Harbor — audio.js
// Every sound in the game is synthesized with the WebAudio API. There are
// no samples and no audio assets: one-shots are short oscillator/noise
// envelopes built on the fly, and the two continuous sounds (police siren
// and vehicle engine) are small oscillator loops that start and stop
// cleanly on demand.
//
// The AudioContext is created lazily inside unlock(), which the game
// calls on the first user gesture (browsers refuse to start audio before
// one). Every other method guards on a null context and silently does
// nothing, so gameplay code can call sounds freely before unlock.

export function createAudio() {
  let ctx = null;      // AudioContext, null until unlock()
  let master = null;   // master gain node -> destination
  let noiseBuf = null; // shared white-noise buffer for bursts
  let volume = 0.8;    // remembered so setVolume works before unlock

  let siren = null;    // { osc, lfo, lfoGain, gain } while the siren runs
  let engine = null;   // { osc, filter, gain } while the engine runs

  // Create the context and the shared nodes on first use.
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // Half a second of white noise, reused by every burst effect.
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  // Call on the first user gesture: creates the context if needed and
  // resumes it if the browser left it suspended.
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  // One oscillator note with an exponential decay envelope. `slideTo`
  // optionally glides the pitch across the note's lifetime.
  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // One filtered noise burst with a decay envelope.
  function noise(dur, vol, freq, q = 1, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Gunshot: a crack of broadband noise over a low thump that drops away.
  function shot() {
    if (!ctx) return;
    noise(0.12, 0.5, 1800, 0.7);
    tone(150, 0.12, 'sine', 0.5, 0, 45);
  }

  // Empty trigger: a dry metallic click and nothing else.
  function dryFire() {
    if (!ctx) return;
    tone(2200, 0.03, 'square', 0.12);
    noise(0.03, 0.1, 3000, 2);
  }

  // Bullet impact / melee connect: a heavy low thud with a little grit.
  function hit() {
    if (!ctx) return;
    tone(110, 0.15, 'sine', 0.55, 0, 55);
    noise(0.08, 0.2, 400, 1);
  }

  // Item pickup: a bright two-note chime, low note then high note.
  function pickup() {
    if (!ctx) return;
    tone(880, 0.09, 'sine', 0.25);
    tone(1318, 0.14, 'sine', 0.25, 0.08);
  }

  // Money earned: a quick three-coin arpeggio.
  function cash() {
    if (!ctx) return;
    const notes = [1568, 2093, 2637];
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], 0.12, 'triangle', 0.22, i * 0.06);
    }
  }

  // Car horn: two square-wave partials held for a quarter second.
  function honk() {
    if (!ctx) return;
    tone(370, 0.25, 'square', 0.16);
    tone(466, 0.25, 'square', 0.11);
  }

  // Stop a running loop bundle and release its nodes.
  function stopLoop(loop) {
    if (!loop) return;
    try { loop.osc.stop(); } catch (err) { /* already stopped */ }
    if (loop.lfo) {
      try { loop.lfo.stop(); } catch (err) { /* already stopped */ }
      loop.lfo.disconnect();
    }
    loop.osc.disconnect();
    loop.gain.disconnect();
  }

  // Police siren loop. level 0 silences it; higher wanted levels sweep
  // faster and sit higher, so the chase sounds more urgent as it grows.
  function sirenSet(level) {
    if (!ctx) return;
    if (level <= 0) {
      stopLoop(siren);
      siren = null;
      return;
    }
    const base = 700 + level * 60;      // centre pitch rises with level
    const rate = 0.6 + level * 0.35;    // sweep rate rises with level
    if (siren) {
      // Already running: just retune it to the new level.
      siren.osc.frequency.setTargetAtTime(base, ctx.currentTime, 0.05);
      siren.lfo.frequency.setTargetAtTime(rate, ctx.currentTime, 0.05);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = base;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180; // ±180 Hz sweep around the base pitch
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    siren = { osc, lfo, lfoGain, gain };
  }

  // Vehicle engine loop: a sawtooth through a lowpass filter. `load`
  // (0..1, throttle/RPM) raises both the pitch and the filter cutoff.
  function engineSet(on, load = 0) {
    if (!ctx) return;
    if (!on) {
      stopLoop(engine);
      engine = null;
      return;
    }
    const clamped = Math.max(0, Math.min(1, load));
    const pitch = 55 + clamped * 165;
    const cutoff = 350 + clamped * 900;
    if (engine) {
      engine.osc.frequency.setTargetAtTime(pitch, ctx.currentTime, 0.05);
      engine.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.05);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = pitch;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = 0.055;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    engine = { osc, filter, gain };
  }

  // Menu blip.
  function uiClick() {
    if (!ctx) return;
    tone(1200, 0.05, 'sine', 0.15);
  }

  // Mission complete: a short rising jingle with a bright final note.
  function missionDone() {
    if (!ctx) return;
    const seq = [523, 659, 784, 1047];
    for (let i = 0; i < seq.length; i++) {
      tone(seq[i], 0.16, 'triangle', 0.25, i * 0.11);
    }
    tone(1319, 0.32, 'triangle', 0.22, seq.length * 0.11);
  }

  // Master volume, 0..1. Stored even before unlock so the settings menu
  // can set it before the context exists.
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  }

  return {
    unlock,
    shot,
    dryFire,
    hit,
    pickup,
    cash,
    honk,
    sirenSet,
    engineSet,
    uiClick,
    missionDone,
    setVolume,
  };
}
