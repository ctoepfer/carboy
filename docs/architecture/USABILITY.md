# Usability, Accessibility, and Localization v0 (draft)

- Status: **Draft v0 (Phase 1). Planning only. Nothing here is frozen.**
- Date: 2026-10-13
- Decision owner: Charles Toepfer
- Freezes: rules U1–U12 before the first real UI string (Phase 4); the
  message format and catalog layout with D-010 (end of Phase 1); launch
  languages and the conformance statement before Phase 6.

This page plans three things that cut across every phase:

1. **Accessibility**: people with disabilities can do every essential task,
   with their own assistive technology (screen readers, magnifiers, voice
   control, switch access, braille displays) and their own OS settings.
2. **Localization**: the interface works in other languages, number
   formats, and unit systems, and translations can be added as language
   packs without touching code.
3. **The GUI feature set** that both depend on, mapped to phases.

It builds on the existing commitments: principle 7 of the
[project plan](../project/PROJECT_PLAN.md) (WCAG 2.1 AA minimum, 2.2 AA
target), AGENTS.md front-end rules, editor-command rule C8 (every drag has a
command), and the Phase 1 accessibility findings in
[GRAPH_REPORT.md](../../spikes/phase1/GRAPH_REPORT.md).

Facts about platforms and libraries below are marked **verified** (with
where) or **to verify**. Nothing marked "to verify" may be relied on until a
spike or test confirms it.

## Principles

| # | Rule | Why / from |
|---|---|---|
| U1 | **Everything is a command first, a gesture second.** Any action a pointer or drag can do is an editor command reachable by keyboard, by menu or command palette, and (Phase 8) by the local connector | EDITOR_COMMANDS C8; WCAG 2.1.1, 2.5.7 |
| U2 | **Native semantics before ARIA.** Use real HTML controls; use ARIA only for widgets HTML lacks (graph, tree, grid), following the WAI-ARIA Authoring Practices patterns | Assistive technology support is best for native elements |
| U3 | **The list view is complete.** The graph is never the only way to see or edit anything; the ingredient and process lists are a full equivalent | D-015; WCAG 1.3.1 |
| U4 | **No meaning by colour, motion, or sound alone.** Provenance, warnings, SRM colour, and alarms always carry text (and an icon where useful) | WCAG 1.4.1, 1.3.3 |
| U5 | **Respect the user's OS settings**: text size, zoom, colour scheme, increased contrast / forced colours, reduced motion. Never override them with fixed sizes or forced animations | WCAG 1.4.4, 1.4.10, 1.4.12, 2.3.3 (AAA, adopted) |
| U6 | **Visible label = accessible name start.** Voice-control users say what they see | WCAG 2.5.3 |
| U7 | **Recipe Core speaks codes, not sentences.** Diagnostics, warnings, and statistic labels leave Core as stable codes plus structured `details`; the UI turns them into words in the user's language | EDITOR_COMMANDS §6 already does this; invariant 11 |
| U8 | **No string literals in UI code.** Every user-visible string comes from a message catalog with a stable key and a translator note | Makes language packs possible; testable by lint |
| U9 | **Language, number format, and units are three separate settings.** A US brewer may use metric; a German brewer may use °P and litres in English | Brewing practice; RECIPE_SCHEMA §5 typed quantities |
| U10 | **Display never changes data.** Unit conversion, rounding, and number formatting are display-only; stored quantities, decimal strings, and hashes are untouched | RECIPE_SCHEMA; invariant 6 |
| U11 | **Undo and preview instead of confirmation dialogs** for recipe edits; irreversible actions (delete library item, hardware control) are rare, explicit, and still keyboard- and screen-reader-operable | WCAG 3.3.4 (applied beyond legal/financial); cognitive load |
| U12 | **User-written text is never translated or rewritten**; it is marked with its language so screen readers pronounce it correctly | WCAG 3.1.2; provenance |

## 1. Accessibility

### 1.1 Who we design for

