/// <reference types="vite/client" />

import { createAgent } from "@ui-sdk/react/agent"
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  backgroundLabel,
  backgroundNames,
  backgrounds,
  imageBackgroundNames,
  imageBackgrounds,
  normalizeStyle,
  type AsciiDitherStyle,
} from "../../src/index"
import { AsciiDither } from "../../src/react"

// The same bridge a model would use. Try it from the console:
// agent.act({ steps: [{ ref: "Background", action: "tweak", args: [{ speed: 2 }] }] })
const agent = createAgent()
Object.assign(window, { agent })

// Vite hands back each photo's URL. In your app, serve `images/` from a public
// folder and use `imageSources()` in place of this.
const urls = import.meta.glob<string>("../../images/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
})
const sources = Object.fromEntries(
  imageBackgroundNames.map((name) => [
    backgroundLabel(name),
    urls[`../../images/${imageBackgrounds[name].file}`] ?? "",
  ])
)

function Gallery() {
  const [style, setStyle] = useState<AsciiDitherStyle>(() =>
    normalizeStyle(backgrounds.phosphor)
  )
  const [image, setImage] = useState<string | null>(null)

  // Equal styles are the same object, so this finds the background showing.
  const pattern = image
    ? undefined
    : backgroundNames.find(
        (name) => normalizeStyle(backgrounds[name]) === style
      )
  const photo = imageBackgroundNames.find(
    (name) =>
      backgroundLabel(name) === image &&
      normalizeStyle(imageBackgrounds[name].style) === style
  )
  const current = pattern ?? photo
  const usage = pattern
    ? `<AsciiDither defaultValue={backgrounds.${pattern}} />`
    : photo
      ? `<AsciiDither {...imageBackground("${photo}")} />`
      : `<AsciiDither defaultValue={${JSON.stringify(style)}} />`

  const askAgent = () => {
    const others = [...backgroundNames, ...imageBackgroundNames].filter(
      (name) => name !== current
    )
    const pick = others[Math.floor(Math.random() * others.length)]
    if (!pick) return
    void agent.act({
      steps: [
        {
          ref: "Background",
          action: "applyPreset",
          args: [backgroundLabel(pick)],
        },
      ],
    })
  }

  return (
    <div className="stage">
      <AsciiDither
        className="backdrop"
        value={style}
        onValueChange={setStyle}
        image={image}
        onImageChange={setImage}
        images={sources}
      />
      <div className="panel">
        <div className="row">
          <h1>{current ? backgroundLabel(current) : "Custom"}</h1>
          <code>{usage}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(usage)}
          >
            Copy JSX
          </button>
          <button type="button" onClick={askAgent}>
            Run an agent step
          </button>
        </div>
        <div className="names" aria-label="Patterns">
          {backgroundNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === current}
              onClick={() => {
                setImage(null)
                setStyle(normalizeStyle(backgrounds[name]))
              }}
            >
              {backgroundLabel(name)}
            </button>
          ))}
        </div>
        <div className="names" aria-label="Photos">
          {imageBackgroundNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === current}
              onClick={() => {
                setImage(backgroundLabel(name))
                setStyle(normalizeStyle(imageBackgrounds[name].style))
              }}
            >
              {backgroundLabel(name)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>
)
