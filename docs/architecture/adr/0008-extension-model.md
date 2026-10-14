# ADR 0008: Extension model: data packs, external integrations, build-time modules

- Status: Accepted (2026-10-13, owner)
- Date: 2026-10-13
- Decision owner: Charles Toepfer

## Context

The owner asked for a Drupal-like structure in which themes and features can
live outside the main project. Drupal-style runtime code modules conflict
with existing decisions: ADR 0001 rejected a runtime plugin system (mobile
store rules on downloaded code, security), the product brief excludes
downloadable executable plugins on mobile, and invariants 6 (one
deterministic calculation engine) and 8 (AI and other outside writers only
propose) need a single controlled path that changes recipe state.

The goal is mainly organizational: clear code separation, and control over
what can change the app and how.

## Decision

Extensions come in four tiers. Tiers A and B are the extension model.
Tier C is a design rule now and a feature later. Tier D is not planned.

| Tier | What | Rule |
|---|---|---|
| **A. Data-only packs** | Themes (design-token values only), language packs ([USABILITY.md §2.3](../USABILITY.md#23-language-packs)), ingredient catalogs, recipe templates, equipment presets | Loaded as data, validated against a schema, versioned, with licence and provenance. No scripts, markup, or templates. A theme may not lower contrast below WCAG AA or remove focus indicators. Packs never contain formulas |
| **B. External integrations** | Separate programs using published contracts: local connector ([AI_TOOLS.md](../AI_TOOLS.md)), sync protocol, shop connector, BrewIO host, file formats | Out of process; writes are proposals the user accepts (invariant 8); no hardware path except Phase 10's verified controls |
| **C. Build-time modules** | Code in separate repositories compiled into a build, the way Drupal's contributed modules come in through Composer | Not offered until the internal interfaces are stable (after 1.0) and a further ADR defines the public module interface. Official store builds include only modules the owner has reviewed |
| **D. Runtime code plugins** | Code loaded into a running app | Not planned. Revisit in Phase 14, desktop only and sandboxed, only with evidence of need |

**Design rule now (prepares tier C, adds no scaffolding):** each built-in
module ([OVERVIEW.md §2](../OVERVIEW.md#2-modules)) declares what it adds
(commands, views, settings, permissions, preferences) through one
registration point that the composition root reads, rather than being wired
in by hand-written special cases. Built-in modules use the same mechanism a
future external module would.

**Control rules for every tier:**
1. Only Recipe Core calculates; only editor commands change recipe state.
   No extension adds or replaces a formula.
2. Extensions are brand-neutral (NAMING.md) and cannot change technical
   identifiers or data formats.
3. Disabling or removing an extension never loses recipe data. Recipes do
   not depend on a theme or pack being installed (catalog values are
   snapshotted, as the catalog module already requires).

## Alternatives considered

- **Drupal-style runtime modules (tier D now)**: maximum flexibility, but
  blocked on mobile, a security and support burden, and incompatible with a
  single calculation engine unless heavily restricted. A stable hook API is
  also a long-term promise a small team can't make yet.
- **No extension model**: simplest, but themes and language packs are
  already needed (USABILITY.md), and separate code organization pays off
  inside the monolith anyway.

## Consequences

- ADR 0001 stays Accepted; this ADR fills in its "data-only extensions"
  clause and adds tier C as a later option.
- Apache-2.0 allows proprietary extensions. Whether official builds include
  only open-source modules is an owner decision when tier C is offered.
- The registration point is part of Phase 2–4 code reviews.

## Acceptance (2026-10-13)

Accepted by the owner as proposed: tiers A–D and the control rules.

- **Themes:** data-only design tokens. Light, dark, and high-contrast
  themes are supported. No arbitrary CSS and no executable themes at this
  stage. Every theme must keep the accessibility requirements (contrast
  floor, focus indicators; USABILITY.md).
- Built-in modules use the common registration mechanism with clear
  boundaries. Extensions can't change canonical recipe semantics or bypass
  validation.

Still to show (Phase 4): a first pack format (language pack or theme)
implemented and validated without special cases in the app shell.