| Need | Typical tools | What it demands of Carboy |
|---|---|---|
| Blind / low vision (screen reader) | NVDA, JAWS, Narrator (Windows); VoiceOver (macOS, iOS); Orca (Linux); TalkBack (Android); braille displays through these | Correct names, roles, states; logical reading and focus order; status messages announced; units and numbers spoken clearly |
| Low vision (magnification, contrast) | OS zoom and magnifiers, browser/webview zoom, high-contrast or forced-colour themes | Reflow at 400 % zoom without horizontal scrolling; contrast ≥ 4.5:1 text, 3:1 controls; forced-colours mode intact; focus visible and not hidden |
| Motor (keyboard only, switch, voice, eye tracking, tremor) | Keyboard, Switch Control / Switch Access, Voice Control, Voice Access, Dragon, eye trackers emulating a pointer | Everything by keyboard; no traps; no drag-only or precision-only actions; targets ≥ 24 × 24 CSS px (WCAG 2.5.8); single-key shortcuts can be turned off or remapped (WCAG 2.1.4) |
| Cognitive, learning, attention | Reading aids, OS text-to-speech, spell check | Plain language, consistent layout and naming, errors that say how to fix them, no time limits, step-by-step guided creation, undo everywhere |
| Deaf / hard of hearing | — | Timer and hardware alarms visual and haptic as well as audible; any future video captioned |
| Vestibular / photosensitive | OS "reduce motion" | No auto-animating graph layout when reduced motion is on; nothing flashes more than three times per second (WCAG 2.3.1) |
| **Situational** (brew day) | Wet or gloved hands, steam, glare, noise, standing at a distance | Large touch targets, high-contrast brew-day view, alarms that don't depend on sound, screen kept awake while a timer runs (Phase 7) |

### 1.2 How Carboy reaches assistive technology

Carboy's UI is HTML in a system webview (ADR 0003, Proposed). Assistive
technology does not talk to Carboy directly; it talks to the operating
system's accessibility API, which the webview fills from the page's
accessibility tree. **Compatibility with third-party assistive software
therefore comes from one thing: a correct accessibility tree, in every
webview we ship.** We do not build screen-reader-specific code paths.

| Platform | Webview (ADR 0003 candidate) | OS accessibility API | Status |
|---|---|---|---|
| Linux | WebKitGTK | AT-SPI 2 | **Verified** for the spike pages via `spikes/phase1/tools/atspi_check.py` (2026-10-13); speech by ear not yet checked |
| Windows | WebView2 (Chromium) | UI Automation (and MSAA/IA2 for older readers) | To verify (CI run; Accessibility Insights inspection; NVDA by ear) |
| macOS | WKWebView | NSAccessibility | To verify (Accessibility Inspector; VoiceOver by ear) |
| iOS | WKWebView | UIAccessibility | To verify (Phase 12; device or simulator) |
| Android | Android System WebView | AccessibilityNodeInfo | To verify (Phase 12; device) |

Consequences:

- **No canvas-only or WebGL-only UI.** Anything drawn on a canvas (charts,
  SRM swatches) also exists as accessible text or a data table.
- **Each webview is tested, not assumed.** The same HTML can produce
  different trees in WebKit and Chromium (the spike already found a
  library quirk, GRAPH_REPORT AT-SPI item 2).
- If a webview proves unable to expose an essential widget correctly, that
  is evidence against it in ADR 0003, alongside performance.

### 1.3 Build rules (apply from the first real UI in Phase 4)

**Structure and names**
- One `<h1>` per view; landmarks (`nav`, `main`, named `region`s) as the
  spike pages already use; headings that make sense in a heading list.
- Every control has a visible label; icon-only buttons have an accessible
  name and a tooltip that is also reachable by keyboard focus (WCAG 1.4.13).
- Composite widgets follow the APG pattern with that pattern's keyboard
  model: tree (process list stages and steps), grid (ingredient table),
  combobox (ingredient search), dialog, tabs, menu.
- The graph keeps the spike's model: nodes named "Stage N of M: name,
  K additions", Carboy's own descriptions, Delete disabled (the graph never
  deletes), connection handles hidden from the tree.

**Numbers and units** (a brewing-specific problem)
- Abbreviations are ambiguous when spoken: "°P", "SRM", "IBU", "g/L",
  "1.064". Each unit token has a short and a long message
  (`kg` → "kg" / "kilograms"); the long form is the accessible name or
  description where the short form is shown.
- Gravity readings, temperatures, and colour values are read with their
  scale ("specific gravity 1.064", "colour 8 SRM, amber"); the colour
  name comes from a message, never from the swatch alone.
