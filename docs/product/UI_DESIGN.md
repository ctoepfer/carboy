# Desktop UI Design Proposal v0

- Status: **Proposed. Nothing here is accepted or implemented.** Open decisions UD1–UD10 (§8).
- Date: 2026-11-07
- Decision owner: Charles Toepfer
- Prototype: [`spikes/ui-prototype/`](../../spikes/ui-prototype/README.md) (throwaway; simulated behaviour labelled in the page)
- Builds on: [USABILITY.md](../architecture/USABILITY.md) rules U1–U12 (accepted),
  [INVARIANTS.md](../architecture/INVARIANTS.md),
  [EDITOR_COMMANDS.md](../architecture/EDITOR_COMMANDS.md) (commands, diff, proposals),
  [RECIPE_LIBRARY.md](../architecture/RECIPE_LIBRARY.md) (revisions),
  D-006 (formula gate), ADR 0008 (themes are data-only tokens).

This proposal covers how the desktop app should look and behave in Phase 4:
the Recipe Library, the Recipe Editor, and change review. The aim is an
application that a new brewer finds approachable and an experienced brewer
finds fast.

**It decides nothing about architecture.** The UI framework (D-010), graph
library (D-017), message format (UQ2), application shell (ADR 0003), and
persistence (ADR 0006) stay open. The prototype is plain HTML, CSS, and
JavaScript with no dependencies, so it favours none of them. Autosave and crash
recovery are not designed here beyond what the editing model needs to assume
(§3.4).

## 1. Who and what for

Two kinds of user, both on the same screens:

- **Newer brewers** need plain words, visible state, clear next steps when
  something is missing, and forgiveness (undo, never a silent loss).
  Guided creation (UQ10) is a separate path for them and isn't covered here.
- **Experienced brewers** edit many numbers quickly. They need keyboard entry
  without dialogs, dense lists, and no confirmation prompts for routine edits.

Both need to trust the numbers: what was calculated, by which formula; what
was only stated by a source; what is unknown (invariant 7, D-006).

### Primary journeys

| # | Journey | Views |
|---|---|---|
| J1 | Find a recipe by name or style and open it | Library |
| J2 | Start a new recipe from nothing (stages, then ingredients) | Library → Editor |
| J3 | Adjust amounts, stages, and properties quickly by keyboard | Editor |
| J4 | Fill in missing information the app points to | Editor |
| J5 | Rearrange the process: move an addition to another stage, reorder stages; with or without the graph | Editor |
| J6 | Review what changed, save it as a revision, or discard it; recover from a failed save | Review |
| J7 | Review a suggestion (AI proposal or import) and accept or reject it as a whole | Review |
| J8 | Find out where a number comes from | Editor |

Later journeys this layout must leave room for, not prototyped: import review
with loss reports, revision history and comparison, scaling, catalog search
(after D-009), applying an equipment profile, printing, guided creation,
brew-day mode (Phase 7).

## 2. Navigation model

**One window, three connected views, one recipe open at a time.**

- A **navigation rail** on the start side: *Library*, then the open recipe's
  *Editor* (with the recipe name beneath) and *Review changes* (with an
  unsaved-change count), then *Commands*. The rail is a `nav` landmark with
  links; `aria-current="page"` marks where you are.
- **Library → Editor → Review** is the main path. A breadcrumb in each view
  gives the way back. The browser-style back and forward work, because each
  view has its own address.
- **Moving between views never loses work.** An unsaved draft stays with its
  recipe; the library marks it ("2 unsaved changes"). No "Save before
  leaving?" dialog (U11).
- **Commands are first** (U1): every action is on screen as a labelled
  control *and* in the command palette (Ctrl/Cmd+K). Shortcuts: Ctrl/Cmd+S
  save, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo, F6 / Shift+F6
  move between rail, view, and inspector. No single-key shortcuts by default
  (WCAG 2.1.4).
- On a view change, focus moves to the view's `h1` and the title changes.

Tabs for several open recipes, and multiple windows, are left out of 1.0
(UD9): they double the state to explain and test.

## 3. Editing model

### 3.1 One draft per recipe, edited by commands

The editor always shows the recipe's **working draft**. Every edit, whether
typed, picked from a list, or clicked, becomes one editor command
(EDITOR_COMMANDS) applied to that draft at once. There is no separate "edit
mode" and no Apply button per form.

- **Typed values commit on Enter or on leaving the field**; Escape cancels.
  A value that doesn't parse is never applied: the field keeps what was typed,
  shows the reason beside it, and focus stays (§4.6).
