# Bacon design system (v1)

Bacon should feel like a finished iOS app that also works beautifully on the
desktop web — not a terminal demo. This guide is the contract every screen
follows. Tokens and primitives live in `app/globals.css`; React wrappers in
`components/ui`.

## Voice and copy

- **Sentence case everywhere.** Buttons, titles, tabs, labels. Never ALL CAPS
  labels, never monospace for words, no `▸`, `◷`, `===`, "CONN ●", clocks, boot
  screens, scan lines or graph paper. (Those were the demo costume.)
- Verbs on buttons: "Run analysis", "Track", "Refresh brief", "Upgrade". Not
  "RE-SWEEP NOW" or "PIECING IT TOGETHER".
- Short, calm, specific. One disclaimer per screen, at the bottom, in
  `t-caption`: "Research, not investment advice." Don't sprinkle hedges.
- Numbers are facts or labelled estimates. Keep the honesty mechanics (source
  labels, "delayed close", data-check flags) — restyle them, never remove them.
- Monospace is for tickers only (`<Ticker>`), and code.

## Layout

- Every screen: `<div className="page">` → `<PageHeader title subtitle actions/>`
  → one or more `<Section>`s. Max content width is handled by the shell.
- Mobile (<900px): the shell provides the blurred top bar (compact title on
  scroll) and the bottom tab bar. Screens must not add their own fixed bars.
  Content must clear the tab bar (the shell pads for it).
- Desktop (≥900px): left sidebar from the shell. Use `grid-2` / `grid-3` for
  card grids; single column on phones.
- Spacing on the 4pt grid via tokens (`--s-1` … `--s-12`). Sections are 20–24px
  apart, cards 12px apart.
- Touch targets ≥44px on touch devices (`ui-btn`, `ui-row`, `ui-iconbtn` already
  comply). Inputs are 16px (no iOS zoom on focus).

## Tokens (CSS variables)

Surfaces `--bg --surface --surface-2 --surface-3 --bg-elev` · ink `--text
--text-2 --text-3` · lines `--border --border-strong` · brand `--accent
--accent-text --accent-soft` · semantic `--pos --neg --warn --info` and
`*-soft` backgrounds · radius `--r-xs … --r-xl --r-pill` · shadow `--shadow-1..3`
· type `--font-body --font-display --font-mono`, sizes `--fs-xs … --fs-4xl` ·
lens hues `--lens-<key>` (fundamental, valuation, technical, health, factor,
macro, signals, risk). Light/dark both defined; **never hard-code a colour**.

## Primitives (`components/ui`)

| Component | Use |
|---|---|
| `Button` (`variant`: primary · secondary · tonal · ghost · danger; `size`: sm · md · lg; `loading`, `icon`, `block`) | One primary per view region. Haptic tap in the iOS app. |
| `IconButton` (`label` required) | Toolbar actions. |
| `Card` (`pad`, `flat`) | Content containers. `ui-card--interactive` for tappable cards. |
| `PageHeader`, `Section` | Screen scaffolding. |
| `List` + `Row` (`icon`, `title`, `sub`, `value`, `trailing`, `chevron`, `onClick`, `danger`) | iOS grouped lists: settings, menus, simple item lists. |
| `Switch` | Boolean settings (with a `Row`). |
| `Segmented` | 2–4 peer views inside a screen (e.g. Brief · Headlines). |
| `Badge` (`tone`), `Ticker`, `Delta`, `Chip` | Status, symbols, % changes, filters. |
| `UsageMeter` | "x of y used". |
| `Callout` (`tone`) | Inline notices / errors with a retry. |
| `EmptyState` | Every list needs one: icon, title, one-line body, one action. |
| `Skeleton`, `SkeletonCard` | Loading. Never a bare spinner for content. |
| `Sheet` (`variant`: dialog · wide · side; `full`) | Modals: bottom sheet on phones, dialog/side panel on desktop. |
| `toast()`, `toast.error()` | Feedback for mutations (with optional action). |

Text helpers: `t-title t-headline t-callout t-caption t-eyebrow t-2 t-3
t-accent t-pos t-neg t-num t-mono t-clamp-2 t-clamp-3`. Layout helpers: `stack
stack-sm stack-lg row row-wrap spacer grid-2 grid-3 hscroll`.

Feature-specific styling goes in a CSS Module next to the component
(`components/<feature>/<Name>.module.css`) and uses only tokens.

## Shell contract (`useApp()` from `components/app/AppContext`)

- `navigate(path)` with `paths.*` from `lib/client/routes` — never `<a href>` for
  in-app moves, never `router.push`.
- `openAnalyze({ asset, cls, run })`, `openChat(ctx)`, `openSearch()`.
- `me`, `can(feature)`, `remaining(meter)`, `refreshMe()` — plan and allowance.
- `watchlist`, `isTracked(sym)`, `trackSymbol(sym, cls)`, `untrackSymbol(sym)`.
- Screens receive `active` (whether they're on screen). They stay mounted when
  hidden: don't refetch on every show; do refresh stale data on becoming active
  if it's older than a few minutes.

## Data + errors

- Client calls go through `apiFetch` / `apiStream` / `useApi` in
  `lib/client/api`. They throw `ApiError` with a readable `message`; a 402
  `upgrade_required` opens the paywall automatically.
- Server routes use `requireUser()` / `readJson()` / `fail()` from `lib/api`, and
  answer errors as `{ error, code? }`.
- Paid work goes through `gate(sb, user, "<route>")` from `lib/entitlements`
  after validation and before spending; call `refund()` if the work fails.

## States every screen handles

Loading (skeletons) · empty (EmptyState with a next step) · error (Callout with
retry) · offline (`ApiError.code === "offline"`) · locked (plan doesn't include
it: show what it is + "Upgrade" that calls `openPaywall`) · over allowance.

## Motion and feedback

`ui-enter` on screens (built in to `.page`), sheets slide up on phones. Respect
`prefers-reduced-motion` (global). Haptics come free with `Button`, `Row`,
`Switch`, `Segmented` and `toast`.

## Accessibility

Every icon-only control has a label. Lists use real buttons. Streaming regions
get `aria-live="polite"`. Contrast pairs in the tokens clear WCAG AA in both
themes — don't put `--text-3` on `--surface-3`.
