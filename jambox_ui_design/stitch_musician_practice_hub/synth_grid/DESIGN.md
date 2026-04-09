# Design System Specification: The Digital Studio

## 1. Overview & Creative North Star
### The Creative North Star: "Precision Pulse"
This design system is not a music player; it is a high-performance workstation. We are moving away from the "consumer app" aesthetic and toward a "Digital Studio" environment. The goal is to make the user feel like they are sitting at a multi-million dollar mixing console in a darkened studio.

**The "Precision Pulse" aesthetic is defined by:**
*   **Aggressive Geometry:** Zero-radius corners that feel architectural and uncompromising.
*   **Luminous Depth:** Utilizing dark surfaces to let neon accents "glow" with digital intent.
*   **Editorial Intent:** Breaking the grid with massive, high-contrast typography that bleeds off-canvas or overlaps elements to create a sense of motion.

The system rejects "standard" UI patterns in favor of a bespoke, technical feel that prioritizes data density and vibrant energy.

---

## 2. Colors & Surface Logic

### The "No-Line" Rule
Traditional dividers are strictly prohibited. In this design system, hierarchy is defined by **Tonal Stepping**. To separate a sidebar from a main feed, use a shift from `surface` (#0e0e10) to `surface-container-low` (#131315). The eye should perceive a change in depth, not a line in space.

### Surface Hierarchy & Nesting
Treat the screen as a series of physical plates. Use the following hierarchy for depth:
*   **Base Layer:** `surface` (#0e0e10) — The absolute ground.
*   **Secondary Sections:** `surface-container-low` (#131315) — Used for large background zones.
*   **Interactive Components:** `surface-container-highest` (#262528) — Used for cards or elevated containers.
*   **The Inset Rule:** To create a "carved out" feel (like a fader track), use `surface-container-lowest` (#000000) inside a `surface-container` section.

### Glass & Gradient Architecture
*   **The "Studio Glow":** Main CTAs and progress bars should utilize a linear gradient from `primary` (#e08dff) to `primary_container` (#d978ff) at a 135-degree angle.
*   **Backdrop Blurs:** Floating panels (like a "Now Playing" bar) must use `surface_container_high` at 70% opacity with a `20px` backdrop blur. This allows the vibrant album art to bleed through the UI, mimicking the reflection of studio monitors.

---

## 3. Typography
The type system relies on the tension between the technical sharpness of **Space Grotesk** and the rhythmic readability of **Manrope**.

*   **Display & Headlines (Space Grotesk):** Use these for artist names, track titles, and section headers. The high-contrast, monospaced-leaning glyphs of Space Grotesk reinforce the "Digital Studio" feel.
    *   *Directives:* Use `display-lg` for hero states. Don't be afraid to use `tracking-tighter` (-0.02em) to increase the "technical" density.
*   **Body & Titles (Manrope):** Use Manrope for all functional metadata and long-form text. It provides a human balance to the digital coldness of the headlines.
*   **Functional Labels (Space Grotesk):** All button text, time codes, and technical readouts must use `label-md` or `label-sm` in Space Grotesk to maintain the "instrument" aesthetic.

---

## 4. Elevation & Depth

### The Layering Principle
Forget shadows; think in luminosity. 
*   **Stacking:** A `surface-container-highest` card placed on a `surface` background provides enough contrast to signify elevation without a single pixel of shadow.
*   **Ambient Shadows:** If a floating element (like a context menu) requires separation, use an ultra-diffused shadow: `0px 20px 40px rgba(0, 0, 0, 0.6)`. Do not use "drop shadows" on standard cards.

### The "Ghost Border" Fallback
If a boundary is absolutely required for accessibility, use a "Ghost Border": `outline-variant` (#48474a) at 20% opacity. It should be felt, not seen.

### Roundedness Scale
**Universal Value: 0px.**
There are no rounded corners in this system. This design system is built on "Sharp Edges." Every button, card, and input field must have 90-degree angles to maintain the high-tech, architectural feel.

---

## 5. Components

### Buttons (The "Module" Approach)
*   **Primary:** Solid `primary` (#e08dff) or the "Studio Glow" gradient. Text is `on_primary` (#4f006c) in `label-md` Space Grotesk.
*   **Secondary:** No background. `outline` border (#767577) at 50% opacity with `secondary` (#00eefc) text.
*   **Interaction:** On hover, primary buttons should "glow" by adding a soft outer glow of the same color (8px blur, 30% opacity).

### Cards & Lists
*   **Forbid Dividers:** Use `16px` or `24px` of vertical whitespace to separate list items.
*   **Active State:** Use a `secondary` (#00eefc) vertical 2px line on the far left edge of a list item to indicate "Playing" or "Selected."

### Input Fields
*   **Visual Style:** Bottom-border only or fully enclosed in `surface-container-highest`.
*   **Focus State:** The border transitions to `secondary` (#00eefc) with a sharp, 1px thickness.
*   **Error State:** Use `error` (#ff6e84) text and a subtle `error_container` background tint.

### The "Fader" (Slider)
*   The track must be `surface-container-lowest` (#000000).
*   The progress bar is a solid `secondary` (#00eefc) or `primary` (#e08dff).
*   The thumb/knob should be a sharp square, slightly larger than the track height.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** lean into intentional asymmetry. Align a large `display-lg` headline to the left while keeping the content grid centered.
*   **Do** use `secondary` (#00eefc) for "technical" data like timestamps, bitrates, and waveforms.
*   **Do** use overlapping elements. Let a high-resolution artist image bleed behind a `headline-lg` text block.

### Don't:
*   **Don't** use 1px solid borders to define the layout. It breaks the "Digital Studio" immersion.
*   **Don't** use any border-radius. Even a 2px radius will soften the design and ruin the high-tech edge.
*   **Don't** use standard grey shadows. If you need depth, use tonal shifts or tinted ambient glows.
*   **Don't** use centered typography for headlines. Keep it flush-left to maintain the "technical manual" look.