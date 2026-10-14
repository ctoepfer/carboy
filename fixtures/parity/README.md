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

## Running the fixtures in both languages (D-005)

- **TypeScript:** `npm test` runs `packages/recipe-core/test/parity.test.mjs`
  against every fixture here (Recipe Core within 1e-9 relative of
  Lumina's floats; OG at Lumina's three places).
- **Python:** `tools/parity/lumina_runner.py` re-runs each fixture's
  recorded producer (Lumina's `parse_beerxml` and `calculate_recipe_stats`)
  on the recorded source file, after checking its SHA-256, and requires
  Lumina's values to equal the fixture's exactly. It needs a local Lumina
  checkout, so it runs on a maintainer's machine, not in CI. It is
  read-only: no bytecode, no changes to Lumina.

  ```sh
  <lumina>/runtime/venv/bin/python -I tools/parity/lumina_runner.py --lumina <lumina>
  ```

  Exit status 0: every fixture reproduces; 1: a value or source file
  changed (Lumina drifted, or the fixture needs regenerating with a note);
  2: a fixture couldn't be run.

Last run 2026-10-14 (Lumina `632da60`, working tree with uncommitted
changes outside `stats_hooks.py`): all three fixtures PASS.
