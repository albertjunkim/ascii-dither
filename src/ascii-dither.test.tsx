// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, expect, test, vi } from "vitest"
import { normalizeStyle } from "./ascii-dither"
import { backgroundNames, backgrounds } from "./backgrounds"
import { AsciiDither } from "./react"

declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

// jsdom has no WebGL: the renderer mounts nothing, and the state still changes.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext

const agent = createAgent()

afterEach(cleanup)

const onPage = () => agent.snapshot().filter((entry) => !entry.offPage)

test("an agent can find and restyle the background", async () => {
  const onValueChange = vi.fn()
  const { container } = render(<AsciiDither onValueChange={onValueChange} />)

  const [entry] = onPage()
  expect(entry.component).toBe("ascii-dither")
  expect(entry.label).toBe("Background")
  expect(entry.actions).toEqual([
    "setValue",
    "tweak",
    "applyPreset",
    "setImage",
    "clearImage",
    "setPaused",
  ])

  const result = await agent.act({
    steps: [
      {
        ref: "Background",
        action: "setValue",
        args: [{ pattern: "rain", color: "#ff00aa" }],
      },
      { ref: "Background", action: "tweak", args: [{ speed: 99 }] },
      { ref: "Background", action: "setPaused", args: [true] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)

  const root = container.querySelector<HTMLElement>(
    '[data-slot="ascii-dither"]'
  )
  expect(root?.getAttribute("data-pattern")).toBe("rain")
  expect(root?.hasAttribute("data-paused")).toBe(true)
  expect(root?.style.getPropertyValue("--ascii-dither-ink")).toBe("#ff00aa")

  const [value, details] = onValueChange.mock.calls.at(-1) ?? []
  expect(value).toMatchObject({ pattern: "rain", color: "#ff00aa", speed: 3 })
  expect(details.source).toBe("agent")
})

test("an agent can list the backgrounds and apply one by name", async () => {
  const { container } = render(<AsciiDither />)
  const [entry] = onPage()

  const found = await agent.query({ within: entry.ref })
  if ("error" in found) {
    throw new Error(found.error)
  }
  const labels = found[0].items?.map((item) => item.label) ?? []
  expect(labels).toHaveLength(backgroundNames.length)
  expect(labels).toContain("Amber Tide")

  const result = await agent.act({
    steps: [{ ref: entry.ref, action: "applyPreset", args: ["Amber Tide"] }],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(
    container
      .querySelector('[data-slot="ascii-dither"]')
      ?.getAttribute("data-pattern")
  ).toBe("waves")
})

test("every background is a style the component takes", () => {
  expect(backgroundNames).toHaveLength(25)
  for (const name of backgroundNames) {
    expect(() => normalizeStyle(backgrounds[name]), name).not.toThrow()
  }
})

test("a style that doesn't fit is refused with what the key takes", async () => {
  const { container } = render(<AsciiDither />)
  const [entry] = onPage()

  const result = await agent.act({
    steps: [
      { ref: entry.ref, action: "setValue", args: [{ pattern: "spiral" }] },
    ],
  })
  expect(result.ok).toBe(false)
  expect(result.error?.message).toContain("flow, waves, ripple, rain")
  expect(
    container
      .querySelector('[data-slot="ascii-dither"]')
      ?.getAttribute("data-pattern")
  ).toBe("flow")
})

test("the app can refuse an agent's change", async () => {
  const { container } = render(
    <AsciiDither
      onValueChange={(_value, details) => {
        if (details.source === "agent") details.cancel()
      }}
    />
  )
  const [entry] = onPage()

  await agent.act({
    steps: [{ ref: entry.ref, action: "applyPreset", args: ["Monsoon"] }],
  })
  expect(
    container
      .querySelector('[data-slot="ascii-dither"]')
      ?.getAttribute("data-pattern")
  ).toBe("flow")
})

const images = { Dunes: "/dunes.jpg", Portrait: "/portrait.jpg" }

test("an agent can show one of the app's images and clear it", async () => {
  const onImageChange = vi.fn()
  const { container } = render(
    <AsciiDither images={images} onImageChange={onImageChange} />
  )
  const root = container.querySelector('[data-slot="ascii-dither"]')

  const [entry] = onPage()
  expect(entry.images).toEqual(["Dunes", "Portrait"])
  expect(entry.imageStatus).toBe("none")

  const shown = await agent.act({
    steps: [
      { ref: entry.ref, action: "setImage", args: ["dunes"] },
      { ref: entry.ref, action: "tweak", args: [{ colorMode: "source" }] },
    ],
  })
  expect(shown.ok, shown.error?.message).toBe(true)
  expect(onImageChange.mock.calls.at(-1)?.[0]).toBe("Dunes")
  expect(onImageChange.mock.calls.at(-1)?.[1].source).toBe("agent")
  expect(onPage()[0].image).toBe("Dunes")
  expect(onPage()[0].imageStatus).toBe("loading")
  expect(root?.getAttribute("data-image")).toBe("loading")

  const cleared = await agent.act({
    steps: [{ ref: entry.ref, action: "clearImage" }],
  })
  expect(cleared.ok, cleared.error?.message).toBe(true)
  expect(onPage()[0].image).toBeNull()
  expect(root?.hasAttribute("data-image")).toBe(false)
})

test("an agent can't load an address the app didn't offer", async () => {
  render(
    <AsciiDither
      images={images}
      allowImage={(url) => url.startsWith("/uploads/")}
    />
  )
  const [entry] = onPage()
  const setImage = (image: string) =>
    agent.act({ steps: [{ ref: entry.ref, action: "setImage", args: [image] }] })

  const refused = await setImage("https://example.com/tracker.png")
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("Images: Dunes, Portrait")
  expect(onPage()[0].image).toBeNull()

  // `allowImage` says yes to anything under /uploads/, and nothing else.
  expect((await setImage("/uploads/mine.png")).ok).toBe(true)
  expect(onPage()[0].image).toBe("/uploads/mine.png")
  expect((await setImage("javascript:alert(1)")).ok).toBe(false)
})

test("the app's own image prop takes any address", () => {
  const { container } = render(<AsciiDither image="/hero.mp4" />)
  expect(onPage()[0].image).toBe("/hero.mp4")
  expect(
    container
      .querySelector('[data-slot="ascii-dither"]')
      ?.getAttribute("data-image")
  ).toBe("loading")
})
