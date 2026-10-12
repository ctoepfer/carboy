# Carboy — Product Brief

Status: Planning baseline, 2026-10-09. Name decided; everything else here is
direction to validate in Phase 0.

## Problem

Homebrewers, home winemakers, mead makers, cider makers, and home sake brewers
juggle spreadsheets, single-beverage desktop tools, manufacturer apps for each
device, and ad-hoc chat with AI assistants that cannot see or safely change
their recipes. Most recipe tools are beer-centric, import/export loses meaning,
and calculated numbers are presented with more confidence than their inputs
justify.

## Product

An offline-first, open-source recipe application that:

1. **Designs recipes** for beer, wine, mead, cider, and sake with deterministic,
   labeled calculations and validation.
2. **Improves recipes** by recording batches, comparing predicted with measured
   results, calibrating equipment profiles, and proposing (never silently
   applying) the next revision.
3. **Edits directly**: synchronized ingredient list, process list, and
   interactive process graph; mouse, keyboard, and touch.
4. **Works with AI on the user's terms**: local models, the user's own API key,
   local AI tools via a local connector, and — optionally, paid — cloud AI
   assistants through a hosted connector.
5. **Connects to local homebrew shops**: shopping lists and optional orders
   through a generic, shop-neutral connector.
6. **Monitors brewing hardware** through BrewIO (from `codesamples/brewpanel/`), with
   physically verified device support only.

## Users

| User | Needs |
|---|---|
| New homebrewer | Guided creation, clear warnings, understandable numbers, starter recipes |
| Experienced brewer | Precise control, equipment calibration, batch history, reliable exchange with other tools |
| Winemaker / mead / cider maker | Calculations that are not beer math in disguise: Brix/SG, sugar sources, acid, sulfite, nutrients |
| Home sake brewer | Multi-stage (sandan shikomi) schedules, koji/rice/water ratios, honest limits on prediction |
| AI-assistant user | Have an assistant read, critique, and propose recipe changes without corrupting data |
| Local homebrew shop | Receive accurate shopping lists/orders without being the only shop the app supports |

## Free vs. paid

| Capability | Tier |
|---|---|
| Recipe design, calculations, validation, library, revisions | Free, open source |
| Import/export (native, BeerXML), printing | Free, open source |
| Batches, guided brew day, recipe improvement | Free, open source |
| In-app AI with a local model or the user's own API key | Free, open source |
| Local AI connector (desktop AI clients on the same machine) | Free, open source |
| Hardware monitoring and verified controls | Free, open source |
| Shop connector and shop integrations | Free, open source |
| Mobile apps | Free, open source |
| **Carboy AI Bridge** (hosted service on its own domain): cloud assistants such as ChatGPT or Claude create and change recipes ("create an all-grain 5-gallon stout in Carboy"), online recipe library, sync with the app | **Paid, optional** |

Rules for the paid piece (see [ADR 0002](../architecture/adr/0002-open-core-boundary.md)):

- Nothing in the free product depends on it, degrades without it, or nags
  toward it.
- It exists as a paid service because it needs hosting, accounts, OAuth, and
  ongoing security operations — not because a feature was withheld.
- It never becomes the authority for recipe correctness; changes it carries
  are proposals validated by Recipe Core.
- Users opt in explicitly, choose what is shared, and can revoke and delete.

## Shop integration principles

The project is started by the owner of a local homebrew shop
(Pacific Brewing Supplies). That is an advantage for realistic requirements
and a risk for perceived neutrality. Therefore:

- The shop connector is a published, generic contract. Pacific Brewing
  Supplies is the first implementation, not a privileged one.
- The user chooses a shop (or none). No default shop is preselected.
- Shop systems remain authoritative for stock, prices, and orders. Carboy
  shows availability timestamps and never presents local data as live stock.

## Non-goals (unless separately approved)

- Mandatory accounts, mandatory cloud, or subscriptions for the core app.
- Free cloud sync of the recipe library. Online storage and sync exist only
  as part of the optional paid AI Bridge; the free app never requires them.
- Social/community recipe publishing.
- AI agents controlling brewing equipment.
- Downloadable executable plugins on mobile.
- Replacing every manufacturer app or supporting every device/firmware.
- Bookkeeping or inventory ownership.
- Spirits distillation workflows (home distillation of spirits is illegal
  without federal permits in the United States; Lumina's `wash` type is not
  carried over).

## Definition of success (first public desktop release)

A user installs Carboy, creates and edits a recipe for a supported beverage
by mouse, keyboard, or touch, understands where every number comes from,
saves it reliably, prints it, and exchanges it with other tools and Lumina —
without an account, AI, hardware, or network connection.