- Calculated values announce their provenance on request ("calculated by
  Tinseth, version 1"), matching invariant 7.

**Status and change**
- Results of an action (saved, preview ready, command rejected, moved to
  position 2 of 8) use a polite live region (WCAG 4.1.3). Errors that block
  an action move focus to the error summary.
- Recalculation is announced **once, after a committed change**, not on
  every keystroke: "OG 1.064 → 1.071". Rapid live-region updates make
  screen readers unusable.
- After a command, focus stays on or returns to the edited item; after
  undo, focus returns to what was undone.

**Visual**
- Design tokens (starting from Lumina's `tokens.css`, REUSE_BASELINE) define
  light, dark, and increased-contrast themes; contrast is checked on the
  tokens, so components inherit it. User-installed themes are data-only
  token packs that cannot go below AA contrast or remove focus indicators
  ([ADR 0008](adr/0008-extension-model.md)).
- Support `prefers-color-scheme`, `prefers-reduced-motion`,
  `prefers-contrast`, and `forced-colors` (support in each webview: to
  verify; see §5).
- Text sizes in `rem`, layout in logical properties (also needed for RTL,
  §2.5); reflow down to 320 CSS px width.
- Focus indicator always visible and never covered by sticky headers or
  panels (WCAG 2.4.7, 2.4.11); sized at least 2 CSS px with 3:1 contrast
  (WCAG 2.4.13, AAA, adopted).

**Time**
- No session or form time limits. Brew timers and hardware alarms are
  real-time events (WCAG 2.2.1 exception), so they must be multi-modal:
  text, visual, OS notification, sound, and vibration where available, and
  snoozable by keyboard.

### 1.4 Working with other software (beyond assistive technology)

Some users drive their computer through software that is not a screen
reader: voice assistants, automation tools, scripting, or an AI agent
acting for them. Carboy supports these through contracts it already has,
rather than through special accessibility features:

| Channel | Provided by | Phase |
|---|---|---|
| Keyboard shortcuts and a command palette that lists every command by name | UI over the editor command contract | 4 |
| Voice control "click *label*" | Visible label = accessible name (U6) | 4 |
| Local automation and AI agents operating the app | Local connector over the AI tool surface ([AI_TOOLS.md](AI_TOOLS.md)): the same commands, previews, and proposals as the UI | 8 |
| Reading a recipe in any tool | Native JSON format; printable summary as semantic HTML (headings, tables with headers) that screen readers and text-to-speech read well; plain-text export (proposed, UQ8) | 4 |
| Other recipe software | BeerXML with loss reports | 4 |

The safety rules stay: the local connector proposes, the user accepts
(invariant 8), and no channel reaches hardware except the verified
controls of Phase 10.

### 1.5 Verification

| Check | How | When |
|---|---|---|
| Automated rules | axe-core (MPL-2.0) on every page in CI, per webview where the runner can drive it | From Phase 4; trial in Phase 1 (§5) |
| Accessibility tree | `atspi_check.py` on Linux (exists); equivalent inspection on Windows (UI Automation) and macOS | Phase 1 onward, per platform |
| No hard-coded strings | Lint rule for U8; pseudo-locale run (§2.6) | From Phase 4 |
| Keyboard-only | Scripted end-to-end runs of the Phase 4 exit workflow without a pointer | Phase 4, 5 |
| Screen readers by ear | Matrix: NVDA + Windows, Narrator, VoiceOver macOS, Orca Linux; TalkBack and VoiceOver iOS in Phase 12 | Each phase exit from 4 |
| Zoom, reflow, forced colours, reduced motion | Manual checklist per platform | Each phase exit from 4 |
| Voice control and switch access | Manual, at least one platform each | Phase 6 |
| People with disabilities | Testers who use assistive technology daily (UQ7) | Before Phase 6 |
| Conformance statement | Published WCAG 2.2 AA statement listing known gaps | Phase 6 |

Automated tools find only part of the problems; the manual matrix is the
evidence for "supported", as with every other support claim (principle 5).

## 2. Localization

### 2.1 What is and isn't localized

| Content | Localized? | How |
|---|---|---|
| UI text, menus, labels, help | Yes | Message catalogs (§2.2) |
| Diagnostics, warnings, statistic names | Yes | Rendered in the UI from Core codes plus `details` (U7) |
| Unit names and abbreviations | Yes | Messages per unit token; tokens themselves never change |
| Numbers, dates, times | Formatted per locale | CLDR data via the platform's `Intl` (to verify per webview, §5) |
| Units shown | Per **unit preference**, not language (U9) | Display conversion only (U10) |
| Recipe names, notes, user ingredient names | **No** (U12) | Stored as written, tagged with a language (UQ5) |
| Catalog ingredient names | Later, where the data licence allows | D-009; catalog entries may carry names per language |
| Style names (BJCP etc.) | Only if the publisher's terms allow | D-020 |
| Brand name | Not translated; inserted from `identity/identity.json` | Messages reference the brand by placeholder, never literally (NAMING.md) |
| AI rationale text | In the user's language when the model can | The UI passes the locale to the assistant (Phase 8); commands stay language-neutral |
| Printable summary | Yes, in the chosen UI language and units | Same catalogs |

### 2.2 Message catalogs

- Each string has a stable key (`recipe.edit.preview-button`), a source
  English text, and a translator note saying where it appears.
- Messages use a format with **plural, select, and placeholder** support,
  because brewing text is full of counts and quantities ("3 additions",
  "1 addition"). Candidates, both open source and supported by common
  translation platforms (support claims: to verify):
  - **Project Fluent** (Mozilla; Apache-2.0; `@fluent/bundle`)
  - **ICU MessageFormat** (via FormatJS, MIT), or its successor Unicode
    MessageFormat 2 (status of JS implementations: to verify)
  The choice is UQ2 and depends on D-010 (React vs. Svelte), so it is
  evaluated in the Phase 1 spike.
- Messages contain **no HTML**. Formatting (bold, links) is applied by the
  UI around placeholders. This keeps translations from injecting markup and
  keeps the accessibility tree predictable.
- Diagnostic messages follow the existing rule: user text appears only in
  labelled `details`, never interpolated into `message`
  (EDITOR_COMMANDS §6). Localized rendering keeps that rule.

### 2.3 Language packs

A **language pack** is a set of catalog files for one locale (BCP 47 tag,
RFC 5646), plus metadata: locale, catalog version it targets, completeness
percentage, translators, and licence (Apache-2.0, same as the code).

- **Shipped packs are bundled** in the app build: offline-first
  (invariant 1) means no download at first run.
- A missing key falls back to the next locale in the chain (`de-AT` → `de`
  → `en`), and the UI shows which strings are untranslated only in a
  developer mode.
- **User-loaded packs** (a translator testing work, or a community language
  not yet shipped) are UQ3. If allowed, they are plain message files, read as
  text, validated against the source catalog's keys and placeholders, and
  never able to run code or include markup.
- Packs are versioned with the catalog; a pack for an older catalog still
  loads, with fallbacks for new keys.

### 2.4 Numbers, units, and input

- **Display**: numbers are formatted from Core's decimal strings, never via
  a binary float, so rounding is decimal and matches the hash-stable value.
  Whether the webview's `Intl.NumberFormat` formats decimal **strings**
  exactly (ECMA-402 2023 behaviour) is to verify per webview; if not, a small
  formatter over decimal strings is used.
- **Input**: users type numbers in their own convention. The parser accepts
  the locale's decimal separator; input whose meaning is ambiguous (for
  example "1.000" where "." is a grouping separator) is **rejected with a
  message**, never guessed. The existing preview step shows the interpreted
  value before anything is saved; this is already how the spike's Edit
  control works ("the UI normalizes what was typed").
- **Unit preferences** per dimension: volume, mass, temperature, gravity
  scale (SG, °P, Brix), colour (SRM, EBC), bitterness (IBU), pressure,
  carbonation (volumes, g/L). Defaults are suggested from the region; the
  user can change each. Gravity-scale conversion uses the versioned
  formulas only (RECIPE_SCHEMA Q2 decision).
- **Dates and times** follow the locale; durations in recipes (boil 60 min)
  use unit messages.

### 2.5 Scripts and direction

- Layout uses CSS logical properties (`margin-inline-start`, not
  `margin-left`) from Phase 4, so right-to-left languages need no rework.
- Every view sets `lang` and `dir`; user text carries its own `lang` (UQ5)
  and `dir="auto"`.
- Process graph direction in RTL (mirror the flow or keep it left-to-right
  like a timeline) is UQ6.
- Fonts: system font stacks, so CJK, Arabic, and other scripts render with
  the OS's fonts and the user's font settings. No bundled Latin-only fonts
  for body text.
- Japanese matters early because of sake: terms such as *koji*, *moto*,
  *sandan shikomi* need a glossary decision (translate, transliterate, or
  both) per language.

### 2.6 Translation workflow and quality

- **Pseudo-locales** in CI from Phase 4: an expanded, accented locale
  (finds hard-coded strings and layouts that break with roughly 30–40 %
  longer text) and a mirrored RTL locale.
- **Glossary** of brewing terms per language, reviewed by people who brew
  in that language; a wrong technical term is worse than an English one.
- **Translation platform** (UQ9): candidates include Weblate (open source;
  free hosting for libre projects: to verify current terms), Crowdin,
  Transifex, or pull requests only. Decided before Phase 6; any platform
  must export standard catalog files committed to this repository, so the
  repository stays the source of truth.
- Screenshots or a running pseudo-locale build for translators' context.

## 3. GUI feature plan

Features that make Carboy usable, with where they land. "Spike" means
throwaway code exists in `spikes/phase1/`; it informs the real build but is
not carried over.

| Feature | Phase | Status | Accessibility / localization notes |
|---|---|---|---|
| Navigation shell with named landmarks | 4 | Spike | Skip link to main content; current page announced |
| Recipe summary with calculated statistics and provenance | 4 | Spike (OG only) | Provenance as text, not colour; long unit names |
| Edit with preview and diff before saving | 4 | Spike (one command) | Diff readable as a list, not only as colour highlights |
| Undo / redo | 4 | Next agent task | Announced ("Undid: amount of Pale malt"); focus returns |
| Revision history per recipe | 3–4 | Next agent task (Library page) | Tree or list with parent links readable as text |
| Ingredient search and catalog | 3–4 | Planned | APG combobox; localized catalog names when licensed |
| Process list (stages and steps) | 4 | Planned | APG tree; reorder by keyboard and menu |
| Process graph | 5 | Spike (two candidates) | Non-drag move, no delete in graph, list equivalent |
| Command palette and shortcut reference | 4 | Planned | Every command by localized name; shortcuts remappable, single-key shortcuts can be turned off |
| Preferences: language, units per dimension, theme, motion, density, shortcuts | 3–4 | Planned (Phase 3 "preferences stored separately") | Stored apart from recipes; never in hashes |
| Validation messages and import review | 4 | Planned | Error summary with links to fields; codes rendered per locale |
| Guided recipe creation for new brewers | 4 or 7 (UQ10) | Planned (product brief "guided creation") | Step-by-step, one decision per step, plain language |
| Printable summary | 4 | Planned | Semantic HTML; prints in chosen language and units |
| Help with sources ("where every number comes from") | 4 | Planned | Reachable by keyboard from each statistic |
| Autosave and recovery | 3 | Planned | Recovery offered in a dialog, never automatic overwrite |
| Brew-day mode (timers, large targets, high contrast, screen awake) | 7 | Planned | Multi-modal alarms; situational accessibility |
| Charts (fermentation curves, measurements) | 7, 9 | Planned | Data table alternative; no colour-only series |
| Mobile layouts | 12 | Planned | Adapted interactions, not a shrunken desktop (PROJECT_PLAN Phase 12) |

## 4. Phase placement

| Phase | Usability work added by this plan |
|---|---|
| 1 (now) | Measure webview support for the features this plan relies on (§5); choose the message format with D-010; record findings in the spike reports |
| 2 | Core outputs only codes and structured details (U7) for all diagnostics and statistic labels; unit tokens get message keys; recipe language tag if UQ5 is accepted (schema MINOR) |
| 3 | Preferences store: language, unit preferences, theme, motion, shortcuts |
| 4 | Catalog infrastructure and lint (U8); pseudo-locales and axe-core in CI; design tokens with three themes; command palette; keyboard-only exit workflow |
| 5 | Graph keeps spike accessibility rules; RTL decision (UQ6); screen-reader matrix on the graph |
| 6 | Launch languages (UQ1); conformance statement; AT matrix on every desktop platform; testers with disabilities (UQ7); translation platform (UQ9) |
| 7 | Brew-day mode; multi-modal alarms |
| 8 | Locale passed to AI; local connector as an automation channel |
| 12 | TalkBack and VoiceOver iOS; mobile text scaling and switch access |

## 5. Phase 1 additions (proposed, needs the owner's go-ahead)

Small measurements that fit the current spike and affect ADR 0003 and
D-010. Each is a check on the existing Tauri shell, not new product code.

1. **Media-query support** in WebKitGTK now, other webviews in the CI run:
   `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`,
   `forced-colors`; does each change when the OS setting changes?
2. **`Intl` support**: `NumberFormat` (including exact formatting of decimal
   strings), `PluralRules`, `DateTimeFormat`, `Locale`, `DisplayNames` for a
   sample of locales including `de`, `ja`, `ar`.
3. **Message format trial**: render the Recipe page's strings through each
   catalog candidate in both React and Svelte; record bundle size and
   developer ergonomics. Feeds D-010.
4. **Pseudo-locale and RTL pass** on the Recipe page and one graph page:
   does the graph library behave with `dir="rtl"`?
5. **axe-core** on every spike page in the webview; compare its results
   with the AT-SPI check.
6. **Zoom and text scaling**: 200 % and 400 % webview zoom and OS text
   scaling on the Recipe page; does Tauri pass OS text scaling to the
   webview?

## 6. Open questions

| # | Question | Recommendation | Decide by |
|---|---|---|---|
| UQ1 | Which languages ship with desktop 1.0? | **English at 1.0, with every string externalized and pseudo-locales passing**; other languages ship when a pack is complete and reviewed by a brewer who speaks it. German and Japanese are natural first candidates (brewing tradition; sake), not commitments | Phase 6 |
| UQ2 | Message format: Fluent or ICU MessageFormat (or MF2)? | Decide from the Phase 1 trial (§5 item 3), together with D-010 | End of Phase 1 |
| UQ3 | Allow user-loaded language packs, or bundled only? | Bundled for shipped languages; allow user-loaded packs in a translator/developer setting with the validation rules in §2.3 | Phase 4 |
| UQ4 | Unit preferences independent of language, per dimension, with regional defaults? | Yes (U9) | Phase 3 |
| UQ5 | Add an optional BCP 47 `language` member to the recipe (for names and notes), and allow it per note? | Yes, optional, schema MINOR; lets screen readers switch voice (WCAG 3.1.2) and tells translators/AI what language the user wrote in | Phase 2, with RECIPE_SCHEMA |
| UQ6 | In RTL languages, does the process graph flow right to left? | Mirror it (flow follows reading direction); confirm with an RTL-speaking tester | Phase 5 |
| UQ7 | Recruit testers who use assistive technology daily before 1.0? | Yes; at least one screen-reader user and one keyboard/switch or voice-control user | Before Phase 6 |
| UQ8 | Offer a plain-text (or Markdown) recipe export for reading in any tool? | Yes, as an export only (not an import format) | Phase 4 |
| UQ9 | Translation platform | Decide before Phase 6; must commit standard files back to this repository | Phase 6 |
| UQ10 | Guided creation for new brewers in 1.0 (Phase 4) or after (Phase 7)? | Owner's product call; it is the largest cognitive-accessibility gain | Phase 4 |
| UQ11 | Does the European Accessibility Act or another accessibility law apply to any part of the product (for example the paid Bridge, Phase 13)? | **Legal question for the owner; not answered here.** The app targets WCAG 2.2 AA regardless | Before Phase 13 |

## Evidence required to accept

- Phase 1 measurements (§5) recorded in the spike reports, with the webview
  and OS versions.
- UQ1–UQ6 decided or deferred with a target phase.
- Rules U1–U12 accepted, and AGENTS.md's front-end section pointing here.

## Sources

- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*,
  <https://www.w3.org/TR/WCAG22/>. Success-criterion numbers above refer to
  this document.
- W3C WAI, *ARIA Authoring Practices Guide*, <https://www.w3.org/WAI/ARIA/apg/>.
- IETF, RFC 5646, *Tags for Identifying Languages* (BCP 47),
  <https://www.rfc-editor.org/rfc/rfc5646>.
- Unicode, *Common Locale Data Repository (CLDR)*, <https://cldr.unicode.org/>.
- Project Fluent, <https://projectfluent.org/>.
- ICU, *Formatting Messages*,
  <https://unicode-org.github.io/icu/userguide/format_parse/messages/>.
- Deque, *axe-core*, <https://github.com/dequelabs/axe-core>.
- Carboy Phase 1 evidence: [GRAPH_REPORT.md](../../spikes/phase1/GRAPH_REPORT.md)
  (AT-SPI check, 2026-10-13).
