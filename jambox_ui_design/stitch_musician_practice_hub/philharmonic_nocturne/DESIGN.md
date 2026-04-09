# Design System: The Orchestral Manuscript

## 1. Overview & Creative North Star

**Creative North Star: "The Curated Manuscript"**

This design system rejects the "app-as-a-utility" trend in favor of "app-as-an-experience." It is inspired by the haptic quality of heavy-stock sheet music and the architectural grandeur of a concert hall. We move beyond the rigid, boxy constraints of digital interfaces by embracing **intentional asymmetry** and **breathable white space**. 

The goal is to evoke the feeling of a private gallery or a front-row seat at the symphony. We achieve this through "The Editorial Stretch"—using high-contrast typography scales and overlapping elements that break the grid, suggesting a fluid, lyrical movement across the screen rather than a static list of files.

---

## 2. Colors

The palette is a sophisticated interplay between the warmth of Ivory (`#fbf9f4`) and the gravitas of Deep Navy and Gold. 

- **Primary (`#000000`) & Primary Container (`#001b3d`):** These represent the "Ink" and the "Midnight Stage." Use the Deep Navy (`primary_container`) for immersive sections to provide a sense of depth and prestige.
- **Secondary (`#775a19`):** Our "Conducting Baton." This Gold is reserved for moments of guidance—play buttons, active states, and highlights.
- **Surface Tiers:** Use `surface` (`#fbf9f4`) as the base. Use `surface_container_low` (`#f5f3ee`) for subtle grouping and `surface_container_highest` (`#e4e2dd`) for elevated focal points.

**The "No-Line" Rule**
Under no circumstances are 1px solid borders to be used for sectioning content. Boundaries are defined strictly by background shifts. If you need to separate the "Now Playing" bar from the main feed, shift from `surface` to `surface_container_low`. The eye should follow the color, not a cage.

**The "Glass & Gold" Rule**
For floating playback controls, use Glassmorphism. Apply `surface_container_lowest` at 70% opacity with a `20px` backdrop blur. This allows the album art to bleed through like light through a frosted stage door.

---

## 3. Typography

Typography is our melody. We use a high-contrast pairing of *Noto Serif* and *Newsreader*, with *Inter* serving only as a functional accompaniment.

- **Display (Noto Serif):** Used for "Hero" moments—composer names, concert titles, or mood headers. The large scale (`display-lg` at 3.5rem) should be used with tight letter-spacing to feel like a premium magazine header.
- **Headline & Title (Noto Serif / Newsreader):** *Noto Serif* provides authority for section headers, while *Newsreader* adds an elegant, bookish quality to track titles.
- **Body (Newsreader):** All long-form text (biographies, program notes) must use *Newsreader*. It is designed for legibility and evokes the feel of a printed program.
- **Labels (Inter):** Functional metadata (durations, timestamps, technical specs) uses *Inter*. This sans-serif anchor provides a modern, legible contrast to the romanticism of the serifs.

---

## 4. Elevation & Depth

In this system, depth is "Tonal," not "Structural." We avoid the "floating card" cliché of 2010s design.

- **The Layering Principle:** Treat the UI as stacked sheets of fine vellum. An artist’s bio (`surface_container_high`) should sit atop the main gallery (`surface`), creating a soft natural lift. 
- **Ambient Shadows:** Shadows are rarely used. When essential (e.g., a modal), use a `32px` blur at 5% opacity, tinted with the `on_surface` color (`#1b1c19`). It should feel like a soft shadow cast by a dim spotlight, not a digital effect.
- **The "Ghost Border" Fallback:** If a boundary is visually required for accessibility (e.g., an input field), use the `outline_variant` token at **15% opacity**. It should be a whisper, not a statement.
- **Sharp Precision:** All corners are set to `0px`. Roundness is forbidden. The elegance of this system comes from the sharp, architectural precision of its edges, mimicking the cut of high-quality paper.

---

## 5. Components

### Buttons
- **Primary:** Solid `primary` (Black) with `on_primary` (White) text. Square edges. High internal padding (16px vertical / 32px horizontal) to command space.
- **Secondary:** An `outline` variant using the "Ghost Border" logic. Refined and quiet.
- **Tertiary:** Text-only, using `secondary` (Gold) for the label.

### Lists & Cards
- **The Divider Ban:** Never use lines to separate tracks in a list. Use vertical whitespace (16px–24px) or a subtle background toggle between `surface` and `surface_container_low`.
- **Media Cards:** Album art should be large and unadorned. Metadata should be set in *Newsreader* Title-SM, left-aligned to create a strong vertical axis.

### Playback Controls
- **Iconography:** Use "Thin-Line" (1pt) custom icons. The play button should be a simple, un-encircled Gold (`secondary`) triangle, allowing the negative space to do the work.

### Additional Components: "The Program Note"
- **The Program Note (Custom):** A specialized text container for historical context of a piece. It uses a `surface_container_lowest` background with a wide left margin (64px) to create an asymmetrical, editorial look.

---

## 6. Do’s and Don’ts

**Do:**
- **Embrace Asymmetry:** Place a heading on the left and the body text slightly offset to the right. Let the "weight" of the screen feel balanced but not mirrored.
- **Use "White Space" as a Material:** Space is not "empty." It is the silence between notes. Use generous margins (minimum 32px on mobile) to let the typography breathe.
- **Color Transitions:** Use subtle gradients from `primary` to `primary_container` for full-screen immersive players to mimic the gradient of a theater’s lighting.

**Don’t:**
- **No Rounded Corners:** Ever. The `0px` rule is absolute. Circles are for icons and play buttons only; containers must be rectangular.
- **No Heavy Borders:** Never use a 100% opaque border. It breaks the "Manuscript" illusion.
- **No Fast Animations:** Transitions should be "Largo"—slow, elegant fades (300ms–500ms) rather than "Pop" or "Bounce" effects.