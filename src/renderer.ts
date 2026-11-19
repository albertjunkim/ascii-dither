/**
 * Framework-free WebGL renderer for the ASCII / Bayer-dither field.
 *
 *   const renderer = mountAsciiDither(canvas, () => options)
 *   renderer.invalidate()  // options changed while paused
 *   renderer.destroy()
 *
 * `read` is called on every tick, so return the newest options from it.
 * The ink colour is the canvas's CSS `color`.
 */

const PATTERNS = [
  "flow",
  "waves",
  "ripple",
  "rain",
  "plasma",
  "vortex",
  "tunnel",
  "contours",
  "cells",
  "stars",
  "warp",
  "grid",
  "moire",
  "aurora",
  "fire",
  "blobs",
] as const

type AsciiDitherPattern = (typeof PATTERNS)[number]

type AsciiDitherRenderOptions = {
  /** The shape of the motion. Default "flow". */
  pattern?: AsciiDitherPattern
  /** "ascii" draws glyphs, "dots" draws square Bayer dots. Default "ascii". */
  mode?: "ascii" | "dots"
  /** Glyph ramp from emptiest to densest. Start with a space. */
  chars?: string
  /** Glyph height in CSS px (dots use half of it). Default 12. */
  cellSize?: number
  /** Animation speed multiplier. Default 1. */
  speed?: number
  /** 0 to 10. Higher leaves more empty space and harder edges. Default 5. */
  contrast?: number
  /** -1 to 1. Lifts or lowers the whole field before contrast. Default 0. */
  brightness?: number
  /** Size of the features. 2 is twice as large. Default 1. */
  scale?: number
  /** 0 to 1. How much the Bayer pattern breaks up the tone bands. Default 1. */
  dither?: number
  /** Flip brightness, like dark ink on a light page. */
  invert?: boolean
  /** A second ink colour the densest glyphs blend toward. Any CSS colour a canvas can parse. */
  accent?: string
  /** 0 to 1. Thins the field toward the edges. Default 0. */
  vignette?: number
  /** Frames per second. Low values give the stepped retro feel. Default 24. */
  fps?: number
  /** Image or video URL used as the brightness source in place of `pattern`. */
  src?: string
  /** Force the media type; otherwise read from the file extension. */
  srcType?: "image" | "video"
  /** With `src`: how much the flow field stirs the picture, 0 to 1. Default 0.25. */
  flow?: number
  /** With `src`: "source" tints each cell from the picture. Default "mono". */
  colorMode?: "mono" | "source"
  /** Brighten the field around the pointer. Default true. */
  interactive?: boolean
  /** Pointer glow radius in CSS px. Default 90. */
  pointerRadius?: number
  /** Freeze the animation. */
  paused?: boolean
  /** Font stack for the glyphs. Monospace recommended. */
  fontFamily?: string
  /** Cap on devicePixelRatio. Default 2. */
  maxDpr?: number
  /** Hears `src` start loading, become drawable, or fail, like a file without CORS headers. */
  onSourceStatus?: (status: AsciiDitherSourceStatus) => void
}

type AsciiDitherSourceStatus = "loading" | "ready" | "error"

type AsciiDitherRenderer = {
  /** Draws once more on the next tick, for a change made while nothing animates. */
  invalidate: () => void
  destroy: () => void
}

const DEFAULT_CHARS = " .:-=+*#%@"
const DEFAULT_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
const MAX_GLYPHS = 64
const PATTERN_INDEX = Object.fromEntries(
  PATTERNS.map((pattern, index) => [pattern, index])
) as Record<AsciiDitherPattern, number>

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform vec2 uCell;
uniform float uDpr;
uniform float uTime;
uniform float uScale;
uniform float uContrast;
uniform float uBrightness;
uniform float uDither;
uniform float uFlow;
uniform float uCount;
uniform float uMode;
uniform float uPattern;
uniform float uHasSrc;
uniform float uSrcColor;
uniform float uInvert;
uniform float uVignette;
uniform float uRadius;
uniform vec3 uPointer;
uniform vec4 uColor;
uniform vec4 uAccent;
uniform sampler2D uAtlas;
uniform sampler2D uSrc;

