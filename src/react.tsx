"use client"

import { createParts, type PartProps } from "@ui-sdk/react/primitive"
import { asciiDither, type AsciiDitherOptions } from "./ascii-dither"

const parts = createParts(asciiDither, { root: "div", canvas: "canvas" })

const canvasStyle = {
  display: "block",
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  color: "var(--ascii-dither-ink, currentColor)",
  background: "var(--ascii-dither-background, transparent)",
} as const

type AsciiDitherProps = AsciiDitherOptions &
  Omit<PartProps<"div">, "defaultValue" | "children">

/**
 * Size it with a class, like `className="absolute inset-0 -z-10"`. Its
 * `aria-label` is the name an agent finds it by.
 */
function AsciiDither({
  "aria-label": label = "Background",
  ...props
}: AsciiDitherProps) {
  return (
    <parts.Root aria-label={label} {...props}>
      <parts.Canvas style={canvasStyle} />
    </parts.Root>
  )
}

export { AsciiDither, type AsciiDitherProps }
