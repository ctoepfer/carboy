# ADR 0002: Open-source core with one paid hosted connector

- Status: Accepted. Direction 2026-10-09; app license Apache-2.0 and Bridge as
  a separate private service (`carboy-bridge`) decided 2026-10-11 (D-001, D-003).
- Date: 2026-10-09 (updated 2026-10-11)
- Decision owner: Charles Toepfer

## Context

The owner wants Carboy to be free and open source, with one paid piece: an
online service that lets cloud AI assistants (ChatGPT, Claude on the web, and
similar) work across the tool. Cloud assistants run on vendor servers and
cannot reach an app on a user's desktop directly; they need a publicly
reachable, authenticated endpoint. That requires hosting, user accounts,
OAuth, abuse protection, and ongoing security operations — real costs that
justify a paid tier. At the time of writing, major assistant platforms
integrate external tools through the Model Context Protocol (MCP); verify
current connector requirements when Phase 13 starts.

## Decision

1. **Everything that runs on the user's devices is free and open source**:
   the app on every platform, Recipe Core, formats, calculations, in-app AI
   with local models or the user's own API key, the local AI connector,
   hardware integration, shop integrations, and the BrewIO protocol.
2. **The one paid piece is the hosted Carboy AI Bridge**: a separate,
   lightweight service on its own domain, in the private `carboy-bridge`
   repository (decided 2026-10-11; its language follows Recipe Core, ADR 0004;
   supersedes "built on Drupal", 2026-10-09). It imports Recipe Core directly
   as a library, so the same code validates and calculates in the app and in
   the Bridge. It stores the user's opted-in recipe library
   online, exposes an authenticated remote endpoint that cloud assistants call
   ("create an all-grain 5-gallon stout in Carboy", "add this recipe to my
   Carboy library"), and lets the Carboy app sync those recipes.
3. **The free product never depends on the paid piece.** No feature degrades
   without it; no nag screens; the app is complete offline.
4. **The AI Bridge is not a calculation authority.** Recipes and changes it
   carries are AI-proposed, validated and calculated by Recipe Core, and
   marked with provenance; edits to existing recipes are reviewed by the user
   (ADR 0007). Local data in the app stays authoritative on the device, and a
   lapsed subscription never locks users out of their recipes (export always
   available).
5. **The client side is open.** The app's connector client and the protocol
   it speaks are open source, so users can audit exactly what is shared.
6. **Opt-in and scoped.** Users choose what the connector may access, can
   revoke access, and can delete hosted data.

## Open questions

- **D-001** Decided 2026-10-11: Apache-2.0.
- **D-003** Decided 2026-10-11: the Bridge is a separate service
  in its own **private** repository (`ctoepfer/carboy-bridge`). Apache-2.0
  lets it import the open-source Recipe Core. The public sync/API contract and
  the app's Bridge client stay in the open-source repository.
- **D-011** Decided: **hosted copy.** The AI Bridge stores opted-in recipes,
  which makes Carboy a data custodian (privacy policy, retention, export,
  deletion, breach response). Open sub-questions: sync and conflict model,
  and where AI-created recipes are validated and calculated. The latter is
  resolved by D-003: the Bridge runs Recipe Core in-process.
- **D-012** Whether contributions need a CLA. Not required: the paid service
  is a separate codebase, and it uses contributed Apache-2.0 code (such as
  Recipe Core) under that license's own permissive terms.
- **D-013** Name and trademark availability for "Carboy" (not yet checked).

## Consequences

- Plan the connector as a late phase (Phase 13) on top of stable editing
  commands and the local AI connector (Phase 8), which defines the tool
  surface the hosted connector reuses.
- Accounts and privacy obligations are confined to the connector service.
- Pricing, payments, and terms of service are business decisions outside this
  ADR.
