/**
 * Twenty-five looks built on photos. Each pairs a file from `images/` with a
 * style tuned for it. Serve the folder from your app, then:
 *
 *   <AsciiDither {...imageBackground("dunes")} />
 *
 * `images/CREDITS.md` lists where every photo came from.
 */

import type { AsciiDitherStyle } from "./ascii-dither"
import { backgroundLabel } from "./backgrounds"

const LONG_RAMP = " .,:;irsXA253hMHGS#9B&@"

const imageBackgrounds = {
  dunes: {
    file: "dunes.jpg",
    style: {
      colorMode: "source",
      background: "#0b0705",
      cellSize: 10,
      contrast: 3,
      brightness: -0.3,
      flow: 0.15,
    },
  },
  alpineLake: {
    file: "alpine-lake.jpg",
    style: {
      mode: "dots",
      color: "#8fc7ff",
      accent: "#ffffff",
      background: "#06101a",
      cellSize: 6,
      contrast: 2,
      brightness: -0.2,
    },
  },
  peaks: {
    file: "peaks.jpg",
    style: {
      color: "#1c1c1c",
      background: "#efece4",
      cellSize: 9,
      contrast: 2,
      flow: 0.1,
      invert: true,
    },
  },
  canyon: {
    file: "canyon.jpg",
    style: {
      chars: LONG_RAMP,
      colorMode: "source",
      background: "#0c0508",
      cellSize: 9,
      contrast: 3,
      brightness: 0.25,
    },
  },
  mesa: {
    file: "mesa.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#0a0605",
      cellSize: 6,
      contrast: 2,
    },
  },
  teaHills: {
    file: "tea-hills.jpg",
    style: {
      chars: " .:;+=xX$&",
      color: "#6fd94a",
      accent: "#f1ffd6",
      background: "#041006",
      cellSize: 10,
      contrast: 1,
      brightness: 0.1,
    },
  },
  mirrorLake: {
    file: "mirror-lake.jpg",
    style: {
      colorMode: "source",
      background: "#05080c",
      cellSize: 9,
      contrast: 2,
      brightness: -0.1,
      flow: 0.35,
    },
  },
  moon: {
    file: "moon.jpg",
    style: {
      color: "#c9ad6a",
      accent: "#fff7dc",
      background: "#021a26",
      cellSize: 8,
      contrast: 2,
      brightness: 0.1,
      flow: 0.05,
    },
  },
  eclipse: {
    file: "eclipse.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#000000",
      cellSize: 6,
      contrast: 2,
      brightness: 0.15,
      flow: 0.05,
    },
  },
  lunarSurface: {
    file: "lunar-surface.jpg",
    style: {
      color: "#8d8d8d",
      accent: "#ffffff",
      background: "#050505",
      cellSize: 8,
      contrast: 3,
      brightness: 0.15,
      flow: 0.1,
    },
  },
  cityLights: {
    file: "city-lights.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#01030a",
      cellSize: 6,
      contrast: 2,
      brightness: 0.35,
      flow: 0.1,
    },
  },
  nebula: {
    file: "nebula.jpg",
    style: {
      colorMode: "source",
      background: "#03020a",
      cellSize: 9,
      contrast: 1,
      brightness: 0.15,
      flow: 0.3,
    },
  },
  carina: {
    file: "carina.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#050208",
      cellSize: 6,
      contrast: 1,
    },
  },
  saturn: {
    file: "saturn.jpg",
    style: {
      color: "#b79c5a",
      accent: "#fff6dc",
      background: "#000000",
      cellSize: 9,
      contrast: 1,
      brightness: 0.3,
      flow: 0.05,
    },
  },
  spiral: {
    file: "spiral.jpg",
    style: {
      mode: "dots",
      color: "#f2f2f2",
      background: "#050505",
      cellSize: 6,
      contrast: 3,
      flow: 0.1,
    },
  },
  courtyard: {
    file: "courtyard.jpg",
    style: {
      chars: " .:;+=xX$&",
      colorMode: "source",
      background: "#0a0300",
      cellSize: 9,
      contrast: 2,
      flow: 0.15,
    },
  },
  trestle: {
    file: "trestle.jpg",
    style: {
      color: "#1fb8e0",
      accent: "#e8fbff",
      background: "#010a10",
      cellSize: 8,
      contrast: 2,
      brightness: 0.4,
      flow: 0.1,
    },
  },
  skyline: {
    file: "skyline.jpg",
    style: {
      colorMode: "source",
      background: "#03030a",
      cellSize: 8,
      contrast: 2,
      flow: 0.3,
    },
  },
  facade: {
    file: "facade.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#06040c",
      cellSize: 8,
      contrast: 1,
      flow: 0.1,
    },
  },
  tiles: {
    file: "tiles.jpg",
    style: {
      chars: " ░▒▓█",
      color: "#1fae96",
      accent: "#eafffb",
      background: "#021010",
      cellSize: 10,
      contrast: 1,
      dither: 0.5,
    },
  },
  jellyfish: {
    file: "jellyfish.jpg",
    style: {
      color: "#2f8fff",
      accent: "#ffffff",
      background: "#010822",
      cellSize: 9,
      contrast: 3,
      flow: 0.4,
    },
  },
  shrike: {
    file: "shrike.jpg",
    style: {
      color: "#1e2a1e",
      background: "#ebe7da",
      cellSize: 8,
      contrast: 3,
      brightness: 0.1,
      flow: 0.1,
      invert: true,
    },
  },
  periwinkle: {
    file: "periwinkle.jpg",
    style: {
      mode: "dots",
      colorMode: "source",
      background: "#04060c",
      cellSize: 6,
      contrast: 2,
    },
  },
  spices: {
    file: "spices.jpg",
    style: {
      chars: LONG_RAMP,
      colorMode: "source",
      background: "#0a0605",
      cellSize: 9,
      contrast: 1,
      flow: 0.1,
    },
  },
  dish: {
    file: "dish.jpg",
    style: {
      mode: "dots",
      color: "#141414",
      background: "#f2efe6",
      cellSize: 6,
      contrast: 2,
      flow: 0.05,
      invert: true,
    },
  },
} satisfies Record<
  string,
  { file: string; style: Partial<AsciiDitherStyle> }
>

type ImageBackgroundName = keyof typeof imageBackgrounds

const imageBackgroundNames = Object.keys(
  imageBackgrounds
) as ImageBackgroundName[]

/**
 * The props for one image background, to spread onto the component. `base` is
 * where your app serves the `images/` folder from.
 */
function imageBackground(name: ImageBackgroundName, base = "/ascii-dither") {
  const { file, style } = imageBackgrounds[name]
  return {
    image: `${base.replace(/\/$/, "")}/${file}`,
    defaultValue: style as Partial<AsciiDitherStyle>,
  }
}

/**
 * Every photo by the name an agent picks it with, for the `images` option:
 * `{ Dunes: "/ascii-dither/dunes.jpg", … }`.
 */
function imageSources(base = "/ascii-dither"): Record<string, string> {
  return Object.fromEntries(
    imageBackgroundNames.map((name) => [
      backgroundLabel(name),
      `${base.replace(/\/$/, "")}/${imageBackgrounds[name].file}`,
    ])
  )
}

export {
  imageBackground,
  imageBackgroundNames,
  imageBackgrounds,
  imageSources,
  type ImageBackgroundName,
}
