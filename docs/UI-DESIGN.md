# Jambox UI Design

## Design System — "Sonic Pulse"

Dark, electric, music-studio aesthetic. Deep near-black backgrounds with vibrant purple, cyan, and lime accents evoke a professional audio workspace.

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#db90ff` | Purple — branding, play button, active states |
| `primary-container` | `#d37bff` | Deeper purple — gradients, hover states |
| `secondary` | `#00e3fd` | Cyan — progress bars, secondary actions, Add Song CTA |
| `tertiary` | `#ddffb0` | Lime — success states, ready badges |
| `error` | `#ff6e84` | Soft red — errors, mute button |
| `surface` | `#0e0e10` | App background |
| `surface-container` | `#19191c` | Cards, panels |
| `surface-container-high` | `#1f1f22` | Elevated cards |
| `surface-container-highest` | `#262528` | Sliders, inputs |
| `on-surface` | `#f6f3f5` | Primary text |
| `on-surface-variant` | `#acaaad` | Secondary text, labels |
| `outline` | `#767577` | Borders, dividers |

#### Stem Colors

| Stem | Color |
|------|-------|
| Vocals | `#db90ff` (purple) |
| Drums | `#00e3fd` (cyan) |
| Bass | `#ddffb0` (lime) |
| Guitar | `#ffb347` (amber) |
| Other | `#f9a8d4` (pink) |

### Typography

| Role | Font | Fallback |
|------|------|---------|
| Headlines | Space Grotesk | sans-serif |
| Body | Manrope | sans-serif |
| Labels | Manrope | sans-serif |

Sizes follow Tailwind defaults. Key uses:
- **Page titles**: `text-3xl`–`text-4xl`, bold, `tracking-tighter`
- **Section headings**: `text-xl`–`text-2xl`, `font-headline`
- **Labels**: `text-[10px]`–`text-xs`, uppercase, `tracking-widest`
- **Body text**: `text-sm`

### Spacing & Shape

- Cards: `rounded-2xl`, `border border-white/5`
- Buttons: `rounded-full` for CTAs, `rounded-lg` for nav
- Page padding: `p-8` standard, `px-6 md:px-10` on player
- Border: `1px solid rgba(255,255,255,0.05)`

### Effects

- **Glow**: Primary elements emit purple glow on hover: `shadow-[0_0_20px_rgba(219,144,255,0.4)]`
- **Glass**: Mini player uses `backdrop-filter: blur(24px)` with `rgba(44,44,47,0.4)`
- **Hover lift**: Cards scale `group-hover:scale-110` on thumbnail
- **Gradient borders**: None — all borders are `border-white/5` on surface containers

### Icons

Google Material Symbols (Outlined variant, weight 400, optical size 24). `FILL` variation toggled programmatically for toggle states (play/pause, favorite star).

---

## Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  HEADER  [Jambox logo]  [Library] [Favourites]  [+]  [🔔] [Avatar/Login] │
├──────────┬───────────────────────────────────────────┤
│ SIDEBAR  │                                            │
│          │                                            │
│ Library  │         MAIN CONTENT                       │
│ Favourites│        (Outlet)                          │
│          │                                            │
│          │                                            │
├──────────┴───────────────────────────────────────────┤
│              MINI PLAYER (when song loaded)           │
└──────────────────────────────────────────────────────┘
```

- **Header** (sticky, `h-16`): Logo, nav links, add button, notifications, auth
- **Sidebar** (hidden on mobile, `w-64`): Navigation with active indicator (left border accent)
- **Main** (`flex-1`): Page content, `pb-20` to clear mini player
- **Mini Player** (fixed bottom, `h-16`): Thumbnail, title, play/pause, progress, expand button

---

## Page Designs

### Library Page (`/`)

```
┌─────────────────────────────────────────────────────┐
│ [HERO CARD — "Expand Your Library"]         [PRO TIP] │
│  H1: Expand Your Library                        ─── │
│  Sub: Add a YouTube link...                            │
│  [ADD SONG →]                                         │
│                                       💡 Use solo...   │
│                                       ───────         │
│                                       tips_and_updates│
│                                       MUS PRACTICE HUB │
├─────────────────────────────────────────────────────┤
│ My Songs                                    12 TRACKS │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │ 📷   │ │ 📷   │ │ 📷   │ │ 📷   │ │ 📷   │        │
│ │      │ │      │ │      │ │      │ │      │        │
│ │ ▶    │ │      │ │      │ │ ▶    │ │ ▶    │        │
│ │ ⭐   │ │ ⭐   │ │ ⭐   │ │ ⭐   │ │ ⭐   │        │
│ │▓▓▓▓▓ │ │ ░░░░ │ │ ░░░░ │ │▓▓▓▓▓ │ │▓▓▓▓▓ │        │
│ │ Title│ │ Title│ │ Title│ │ Title│ │ Title│        │
│ │Artist│ │Artist│ │Artist│ │Artist│ │Artist│        │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
└─────────────────────────────────────────────────────┘
```

**Song Card States:**
- **Ready**: Thumbnail with hover overlay showing purple play button; ⭐ visible top-right
- **Processing**: Thumbnail + animated status badge (e.g., "Separating" in purple pill)
- **Error**: Red status badge, no play button

**Grid:** 2 columns mobile → 3 tablet → 4 desktop → 5 wide. `gap-6`.

**Interactions:**
- Click ready card → navigate to `/player/:id`
- Click ⭐ → toggle favourite (tooltip prompts guest to sign in)
- Admin: hover shows red delete button top-left
- Auto-poll every 5s to refresh processing status

---

### Add Song Page (`/add`)

```
┌─────────────────────────────────────────────────────┐
│ [BADGE: Add New Track]                               │
│                                                     │
│  Add a Song                                         │
│  Paste a YouTube URL to download...                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔗  https://www.youtube.com/watch?v=...       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [ ADD SONG  → ] (cyan, full width)                 │
│                                                     │
│  ┌ Song info card (appears after submit) ─────────┐ │
│  │ [📷 thumb]  Title                              │ │
│  │              Artist  03:42                      │ │
│  │  ─────────────────────────────────────────────  │ │
│  │  Separating stems (AI)            62%          │ │
│  │  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│  │  Separating… 62%                              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  How it works                                        │
│  ┌────────────┐  ┌────────────┐                     │
│  │ download   │  │ psychology │                     │
│  │ Download   │  │ AI Separ.  │                     │
│  │ Audio from │  │ Demucs...  │                     │
│  └────────────┘  └────────────┘                     │
│  ┌────────────┐  ┌────────────┐                     │
│  │ tune       │  │ headphones │                     │
│  │ Stems Ready│  │ Practice   │                     │
│  │ Vocals,... │  │ Mix stems  │                     │
│  └────────────┘  └────────────┘                     │
└─────────────────────────────────────────────────────┘
```

**States:**
1. Empty form → "How it works" section visible below
2. After submit → song card appears with real-time progress via WebSocket
3. Complete → green checkmark, "Open Player" button
4. Error → red error message below form

---

### Player Page (`/player/:id`)

```
┌─────────────────────────────────────────────────────┐
│ [📷 thumb]  Song Title                        [←]   │
│              ARTIST                                 │
│              5 Stems                               │
│                                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ TRANSPORT BAR                                 │   │
│  │ [⏮ 10] [▶/⏸] [10 ⏭]                       │   │
│  │ ════════════════●═══════════════════  master │   │
│  │ space · play/pause   0:32  ← → seek 5s  3:42│   │
│  ├─────────────────────────────────────────────│   │
│  │ Stem Mixer                  [Reset All]     │   │
│  ├─────────────────────────────────────────────│   │
│  │ VOCALS   [M] [S]  ▃▅█▇▅▃▁▃▅█▇▅▃░░░░░░░  🔊100%│   │
│  │ DRUMS    [M] [S]  ▃▃▅█▇▅▃▁▃▅█▇▅▃░░░░░░░  🔊100%│   │
│  │ BASS     [M] [S]  ▃▅█▇▅▃░░░░░░░░░░░░░░░  🔊100%│   │
│  │ GUITAR   [M] [S]  ▃▅█▇▅▃▁▃▅█▇▅▃░░░░░░░░  🔊100%│   │
│  │ OTHER    [M] [S]  ▃▃▅█▇▅▃░░░░░░░░░░░░░░░  🔊100%│   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Stem Row Anatomy:**
```
[VOCALS]  [M][S]  [===waveform bar with cursor===]  [🔊 icon][volume────][100%]
 w-16       w-15              flex-1                    w-40
```

**Waveform Bars:** 150 vertical bars, height = RMS amplitude. Color matches stem. Unplayed region is 50% opacity; played region (left of cursor) is 100% opacity + colored overlay.

**Solo logic:**
- Soloed row: subtle purple background tint (`bg-primary/5`)
- Muted row: reduced opacity background + dimmed label
- Both soloed + muted: solo wins visually, label is dimmed

**Transport Bar Alignment:** The play/skip cluster is `w-[8.75rem]`. Progress bar is `flex-1`. Master volume is `w-40`. These widths exactly match the stem label + M/S + volume columns, so all bars are column-aligned.

**Keyboard Shortcuts:**
- `Space` → play/pause
- `←` → seek back 5s
- `→` → seek forward 5s

**"Reset All" Button:** Resets all stems to volume 1, unmuted, unsoloed.

---

### Favourites Page (`/favourites`)

Identical grid layout to Library Page. Only shows songs the authenticated user has starred. Empty state shows "favorite" icon with message. Login required — unauthenticated users see prompt.

---

## Reusable Components

### StatusBadge
- Pill shape, uppercase label, `tracking-widest`
- Processing states (downloading, separating, etc.) have an animated pulsing dot
- Colors map to semantic status

### FavouriteButton
- Material star icon, FILL variation when active
- Color: `#ff6b9d` (pink) when active
- Guest click: shows tooltip "Sign in to save favourites"
- Positioned top-right on cards, top-right on player header

### TaskProgress
- Segmented progress bar with `from-secondary to-primary` gradient
- Pulsing white overlay while running
- Step label + percentage above bar
- Message below bar from WebSocket event

### MiniPlayer
- Fixed to bottom, glass blur panel
- Shows current song: thumbnail, title/artist, play/pause
- Inline progress bar (hidden on very small screens)
- "Expand" button → navigates to full player

### NotificationBell
- Bell icon in header, badge for unread notifications
- Dropdown/panel showing queued/processing/complete/error states

---

## Visual Pacing

| Area | Intensity | Mood |
|------|-----------|------|
| App background | Dark, calm | `#0e0e10` |
| Cards/panels | Slightly elevated | `#19191c` |
| Hero sections | Gradient glows, large type | Expansive |
| Player | Dense, functional | Focused workspace |
| Mini player | Minimal, unobtrusive | Ambient |

---

## Responsive Breakpoints

| Breakpoint | Sidebar | Player layout |
|------------|---------|---------------|
| `< lg` | Hidden | Full width |
| `lg+` | Visible `w-64` | With back button |
| Grid columns | 2 → 3 → 4 → 5 | — |
