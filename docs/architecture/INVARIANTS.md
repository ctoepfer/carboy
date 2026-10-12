# Invariants

Properties every change must preserve. A change that breaks one needs an ADR
that replaces the invariant explicitly; it is never broken by accident.

| # | Invariant | What it means in practice |
|---|---|---|
| 1 | **Offline-first** | Design, calculation, validation, storage, history, import/export, and printing work with no network. Local storage is authoritative on each device |
| 2 | **No mandatory account** | Every free capability works without signing in to anything |
| 3 | **No mandatory AI** | Disabling or never configuring AI leaves the application complete |
| 4 | **No mandatory hardware** | Equipment profiles, batches, and calculations work with no connected device |
| 5 | **No mandatory internet** | Nothing blocks on reachability: no license checks, telemetry gates, or online-only features in the free application |
| 6 | **Deterministic calculations** | The same recipe, settings, and formula versions always produce the same results on every platform and in the Bridge. One Recipe Core implementation; no second calculation engine anywhere |
| 7 | **Explainable value provenance** | Every value records where it came from (declared, imported, inferred, calculated, measured, manually entered, AI-proposed) and calculated values record formula ID, version, and assumptions. Unknown stays unknown, never zero |
| 8 | **AI suggestions require validation and approval** | AI produces proposals made of typed edit commands. Recipe Core validates them; the user reviews a diff and accepts. AI never writes storage directly, never overrides calculations, and has no path to hardware |
| 9 | **Open-source application independence** | The public application builds, tests, and runs without the private Bridge repository, service, or credentials. Dependencies point only from private to public |
| 10 | **Vendor-neutral shop connections** | Shops connect through a published, generic contract; the user chooses a shop or none; no default shop; shop systems stay authoritative for stock, prices, and orders |
| 11 | **Future cross-platform portability** | Domain logic has no UI, storage, network, device, or shell dependency, so it can run on desktop, mobile, and server. Platform services sit behind ports |
| 12 | **Configurable user-facing branding** | The brand lives only in `identity/identity.json`; no code, data format, or API depends on it ([NAMING.md](NAMING.md)) |

Related: batches are history (recipe edits never rewrite batches); imports
are reviewed before commit and never modify the source file; secrets never
appear in exports, logs, or prompts.
