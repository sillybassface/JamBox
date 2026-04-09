```markdown
# Design System: Documentation for High-End Musical Interfaces

## 1. Overview & Creative North Star: "The Electric Pulse"

This design system is engineered to feel like a high-end recording studio translated into a digital canvas. We are moving away from the "standard SaaS" look of flat cards and rigid borders. Our Creative North Star is **"The Electric Pulse"**—a philosophy that treats the UI as a living, vibrating organism. 

To achieve a signature, award-winning feel, we utilize **intentional asymmetry** and **tonal depth**. Instead of centering everything, we use the "Space Grotesk" headlines to anchor layouts to the edges, allowing the vibrant accents to guide the eye like a laser through a dark room. The interface shouldn't just hold data; it should feel like it’s humming with potential energy.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule

The foundation of this system is a deep, immersive dark theme. We do not use color merely for decoration; we use it to define functionality and energy levels.

### The "No-Line" Rule
**Explicitly prohibit 1px solid borders for sectioning.** To create a premium, editorial feel, boundaries must be defined solely through background color shifts.
- Use `surface-container-low` (#131315) for secondary sections sitting on the main `background` (#0e0e10).
- Use `surface-container-high` (#1f1f22) for interactive modules like mixer channels.
- This creates a "molded" look, as if the UI was carved from a single block of material, rather than being a collection of boxes.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers.
1. **Base:** `surface-dim` (#0e0e10) — The infinite void.
2. **Plates:** `surface-container` (#19191c) — Large layout blocks.
3. **Modules:** `surface-container-highest` (#262528) — High-interaction zones like waveforms or transport controls.

### The "Glass & Gradient" Rule
To elevate the app beyond a standard utility, use **Glassmorphism** for floating overlays. Use `surface_bright` at 40% opacity with a `24px` backdrop blur. 
- **Signature Textures:** For primary CTAs and active states in the audio mixer, use a linear gradient: `primary` (#db90ff) to `primary_container` (#d37bff). This adds "soul" and mimics the glowing LEDs of professional rack gear.

---

## 3. Typography: Editorial Authority

We use a high-contrast typographic pairing to balance technical precision with creative energy.

- **Display & Headlines (Space Grotesk):** This is our "Vibe" font. It is tech-forward and aggressive. Use `display-lg` for hero moments and `headline-sm` for section titles. Do not be afraid of tight letter-spacing (-0.02em) on headlines to increase the "bold" feel.
- **Body & Labels (Manrope):** This is our "Utility" font. It is highly legible even at small sizes in dense environments like mixer labels or BPM readouts. 
- **Hierarchy Tip:** Use `tertiary` (#ddffb0) in `label-sm` for meta-data (e.g., "TRACK 01", "44.1kHz"). The high contrast of the Lime Green against the dark background ensures it pops without requiring a large font size.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are too "web 2.0" for this system. We achieve lift through light and transparency.

- **The Layering Principle:** Place a `surface-container-lowest` (#000000) element inside a `surface-container-high` (#1f1f22) section to create an "inset" effect—perfect for waveform displays or mixer tracks.
- **Ambient Glows:** When an element must "float" (like a modal or context menu), use a shadow with a large blur (40px) and low opacity (8%). Use a tint of `primary` (#db90ff) for the shadow color to simulate the glow of the screen reflecting off a surface.
- **The "Ghost Border" Fallback:** If accessibility requires a stroke, use the `outline_variant` (#48474a) at **20% opacity**. It should be felt, not seen.

---

## 5. Components: Precision Interaction

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`) with `on_primary_fixed` (#000000) text. Roundedness: `full`.
- **Secondary:** Transparent background with a "Ghost Border" and `secondary` (#00e3fd) text.
- **Haptic Feel:** On hover, primary buttons should increase their glow (shadow spread), not change their color.

### Audio Mixer & Controls
- **Faders:** The track should be `surface-container-highest`. The "handle" is a glassmorphic block with a 2px `secondary` (#00e3fd) indicator line.
- **Knobs:** Use a circular `surface-container-high` base. The "value" ring should be a gradient of `secondary` to `tertiary`.

### Waveform Visualizations
- **Active State:** Use a `tertiary` (#ddffb0) fill with a subtle vertical gradient.
- **Background State:** Use `outline_variant` at 30% opacity. 
- **The Rule:** No borders around waveforms. Let the color define the shape against the `surface-container-lowest` background.

### Inputs & Search
- Use `surface-container-low` with a `full` roundedness. 
- **Focus State:** Instead of a thick border, use a `1px` inner glow of `secondary` (#00e3fd) and a subtle backdrop-blur increase.

---

## 6. Do's and Don'ts

### Do:
- **Use Intentional Asymmetry:** Align text to the left and controls to the right to create a sophisticated, editorial rhythm.
- **Embrace White Space:** Musicians need focus. Give complex audio controls room to breathe using the `xl` (1.5rem) spacing scale.
- **Layer with Purpose:** Only use the `highest` surface tiers for elements the user must touch immediately.

### Don't:
- **No Dividers:** Never use a solid line to separate list items. Use 16px of vertical space or a subtle shift from `surface-container` to `surface-container-low`.
- **Avoid Flat Colors:** For active states (Play, Record, Solo), always use our vibrant accent tokens (`primary`, `secondary`, `tertiary`). Never use greys for "on" states.
- **Don't Over-Round Everything:** Use `md` (0.75rem) for most modules to maintain a "professional" edge. Reserve `full` roundedness only for buttons and chips to signify "touchability."

### Accessibility Note:
Ensure all `on_surface_variant` text on `surface` backgrounds meets WCAG 2.1 contrast ratios. While we want a "dark" vibe, the data (BPM, Key, Time Signature) must be crystal clear. Use `secondary` (#00e3fd) for critical status indicators to ensure they are visible even in peripheral vision.```