const float TAU = 6.2831853;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return s / 0.875;
}

// Domain-warped noise: the warp is what makes it look liquid.
float flowField(vec2 p, float t) {
  vec2 w = vec2(
    fbm(p + vec2(t * 0.16, -t * 0.11)),
    fbm(p + vec2(5.2 - t * 0.13, 1.3 + t * 0.14))
  );
  return fbm(p + 2.2 * w + vec2(t * 0.04, -t * 0.03));
}

float wavesField(vec2 p, float t) {
  float bend = fbm(p * 0.6 + vec2(t * 0.05, 0.0)) * 3.0;
  float a = sin(p.y * 5.0 + bend * 2.0 + t * 0.9);
  float b = sin(p.y * 2.3 - p.x * 1.1 + bend + t * 0.5);
  return 0.5 + 0.25 * a + 0.25 * b;
}

float rippleField(vec2 p, vec2 center, float t) {
  float r = length(p - center);
  float w = sin(r * 7.0 - t * 1.6 + fbm(p + t * 0.05) * 2.0);
  return (0.5 + 0.5 * w) * (0.35 + 0.65 * exp(-r * 0.35));
}

// Streaks falling down each column, brightest at the head.
float rainField(vec2 cell, float y, float t) {
  float h1 = hash(vec2(cell.x, 1.0));
  float h2 = hash(vec2(cell.x, 7.0));
  float len = 260.0 * uScale * (0.6 + 0.8 * h2);
  float s = fract(y / len - t * (0.25 + 0.45 * h1) + h2 * 10.0);
  return pow(s, 3.0) * (0.55 + 0.45 * hash(vec2(cell.x, 3.0)));
}

float plasmaField(vec2 p, float t) {
  float v = sin(p.x * 3.0 + t);
  v += sin((p.y * 3.0 + t) * 0.7);
  v += sin((p.x + p.y) * 2.0 + t * 0.6);
  vec2 c = p + vec2(sin(t * 0.33), cos(t * 0.5)) * 1.5;
  v += sin(length(c) * 3.0 + t);
  return 0.5 + 0.125 * v;
}

// Spiral arms turning around the centre.
float vortexField(vec2 p, vec2 center, float t) {
  vec2 d = p - center;
  float r = length(d);
  float a = atan(d.y, d.x);
  float arms = sin(a * 3.0 + log(r + 0.05) * 4.0 - t * 1.2 + fbm(p * 0.8) * 1.5);
  return (0.5 + 0.5 * arms) * smoothstep(0.0, 0.5, r);
}

// A wire tube, flown through: rings rushing outward along fixed spokes.
float tunnelField(vec2 p, vec2 center, float t) {
  vec2 d = p - center;
  float r = length(d) + 0.0001;
  float ring = abs(fract(2.2 / r + t * 0.45) - 0.5) * 2.0;
  float spoke = abs(fract(atan(d.y, d.x) / TAU * 14.0) - 0.5) * 2.0;
  float wire = max(
    1.0 - smoothstep(0.0, 0.45, ring),
    1.0 - smoothstep(0.0, 0.22, spoke)
  );
  return wire * smoothstep(0.08, 1.1, r);
}

// Lines of equal height over slow terrain, like a map.
float contoursField(vec2 p, float t) {
  float n = vnoise(p * 0.55 + vec2(t * 0.03, 0.0)) * 0.7;
  n += vnoise(p * 1.1 + vec2(5.0, -t * 0.02)) * 0.3;
  float line = abs(fract(n * 14.0) - 0.5) * 2.0;
  return 1.0 - smoothstep(0.0, 0.36, line);
}

// Worley cells whose points drift: dark seams, bright insides.
float cellsField(vec2 p, float t) {
  p *= 1.6;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(i + g), hash(i + g + 17.17));
      o = 0.5 + 0.45 * sin(t * 0.6 + TAU * o);
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return smoothstep(0.0, 0.28, d2 - d1);
}

