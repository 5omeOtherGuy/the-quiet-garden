// The compositor: presents the engine's scene canvas as a sheet of watercolour paper, graded for the
// season, time of day and weather, then screens the frame's lights on top so lamps stay warm at night.
// WebGL single pass straight on the target canvas (paper tooth, edge pooling, grading, fog, vignette, lights);
// Canvas 2D fallback built from blend modes.
//
// Moving backgrounds (painted places): a place may hand over its paintings for the frame as `compositor.backdrop`
// instead of drawing them into the scene canvas. The same single pass then draws the painting UNDER the scene,
// displaced by a motion source (a flow atlas measured from an animated clip, or invented wind) times a strength per
// pixel (weather level in gust fronts + where fingers have just been, by region), blends day into night, and spreads a season
// change as a wet wash. See painted.js (Place.draw, Place.gust) for the data.
import { grade } from './palette.js';
import { paperTile, pattern } from './paper.js';
import { css } from './color.js';
import { lights } from './lights.js';

const PREC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
// the grade, shared by both programs: paper tooth, glaze (lamps and warm lights resist the night), fog, vignette, lights
const GRADE = `
uniform sampler2D paper; uniform sampler2D lightTex;
uniform vec2 res; uniform vec2 paperScale;
uniform vec3 mul; uniform vec3 add; uniform vec3 fog;
uniform float sat; uniform float contrast; uniform float fogAmt; uniform float vignette; uniform float paperK; uniform float warmKeep; uniform float hasLight;
const vec3 L = vec3(0.2126, 0.7152, 0.0722);
vec3 graded(vec3 c, vec2 uv) {
  float l0 = dot(c, L);
  // paper tooth, stronger where the wash is light (pigment lies thin on the ridges)
  float p = texture2D(paper, gl_FragCoord.xy * paperScale).r;
  c *= 1.0 + (p - 0.5) * paperK * (0.5 + 0.5 * l0);
  // grading: lamps and warm highlights resist the night glaze
  float warmth = clamp((c.r - c.b) * 2.2, 0.0, 1.0) * smoothstep(0.5, 0.85, l0);
  vec3 gcol = c * mul + add;
  gcol = mix(gcol, c * mix(mul, vec3(1.0), 0.85) + add * 0.3, warmth * warmKeep);
  float lg = dot(gcol, L);
  gcol = mix(vec3(lg), gcol, sat);
  gcol = (gcol - 0.5) * contrast + 0.5;
  gcol = mix(gcol, fog, fogAmt * (0.6 + 0.4 * (1.0 - uv.y)));
  vec2 q = uv - 0.5;
  gcol *= 1.0 - vignette * dot(q, q) * 1.5;
  // lights: screened on after the grade
  if (hasLight > 0.5) { vec3 li = texture2D(lightTex, uv).rgb; gcol = 1.0 - (1.0 - gcol) * (1.0 - li); }
  return clamp(gcol, 0.0, 1.0);
}`;
const FS = `${PREC}
varying vec2 v;
uniform sampler2D scene; uniform float edgeK;
${GRADE}
void main() {
  vec2 uv = vec2(v.x, 1.0 - v.y);
  vec3 c = texture2D(scene, uv).rgb;
  // pigment pooling along hard edges
  if (edgeK > 0.001) {
    vec2 px = 1.3 / res;
    float l0 = dot(c, L);
    float gx = dot(texture2D(scene, uv + vec2(px.x, 0.0)).rgb, L) - dot(texture2D(scene, uv - vec2(px.x, 0.0)).rgb, L);
    float gy = dot(texture2D(scene, uv + vec2(0.0, px.y)).rgb, L) - dot(texture2D(scene, uv - vec2(0.0, px.y)).rgb, L);
    c *= 1.0 - edgeK * min(1.0, length(vec2(gx, gy)) * 2.5) * (0.35 + 0.65 * l0);
  }
  gl_FragColor = vec4(graded(c, uv), 1.0);
}`;
// The backdrop pass. Painting uv p = fit.xy + uv * fit.zw. regionTex: r crown, g meadow, b water, a sky.
// mode 0: flow (the still painting displaced by the motion measured in a clip: an atlas of moments of its loop)
// mode 1: wind (invented motion, for views that have no clip yet)   mode 2: a plain clip plays in dayA   mode 3: still
const FSB = `${PREC}
varying vec2 v;
uniform sampler2D scene; uniform sampler2D dayA; uniform sampler2D nightA; uniform sampler2D dayB; uniform sampler2D nightB;
uniform sampler2D regionTex; uniform sampler2D flowTex; uniform sampler2D touchTex; uniform sampler2D stormTex;
uniform vec4 fit; uniform vec4 gains; uniform vec4 wash; uniform vec2 size; uniform vec2 range; uniform vec2 grid; uniform vec2 halfT;
uniform vec2 range2; uniform vec2 grid2; uniform vec2 halfT2; uniform float frames2; uniform float phase2; uniform float storm;
uniform sampler2D waterTex; uniform sampler2D waterBase; uniform sampler2D waterStorm; uniform vec4 wbox; uniform vec4 waterCh; uniform float hasWater; uniform float wstorm; uniform float wmask;
uniform float nightA_k; uniform float nightB_k; uniform float hasB; uniform float level; uniform float time; uniform float frames; uniform float phase;
uniform float mode; uniform float touchGain; uniform float washSeed; uniform float washFade;
${GRADE}
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return noise(p) * 0.6 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 9.1) * 0.1; }
// the wind comes in fronts that travel left to right; between them the picture rests. The same formula is in
// painted.js (gustAt), so that grown things and creatures sway with the grass under them: keep the two in step.
float gustAt(vec2 w, float t) {
  float f = 0.5 + 0.2 * sin(w.x * 2.9 - t * 0.5 + w.y * 1.7) + 0.16 * sin(w.x * 5.3 - t * 0.83 - w.y * 2.9 + 1.3) + 0.14 * sin(w.x * 1.3 - t * 0.21 + w.y * 4.1 + 4.0);
  return 0.45 + 1.1 * smoothstep(0.25, 0.8, f);
}
vec2 tile(vec2 uv, float i){ vec2 g = vec2(mod(i, grid.x), floor(i / grid.x + 0.001)); return texture2D(flowTex, (g + clamp(uv, halfT, 1.0 - halfT)) / grid).rg - 0.50196; }
vec2 flowAt(vec2 uv, float ph){ float f = ph * frames, i0 = floor(f); return mix(tile(uv, i0), tile(uv, mod(i0 + 1.0, frames)), f - i0); }
// the same for the storm map (its own atlas, loop length and range)
vec2 tile2(vec2 uv, float i){ vec2 g = vec2(mod(i, grid2.x), floor(i / grid2.x + 0.001)); return texture2D(stormTex, (g + clamp(uv, halfT2, 1.0 - halfT2)) / grid2).rg - 0.50196; }
vec2 stormAt(vec2 uv, float ph){ float f = ph * frames2, i0 = floor(f); return mix(tile2(uv, i0), tile2(uv, mod(i0 + 1.0, frames2)), f - i0); }
void main() {
  vec2 uv = vec2(v.x, 1.0 - v.y);
  vec2 p = fit.xy + uv * fit.zw;
  vec2 d = vec2(0.0); float sheen = 0.0;
  if (mode < 1.5) {
    vec4 G = texture2D(regionTex, p) * gains;                 // what may move here, and how much of it this season
    float touch = texture2D(touchTex, p).r * touchGain;       // what a finger has just stirred
    vec2 w = vec2(p.x * size.x / size.y, p.y);                // in sheet heights
    float gust = gustAt(w, time), fill = 1.0, wind = level * gust;
    if (mode < 0.5) {
      // strength per pixel = weather level (in fronts) + touch; 1 = as far as the clip moves
      float amp = min(1.8, min(1.0, G.r + G.g + G.b + G.a) * (wind + touch));
      // two readings of the loop half a turn apart, each faded out where its loop starts over: the wind never stops
      // as a whole, the loop point never shows, and the moment differs from place to place
      float ph = fract(phase + (noise(w * vec2(1.25, 2.0)) - 0.5) * 0.5), wa = sin(3.14159 * ph); wa *= wa;
      vec2 f = flowAt(p, ph) * wa + flowAt(p, fract(ph + 0.5)) * (1.0 - wa);
      vec2 df = f * 2.0 * range;
      float rest = texture2D(flowTex, clamp(p, halfT, 1.0 - halfT) / grid).b;
      if (storm > 0.001) {
        // a storm map (measured from a storm clip of the same painting) blends in by the storm level: the sea does
        // not just move more, it moves differently, and the change comes with the weather, never as a cut
        float ph2 = fract(phase2 + (noise(w * vec2(1.25, 2.0)) - 0.5) * 0.5), wb = sin(3.14159 * ph2); wb *= wb;
        vec2 f2 = stormAt(p, ph2) * wb + stormAt(p, fract(ph2 + 0.5)) * (1.0 - wb);
        df = mix(df, f2 * 2.0 * range2, storm); f = mix(f, f2, storm);
        rest = mix(rest, texture2D(stormTex, clamp(p, halfT2, 1.0 - halfT2) / grid2).b, storm);
      }
      d = df * amp;
      sheen = G.g * min(amp, 1.2) * abs(f.x) * 0.16;          // bent grass catches the light
      // where the clip itself rests (far grass, clouds; blue = how far a spot ever moves, written by the export) invented
      // motion fills in, fully under a finger and a little in the wind: the picture answers a touch wherever it is laid
      fill = 1.0 - smoothstep(0.03, 0.2, rest);
      wind *= 0.35;
    }
    if (fill > 0.01) {
      // invented motion (all there is for a view without a clip): blades lean, leaves tremble, water ripples, clouds drift
      float st = (wind + touch) * fill;
      vec2 s2 = vec2(w.x * 0.5, w.y);                         // as on a 2:1 sheet
      float near = smoothstep(0.5, 1.0, w.y);
      vec2 e = vec2(0.0);
      if (G.g > 0.01) {
        float blade = noise(vec2(s2.x * 120.0, s2.y * 16.0)), ph2 = noise(vec2(s2.x * 30.0 - time * 0.9, s2.y * 12.0));
        float lean = st * (0.55 + 0.45 * sin(time * 2.6 + ph2 * 6.28 + blade * 3.0));
        e.x -= G.g * lean * (0.0006 + 0.0022 * near) * (0.4 + blade);
        e.y += G.g * abs(lean) * (0.0002 + 0.0007 * near) * blade;
        sheen += G.g * lean * blade * 0.07 * near;
      }
      if (G.r > 0.01) {
        vec2 leaf = vec2(noise(s2 * 46.0 + vec2(time * 1.3, 0.0)), noise(s2 * 46.0 + vec2(7.0, time * 1.1))) - 0.5;
        e -= G.r * st * (0.0018 * leaf + vec2(0.0016 * sin(time * 1.2 + s2.y * 7.0 + s2.x * 3.0), 0.0007 * sin(time * 1.7 + s2.x * 9.0)));
      }
      if (G.b > 0.01) e.x -= G.b * fill * (0.0004 + 0.0007 * st) * sin(s2.y * 300.0 + time * 2.2 + noise(s2 * 40.0) * 6.28);
      if (G.a > 0.01) e -= G.a * fill * 0.0030 * vec2(sin(s2.x * 5.0 + time * 0.21 + 2.0 * sin(s2.y * 4.0 + time * 0.05)), cos(s2.y * 6.0 - time * 0.17 + 2.0 * sin(s2.x * 3.0)));   // clouds drift, slowly
      e.x *= 2.0 * size.y / size.x;
      d += e;
    }
  }
  // water that really flows: inside the water region (soft at its edge) a clip of the water takes over from the field
  // (the mask: the base's alpha when the export made one, e.g. the water plus the band of wet sand the surf runs up;
  // else the view's water region with a soft edge)
  float wm = 0.0; vec2 wq = vec2(0.0); vec4 cb = vec4(0.0);
  if (hasWater > 0.5) {
    wq = (p - wbox.xy) / wbox.zw;
    if (wq.x > 0.0 && wq.x < 1.0 && wq.y > 0.0 && wq.y < 1.0) {
      cb = texture2D(waterBase, wq);
      wm = (wmask > 0.5 ? cb.a : smoothstep(0.3, 0.75, dot(texture2D(regionTex, p), waterCh))) * hasWater; d *= 1.0 - wm;
    }
  }
  vec2 q = p + d;
  vec3 c = texture2D(dayA, q).rgb;
  if (nightA_k > 0.004) c = mix(c, texture2D(nightA, q).rgb, nightA_k);
  if (hasB > 0.5) {
    // a season change spreads as a wash: a ragged wet edge that creeps into the paper, pigment gathering where it stops
    vec2 ww = p * size - wash.xy; ww.y /= 0.8;
    float a = atan(ww.y, ww.x);
    float k = 1.0 + 0.16 * (noise(vec2(cos(a) * 1.6 + 5.0, washSeed)) + noise(vec2(sin(a) * 1.6 + 9.0, washSeed + 3.0)) - 1.0);
    float e = length(ww) - wash.z * k + (fbm(p * size / 75.0) - 0.5) * 110.0;
    float m = 1.0 - smoothstep(-26.0, 26.0, e);
    vec3 cb = texture2D(dayB, q).rgb;
    if (nightB_k > 0.004) cb = mix(cb, texture2D(nightB, q).rgb, nightB_k);
    c = mix(c, cb, m);
    c *= 1.0 - 0.12 * washFade * exp(-e * e / 900.0);
    c = mix(c, vec3(1.0, 0.985, 0.95), 0.09 * washFade * smoothstep(120.0, 0.0, e) * step(0.0, e));
  }
  c *= 1.0 + sheen;
  if (wm > 0.001) {
    // the clip's change against the still it was made from, as a ratio, lands on whatever variant is shown: the
    // water runs by day and by night, in every season, with that variant's colour
    vec3 cl = texture2D(waterTex, wq).rgb;
    if (wstorm > 0.001) cl = mix(cl, texture2D(waterStorm, wq).rgb, wstorm);   // the storm's clip, by the storm level
    c = mix(c, clamp(c * (cl + 0.04) / (cb.rgb + 0.04), 0.0, 1.25), wm);
  }
  vec4 fg = texture2D(scene, uv);                              // the living foreground, premultiplied
  gl_FragColor = vec4(graded(fg.rgb + c * (1.0 - fg.a), uv), 1.0);
}`;
const U_GRADE = ['scene', 'paper', 'lightTex', 'res', 'paperScale', 'mul', 'add', 'fog', 'sat', 'contrast', 'fogAmt', 'vignette', 'paperK', 'warmKeep', 'hasLight'];
const U_BACK = ['waterTex', 'waterBase', 'waterStorm', 'wbox', 'waterCh', 'hasWater', 'wstorm', 'wmask', 'stormTex', 'range2', 'grid2', 'halfT2', 'frames2', 'phase2', 'storm', 'dayA', 'nightA', 'dayB', 'nightB', 'regionTex', 'flowTex', 'touchTex', 'fit', 'gains', 'wash', 'size', 'range', 'grid', 'halfT', 'nightA_k', 'nightB_k', 'hasB', 'level', 'time', 'frames', 'phase', 'mode', 'touchGain', 'washSeed', 'washFade'];
// texture units of the backdrop pass
const T_DAYA = 3, T_NIGHTA = 4, T_DAYB = 5, T_NIGHTB = 6, T_REGION = 7, T_FLOW = 8, T_TOUCH = 9, T_STORM = 10, T_WATER = 11, T_WBASE = 12, T_WSTORM = 13;

