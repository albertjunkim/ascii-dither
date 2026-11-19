/**
 * The ascii-dither primitive for UI SDK: an animated ASCII / Bayer-dither
 * backdrop whose whole look is one `value`, with an optional picture behind
 * it, so a person, the app or an agent can restyle it while it runs.
 *
 * Render it with `createParts` from your framework's adapter; see `react.tsx`.
 */

import {
  createChange,
  css,
  definePrimitive,
  type ChangeDetails,
} from "@ui-sdk/core"
import { backgroundLabel, backgrounds } from "./backgrounds"
import { imageBackgrounds } from "./image-backgrounds"
import {
  mountAsciiDither,
  PATTERNS,
  type AsciiDitherPattern,
  type AsciiDitherRenderOptions,
  type AsciiDitherRenderer,
  type AsciiDitherSourceStatus,
} from "./renderer"

type AsciiDitherStyle = {
  /** The motion, like liquid noise ("flow"), falling streaks ("rain") or a spiral ("vortex"). */
  pattern: AsciiDitherPattern
  /** Glyphs, or square Bayer dots. */
  mode: "ascii" | "dots"
  /** Glyph ramp from emptiest to densest, starting with a space. */
  chars: string
  /** Ink colour: hex, rgb(), hsl() or a named colour. */
  color: string
  /** A second ink colour the densest glyphs blend toward, or null for one colour. */
  accent: string | null
  /** Colour behind the ink. */
  background: string
  /** With an image: "source" tints each cell from the picture, "mono" uses `color`. */
  colorMode: "mono" | "source"
  /** Glyph height in px, 6 to 32. */
  cellSize: number
  /** 0 to 3. */
  speed: number
  /** 0 to 10. Higher leaves more empty space. */
  contrast: number
  /** -1 to 1. Lifts or lowers the whole field, like exposure on a photo. */
  brightness: number
  /** 0.3 to 4. Size of the shapes. */
  scale: number
  /** 0 to 1. How much the Bayer pattern breaks up the tone bands. */
  dither: number
  /** With an image: how much the motion stirs the picture, 0 to 1. */
  flow: number
  /** 0 to 1. Thins the field toward the edges. */
  vignette: number
  /** 6 to 60. Low values look stepped and retro. */
  fps: number
  /** Flips brightness, like dark ink on a light page. */
  invert: boolean
}

type AsciiDitherImageStatus = "none" | AsciiDitherSourceStatus

type AsciiDitherOptions = {
  value?: Partial<AsciiDitherStyle>
  defaultValue?: Partial<AsciiDitherStyle>
  onValueChange?: (
    value: AsciiDitherStyle,
    details: ChangeDetails<"restyle" | "tweak" | "preset">
  ) => void
  /**
   * The picture or video to filter in place of `pattern`: a name from
   * `images`, or a URL. The app may pass any URL here.
   */
  image?: string | null
  defaultImage?: string
  onImageChange?: (
    image: string | null,
    details: ChangeDetails<"image" | "clear">
  ) => void
  /** The pictures `setImage` may pick, by name: `{ Dunes: "/dunes.jpg" }`. */
  images?: Record<string, string>
  /**
   * Whether `setImage` may load a URL that isn't in `images`. Without it,
   * only the listed ones load, so an agent can't point the page at any address.
   */
  allowImage?: (url: string) => boolean
  /** Forces the media type; otherwise it's read from the file extension. */
  imageType?: "image" | "video"
  paused?: boolean
  defaultPaused?: boolean
  onPausedChange?: (paused: boolean, details: ChangeDetails<"pause">) => void
  /** Brighten the field around the pointer. On unless set to false. */
  interactive?: boolean
  pointerRadius?: number
  fontFamily?: string
  maxDpr?: number
}

const MODES = ["ascii", "dots"] as const
const COLOR_MODES = ["mono", "source"] as const

const RANGES = {
  cellSize: [6, 32],
  speed: [0, 3],
  contrast: [0, 10],
  brightness: [-1, 1],
  scale: [0.3, 4],
  dither: [0, 1],
  flow: [0, 1],
  vignette: [0, 1],
  fps: [6, 60],
} as const

const DEFAULT_STYLE: AsciiDitherStyle = {
  pattern: "flow",
  mode: "ascii",
  chars: " .:-=+*#%@",
  color: "#7cffb2",
  accent: null,
  background: "#050807",
  colorMode: "mono",
  cellSize: 12,
  speed: 1,
  contrast: 5,
  brightness: 0,
  scale: 1,
  dither: 1,
  flow: 0.25,
  vignette: 0,
  fps: 24,
  invert: false,
}

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof AsciiDitherStyle)[]

