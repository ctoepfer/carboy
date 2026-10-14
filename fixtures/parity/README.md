# Parity fixtures

Inputs and expected results produced by **Lumina's own code**, run
read-only, so Recipe Core can be checked against the existing Python
implementation (D-005). Parity is not correctness: these fixtures show that
the two implementations agree, not that either formula is right.

| File | Recipe | Checks |
|---|---|---|
| `verdant-reverie-og-points.json` | Verdant Reverie Saison (owner's recipe) | Points-method OG (Phase 1 format) |
| `lumina/verdant-reverie.json` | Verdant Reverie Saison | `color.mcu`, points-method OG |
| `lumina/ultimate-coffee-schwarzbier.json` | Ultimate Coffee Schwarzbier (owner's recipe, real Grainfather export) | `color.mcu`, points-method OG |

Both recipes are the owner's and are cleared for publication as fixtures
(2026-10-11). Each file records the source file's SHA-256, the Lumina
revision, and how the values were produced. Lumina's values are Python
floats; Recipe Core's tests compare within 1e-9 relative.

Known difference kept on purpose: Lumina treats a missing colour or weight
as 0 in MCU; Recipe Core reports it as missing. None of these fixtures has
missing values.
