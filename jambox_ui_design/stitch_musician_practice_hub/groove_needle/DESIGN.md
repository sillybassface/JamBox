# Design System Document: The Analog Era

## 1. Overview & Creative North Star
**Creative North Star: "The Tactile Hi-Fi"**

This design system is a rejection of the sterile, flat aesthetic of modern SaaS. It is an invitation to touch, feel, and listen. We are drawing direct inspiration from 1970s high-fidelity audio equipment—the heavy weight of a silver-face receiver, the warmth of a vacuum tube, and the physical ritual of placing a needle on vinyl. 

The goal is to move beyond a "retro theme" and create a **bespoke digital furniture** experience. We break the template look through **intentional asymmetry**, using extreme typography scales to create editorial-style layouts, and replacing rigid dividers with tonal layering. The interface should feel like it was assembled by hand, with "heavy" corners and a sense of physical permanence.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the "Golden Hour" of analog sound: deep ambers, burnt oranges, and creamy foundations.

### Surface Hierarchy & The "No-Line" Rule
To achieve a premium, custom feel, **1px solid borders for sectioning are strictly prohibited.** We define space through "Tonal Sculpting."

*   **Surface Nesting:** Treat the UI as a physical stack of materials. 
    *   **Base Layer:** `surface` (#fbfbe2) or `surface_container_low` (#f5f5dc) for the main canvas.
    *   **Nested Elements:** To highlight a section (like a track list or player controls), use `surface_container` (#efefd7) or `surface_container_high` (#eaead1). The change in depth is felt, not seen as a line.
*   **The Glass & Gradient Rule:** For floating controllers or persistent navigation, use Glassmorphism. Apply `surface_container_low` at 80% opacity with a `24px` backdrop-blur. 
*   **Signature Textures:** Main CTAs or active player states should utilize a subtle linear gradient from `primary` (#8d4b00) to `primary_container` (#b15f00) at a 135-degree angle. This mimics the soft glow of an illuminated VU meter.

---

## 3. Typography
We pair the authoritative, intellectual weight of a bold serif with a highly legible, modern sans-serif to bridge the gap between "Vintage" and "Functional."

*   **Display & Headline (Newsreader):** This is our "Hero" voice. Use `display-lg` (3.5rem) for artist names and `headline-lg` (2rem) for album titles. The tight tracking and bold weights evoke 70s record sleeve typography.
*   **Body & Titles (Be Vietnam Pro):** Our functional layer. Use `body-lg` for descriptions and `title-md` for navigation labels. The geometric nature of Be Vietnam Pro provides a "high-tech" (for 1975) contrast to the serif.
*   **The "Editorial" Shift:** Use `display-md` in an asymmetric layout (e.g., left-aligned with a large margin-right) to create an editorial, magazine-like feel rather than a standard grid.

---

## 4. Elevation & Depth
In this system, depth is "Ambient." We avoid the "floating card" look of the 2010s.

*   **The Layering Principle:** Instead of shadows, use `surface_container_lowest` (#ffffff) on top of `surface_dim` (#dbdcc3) to create a crisp, "paper-on-wood" lift.
*   **Ambient Shadows:** When a shadow is required for a floating Modal or Popover, use a large blur (40px) at 6% opacity. The shadow color must be a tinted version of `on_surface` (#1b1d0e), never pure black.
*   **The "Ghost Border" Fallback:** If a layout feels muddy, you may use a `1px` stroke of `outline_variant` at **15% opacity**. It should be a suggestion of an edge, not a boundary.

---

## 5. Components

### Buttons & Interaction
*   **Primary Button:** Uses the `primary` (#8d4b00) background with `on_primary` (#ffffff) text. Shape is `rounded-md` (0.75rem). No shadows—use a subtle inset `outline_variant` on hover to simulate a physical button being pressed.
*   **Secondary/Tertiary:** High-contrast `on_surface` text on a `surface_container_high` background.

### Cards & Lists (The "Vinyl Sleeve" Style)
*   **Cards:** Forbid divider lines. Separate album cards using the `xl` (1.5rem) spacing token. The card itself should use `surface_container_low`.
*   **Track Lists:** Use a rhythmic vertical spacing of `1rem`. Active tracks should be highlighted by shifting the background to `secondary_container` (#fd9e70) with `0.75rem` rounded corners.

### Custom Component: The "VU Meter" Progress Bar
*   Replace standard flat progress bars with a segmented bar. The "filled" portion uses `secondary` (#944a23), and the "unfilled" portion uses `surface_container_highest`. This mimics the physical LED or needle gauges found on vintage amps.

### Input Fields
*   Text inputs should be "sunken." Use `surface_container_highest` with a `2px` top-shadow (ambient, low-opacity) to create a tactile indentation in the UI.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace White Space:** Treat the screen like a premium print ad. Give the `display-lg` type room to breathe.
*   **Layer Tones:** Use the full range of `surface_container` tokens to create a "nested" UI.
*   **Use Bold Color Accents:** Use `tertiary` (#b6191a) sparingly for high-alert items (like "Live" or "Recording") to mimic a glowing red bulb on a studio console.

### Don't:
*   **Don't use 100% Opaque Borders:** This shatters the "Analog" illusion and makes the app look like a generic template.
*   **Don't use sharp 0px corners:** Everything in the 70s was softened. Even "square" elements should use at least the `sm` (0.25rem) radius.
*   **Don't Over-Animate:** Transitions should be "Heavy." Use longer durations (300ms-500ms) with ease-in-out curves that suggest physical inertia.