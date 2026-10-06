// The audio engine core: context, master chain, buses, voice limits, shared buffers and the scheduler clock.
// Works on a live AudioContext and on an OfflineAudioContext (tests): pass {offline: true} and call pump() yourself.

import { makeImpulse, makeNoise, makeCeilingCurve, makePluck, makeJawari } from './dsp.js';
import { mulberry32 } from './theory.js';

export const LIMITS = { music: 22, sfx: 14, amb: 12 }; // simultaneous voices per bus (mobile-friendly)
export const BUS_LEVEL = { music: 0.36, sfx: 1.0, amb: 0.8 }; // gain staging into the master chain

export function createCore(ctx, opts = {}) {
  const E = {
    ctx, offline: !!opts.offline, rng: mulberry32(opts.seed ?? 12345),
    voices: { music: [], sfx: [], amb: [] }, stolen: 0, cache: new Map(), noises: {}, tasks: new Set(),
    lookahead: opts.lookahead ?? 0.12,
  };
  E.rand = (a = 0, b = 1) => a + (b - a) * E.rng();
  E.pick = (arr) => arr[Math.floor(E.rng() * arr.length)];
  E.now = () => ctx.currentTime;

  // ---------------------------------------------------------------- the master chain
  const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const bus = (name, dry, rev, dly) => {
    const b = { in: g(BUS_LEVEL[name]), dry: g(dry), rev: g(rev), dly: g(dly), name };
    b.in.connect(b.dry); b.in.connect(b.rev); b.in.connect(b.dly); return b;
  };
  const M = (E.master = {});
  M.music = bus('music', 1, 0.34, 0.22);   // painted notes and the generative bed
  M.sfx = bus('sfx', 1, 0.2, 0.08);        // creature and object voices
  M.amb = bus('amb', 1, 0.1, 0);           // soundscapes (already diffuse)
  M.musicIn = g(1); M.musicIn.connect(M.music.in); // painting ducking happens on bedGain, not here
  M.sum = g(1);
  M.tone = ctx.createBiquadFilter(); M.tone.type = 'lowpass'; M.tone.frequency.value = 6000; M.tone.Q.value = 0.5;
  M.air = ctx.createBiquadFilter(); M.air.type = 'highshelf'; M.air.frequency.value = 7000; M.air.gain.value = -3;
  M.lowcut = ctx.createBiquadFilter(); M.lowcut.type = 'highpass'; M.lowcut.frequency.value = 35; M.lowcut.Q.value = 0.6;
  M.conv = ctx.createConvolver(); M.conv.buffer = makeImpulse(ctx, 'garden'); E.room = 'garden';
  M.revRet = g(0.9); M.revSum = g(1);
  M.delay = ctx.createDelay(2); M.delay.delayTime.value = 0.31; // the original garden echo
  M.fb = g(0.3); M.dlyLp = ctx.createBiquadFilter(); M.dlyLp.type = 'lowpass'; M.dlyLp.frequency.value = 2600;
  M.dlyRet = g(0.85); M.dlySum = g(1);
  for (const b of [M.music, M.sfx, M.amb]) { b.dry.connect(M.sum); b.rev.connect(M.revSum); b.dly.connect(M.dlySum); }
  M.revSum.connect(M.conv); M.conv.connect(M.revRet); M.revRet.connect(M.sum);
  M.dlySum.connect(M.delay); M.delay.connect(M.dlyLp); M.dlyLp.connect(M.fb); M.fb.connect(M.delay); M.dlyLp.connect(M.dlyRet); M.dlyRet.connect(M.sum);
  M.sum.connect(M.lowcut); M.lowcut.connect(M.tone); M.tone.connect(M.air);
  M.glue = ctx.createDynamicsCompressor();
  M.glue.threshold.value = -18; M.glue.knee.value = 10; M.glue.ratio.value = 2; M.glue.attack.value = 0.012; M.glue.release.value = 0.3;
  M.limit = ctx.createDynamicsCompressor();
  M.limit.threshold.value = -6; M.limit.knee.value = 2; M.limit.ratio.value = 20; M.limit.attack.value = 0.002; M.limit.release.value = 0.12;
  M.makeup = g(opts.makeup ?? 1.0);
  M.volume = g(opts.volume ?? 1);
  M.pre = g(0.5); M.shaper = ctx.createWaveShaper(); M.shaper.curve = makeCeilingCurve(0.86); M.shaper.oversample = 'none';
  // a soft dark room for water: drops, splashes and rain are sent into it so they tail off instead of clicking
  M.wet = { in: g(1) }; M.wetLp = ctx.createBiquadFilter(); M.wetLp.type = 'lowpass'; M.wetLp.frequency.value = 2400; M.wetLp.Q.value = 0.5;
  M.wetConv = ctx.createConvolver(); M.wetConv.buffer = makeImpulse(ctx, 'water', 17); M.wetRet = g(0.55);
  M.wet.in.connect(M.wetLp); M.wetLp.connect(M.wetConv); M.wetConv.connect(M.wetRet); M.wetRet.connect(M.amb.in);
  M.air.connect(M.glue); M.glue.connect(M.limit); M.limit.connect(M.makeup); M.makeup.connect(M.volume);
  M.volume.connect(M.pre); M.pre.connect(M.shaper); M.shaper.connect(opts.destination || ctx.destination);
  // the shaper's curve maps the +-2 range to +-0.86, so the pre gain of 0.5 is undone inside the curve (unity below the knee)

  // ---------------------------------------------------------------- shared resources (built once, reused)
  E.noise = (color = 'white') => E.noises[color] || (E.noises[color] = makeNoise(ctx, color, 4, color.length * 97 + 5));
  E.pluck = (freq, o = {}) => {
    const key = `p${Math.round(freq * 4)}:${o.bright ?? 0.5}:${o.sustain ?? 0.5}:${o.body ?? 0}`;
    let v = E.cache.get(key);
    if (!v) {
      v = makePluck(ctx, freq, o); E.cache.set(key, v);
      if (E.cache.size > 64) E.cache.delete(E.cache.keys().next().value); // simple LRU-ish bound on memory
    } else { E.cache.delete(key); E.cache.set(key, v); }
    return v;
  };
  // jawari strings (sitar, tanpura): rendered once per pitch, kept in their own small LRU (a buffer is 0.3-0.7 MB)
  E.jcache = new Map();
  E.jawari = (kind, freq, params) => {
    const key = `${kind}${Math.round(freq * 10)}`;
    let v = E.jcache.get(key);
    if (v) { E.jcache.delete(key); E.jcache.set(key, v); return v; }
    v = makeJawari(ctx, freq, params); E.jcache.set(key, v);
    if (E.jcache.size > 28) E.jcache.delete(E.jcache.keys().next().value);
    return v;
  };
  E.waves = {};
  E.wave = (name, real) => {
    if (E.waves[name]) return E.waves[name];
    const re = new Float32Array(real.length + 1), im = new Float32Array(real.length + 1);
    real.forEach((a, i) => { im[i + 1] = a; });
    return (E.waves[name] = ctx.createPeriodicWave(re, im, { disableNormalization: true }));
  };

  E.setRoom = (room) => {
    if (!room || room === E.room) return;
    E.room = room; const t = E.now();
    // dip the reverb return, swap the impulse, bring it back (avoids a click)
    M.revRet.gain.cancelScheduledValues(t); M.revRet.gain.setTargetAtTime(0, t, 0.05);
    const swap = () => { try { M.conv.buffer = makeImpulse(ctx, room); } catch (_) {} M.revRet.gain.setTargetAtTime(0.9, E.now(), 0.25); };
    if (E.offline) swap(); else setTimeout(swap, 220);
  };

  // ---------------------------------------------------------------- voices: every note or sound registers here
  /** Register a voice. v = {out: GainNode, end: time, sources: [nodes], prio}. Steals the oldest when full. */
  E.addVoice = (busName, v) => {
    const list = E.voices[busName], t = E.now();
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) list.splice(i, 1);
    while (list.length >= LIMITS[busName]) {
      let k = 0; for (let i = 1; i < list.length; i++) if ((list[i].prio || 0) < (list[k].prio || 0) || ((list[i].prio || 0) === (list[k].prio || 0) && list[i].start < list[k].start)) k = i;
      E.kill(list[k], t); list.splice(k, 1); E.stolen++;
    }
    v.start = v.start ?? t; list.push(v); return v;
  };
  E.kill = (v, t = E.now()) => {
    try { v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.012); } catch (_) {}
    for (const s of v.sources || []) try { s.stop(t + 0.08); } catch (_) {}
    v.end = t + 0.08;
  };
  E.activeVoices = () => { const t = E.now(); let n = 0; for (const k in E.voices) for (const v of E.voices[k]) if (v.end >= t) n++; return n; };

  /** A voice output: gain (optionally panned) into a bus input. Returns the gain node to feed. */
  E.out = (dest, pan = 0) => {
    const out = ctx.createGain(); out.gain.value = 0;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); p.connect(dest); }
    else out.connect(dest);
    return out;
  };
  /** Send a voice output into the soft water room (amount 0..1). */
  E.wetSend = (node, amount) => { if (!(amount > 0)) return; const s = ctx.createGain(); s.gain.value = amount; node.connect(s); s.connect(M.wet.in); };
  E.osc = (type, f, t, stop) => {
    const o = ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o;
  };
  E.noiseSrc = (color, t, stop, rate = 1) => {
    const s = ctx.createBufferSource(); s.buffer = E.noise(color); s.loop = true; s.playbackRate.value = rate;
    s.start(t, E.rand(0, 3)); s.stop(stop); return s;
  };

  // ---------------------------------------------------------------- scheduler
  /** Tasks are functions (t0, t1) that schedule whatever falls in [t0, t1). pump() runs them up to now + lookahead. */
  E.horizon = 0;
  E.pump = () => {
    const now = E.now(), until = now + E.lookahead, from = Math.max(E.horizon, now);
    if (until <= from) return;
    for (const task of E.tasks) { try { task(from, until); } catch (e) { if (!E._warned) { E._warned = 1; console.warn('audio task', e); } } }
    E.horizon = until;
  };
  E.startClock = () => {
    if (E.offline || E.timer) return;
    E.timer = setInterval(E.pump, 40);
  };
  E.stopClock = () => { if (E.timer) { clearInterval(E.timer); E.timer = null; } };

  E.param = (p, v, t = E.now(), tc = 0.4) => { try { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); } catch (_) { p.value = v; } };
  return E;
}
