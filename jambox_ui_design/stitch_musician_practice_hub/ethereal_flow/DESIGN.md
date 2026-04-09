```markdown
# Design System: The Flow State Editorial

## 1. Overview & Creative North Star: "The Living Sanctuary"
The digital landscape is often loud and fragmented. This design system rejects the "dashboard" mentality of traditional music apps in favor of **"The Living Sanctuary."** Our Creative North Star is centered on a high-end, editorial experience that mirrors the meditative quality of a physical listening room.

To move beyond the "template" look, we employ **Intentional Asymmetry** and **Spatial Breathing.** Rather than forcing elements into a rigid, boxed grid, we treat the screen as a canvas where negative space is an active participant. Expect overlapping imagery, oversized typography that bleeds off-canvas, and a total absence of structural lines. This is not just a player; it is a landscape for focus.

---

## 2. Colors & Tonal Depth
Our palette is rooted in a "Soil and Stone" philosophy—soft, muted earth tones that recede into the background, allowing the album art to be the only "pop" of saturated color.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Structural definition must be achieved solely through background color shifts. 
*   *Example:* A tracklist container should use `surface-container-low` sitting atop a `surface` background. The change in tone is the boundary.

### Surface Hierarchy & Nesting
Think of the UI as layers of fine, handmade paper. 
*   **Base:** `surface` (#fffcf8)
*   **In-Page Sections:** `surface-container-low` (#fcf9f4)
*   **Interactive Cards:** `surface-container` (#f6f3ed)
*   **Floating Elements:** `surface-container-highest` (#eae8e0)

### The "Glass & Gradient" Rule
To add soul to the "Flow State," use **Glassmorphism** for the persistent Play Bar. Apply `surface-container-low` at 80% opacity with a 20px backdrop blur. For primary CTAs (like "Start Flow"), use a subtle linear gradient from `primary` (#5c614d) to `primary-container` (#e0e5cc) at a 45-degree angle to create a soft, sun-drenched glow.

---

## 3. Typography: The Editorial Voice
We utilize a sophisticated pairing of **Manrope** for its geometric clarity and **Plus Jakarta Sans** for its high-end, contemporary label feel.

*   **Display (Manrope):** `display-lg` (3.5rem) is used for "State of Mind" headers. Use tight letter-spacing (-0.02em) to create a premium, editorial feel.
*   **Headlines (Manrope):** `headline-md` (1.75rem) serves as the primary navigation anchor. 
*   **The Label Contrast (Plus Jakarta Sans):** All metadata (timestamps, track durations, genres) must use `label-md` or `label-sm`. This font’s slightly wider stance provides an authoritative, curated look against the more fluid Manrope.
*   **Visual Hierarchy:** Use `on-surface-variant` (#64655e) for secondary information to reduce cognitive load and maintain the "Zen" atmosphere.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to represent "height"; we use tonal shifts to represent "presence."

*   **The Layering Principle:** Stack `surface-container-lowest` cards on `surface-container-low` backgrounds. The subtle contrast creates a "soft lift" that feels organic rather than mechanical.
*   **Ambient Shadows:** If a floating element (like a volume popover) requires a shadow, it must use the `on-surface` color (#383833) at **4% opacity** with a **64px blur** and **16px Y-offset**. It should feel like a cloud casting a shadow, not a plastic box.
*   **The "Ghost Border" Fallback:** In high-density list views where accessibility is a concern, use `outline-variant` (#bab9b2) at **15% opacity**. This provides a "suggestion" of a boundary without breaking the flow.

---

## 5. Components

### Buttons: The Tactile Pebble
*   **Primary:** Rounded `full` (9999px). Background: `primary` (#5c614d). Text: `on-primary` (#f6fae1). No shadow.
*   **Tertiary (Text-only):** Use `title-sm` weight. The hover state is a simple background shift to `surface-container-high`.

### Cards & Lists: The Infinite Stream
*   **Rule:** Forbid all divider lines.
*   **Spacing:** Use `2rem` (xl) vertical spacing between list items. Use a subtle `surface-container-low` background on hover to indicate interactivity.
*   **Album Art:** Use `xl` (3rem) corner radius for large featured art and `lg` (2rem) for standard thumbnails.

### Input Fields: The Subtle Prompt
*   **Style:** Minimalist underline or soft-filled container (`surface-container-highest`). 
*   **States:** On focus, the container shouldn't gain a thick border, but rather transition the background color to `primary-container` with a `15%` opacity.

### Navigation: The Zen Rail
*   A side-rail using `surface-container-lowest`. Icons should be thin-stroke (1.5px) to match the weight of `label-md` typography.

### Custom Component: The "Flow Timer"
*   A large, circular progress ring using a gradient of `primary` to `tertiary`. The center uses `display-lg` type to show time remaining, surrounded by maximum negative space to eliminate distractions.

---

## 6. Do's and Don'ts

### Do:
*   **Do** allow headers to be off-center. Asymmetry creates a sense of human touch and artistry.
*   **Do** use `primary-fixed-dim` for inactive states instead of "greyed out" tones to keep the earth-tone warmth.
*   **Do** prioritize "Breathing Room"—if you think there is enough padding, double it.

### Don't:
*   **Don't** use pure black (#000) or pure white (#fff). Always use the provided `surface` and `on-surface` tones.
*   **Don't** use "Pop-up" modals that cover the whole screen. Use "Sliding Trays" that occupy the `surface-container-high` tier, allowing the previous context to remain visible.
*   **Don't** use sharp corners. Everything in this system must feel like a river stone—smoothed by time. Refer strictly to the **Roundedness Scale** (`md` to `xl`).

---

## 7. Motion: The Gentle Current
Interaction should feel like movement through water. Use "Cubic Bezier (0.4, 0, 0.2, 1)" for all transitions. Elements should not "pop" into existence; they should fade and slide upward simultaneously (Y-offset 20px to 0px) to simulate a natural, rising flow.```