// The sample layer: recorded-quality sounds from web/assets/audio/ where they exist, synthesis everywhere else.
// web/assets/audio/manifest.json:
//   { "version": 1,
//     "sfx":  { "rustle": { "files": ["sfx/rustle-1.ogg", "sfx/rustle-2.ogg"], "gain": 1, "pitch": 0.06,
//                           "repeat": 0, "places": ["meadow", "wood"] } },          // places: prefetch there ("*" = everywhere)
//     "beds": { "rain-steady": { "files": ["beds/rain-steady-1.ogg"], "gain": 1 } } }
// Paths are relative to the manifest. Nothing blocks: a voice whose files are not decoded yet plays synthesised this
// once and its files load in the background. Buffers are decoded once and freed when a place no longer needs them.

const SFX_LEVEL = 0.22;  // a loudness-normalised take (loudest 400 ms at -24 dBFS) lands near -29 dB, the middle of the synth voices (measured)
const BUDGET = 40e6;     // bytes of decoded audio kept at most (phones)
// water and grass takes stay as calm as their synthesis (BRIEF points 21, 22): a little quieter, a gentle cut above
// 3 kHz, and the water ones a soft send into the water room. [level, wet]
const SOFT = { drop: [0.7, 0.45, 3200], drip: [0.7, 0.55, 3200], plop: [0.75, 0.45, 3200], bubble: [0.7, 0.4, 3200], splash: [0.7, 0.5, 3200], wave: [0.8, 0.25, 3200],
  grass: [0.55, 0, 2200, 250], rustle: [0.6, 0, 2200, 250] }; // [level, wet, lowpass Hz (two poles twice), highpass Hz (no handling thump)]