// Twinkling points over a faint nebula.
float starsField(vec2 cell, vec2 p, float t) {
  float h = hash(cell + 0.5);
  float star = smoothstep(0.9, 1.0, h);
  float twinkle = 0.5 + 0.5 * sin(t * (1.0 + 4.0 * hash(cell + 7.3)) + h * 40.0);
  float nebula = flowField(p * 0.5, t * 0.3);
  return max(star * (0.35 + 0.65 * twinkle), nebula * nebula * 0.9);
}

// Streaks flying out from the centre, two to a lane.
float warpField(vec2 p, vec2 center, float t) {
  vec2 d = p - center;
  float r = length(d);
  float lane = floor((atan(d.y, d.x) / TAU + 0.5) * 96.0);
  float reach = length(center) + 0.5;
  float v = 0.0;
  for (int i = 0; i < 2; i++) {
    float n = float(i) * 13.0;
    float z = fract(
      hash(vec2(lane, 3.0 + n)) + t * (0.1 + 0.3 * hash(vec2(lane, 9.0 + n)))
    );
    float head = z * z * reach;
    float tail = 0.08 + z * 0.9;
    float streak = (1.0 - smoothstep(0.0, tail, head - r)) * step(r, head);
    v = max(v, streak * sqrt(z));
  }
  return v;
}

// A floor of lines running to the horizon under a banded sun.
float gridField(vec2 uv, float aspect, float t) {
  float y = uv.y - 0.52;
  float x = (uv.x - 0.5) * aspect;
  if (y < 0.0) {
    float d = length(vec2(x, y + 0.02));
    float sun = 1.0 - smoothstep(0.26, 0.27, d);
    float band = step(0.35, fract(-y * 22.0 + t * 0.15));
    float gaps = mix(1.0, band, smoothstep(-0.2, -0.02, y));
    float glow = 0.18 * exp(-max(d - 0.27, 0.0) * 6.0);
    return max(sun * gaps * (0.6 + 0.4 * (-y / 0.27)), glow);
  }
  float z = 0.12 / (y + 0.012);
  float gx = abs(fract(x * z * 14.0 + 0.5) - 0.5);
  float gz = abs(fract(z * 3.5 + t * 0.6 + 0.5) - 0.5);
  // Widths follow the perspective, so a line never gets thinner than a cell,
  // and lines fade out where they would start to merge.
  float cell = 0.7 * uCell.y / uRes.y;
  float wx = min(14.0 * z * cell, 0.5);
  float wz = min(0.42 / ((y + 0.012) * (y + 0.012)) * cell, 0.5);
  float across = (1.0 - smoothstep(wx * 0.6, wx, gx)) * (1.0 - smoothstep(0.2, 0.45, wx));
  float along = (1.0 - smoothstep(wz * 0.6, wz, gz)) * (1.0 - smoothstep(0.2, 0.45, wz));
  return max(max(across, along), 1.0 - smoothstep(0.0, cell * 1.5, y));
}

// Two sets of rings sliding over each other.
float moireField(vec2 p, vec2 center, float t) {
  vec2 a = center + vec2(sin(t * 0.3), cos(t * 0.23)) * 1.2;
  vec2 b = center + vec2(cos(t * 0.19), sin(t * 0.31)) * 1.2;
  return 0.5 + 0.5 * sin(length(p - a) * 9.0) * sin(length(p - b) * 9.0);
}

// Curtains of light hanging from the top.
float auroraField(vec2 p, float y, float t) {
  float x = p.x * 1.2 + fbm(vec2(p.x * 0.5, t * 0.1)) * 2.0;
  float band = 0.5 + 0.5 * sin(x * 5.0 + t * 0.4 + fbm(vec2(x, t * 0.2)) * 3.0);
  float rays = 0.55 + 0.45 * vnoise(vec2(x * 9.0, p.y * 0.6 - t * 0.3));
  // Brighter bands hang lower.
  float hang = 1.0 - smoothstep(0.2 + 0.55 * band, 1.0, y);
  return pow(band, 1.5) * rays * hang;
}