- **Undo and redo** cover every command. After undo, focus returns to the
  item that changed, and the change is announced once ("Undid: Cascade: 28.3 g
  to 21 g").
- **Status is always visible** in the header in words, with an icon: "Saved as
  revision 3", "2 unsaved changes", "Not saved yet".

### 3.2 Saving makes a revision

Saving turns the draft into a new immutable revision (RECIPE_LIBRARY).

- **Ctrl/Cmd+S and the Save button save directly** for your own edits. The
  status line confirms ("Saved 2 changes as revision 4"). This keeps the
  common case to one keystroke for experienced users (UD2).
- **Review changes** is always one step away and lists the semantic diff
  (EDITOR_COMMANDS §7): grouped by recipe, ingredients, process; each line
  with before and after in text, not only colour or strike-through; a
  **Revert** per line; recalculated statistics before and after; an optional
  description of the revision; then *Save as revision N*, *Keep editing*, or
  *Discard all changes*.
- **Discarding** is immediate and offers *Undo discard* in a status message,
  instead of asking first (U11).
- **A failed save** keeps the draft, shows an error with what happened, what
  is safe ("your changes are still here"), and what to do (*Try saving
  again*), and moves focus to it.

### 3.3 Suggestions always go through review

AI proposals and imports never write the recipe (invariant 8). They appear in
**Review changes** as a separate *Suggested change* with its author, the
revision it was written against, its stated reason (shown as written, U12),
the same diff, and *Accept* / *Reject*. Acceptance is all or nothing (E3).
While your own draft has unsaved changes, *Accept* is unavailable and says why;
rebasing and stale proposals follow EDITOR_COMMANDS §9 and need their own
screens later. Whether AI may write into an unsaved draft is D-014; this model
assumes it may not.

### 3.4 What this assumes about autosave and recovery

The draft is the unit autosave will protect. This proposal assumes, without
designing it: drafts are stored apart from revisions and never become
revisions on their own; after a crash, recovery offers the draft for review
rather than restoring it silently (USABILITY §3). Both stay tracked separately
and unstarted.

### 3.5 Ingredients and process without the graph

The list editor is complete on its own (U3, D-015):

- **Ingredients** are shown as **additions grouped by kind** (fermentables,
  hops, cultures, water agents, other), one native table per kind, because the
  useful columns differ per kind. Columns: ingredient, amount (editable),
  stage (a select: the non-drag *move addition*), timing, key properties, and
  *Remove*. Unknown properties show "Colour unknown", never a blank or a zero.
- **Process** is an ordered list of stages, each with its steps and the
  additions in it, and *Move earlier* / *Move later* (the non-drag *move
  stage*).
- **Inspector**: selecting an addition or stage shows its details in a side
  panel: amount, properties with their provenance ("From the recipe's source
  document", "Entered by you, not saved yet", "Unknown"), steps, move
  commands. With nothing selected it shows the recipe's own details. Below
  70em it moves under the lists.
- **Missing information** is listed under the statistics: each item says what
  is missing and has *Show*, which selects the item and puts focus in the
  field that fixes it.

### 3.6 The graph, when present

The graph is another view of the same draft (principle 1), shown above the
stage list and hidden with one switch. **Selection is shared**: choosing a
stage in the graph selects it in the list and inspector, and choosing an
addition highlights its stage in both. Every graph action is a command with a
button elsewhere; the graph never deletes; arrow keys move between stages;
stages are named "Stage N of M: name, K additions" (the spike's tested
phrasing). The prototype draws a plain stand-in, not a graph library.

## 4. Visual foundation

The tokens are in [`spikes/ui-prototype/tokens.css`](../../spikes/ui-prototype/tokens.css).
Components use nothing else, so themes stay data-only (ADR 0008).

### 4.1 Typography

- **System fonts** (`system-ui` and platform fallbacks): native feel on each
  OS, every script covered, the user's font settings respected (USABILITY §2.5).
- **Sizes in rem**, so OS text size and zoom apply: 13, 14, 16 (body), 18, 22
  (view title), 28 px (statistic values).
- **Tabular numerals** for amounts, statistics, and diff values, so columns of
  numbers line up.
- Weight 600–700 for headings and labels; no all-caps (it doesn't localize and
  reads worse).

### 4.2 Spacing and shape

A 4 px base: 4, 8, 12, 16, 24, 32, 48 px (Lumina's scale plus two steps).
Radii 5 and 9 px. One soft shadow for panels. Content up to 1440 px wide.

### 4.3 Colour

Neutral cool greys for structure, a dark navy rail, and **one warm amber accent**
for the primary action and selection: malt and wort colours, distinct from the
blue focus ring and the status colours. The light palette starts from Lumina's
tokens (the maintainer's own code, D-002); the accent was darkened for text
contrast, and Lumina's orange focus colour (2.2:1 on white) replaced with blue.

| Role | Light | Dark | Increased contrast |
|---|---|---|---|
| Text / surface | `#172033` / `#ffffff` | `#e6ebf2` / `#19202a` | `#000000` / `#ffffff` |
| Accent (primary button, selection) | `#a84d17` | `#f0965c` | `#7a2e00` |
| Focus ring | `#2457c5`; `#8ab4ff` on the rail | `#8ab4ff` | `#0000c8`; `#ffff00` on the rail; 4 px |
| Danger, success, warning, info | `#9d2727`, `#246b3c`, `#815d08`, `#175a78` | `#ff8f86`, `#7fd49a`, `#e8c35a`, `#7cc4e4` | darker, on white |
| Simulated (prototype only) | `#5b4a8a`, dashed | `#c3b5f0` | `#3b1f7a` |

**Contrast, measured** with the WCAG 2.x formula on 27 pairs per theme
(text on every surface, muted text, links, accent text, text on the accent,
the rail, control borders, focus ring on every background, each status colour
on its tint): **all 81 pass**. Lowest per theme: control borders, 3.34:1 on the
light page background and 4.17:1 on dark panels (3:1 needed); 8.06:1 in increased
contrast. The first
measurement failed the focus ring on the dark rail (2.36:1), which is why the
rail has its own focus colour.

The dark theme follows the OS setting unless chosen; the increased-contrast
theme follows `prefers-contrast: more` unless chosen; forced-colours mode
(Windows contrast themes) uses system colours, keeps borders, and marks
selection with an outline.

### 4.4 Information hierarchy

In the editor, from the top:

1. **Identity and state**: recipe name, style, method, source badge, save
   status, and the four actions (Undo, Redo, Review changes, Save).
2. **Statistics**: one card each, value first. A card never shows a number in
   the calculated position unless Recipe Core calculated it. A number stated by
   a source is labelled *Stated estimate*; a statistic without an accepted
   formula says *Not calculated: no accepted formula yet*; one with an unknown
   input names what is missing. *Source* expands the explanation (J8).
3. **Missing information**, only when there is something to fix.
4. **Ingredients**, then **Process** (with the graph), then **Notes**; the
   **inspector** beside them.

### 4.5 Control states

| State | How it shows (never by colour alone, U4) |
|---|---|
| Focus | 3 px ring, 2 px offset, ≥ 3:1 against every background; never hidden under the status bar (`scroll-padding`) |
| Hover | Background tint; underline on links |
| Pressed / active | Darker tint |
| Selected (row, stage, node) | Tint, a 4 px start-edge bar or heavier border, and `aria-pressed` |
| Related (the stage of the selected addition) | Double border |
| Unavailable | 55 % opacity, still focusable, `aria-disabled`; activating it says why |
| Invalid | 2 px danger border, ✕ and a message that says how to fix it, `aria-invalid`, linked by `aria-describedby` |
| Unknown value | "Unknown" in words, with "!" |
| Unsaved | "● N unsaved changes" in the header, the library, and the rail |
| Simulated (prototype only) | Dashed border and a *Simulated* badge |

### 4.6 Errors and messages

Messages say what happened, what is safe, and what to do, in plain words:
"“1,5” is ambiguous: use a point for decimals, for example 1.5" rather than
"Invalid input". Numbers are never guessed (USABILITY §2.4). Forms with several
fields show an error summary that takes focus and links to each field.
Results of actions go to one polite live region, announced once per committed
change, not per keystroke (USABILITY §1.3). Every string comes from the
message catalog (U8); recipe text is shown as written and marked with its
language (U12).

### 4.7 Density

*Comfortable* is the default: 40 px controls, 16 px table text. *Compact*: 32 px
controls, 14 px text, tighter rows, with every target still at least 24 px
(WCAG 2.5.8). Density is a preference (USABILITY §3), stored apart from
recipes.

## 5. Recommended direction and tradeoffs

**Recommendation: the "workbench" direction shown in the prototype.** Calm
neutral surfaces, one warm accent, a dark rail, native controls, list-first
editing with an inspector, and a graph that follows the list. It looks like a
modern desktop app rather than a web form, and it leaves the brewing data as
the most prominent thing on screen.

| Choice | Benefit | Cost | Alternative considered |
|---|---|---|---|
| Native tables and buttons, not an ARIA grid | Works with every screen reader without custom keyboard code (U2) | Tab passes through every field in long recipes | APG grid with arrow-key cell navigation: faster for experts, more to build and verify per webview. Revisit if testing shows Tab fatigue (UD5) |
| Grouped tables per ingredient kind | Columns fit each kind; scanning a grain bill is easy | A dry hop appears under Hops, not under Fermentation (the process list shows it there) | One mixed table sorted by stage: matches the process, but most columns are blank for most rows |
| Inspector panel | The list stays dense; details have room and provenance | Needs 70em width; below that it moves under the lists | Expanding rows: no side panel, but rows jump and lose their place |
| Commit on Enter or leaving the field, undo instead of confirmation | Fast; forgiving | A mistyped value lands in the draft (one undo away) | Per-form Apply: slower, and loses edits when leaving |
| Direct save; review optional for own edits | One keystroke for experts | Some users won't look at the diff before saving | Review on every save: safer for beginners, slower; could be a preference (UD2) |
| Stated figures shown, labelled | Users see the numbers they expect from a source document | Risk of being read as Carboy's result | Hide stated figures until formulas are enabled: safer, less useful (UD7) |
| System fonts | Native, every script, no download | Looks a little different on each OS | Bundled typeface: consistent, but Latin-only fonts break localization |
| Amber accent | Warm, brewing-related, not used for status | Close to the warning hue | Blue accent: conventional, but collides with the focus ring and links |

## 6. Prototype

[`spikes/ui-prototype/`](../../spikes/ui-prototype/README.md) shows the three
views with realistic data: the example recipes
([EXAMPLE_BEER_RECIPES.md](EXAMPLE_BEER_RECIPES.md); stated figures labelled
as external estimates), the owner's Schwarzbier as far as the parity fixture
records it (no culture, mash schedule, or fermentation: real missing data),
and a synthetic long recipe (9 stages, 37 additions, unknown values), labelled
"do not brew". Simulated behaviour is marked in the page: no Recipe Core, no
calculations, saving kept in memory, a graph stand-in, a failure switch.

**Checked on 2026-11-07 on Linux**, with `tools/check.js` driving Chromium
149 and Firefox 150 headless: 62 of 62 checks pass in both (keyboard paths,
focus after every action, validation messages, undo and redo, save, failed
save and retry, discard and undo, proposal acceptance, missing-data links,
the command palette, reflow at 320 px, no console errors or missing
messages). axe-core 4.13.0 in Chromium: no violations on the library,
editor (light, dark, increased contrast), long recipe, new recipe, and review
pages. The checks found eight defects, all fixed: among them a stale value
re-applied when undo re-rendered a focused field, the status bar covering the
bottom of the rail, an invalid `aria-pressed` value, and a hidden table header
that made the page scroll sideways at 320 px. Reading the screenshots found two
more: a clipped *Remove* column and a review line that didn't say which of three
Cascade additions had changed.

**Not checked:** WebKit (Playwright's WebKit needs system packages that
weren't installed), any real webview (WebKitGTK, WKWebView, WebView2), macOS,
Windows, any screen reader by ear, zoom and OS text size, forced colours, and
any person using it. Those are §7.

## 7. Usability checklist

Task-based, for Linux, macOS, and Windows. Open the prototype in the browser
that uses the platform's webview engine: GNOME Web or another WebKitGTK
browser on Linux, Safari on macOS, Edge on Windows. A browser isn't the
webview, so the same tasks repeat in the real shell in Phase 4. The prototype
README has setup and a results template.

**[P]** needs a person watching or answering; **[SR]** needs someone listening
to a screen reader (Orca on Linux, VoiceOver on macOS, NVDA and Narrator on
Windows). Everything else can also be scripted, and partly is.

| # | Task | Passes when |
|---|---|---|
| T1 | Find the Märzen and open it, keyboard only | Found with search; opened with Enter; focus on its name |
| T2 | In the American Pale Ale (all grain), change the 15-minute Cascade addition to 21 g; then type `1,5`; then press Escape | Change applied and announced; `1,5` refused with a message saying how to fix it; Escape restores |
| T3 | Undo and redo that change | Value and focus return each time; one announcement each |
| T4 | In the same recipe, move the dry hop to the boil without a pointer; undo | Done with the stage list; announced; undone |
| T5 | Move the Boil stage earlier with buttons; then select a stage in the graph | Order and announcement correct; list and inspector follow the graph |
| T6 | In the long recipe, fill in the experimental hop's alpha acid from *Show* | *Show* lands in the right field; the missing item disappears |
| T7 | Turn on *Make saving fail*, save, then turn it off and retry | The error says the changes are safe; focus is on it; retry saves |
| T8 | Discard changes in Review, then undo the discard | Changes return |
| T9 | Open the Dubbel's suggestion with an unsaved change, then without | First blocked with a reason; then accepted as a new revision |
| T10 | Create a recipe: add a stage, then an ingredient with no name; fix it | Error summary takes focus and links to the field; the ingredient is added with unknown properties flagged |
| T11 | Do T3 and T7 from the command palette only | Both reachable by name |
| T12 **[P]** | Ask: "Did Carboy calculate this OG? What would make it calculate?" | The tester tells stated from calculated and names the missing input, unprompted |
| T13 **[P]** | Ask an experienced brewer to change five amounts in the long recipe | Time and errors noted; asked whether Tab-through rows are acceptable (UD5) |
| T14 **[P]** | Ask a newer brewer to start a recipe | Notes where they hesitate; whether the empty state tells them what to do |

**Settings and display (each platform):**

| # | Check |
|---|---|
| S1 | 200 % and 400 % zoom: nothing cut off, no sideways scrolling except inside wide tables |
| S2 | OS text size at its largest: text grows, nothing overlaps |
| S3 | Dark mode and increased contrast follow the OS; Windows contrast themes (forced colours) keep borders, focus, and selection visible |
| S4 **[P]** | Focus ring visible on every control in each theme, including the rail; never under the status bar |
| S5 **[P]** | View in greyscale, or with a colour-vision simulator: every state still distinguishable |
| S6 **[P]** | Overall impression: does it feel calm and modern; is anything hard to find? |

**Screen readers [SR] (Orca, VoiceOver, NVDA, Narrator):**

| # | Check |
|---|---|
| R1 | Headings list gives the view's structure; landmarks named (main navigation, location, inspector) |
| R2 | In an ingredient table, an amount field reads its ingredient and stage ("Amount of Cascade, Boil") and the hint |
| R3 | A refused value reads the error, once |
| R4 | Status messages (changed, moved, saved, undone) are spoken once, not repeated or cut off |
| R5 | The review diff reads "Before … After …", and *Revert* says what it reverts |
| R6 | Graph stages read "Stage 2 of 4: Boil, 3 additions"; pressed state spoken |
| R7 | The add-ingredient dialog: focus on open, error summary read, focus returns on close |
| R8 | Statistic cards: "No value" and "Not calculated: …" read clearly; units and gravity read sensibly |

## 8. Open decisions

| # | Question | Recommendation |
|---|---|---|
| UD1 | Adopt this direction (§5) as the Phase 4 starting point? | Yes, after T12–T14 with at least one newer and one experienced brewer |
| UD2 | Save directly, or always through review? | Direct save for your own edits; review mandatory for suggestions and imports. Optionally a "review before saving" preference |
| UD3 | Drafts separate from revisions; a revision only on an explicit save | Yes (shapes autosave, §3.4) |
| UD4 | Palette: neutral greys, navy rail, amber accent, blue focus (§4.3) | Yes, as the default light, dark, and increased-contrast token packs |
| UD5 | Ingredient editing: native tables per kind, or an ARIA grid | Native tables now; a grid only if T13 shows the need |
| UD6 | Details in an inspector panel | Yes, moving under the lists below 70em |
| UD7 | Show stated statistics from a recipe's source, labelled | Yes, never in the calculated slot; owner to confirm against D-006 |
| UD8 | Default density comfortable, compact as a preference | Yes |
| UD9 | One recipe open at a time in 1.0; no tabs or multiple windows | Yes |
| UD10 | Shortcut set (§2): Ctrl/Cmd+K, S, Z, Shift+Z, F6; no single-key shortcuts by default | Yes; shown in the palette, remappable later |

**Not decided here and still open elsewhere:** D-010 framework, D-017 graph
library, UQ2 message format, RECIPE_SCHEMA Q4 (whether layout edits make
revisions), D-014 (AI writing into drafts), D-015 (list-only 1.0), and the
autosave and recovery design.

## 9. Status of the work

Proposal and prototype only. **No production UI exists**, nothing here is wired
to Recipe Core, the Recipe Library, or the shell, and no part of Phase 4 is
started by it. The prototype is throwaway: it informs the real build and is
not carried over.