/** What an agent needs to know to restyle the component. Add it to your model's instructions. */
const asciiDitherGuide = [
  'An "ascii-dither" component is an animated ASCII or dither backdrop. Its value is a style object:',
  `- pattern: ${PATTERNS.join(" | ")}`,
  `- mode: ${MODES.join(" | ")} (glyphs, or square Bayer dots)`,
  "- chars: the glyph ramp from emptiest to densest, 2 to 32 characters, starting with a space",
  "- color and background: hex, rgb() or hsl(). accent: a second ink colour for the densest glyphs, or null",
  `- ${Object.entries(RANGES)
    .map(([key, [min, max]]) => `${key} ${min} to ${max}`)
    .join(", ")}, invert true | false`,
  `- colorMode: ${COLOR_MODES.join(" | ")}. With an image, "source" takes each cell's colour from the picture`,
  "Actions: setValue(style) replaces the look and fills any key left out with its default.",
  "tweak(patch) changes only the keys given. applyPreset(name) takes one of the component's items,",
  `like ${Object.keys(backgrounds).slice(0, 4).map(backgroundLabel).join(", ")}; query({ within }) lists them all.`,
  "A preset built on a photo, like Dunes, shows that picture too, and any other preset removes the picture.",
  "setImage(name) filters one of the pictures in the component's `images` in place of the pattern;",
  "the style still applies to it, and `flow` sets how much it moves. clearImage() goes back to the pattern.",
  "After setImage, `imageStatus` in the next snapshot says loading, ready or error.",
  "setPaused(true | false) freezes or resumes the motion.",
].join("\n")

const COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]{3,30}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([\d\s.,%/a-z+-]+\))$/i

// http(s), blob and image data URLs, and paths on this origin.
const LOADABLE = /^(https?:\/\/|blob:|data:image\/|\/(?!\/)|\.{1,2}\/)/i

// Equal values are one object, so a change to the same look reports no change
// and `sync` can run on every render.
const interned = new Map<string, unknown>()

function intern<Value>(value: Value): Value {
  const key = JSON.stringify(value)
  if (interned.has(key)) return interned.get(key) as Value
  if (interned.size >= 64) {
    interned.delete(interned.keys().next().value as string)
  }
  const frozen = Object.freeze(value)
  interned.set(key, frozen)
  return frozen
}

function oneOf<Choice extends string>(
  key: string,
  value: unknown,
  choices: readonly Choice[]
): Choice {
  if (choices.includes(value as Choice)) return value as Choice
  throw new Error(
    `${key} ${JSON.stringify(value)} isn't one of ${choices.join(", ")}.`
  )
}

function numberIn(key: keyof typeof RANGES, value: unknown): number {
  const [min, max] = RANGES[key]
  const number = typeof value === "string" ? Number(value) : value
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new Error(`${key} takes a number from ${min} to ${max}.`)
  }
  return Math.min(max, Math.max(min, number))
}

function colorOf(key: string, value: unknown): string {
  if (typeof value === "string" && COLOR.test(value.trim())) {
    return value.trim()
  }
  throw new Error(
    `${key} takes a CSS colour as hex, rgb() or hsl(), like "#7cffb2".`
  )
}

function charsOf(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error('chars takes a string of glyphs, like " .:-=+*#%@".')
  }
  const glyphs = Array.from(value.startsWith(" ") ? value : ` ${value}`)
  const printable = glyphs.every((glyph) => (glyph.codePointAt(0) ?? 0) >= 32)
  if (glyphs.length < 2 || glyphs.length > 32 || !printable) {
    throw new Error(
      "chars takes 2 to 32 printable glyphs, from emptiest to densest."
    )
  }
  return glyphs.join("")
}

function booleanOf(key: string, value: unknown): boolean {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  throw new Error(`${key} takes true or false.`)
}

/**
 * A complete, checked style from `input` laid over `base`. Numbers are
 * clamped to their range; anything else that doesn't fit throws with what the
 * key takes, which is the message an agent's failed step reports.
 */