// Noise rising from the bottom edge.
float fireField(vec2 p, float y, float t) {
  float heat = fbm(vec2(p.x * 2.2, p.y * 1.4 + t * 1.5)) * 0.6;
  heat += fbm(vec2(p.x * 4.4 + 4.0, p.y * 2.8 + t * 2.6)) * 0.4;
  return clamp(heat * 1.5 - (1.0 - y) * 1.25 + 0.1, 0.0, 1.0);
}

// Soft blobs that merge where they meet.
float blobsField(vec2 p, vec2 center, float t) {
  float v = 0.0;
  for (int i = 0; i < 6; i++) {
    float n = float(i);
    vec2 o = center + vec2(
      sin(t * (0.21 + 0.05 * n) + n * 2.4) * center.x * 0.8,
      cos(t * (0.17 + 0.04 * n) + n * 1.7) * center.y * 0.8
    );
    float d = length(p - o);
    v += 0.11 / (d * d + 0.05);
  }
  return clamp(v * 0.35, 0.0, 1.0);
}

// 4x4 ordered-dither threshold without a lookup table.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(p / uCell);
  vec2 local = fract(p / uCell);
  vec2 c = (cell + 0.5) * uCell;
  vec2 uv = c / uRes;

  float unit = 0.0075 / uScale;
  vec2 q = c / uDpr * unit;
  vec2 center = 0.5 * uRes / uDpr * unit;
  float v;
  vec3 picture = vec3(0.0);

  if (uHasSrc > 0.5) {
    float n = flowField(q, uTime);
    float n2 = fbm(q * 1.7 + vec2(3.1 - uTime * 0.1, 8.4 + uTime * 0.07));
    vec2 at = uv + (vec2(n, n2) - 0.5) * uFlow * 0.06;
    vec3 rgb = texture2D(uSrc, clamp(at, 0.0, 1.0)).rgb;
    v = dot(rgb, vec3(0.299, 0.587, 0.114)) + (n - 0.5) * uFlow * 0.5;
    picture = rgb / max(max(rgb.r, max(rgb.g, rgb.b)), 0.2);
  } else if (uPattern < 0.5) {
    v = flowField(q, uTime);
  } else if (uPattern < 1.5) {
    v = wavesField(q, uTime);
  } else if (uPattern < 2.5) {
    v = rippleField(q, center, uTime);
  } else if (uPattern < 3.5) {
    v = rainField(cell, c.y / uDpr, uTime);
  } else if (uPattern < 4.5) {
    v = plasmaField(q, uTime);
  } else if (uPattern < 5.5) {
    v = vortexField(q, center, uTime);
  } else if (uPattern < 6.5) {
    v = tunnelField(q, center, uTime);
  } else if (uPattern < 7.5) {
    v = contoursField(q, uTime);
  } else if (uPattern < 8.5) {
    v = cellsField(q, uTime);
  } else if (uPattern < 9.5) {
    v = starsField(cell, q, uTime);
  } else if (uPattern < 10.5) {
    v = warpField(q, center, uTime);
  } else if (uPattern < 11.5) {
    v = gridField(uv, uRes.x / uRes.y, uTime);
  } else if (uPattern < 12.5) {
    v = moireField(q, center, uTime);
  } else if (uPattern < 13.5) {
    v = auroraField(q, uv.y, uTime);
  } else if (uPattern < 14.5) {
    v = fireField(q, uv.y, uTime);
  } else {
    v = blobsField(q, center, uTime);
  }

  v = clamp(v + uBrightness * 0.5, 0.0, 1.0);
  if (uInvert > 0.5) v = 1.0 - v;
  v *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(uv - 0.5) * 1.3);

  float d = distance(c, uPointer.xy);
  v += 0.4 * uPointer.z * exp(-d * d / (uRadius * uRadius));

  float lo = 0.5 - 0.5 / (1.0 + uContrast * 0.45);
  v = smoothstep(lo, 1.0 - lo, v);

  float th = mix(0.5, bayer4(cell) + 0.03125, uDither);
  float a;
  float tone;
  if (uMode < 0.5) {
    float levels = uCount - 1.0;
    float idx = clamp(floor(v * levels + th), 0.0, levels);
    float glyph = texture2D(uAtlas, vec2((idx + local.x) / uCount, local.y)).a;
    tone = idx / levels;
    a = glyph * (0.3 + 0.7 * tone);
  } else {
    vec2 gap = step(vec2(1.0) / uCell, local);
    tone = v;
    a = step(th, v) * gap.x * gap.y;
  }

  vec4 mono = mix(uColor, uAccent, smoothstep(0.3, 1.0, tone));
  vec3 ink = mix(mono.rgb, picture, uSrcColor);
  a *= mono.a;
  gl_FragColor = vec4(ink * a, a);
}
`

const UNIFORMS = [
  "uRes",
  "uCell",
  "uDpr",
  "uTime",
  "uScale",
  "uContrast",
  "uBrightness",
  "uDither",
  "uFlow",
  "uCount",
  "uMode",
  "uPattern",
  "uHasSrc",
  "uSrcColor",
  "uInvert",
  "uVignette",
  "uRadius",
  "uPointer",
  "uColor",
  "uAccent",
  "uAtlas",
  "uSrc",
] as const

type UniformName = (typeof UNIFORMS)[number]

type Media = {
  key: string
  el: HTMLImageElement | HTMLVideoElement
  video: boolean
  ready: boolean
  dirty: boolean
  dispose: () => void
}

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value))

const noop = () => {}

const NOOP_RENDERER: AsciiDitherRenderer = { invalidate: noop, destroy: noop }

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("ascii-dither: could not create a shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`ascii-dither: shader failed to compile: ${log}`)
  }
  return shader
}

function makeTexture(gl: WebGLRenderingContext, filter: number) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(4)
  )
  return texture
}

function loadMedia(
  src: string,
  srcType: "image" | "video" | undefined,
  onStatus: (status: AsciiDitherSourceStatus) => void
): Media {
  const video =
    (srcType ??
      (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(src) ? "video" : "image")) ===
    "video"
  const key = `${srcType ?? ""}|${src}`

  if (video) {
    const el = document.createElement("video")
    const media: Media = {
      key,
      el,
      video: true,
      ready: false,
      dirty: true,
      dispose: () => {
        el.removeEventListener("loadeddata", ready)
        el.removeEventListener("error", failed)
        el.pause()
        el.removeAttribute("src")
        el.load()
      },
    }
    const ready = () => {
      media.ready = true
      onStatus("ready")
    }
    const failed = () => onStatus("error")
    el.crossOrigin = "anonymous"
    el.muted = true
    el.loop = true
    el.playsInline = true
    el.preload = "auto"
    el.addEventListener("loadeddata", ready)
    el.addEventListener("error", failed)
    el.src = src
    return media
  }

  const el = new Image()
  const media: Media = {
    key,
    el,
    video: false,
    ready: false,
    dirty: true,
    dispose: () => {
      el.onload = null
      el.onerror = null
    },
  }
  el.crossOrigin = "anonymous"
  el.decoding = "async"
  el.onload = () => {
    media.ready = true
    media.dirty = true
    onStatus("ready")
  }
  el.onerror = () => onStatus("error")
  el.src = src
  return media
}

function mountAsciiDither(
  canvas: HTMLCanvasElement,
  read: () => AsciiDitherRenderOptions
): AsciiDitherRenderer {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    powerPreference: "low-power",
  })
  if (!gl) return NOOP_RENDERER

  const atlas = document.createElement("canvas")
  const atlasCtx = atlas.getContext("2d")
  const scratch = document.createElement("canvas")
  const scratchCtx = scratch.getContext("2d")
  const probe = document.createElement("canvas")
  probe.width = probe.height = 1
  const probeCtx = probe.getContext("2d", { willReadFrequently: true })

  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let atlasTex: WebGLTexture | null = null
  let srcTex: WebGLTexture | null = null
  const u = {} as Record<UniformName, WebGLUniformLocation | null>

  const init = () => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const next = gl.createProgram()
    if (!next) throw new Error("ascii-dither: could not create a program")
    gl.attachShader(next, vs)
    gl.attachShader(next, fs)
    gl.bindAttribLocation(next, 0, "aPos")
    gl.linkProgram(next)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
      throw new Error(
        `ascii-dither: program failed to link: ${gl.getProgramInfoLog(next)}`
      )
    }
    program = next
    for (const name of UNIFORMS) u[name] = gl.getUniformLocation(next, name)

    // One oversized triangle covers the viewport.
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    atlasTex = makeTexture(gl, gl.NEAREST)
    gl.activeTexture(gl.TEXTURE1)
    srcTex = makeTexture(gl, gl.LINEAR)

    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
  }

  try {
    init()
  } catch (error) {
    console.error(error)
    return NOOP_RENDERER
  }

  let raf = 0
  let lost = false
  let visible = true
  let dirty = true
  let disposed = false
  let time = 0
  let last = 0
  let lastColorCheck = -1e9
  let colorCss = ""
  let rgba: [number, number, number, number] = [1, 1, 1, 1]
  let accentCss: string | undefined
  let accent: [number, number, number, number] | null = null
  let cssW = canvas.clientWidth
  let cssH = canvas.clientHeight
  let sizeDirty = true
  let lastDpr = 0
  let atlasKey = ""
  let glyphCount = 2
  let cellW = 8
  let cellH = 12
  let media: Media | null = null
  let srcKey = ""
  let srcMedia: Media | null = null
  let warned = false
  const pointer = { cx: 0, cy: 0, x: -1e5, y: -1e5, moved: false, strength: 0 }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")

  const toRgba = (css: string): [number, number, number, number] => {
    if (!probeCtx) return [1, 1, 1, 1]
    probeCtx.clearRect(0, 0, 1, 1)
    probeCtx.fillStyle = "#fff"
    probeCtx.fillStyle = css
    probeCtx.fillRect(0, 0, 1, 1)
    const [r = 255, g = 255, b = 255, a = 255] = probeCtx.getImageData(
      0,
      0,
      1,
      1
    ).data
    return [r / 255, g / 255, b / 255, a / 255]
  }

  const buildAtlas = (
    mode: "ascii" | "dots",
    chars: string,
    cellSize: number,
    font: string,
    dpr: number
  ) => {
    if (mode === "dots" || !atlasCtx) {
      cellW = cellH = Math.max(3, Math.round(cellSize * 0.5 * dpr))
      glyphCount = 2
      return
    }
    let glyphs = Array.from(chars)
    if (glyphs.length < 2) glyphs = Array.from(DEFAULT_CHARS)
    if (glyphs.length > MAX_GLYPHS) glyphs = glyphs.slice(0, MAX_GLYPHS)

    cellH = Math.max(4, Math.round(cellSize * dpr))
    atlasCtx.font = `${cellH}px ${font}`
    const advance = atlasCtx.measureText("M").width || cellH * 0.6
    cellW = Math.max(2, Math.round(clamp(advance, cellH * 0.4, cellH)))

    atlas.width = cellW * glyphs.length
    atlas.height = cellH
    atlasCtx.clearRect(0, 0, atlas.width, atlas.height)
    atlasCtx.font = `${cellH}px ${font}`
    atlasCtx.fillStyle = "#fff"
    atlasCtx.textAlign = "center"
    atlasCtx.textBaseline = "middle"
    glyphs.forEach((glyph, index) => {
      atlasCtx.save()
      atlasCtx.beginPath()
      atlasCtx.rect(index * cellW, 0, cellW, cellH)
      atlasCtx.clip()
      atlasCtx.fillText(glyph, index * cellW + cellW / 2, cellH / 2)
      atlasCtx.restore()
    })

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, atlasTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    glyphCount = glyphs.length
  }

  // Draws the source cover-fitted into a small canvas, about 2 samples per
  // cell, so each cell reads an averaged brightness instead of one pixel.
  const uploadSource = (source: Media): boolean => {
    if (!scratchCtx) return false
    const el = source.el
    const iw = source.video
      ? (el as HTMLVideoElement).videoWidth
      : (el as HTMLImageElement).naturalWidth
    const ih = source.video
      ? (el as HTMLVideoElement).videoHeight
      : (el as HTMLImageElement).naturalHeight
    if (!iw || !ih) return false

    const sw = clamp(Math.ceil(canvas.width / cellW) * 2, 2, 1024)
    const sh = clamp(Math.ceil(canvas.height / cellH) * 2, 2, 1024)
    const key = `${sw}x${sh}`
    const stale =
      source.video || source.dirty || key !== srcKey || srcMedia !== source
    if (!stale) return true

    if (scratch.width !== sw) scratch.width = sw
    if (scratch.height !== sh) scratch.height = sh
    const ra = canvas.width / canvas.height
    const ia = iw / ih
    let sx = 0
    let sy = 0
    let sWidth = iw
    let sHeight = ih
    if (ia > ra) {
      sWidth = ih * ra
      sx = (iw - sWidth) / 2
    } else {
      sHeight = iw / ra
      sy = (ih - sHeight) / 2
    }
    try {
      scratchCtx.imageSmoothingQuality = "high"
      scratchCtx.drawImage(el, sx, sy, sWidth, sHeight, 0, 0, sw, sh)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, srcTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch)
    } catch (error) {
      // Usually a cross-origin file served without CORS headers.
      if (!warned) {
        warned = true
        console.warn("ascii-dither: could not read `src`", error)
      }
      source.ready = false
      read().onSourceStatus?.("error")
      return false
    }
    srcKey = key
    srcMedia = source
    source.dirty = false
    return true
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (lost || !program) return

    const p = read()

    const wanted = p.src ? `${p.srcType ?? ""}|${p.src}` : ""
    if (wanted !== (media?.key ?? "")) {
      media?.dispose()
      media = p.src
        ? loadMedia(p.src, p.srcType, (status) => {
            dirty = true
            read().onSourceStatus?.(status)
          })
        : null
      if (media) p.onSourceStatus?.("loading")
      dirty = true
    }

    const video = media && media.video ? (media.el as HTMLVideoElement) : null
    const animate = !p.paused && !reduced.matches

    if (video) {
      const shouldPlay = animate && visible
      if (shouldPlay && video.paused) video.play().catch(noop)
      else if (!shouldPlay && !video.paused) video.pause()
    }
    if (!visible) return

    const elapsed = now - last
    if (elapsed < 1000 / clamp(p.fps ?? 24, 1, 120) - 1) return
    last = now
    const dt = Math.min(elapsed, 100)

    if (now - lastColorCheck > 400) {
      lastColorCheck = now
      const css = getComputedStyle(canvas).color
      if (css !== colorCss) {
        colorCss = css
        rgba = toRgba(css)
        dirty = true
      }
    }

    if (p.accent !== accentCss) {
      accentCss = p.accent
      accent = p.accent ? toRgba(p.accent) : null
      dirty = true
    }

    const dpr = Math.min(window.devicePixelRatio || 1, p.maxDpr ?? 2)
    const interactive = p.interactive ?? true
    if (pointer.moved) {
      pointer.moved = false
      if (interactive) {
        const r = canvas.getBoundingClientRect()
        if (
          r.width > 0 &&
          pointer.cx >= r.left &&
          pointer.cx <= r.right &&
          pointer.cy >= r.top &&
          pointer.cy <= r.bottom
        ) {
          pointer.x = ((pointer.cx - r.left) / r.width) * canvas.width
          pointer.y = ((pointer.cy - r.top) / r.height) * canvas.height
          pointer.strength = 1
        }
      }
    }
    if (!interactive) pointer.strength = 0

    const videoLive = !!video && !!media && media.ready && !video.paused
    const idle =
      !animate &&
      !videoLive &&
      !dirty &&
      !sizeDirty &&
      dpr === lastDpr &&
      pointer.strength < 0.004
    if (idle) return

    if (animate) time += (dt / 1000) * (p.speed ?? 1)
    pointer.strength *= Math.exp(-dt / 700)

    if (sizeDirty || dpr !== lastDpr) {
      const w = Math.max(1, Math.round(cssW * dpr))
      const h = Math.max(1, Math.round(cssH * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      gl.viewport(0, 0, w, h)
      sizeDirty = false
      lastDpr = dpr
    }

    const mode = p.mode ?? "ascii"
    const chars = p.chars ?? DEFAULT_CHARS
    const font = p.fontFamily ?? DEFAULT_FONT
    const cellSize = clamp(p.cellSize ?? 12, 4, 48)
    const key = [mode, chars, cellSize, font, dpr].join("\u0000")
    if (key !== atlasKey) {
      atlasKey = key
      buildAtlas(mode, chars, cellSize, font, dpr)
    }

    const hasSrc = !!media && media.ready && uploadSource(media)

    gl.useProgram(program)
    gl.uniform2f(u.uRes, canvas.width, canvas.height)
    gl.uniform2f(u.uCell, cellW, cellH)
    gl.uniform1f(u.uDpr, dpr)
    gl.uniform1f(u.uTime, time)
    gl.uniform1f(u.uScale, clamp(p.scale ?? 1, 0.05, 20))
    gl.uniform1f(u.uContrast, clamp(p.contrast ?? 5, 0, 10))
    gl.uniform1f(u.uBrightness, clamp(p.brightness ?? 0, -1, 1))
    gl.uniform1f(u.uDither, clamp(p.dither ?? 1, 0, 1))
    gl.uniform1f(u.uFlow, clamp(p.flow ?? 0.25, 0, 1))
    gl.uniform1f(u.uCount, glyphCount)
    gl.uniform1f(u.uMode, mode === "dots" ? 1 : 0)
    gl.uniform1f(u.uPattern, PATTERN_INDEX[p.pattern ?? "flow"] ?? 0)
    gl.uniform1f(u.uHasSrc, hasSrc ? 1 : 0)
    gl.uniform1f(u.uSrcColor, hasSrc && p.colorMode === "source" ? 1 : 0)
    gl.uniform1f(u.uInvert, p.invert ? 1 : 0)
    gl.uniform1f(u.uVignette, clamp(p.vignette ?? 0, 0, 1))
    gl.uniform1f(u.uRadius, Math.max(1, (p.pointerRadius ?? 90) * dpr))
    gl.uniform3f(u.uPointer, pointer.x, pointer.y, pointer.strength)
    gl.uniform4f(u.uColor, rgba[0], rgba[1], rgba[2], rgba[3])
    const tip = accent ?? rgba
    gl.uniform4f(u.uAccent, tip[0], tip[1], tip[2], tip[3])
    gl.uniform1i(u.uAtlas, 0)
    gl.uniform1i(u.uSrc, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    dirty = false
  }

  const onPointer = (event: PointerEvent) => {
    pointer.cx = event.clientX
    pointer.cy = event.clientY
    pointer.moved = true
  }
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
  }
  const onRestored = () => {
    try {
      init()
    } catch (error) {
      console.error(error)
      return
    }
    atlasKey = ""
    srcKey = ""
    srcMedia = null
    sizeDirty = true
    lost = false
  }

  const resizeObserver = new ResizeObserver(() => {
    cssW = canvas.clientWidth
    cssH = canvas.clientHeight
    sizeDirty = true
  })
  resizeObserver.observe(canvas)

  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true
  })
  intersectionObserver.observe(canvas)

  // The glyph atlas is drawn with a fallback until web fonts have loaded.
  document.fonts?.ready.then(() => {
    if (disposed) return
    atlasKey = ""
    dirty = true
  }, noop)

  window.addEventListener("pointermove", onPointer, { passive: true })
  window.addEventListener("pointerdown", onPointer, { passive: true })
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", onRestored)
  raf = requestAnimationFrame(frame)

  return {
    invalidate: () => {
      dirty = true
      // The colour may have changed with the options; don't wait for the poll.
      lastColorCheck = -1e9
    },
    destroy: () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("pointerdown", onPointer)
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      media?.dispose()
      media = null
      gl.deleteTexture(atlasTex)
      gl.deleteTexture(srcTex)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}

export {
  mountAsciiDither,
  PATTERNS,
  type AsciiDitherPattern,
  type AsciiDitherRenderOptions,
  type AsciiDitherRenderer,
  type AsciiDitherSourceStatus,
}