export function createSamples(E, opts = {}) {
  const ctx = E.ctx;
  const url = opts.manifest === undefined ? new URL('../../assets/audio/manifest.json', import.meta.url).href : opts.manifest;
  const files = new Map();   // path -> {buf, promise, used, bytes, failed}
  const last = {};           // voice -> index of the variant played last
  let played = 0;
  const waiting = new Set(); // callbacks for "something finished loading"
  let man = { sfx: {}, beds: {} }, base = url || '', placeId = null;

  const ready = (async () => {
    if (!url || typeof fetch !== 'function') return man;
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return man;
      const m = await r.json();
      man = { sfx: m.sfx || {}, beds: m.beds || {}, version: m.version || 1 };
      if (placeId) prefetchPlace(placeId);
    } catch (_) { /* no manifest: everything stays synthesised */ }
    return man;
  })();

  const abs = (p) => new URL(p, base).href;
  // loops are decoded at 32 kHz (noise-like beds lose nothing audible, and a third less memory on phones)
  let bedDecoder = null;
  const decoderFor = (bed) => { if (!bed) return ctx; try { return (bedDecoder ||= new OfflineAudioContext(1, 1, 32000)); } catch (_) { return ctx; } };
  function load(path, bed = false) {
    let f = files.get(path);
    if (f) { f.used = E.now(); return f; }
    f = { buf: null, used: E.now(), bytes: 0, failed: false };
    files.set(path, f);
    f.promise = (async () => {
      try {
        const r = await fetch(abs(path));
        if (!r.ok) throw new Error(r.status);
        const data = await r.arrayBuffer();
        const dc = decoderFor(bed);
        const buf = await new Promise((res, rej) => { const p = dc.decodeAudioData(data, res, rej); if (p && p.catch) p.catch(rej); });
        f.buf = buf; f.bytes = buf.length * buf.numberOfChannels * 4;
        trim();
        for (const cb of [...waiting]) { try { cb(path); } catch (_) {} }
      } catch (e) { f.failed = true; }
    })();
    return f;
  }
  const loaded = (entry) => (entry ? entry.files.map((p) => files.get(p)).filter((f) => f && f.buf) : []);
  const fetchEntry = (entry) => { if (entry && Array.isArray(entry.files)) for (const p of entry.files) load(p); };
  const bedTake = {}; // a bed plays one take per session (picked at random), so only that one is decoded
  const bedFile = (name) => { const e = man.beds[name]; if (!e || !e.files || !e.files.length) return null; if (bedTake[name] === undefined) bedTake[name] = Math.floor(E.rng() * e.files.length); return e.files[bedTake[name] % e.files.length]; };

  function trim(keep = new Set()) { // free the least recently used buffers above the budget
    let total = 0; for (const f of files.values()) total += f.bytes;
    if (total <= BUDGET) return;
    const list = [...files.entries()].filter(([p, f]) => f.buf && !keep.has(p)).sort((a, b) => a[1].used - b[1].used);
    for (const [p, f] of list) { if (total <= BUDGET * 0.8) break; total -= f.bytes; files.delete(p); }
  }
  function prefetchPlace(id) {
    for (const [name, e] of Object.entries(man.sfx)) if (!e.places || e.places.includes('*') || e.places.includes(id)) fetchEntry(e);
  }

  return {
    ready,
    get manifest() { return man; },
    hasVoice: (name) => !!(man.sfx[name] && man.sfx[name].files && man.sfx[name].files.length),
    hasBed: (name) => !!(man.beds[name] && man.beds[name].files && man.beds[name].files.length),
    onLoad(cb) { waiting.add(cb); return () => waiting.delete(cb); },

    /** Play a voice from its files. Returns false (and starts loading) when no decoded file exists yet. */
    playVoice(name, o, out) {
      const e = man.sfx[name]; if (!e || !e.files || !e.files.length) return false;
      const bufs = loaded(e);
      if (!bufs.length) { fetchEntry(e); return false; }
      if (bufs.length < e.files.length) fetchEntry(e);
      const n = Math.max(1, Math.min(e.repeat ? 12 : 1, o.count ?? 1));
      const t0 = Math.max(E.now(), o.time ?? E.now()) + (o.delay || 0);
      for (let i = 0; i < n; i++) {
        let k = Math.floor(E.rng() * bufs.length);
        if (bufs.length > 1 && k === last[name]) k = (k + 1) % bufs.length; // never the same take twice in a row
        last[name] = k;
        const f = bufs[k]; f.used = E.now();
        const sz = Math.pow(2, (0.5 - (o.size ?? 0.5)) * 0.5), jit = 1 + (E.rng() * 2 - 1) * (e.pitch ?? 0.05);
        const rate = Math.max(0.4, Math.min(2.5, (o.pitch ?? 1) * sz * jit));
        const soft = SOFT[name];
        const vol = SFX_LEVEL * (e.gain ?? 1) * (o.vol ?? 1) * (soft ? soft[0] : 1) * Math.pow(10, (E.rng() * 3 - 1.5) / 20);
        const t = t0 + i * (e.repeat || 0) / (o.speed ?? 1);
        const src = ctx.createBufferSource(); src.buffer = f.buf; src.playbackRate.value = rate;
        const g = out(o); g.gain.setValueAtTime(vol, t);
        if (soft) { // two lowpasses (24 dB/oct), a 30 ms fade-in so no take starts with a click, the water room
          const lp = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter(); lp.type = lp2.type = 'lowpass'; lp.frequency.value = lp2.frequency.value = soft[2]; lp.Q.value = 0.5; lp2.Q.value = 0.6;
          if (soft[3]) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = soft[3]; hp.Q.value = 0.6; src.connect(hp); hp.connect(lp); } else src.connect(lp);
          lp.connect(lp2); lp2.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); E.wetSend(g, soft[1]);
        } else src.connect(g); src.start(t); const end = t + f.buf.duration / rate;
        src.stop(end + 0.02);
        E.addVoice(o.bus || 'sfx', { out: g, sources: [src], end, start: t }); played++;
      }
      return true;
    },

    /** Decoded buffers of a bed (all takes), or null while loading (the call starts the load). */
    bedBuffers(name) {
      const p = bedFile(name); if (!p) return null;
      const f = load(p, true);
      return f.buf ? [f.buf] : null;
    },
    bedGain: (name) => (man.beds[name] && man.beds[name].gain) ?? 1,

    /** A new place: prefetch its voices, then free what neither it nor a playing bed needs. */
    setPlace(id, keepBeds = []) {
      placeId = id;
      prefetchPlace(id);
      const keep = new Set();
      for (const b of keepBeds) { const p = bedFile(b); if (p) keep.add(p); }
      for (const [name, e] of Object.entries(man.sfx)) if (!e.places || e.places.includes('*') || e.places.includes(id)) e.files.forEach((p) => keep.add(p));
      const t = E.now();
      for (const [p, f] of files) if (!keep.has(p) && f.buf && t - f.used > 30) files.delete(p);
      trim(keep);
    },
    /** Tests and the lab: load every file of the manifest (or of the given entries) and wait. */
    async preloadAll(names) { await ready; const es = Object.entries(man.sfx).filter(([n]) => !names || names.includes(n));
      for (const [, e] of es) fetchEntry(e);
      for (const n of Object.keys(man.beds)) if (!names || names.includes(n)) load(bedFile(n), true); await Promise.all([...files.values()].map((f) => f.promise)); return this.stats(); },
    lastTake: (name) => last[name],
    /** Lab: play a given take of anything in the manifest (decoded on demand). */
    async take(kind, name, i) { await ready; const e = (kind === 'bed' ? man.beds : man.sfx)[name]; if (!e || !e.files[i]) return null; const f = load(e.files[i], kind === 'bed'); await f.promise; return f.buf; },
    stats() { let bytes = 0, n = 0; for (const f of files.values()) if (f.buf) { bytes += f.bytes; n++; } return { files: n, mb: +(bytes / 1e6).toFixed(1), voices: Object.keys(man.sfx).length, beds: Object.keys(man.beds).length, played }; },
  };
}