export const compositor = {
  mode: 'auto',           // 'auto' | 'gl' | '2d'
  interior: 0,            // 0..1: set by a place on enter()/leave() of an interior; damps the day/night grade
  look: null,             // set by a painted place while it is shown (art.painted does it): {time, tooth}, see grade()
  backdrop: null,         // set by a painted place for ONE frame (Place.draw): its paintings, drawn here under the scene
  measure: false,         // debug: time the pass on the GPU into stats.gpuMs (blocks; the lab's ?gpu=1)
  stats: { ms: 0, mode: '', frames: 0, lights: 0, backdrop: false, water: false },   // water: false | 'gpu' | 'soft'
  _gl: null, _fail: false, _lost: false,

  /**
   * Present the engine's scene. frameInfo: { target: the visible canvas element (required), t, dt, ... }.
   * The first call decides the path for that canvas: WebGL on it if available, else its 2D context.
   * If frameInfo.target is missing the scene canvas is graded in place with the 2D path.
   */
  present(sceneCanvas, env, frameInfo = {}) {
    const t0 = performance.now();
    const target = frameInfo.target;
    const bd = this.backdrop; this.backdrop = null;
    const gp = grade(this.interior > 0 || this.look ? { ...(env || {}), interior: this.interior, look: this.look } : (env || {}));
    this.stats.lights = lights.count;
    const lightCanvas = lights.take();
    let used = '2d';
    if (target && this.mode !== '2d' && !this._fail) {
      try {
        const s = this._ensureGL(target);
        if (s && !this._lost) { this._drawGL(s, sceneCanvas, gp, lightCanvas, bd && s.back ? bd : null); used = 'gl'; s.lastScene = sceneCanvas; }
        else if (s && this._lost) { used = 'skip'; }
      } catch (e) { this._fail = true; console.warn('art compositor: WebGL unavailable, using 2D', e); }
    }
    if (used === '2d') {
      const g2 = target ? (target.getContext ? target.getContext('2d') : target) : sceneCanvas.getContext('2d');
      if (g2) this._draw2D(g2, sceneCanvas, gp, g2.canvas.width, g2.canvas.height, !target, lightCanvas, bd);
    }
    const ms = performance.now() - t0;
    this.stats.ms += (ms - this.stats.ms) * 0.1; this.stats.mode = used; this.stats.frames++; this.stats.backdrop = used === 'gl' && !!bd;
  },

  /**
   * May a place leave its paintings to the compositor this frame? True when the last frame was presented with WebGL
   * from this very scene canvas (so a place drawn into some other buffer, or a 2D fallback, keeps the plain path).
   * texWidth: the widest painting in pixels.
   */
  canBackdrop(sceneCanvas, texWidth = 0) {
    const s = this._gl;
    return !!s && !!s.back && !this._fail && !this._lost && this.mode !== '2d' && s.lastScene === sceneCanvas && texWidth <= s.maxTex;
  },
  /** Forget the texture made for a painting set or a region map (the place calls it when it frees them). */
  release(key) { const s = this._gl; if (!s || !key) return; const t = s.cache.get(key); if (t) { s.gl.deleteTexture(t); s.cache.delete(key); } },

  _ensureGL(target) {
    let s = this._gl;
    if (s && s.canvas !== target) s = null;
    if (!s) {
      const gl = target.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) { this._fail = true; return null; }
      target.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this._lost = true; });
      target.addEventListener('webglcontextrestored', () => { this._gl = null; this._lost = false; });
      const sh = (type, src) => { const h = gl.createShader(type); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
      const program = (fs, names) => {
        const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        const u = {}; for (const n of names) u[n] = gl.getUniformLocation(prog, n);
        gl.useProgram(prog); gl.uniform1i(u.scene, 0); gl.uniform1i(u.paper, 1); gl.uniform1i(u.lightTex, 2);
        return { prog, u };
      };
      const main = program(FS, [...U_GRADE, 'edgeK']);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const mkTex = (unit, wrap, fill) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (fill) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fill)); return t; };
      const sceneTex = mkTex(0, gl.CLAMP_TO_EDGE), paperTex = mkTex(1, gl.REPEAT), lightTex = mkTex(2, gl.CLAMP_TO_EDGE, [0, 0, 0, 255]);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paperTile(512, 7));
      s = this._gl = { canvas: target, gl, main, back: null, sceneTex, paperTex, lightTex, mkTex, w: 0, h: 0, lastScene: null, cache: new Map(), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
      // the backdrop pass: only where the GPU has the texture units for it; a place falls back to the plain path otherwise
      if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) > T_WSTORM) {
        try {
          const back = program(FSB, [...U_GRADE, ...U_BACK]);
          [['dayA', T_DAYA], ['nightA', T_NIGHTA], ['dayB', T_DAYB], ['nightB', T_NIGHTB], ['regionTex', T_REGION], ['flowTex', T_FLOW], ['touchTex', T_TOUCH], ['stormTex', T_STORM], ['waterTex', T_WATER], ['waterBase', T_WBASE], ['waterStorm', T_WSTORM]].forEach(([n, unit]) => gl.uniform1i(back.u[n], unit));
          s.none = mkTex(T_DAYA, gl.CLAMP_TO_EDGE, [0, 0, 0, 0]); s.grey = mkTex(T_FLOW, gl.CLAMP_TO_EDGE, [128, 128, 128, 255]);
          s.clip = mkTex(T_DAYA, gl.CLAMP_TO_EDGE, [0, 0, 0, 255]);
          s.touch = mkTex(T_TOUCH, gl.CLAMP_TO_EDGE, [0, 0, 0, 255]); s.touchGen = -1; s.touchOf = null;
          s.water = mkTex(T_WATER, gl.CLAMP_TO_EDGE, [0, 0, 0, 255]); s.wstorm = mkTex(T_WSTORM, gl.CLAMP_TO_EDGE, [0, 0, 0, 255]);
          s.back = back;
        } catch (e) { console.warn('art compositor: no backdrop pass', e); }
      }
    }
    const W = target.width, H = target.height;
    if (s.w !== W || s.h !== H) { s.gl.viewport(0, 0, W, H); s.w = W; s.h = H; }
    return s;
  },

  // a painting set { tiles: [{img, x, w}], w, h }, a picture { img } or a data map { data: Uint8Array (rgba), w, h }: one texture, made once
  _texOf(s, key, unit) {
    const gl = s.gl; let t = s.cache.get(key);
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (t) { gl.bindTexture(gl.TEXTURE_2D, t); return; }
    t = s.mkTex(unit, gl.CLAMP_TO_EDGE);
    if (key.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, key.w, key.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, key.data);
    else if (key.img) { const f = key.rgba ? gl.RGBA : gl.RGB; gl.texImage2D(gl.TEXTURE_2D, 0, f, f, gl.UNSIGNED_BYTE, key.img); }
    else if (key.tiles.length === 1) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, key.tiles[0].img);
    else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, key.w, key.h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      for (const tile of key.tiles) gl.texSubImage2D(gl.TEXTURE_2D, 0, tile.x, 0, gl.RGB, gl.UNSIGNED_BYTE, tile.img);
    }
    s.cache.set(key, t);
  },

  _drawGL(s, scene, gp, lightCanvas, bd) {
    const { gl } = s, W = s.w, H = s.h, P = bd ? s.back : s.main, u = P.u;
    gl.useProgram(P.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.sceneTex);
    if (bd) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);         // the scene is a transparent sheet over the painting
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    if (bd) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.paperTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.lightTex);
    if (lightCanvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lightCanvas);
    gl.uniform1f(u.hasLight, lightCanvas ? 1 : 0);
    const dpr = Math.max(1, Math.min(3, W / 1280));
    gl.uniform2f(u.res, W, H); gl.uniform2f(u.paperScale, 1 / (512 * 1.1 * dpr), 1 / (512 * 1.1 * dpr));
    gl.uniform3fv(u.mul, gp.mul); gl.uniform3fv(u.add, gp.add); gl.uniform3fv(u.fog, gp.fog);
    gl.uniform1f(u.sat, gp.sat); gl.uniform1f(u.contrast, gp.contrast); gl.uniform1f(u.fogAmt, gp.fogAmt);
    gl.uniform1f(u.vignette, gp.vignette); gl.uniform1f(u.paperK, gp.paper); gl.uniform1f(u.warmKeep, gp.warmKeep);
    if (bd) this._backdrop(s, bd, u); else gl.uniform1f(u.edgeK, gp.edge);
    if (!this.measure) { gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return; }
    // debug: the GPU's time for the pass (reading a pixel back waits for it; never leave this on)
    const px = this._px || (this._px = new Uint8Array(4)), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync(); const t0 = performance.now(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); sync();
    this.stats.gpuMs = (this.stats.gpuMs || 0) + (performance.now() - t0 - (this.stats.gpuMs || 0)) * 0.1;
  },

  _backdrop(s, bd, u) {
    const { gl } = s, bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
    let mode = bd.mode;
    // painting A (or, for comparison in the lab, a plain clip in its place), painting B while a season wash spreads
    if (mode === 2 && bd.clip && bd.clip.readyState >= 2) {
      const v = bd.clip; bind(T_DAYA, s.clip);
      if (s.clipOf !== v || s.clipTime !== v.currentTime) {                           // a new frame of the video
        s.clipOf = v; s.clipTime = v.currentTime;
        if (!s.clipSoft) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v); if (gl.getError() !== gl.NO_ERROR) s.clipSoft = true; }
        if (s.clipSoft) {                                                             // the GPU's video path failed: go through a canvas in memory (slow)
          const c = s.clipC || (s.clipC = document.createElement('canvas')); if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
          c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        }
      }
    } else { if (mode === 2) mode = 3; this._texOf(s, bd.a.day, T_DAYA); }
    const nA = mode !== 2 && bd.a.night ? bd.night : 0; if (nA > 0.004) this._texOf(s, bd.a.night, T_NIGHTA); else bind(T_NIGHTA, s.none);
    const B = bd.b, nB = B && B.night ? bd.night : 0;
    if (B) this._texOf(s, B.day, T_DAYB); else bind(T_DAYB, s.none);
    if (nB > 0.004) this._texOf(s, B.night, T_NIGHTB); else bind(T_NIGHTB, s.none);
    if (bd.regions) this._texOf(s, bd.regions, T_REGION); else bind(T_REGION, s.none);
    // the motion source: an atlas of moments of the view's loop
    const F = bd.flow;
    if (mode === 0 && F && F.img) {
      this._texOf(s, F, T_FLOW);
      gl.uniform2fv(u.range, F.range); gl.uniform2fv(u.grid, F.grid); gl.uniform2f(u.halfT, 0.5 / F.tile[0], 0.5 / F.tile[1]); gl.uniform1f(u.frames, F.frames);
    } else { if (mode === 0) mode = 1; bind(T_FLOW, s.grey); }
    // the storm map, blended in by the storm level (only with a flow atlas to blend from)
    const S = mode === 0 && bd.storm && bd.storm.img && bd.stormMix > 0.001 ? bd.storm : null;
    if (S) {
      this._texOf(s, S, T_STORM);
      gl.uniform2fv(u.range2, S.range); gl.uniform2fv(u.grid2, S.grid); gl.uniform2f(u.halfT2, 0.5 / S.tile[0], 0.5 / S.tile[1]); gl.uniform1f(u.frames2, S.frames);
      gl.uniform1f(u.phase2, bd.phase2 || 0); gl.uniform1f(u.storm, Math.min(1, bd.stormMix));
    } else { bind(T_STORM, s.grey); gl.uniform1f(u.storm, 0); }
    // the water clip: a new frame of the video is uploaded when its time moved (the GPU's video path, else a canvas)
    const Wt = bd.water, wOn = Wt && Wt.base && Wt.base.img ? 1 : 0; bind(T_WATER, s.water);
    if (wOn) {
      if (Wt.mix < 0.995) this._video(s, Wt.video, 'w');
      bind(T_WSTORM, s.wstorm); if (Wt.mix > 0.001) this._video(s, Wt.storm, 'ws');
      this._texOf(s, Wt.base, T_WBASE); gl.uniform4fv(u.wbox, Wt.box); gl.uniform4fv(u.waterCh, Wt.ch);
      gl.uniform1f(u.wstorm, Wt.mix); gl.uniform1f(u.wmask, Wt.mask ? 1 : 0);
    } else { bind(T_WBASE, s.none); bind(T_WSTORM, s.none); gl.uniform1f(u.wstorm, 0); }
    gl.uniform1f(u.hasWater, wOn);
    // the stroke map: where fingers have just been
    const tm = bd.touch; bind(T_TOUCH, s.touch);
    if (tm && (s.touchOf !== tm || s.touchGen !== tm.gen)) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, tm.w, tm.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, tm.data); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      s.touchOf = tm; s.touchGen = tm.gen;
    }
    gl.uniform4fv(u.fit, bd.fit); gl.uniform4fv(u.gains, bd.gains || [1, 1, 1, 1]); gl.uniform2fv(u.size, bd.size);
    gl.uniform1f(u.nightA_k, nA); gl.uniform1f(u.nightB_k, nB); gl.uniform1f(u.hasB, B ? 1 : 0);
    const w = bd.wash; gl.uniform4f(u.wash, w ? w.x : 0, w ? w.y : 0, w ? w.r : 0, 0); gl.uniform1f(u.washSeed, w ? w.seed : 0); gl.uniform1f(u.washFade, w ? w.fade : 0);
    gl.uniform1f(u.level, bd.level || 0); gl.uniform1f(u.time, bd.time || 0); gl.uniform1f(u.phase, bd.phase || 0);
    gl.uniform1f(u.mode, mode); gl.uniform1f(u.touchGain, tm ? bd.touchGain ?? 0.95 : 0);
    this.stats.motion = mode; this.stats.water = wOn ? (s.wSoft ? 'soft' : 'gpu') : false;   // soft: the video goes through a canvas (slow)
  },

  // a new frame of a video into the texture bound on the active unit (k: a key for the per-video state); the GPU's
  // video path, or a canvas in memory when the GPU refuses it (slow; stats.water says 'soft')
  _video(s, v, k) {
    // a new frame: counted by the player where the browser tells (painted.js: requestVideoFrameCallback), else the time
    // moved. A playing video that reported no frame for 50 ms is read anyway: a copy that just started (the water's
    // handover) reports its first frames only once something reads it (tablet: 255 ms and two frames lost without this)
    const gl = s.gl, tag = v.qgFrames ?? v.currentTime, now = performance.now();
    const same = s[k + 'Of'] === v && s[k + 'T'] === tag;
    if (same && (v.qgFrames === undefined || v.paused || now - (s[k + 'At'] || 0) < 50 || s[k + 'CT'] === v.currentTime)) return;
    s[k + 'Of'] = v; s[k + 'T'] = tag; s[k + 'At'] = now; s[k + 'CT'] = v.currentTime;
    if (!s[k + 'Soft']) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); if (gl.getError() !== gl.NO_ERROR) s[k + 'Soft'] = true; }
    if (s[k + 'Soft']) {
      const c = s[k + 'C'] || (s[k + 'C'] = document.createElement('canvas')); if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
      c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
    }
  },

  _draw2D(g, scene, gp, W, H, inPlace, lightCanvas, bd) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (!inPlace) { if (bd) g.clearRect(0, 0, W, H); g.drawImage(scene, 0, 0, W, H); }
    // a place left its paintings to a backdrop pass that is not there (WebGL just failed): lay them under the scene, still
    if (bd && bd.fallback) { g.globalCompositeOperation = 'destination-over'; bd.fallback(g, W, H); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; }
    // paper tooth
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = gp.paper * 0.6;
    g.fillStyle = pattern(g, paperTile(512, 7), 1.1 * Math.max(1, Math.min(3, W / 1280))); g.fillRect(0, 0, W, H);
    // grading glaze (multiply) and lift (screen)
    g.globalAlpha = 1; g.globalCompositeOperation = 'multiply'; g.fillStyle = css(gp.mul); g.fillRect(0, 0, W, H);
    const addMax = Math.max(gp.add[0], gp.add[1], gp.add[2]);
    if (addMax > 0.001) { g.globalCompositeOperation = 'screen'; g.fillStyle = css(gp.add.map((x) => Math.min(1, x * 1.6))); g.fillRect(0, 0, W, H); }
    if (gp.sat < 0.999) { g.globalCompositeOperation = 'saturation'; g.globalAlpha = 1 - gp.sat; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); }
    if (gp.fogAmt > 0.001) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = gp.fogAmt; g.fillStyle = css(gp.fog); g.fillRect(0, 0, W, H); }
    // vignette
    g.globalAlpha = 1; g.globalCompositeOperation = 'multiply';
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(255,255,255,1)'); vg.addColorStop(1, `rgba(${255 - gp.vignette * 180 | 0},${255 - gp.vignette * 170 | 0},${255 - gp.vignette * 140 | 0},1)`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (lightCanvas) { g.globalCompositeOperation = 'screen'; g.drawImage(lightCanvas, 0, 0, W, H); }
    g.restore();
  },
};