function normalizeStyle(
  input: unknown,
  base: AsciiDitherStyle = DEFAULT_STYLE
): AsciiDitherStyle {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      `A style is an object with any of: ${STYLE_KEYS.join(", ")}.`
    )
  }
  const patch = input as Partial<Record<keyof AsciiDitherStyle, unknown>>
  for (const key of Object.keys(patch)) {
    if (!STYLE_KEYS.includes(key as keyof AsciiDitherStyle)) {
      throw new Error(
        `A style has no "${key}". Its keys: ${STYLE_KEYS.join(", ")}.`
      )
    }
  }
  const has = (key: keyof AsciiDitherStyle) => patch[key] !== undefined
  const accentOf = (value: unknown) =>
    value === null || value === "" || value === "none"
      ? null
      : colorOf("accent", value)
  return intern({
    pattern: has("pattern")
      ? oneOf("pattern", patch.pattern, PATTERNS)
      : base.pattern,
    mode: has("mode") ? oneOf("mode", patch.mode, MODES) : base.mode,
    chars: has("chars") ? charsOf(patch.chars) : base.chars,
    color: has("color") ? colorOf("color", patch.color) : base.color,
    accent: has("accent") ? accentOf(patch.accent) : base.accent,
    background: has("background")
      ? colorOf("background", patch.background)
      : base.background,
    colorMode: has("colorMode")
      ? oneOf("colorMode", patch.colorMode, COLOR_MODES)
      : base.colorMode,
    cellSize: has("cellSize")
      ? numberIn("cellSize", patch.cellSize)
      : base.cellSize,
    speed: has("speed") ? numberIn("speed", patch.speed) : base.speed,
    contrast: has("contrast")
      ? numberIn("contrast", patch.contrast)
      : base.contrast,
    brightness: has("brightness")
      ? numberIn("brightness", patch.brightness)
      : base.brightness,
    scale: has("scale") ? numberIn("scale", patch.scale) : base.scale,
    dither: has("dither") ? numberIn("dither", patch.dither) : base.dither,
    flow: has("flow") ? numberIn("flow", patch.flow) : base.flow,
    vignette: has("vignette")
      ? numberIn("vignette", patch.vignette)
      : base.vignette,
    fps: has("fps") ? numberIn("fps", patch.fps) : base.fps,
    invert: has("invert") ? booleanOf("invert", patch.invert) : base.invert,
  })
}

const squash = (name: unknown) =>
  String(name).replace(/[\s_-]+/g, "").toLowerCase()

type Preset = {
  key: string
  style: Partial<AsciiDitherStyle>
  /** The picture an image background shows, by the name `images` lists it under. */
  image?: string
}

const presetKeys = [
  ...Object.keys(backgrounds),
  ...Object.keys(imageBackgrounds),
]

function presetNamed(name: unknown): Preset | undefined {
  const wanted = squash(name)
  const key = presetKeys.find((preset) => squash(preset) === wanted)
  if (!key) return undefined
  if (key in backgrounds) {
    return { key, style: backgrounds[key as keyof typeof backgrounds] }
  }
  return {
    key,
    style: imageBackgrounds[key as keyof typeof imageBackgrounds].style,
    image: backgroundLabel(key),
  }
}

const namesOf = (images: Record<string, string> | undefined) =>
  intern(Object.keys(images ?? {}))

