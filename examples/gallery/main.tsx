import { createAgent } from "@ui-sdk/react/agent"
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  backgroundLabel,
  backgroundNames,
  backgrounds,
  normalizeStyle,
  type AsciiDitherStyle,
} from "../../src/index"
import { AsciiDither } from "../../src/react"

// The same bridge a model would use. Try it from the console:
// agent.act({ steps: [{ ref: "Background", action: "tweak", args: [{ speed: 2 }] }] })
const agent = createAgent()
Object.assign(window, { agent })

function Gallery() {
  const [style, setStyle] = useState<AsciiDitherStyle>(() =>
    normalizeStyle(backgrounds.phosphor)
  )
  // Equal styles are the same object, so this finds the background showing.
  const current = backgroundNames.find(
    (name) => normalizeStyle(backgrounds[name]) === style
  )
  const usage = current
    ? `<AsciiDither defaultValue={backgrounds.${current}} />`
    : `<AsciiDither defaultValue={${JSON.stringify(style)}} />`

  const askAgent = () => {
    const others = backgroundNames.filter((name) => name !== current)
    const pick = others[Math.floor(Math.random() * others.length)]
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
        <div className="names">
          {backgroundNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === current}
              onClick={() => setStyle(normalizeStyle(backgrounds[name]))}
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