const asciiDither = definePrimitive({
  name: "ascii-dither",
  options: {
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    image: "string",
    defaultImage: "string",
    onImageChange: "callback",
    images: "value",
    allowImage: "action",
    imageType: "string",
    paused: "boolean",
    defaultPaused: "boolean",
    onPausedChange: "callback",
    interactive: "boolean",
    pointerRadius: "number",
    fontFamily: "string",
    maxDpr: "number",
  },
  // `images` and `imageStatus` are listed so an agent's snapshot shows them.
  controlled: ["value", "image", "images", "imageStatus", "paused"],
  state: (options: AsciiDitherOptions) => {
    const image = options.image ?? options.defaultImage ?? null
    return {
      value: normalizeStyle(options.value ?? options.defaultValue ?? {}),
      image,
      images: namesOf(options.images),
      imageStatus: (image ? "loading" : "none") as AsciiDitherImageStatus,
      paused: options.paused ?? options.defaultPaused ?? false,
    }
  },
  sync: (options) => ({
    images: namesOf(options.images),
    ...(options.value === undefined
      ? {}
      : { value: normalizeStyle(options.value) }),
    ...(options.image === undefined ? {} : { image: options.image }),
    ...(options.paused === undefined ? {} : { paused: options.paused }),
  }),
  api: (context) => {
    const change = createChange(context)
    const renderers = new Set<AsciiDitherRenderer>()
    let shown = context.store.get().image

    const unsubscribe = context.store.subscribe(() => {
      const { image } = context.store.get()
      if (image !== shown) {
        shown = image
        context.store.set({ imageStatus: image ? "loading" : "none" })
      }
      for (const renderer of renderers) renderer.invalidate()
    })
    context.onOptions(() => {
      for (const renderer of renderers) renderer.invalidate()
    })
    context.onDestroy(() => {
      unsubscribe()
      for (const renderer of renderers) renderer.destroy()
      renderers.clear()
    })

    const named = (image: string) => {
      const wanted = image.trim().toLowerCase()
      return Object.keys(context.options().images ?? {}).find(
        (name) => name.toLowerCase() === wanted
      )
    }

    // Image backgrounds are only offered while the app lists their picture.
    const presets = () =>
      presetKeys
        .filter((key) => key in backgrounds || named(backgroundLabel(key)))
        .map((key) => ({ value: key, label: backgroundLabel(key) }))

    const onSourceStatus = (status: AsciiDitherSourceStatus) => {
      const state = context.store.get()
      if (state.image && state.imageStatus !== status) {
        context.store.set({ imageStatus: status })
      }
    }

    const frame = (): AsciiDitherRenderOptions => {
      const { value, image, paused } = context.store.get()
      const options = context.options()
      return {
        pattern: value.pattern,
        mode: value.mode,
        chars: value.chars,
        cellSize: value.cellSize,
        speed: value.speed,
        contrast: value.contrast,
        brightness: value.brightness,
        scale: value.scale,
        dither: value.dither,
        flow: value.flow,
        vignette: value.vignette,
        accent: value.accent ?? undefined,
        colorMode: value.colorMode,
        fps: value.fps,
        invert: value.invert,
        paused,
        src: image ? (options.images?.[named(image) ?? ""] ?? image) : undefined,
        srcType: options.imageType,
        interactive: options.interactive,
        pointerRadius: options.pointerRadius,
        fontFamily: options.fontFamily,
        maxDpr: options.maxDpr,
        onSourceStatus,
      }
    }

    return {
      attach(canvas: HTMLCanvasElement) {
        const renderer = mountAsciiDither(canvas, frame)
        renderers.add(renderer)
        return () => {
          renderers.delete(renderer)
          renderer.destroy()
        }
      },
      setValue: (style: Partial<AsciiDitherStyle>, event?: Event) =>
        change("value", normalizeStyle(style), { reason: "restyle", event }),
      tweak: (patch: Partial<AsciiDitherStyle>, event?: Event) =>
        change("value", normalizeStyle(patch, context.store.get().value), {
          reason: "tweak",
          event,
        }),
      // A preset is a whole look: an image background brings its picture,
      // and any other one takes the picture away.
      applyPreset(name: string, event?: Event) {
        const preset = presetNamed(name)
        if (!preset) {
          throw new Error(
            `No preset ${JSON.stringify(name)}. Presets: ${presets()
              .map((item) => item.label)
              .join(", ")}.`
          )
        }
        const style = normalizeStyle(preset.style)
        if (preset.image) {
          const image = named(preset.image)
          if (!image) {
            throw new Error(
              `The preset ${JSON.stringify(name)} needs the image "${preset.image}", which this component doesn't list.`
            )
          }
          change("image", image, { reason: "image", event })
        } else if (context.store.get().image) {
          change("image", null, { reason: "clear", event })
        }
        return change("value", style, { reason: "preset", event })
      },
      setImage(image: string, event?: Event) {
        const name = typeof image === "string" ? named(image) : undefined
        if (name) {
          return change("image", name, { reason: "image", event })
        }
        const url = typeof image === "string" ? image.trim() : ""
        if (LOADABLE.test(url) && context.options().allowImage?.(url)) {
          return change("image", url, { reason: "image", event })
        }
        const names = context.store.get().images
        throw new Error(
          names.length
            ? `No image ${JSON.stringify(image)}. Images: ${names.join(", ")}.`
            : `No image ${JSON.stringify(image)}. This component lists no images to pick from.`
        )
      },
      clearImage: (event?: Event) =>
        change("image", null, { reason: "clear", event }),
      setPaused: (paused: boolean, event?: Event) =>
        change("paused", booleanOf("paused", paused), {
          reason: "pause",
          event,
        }),
      presets,
    }
  },
  slots: (slot) => ({
    root: slot<
      {},
      { style: AsciiDitherStyle; image: string | null; paused: boolean }
    >({
      role: "img",
      state: (state) => ({
        style: state.value,
        image: state.image,
        paused: state.paused,
      }),
      attrs: (state) => ({
        "data-pattern": state.value.pattern,
        "data-mode": state.value.mode,
        "data-image": state.image ? state.imageStatus : undefined,
        "data-paused": state.paused ? "" : undefined,
        style: css({
          "--ascii-dither-ink": state.value.color,
          "--ascii-dither-accent": state.value.accent ?? state.value.color,
          "--ascii-dither-background": state.value.background,
        }),
      }),
    }),
    canvas: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      bind: (el, part) => part.api.attach(el as HTMLCanvasElement),
    }),
  }),
  agent: {
    actions: [
      "setValue",
      "tweak",
      "applyPreset",
      "setImage",
      "clearImage",
      "setPaused",
    ],
    items: (api) => api.presets(),
  },
})

export {
  asciiDither,
  asciiDitherGuide,
  DEFAULT_STYLE,
  normalizeStyle,
  type AsciiDitherImageStatus,
  type AsciiDitherOptions,
  type AsciiDitherStyle,
}
