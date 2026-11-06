# Equipment Profiles v0

- Status: **First slice implemented in Phase 3** in
  [`packages/equipment-profiles/`](../../packages/equipment-profiles/)
  (`@carboy/equipment-profiles`) and, for the recipe's snapshot, in Recipe
  Core ([RECIPE_SCHEMA §7.5](RECIPE_SCHEMA.md#75-equipment)). Nothing here is
  frozen.
- Date: 2026-11-05
- Decision owner: Charles Toepfer

A profile describes a brewer's system. A recipe never refers to one: it
holds a **snapshot**, copied as data, so that changing equipment can't change
a saved recipe (invariant 6). No hardware is involved: a profile is a
description, and it works with no device connected (invariant 4).

## Fields

The field table is closed, like the ingredient property table (Q9), and lives
in one place: `EQUIPMENT_FIELDS` in Recipe Core. Profiles, snapshots, and
commands all read it.

| Field | Dimension | Rule | Meaning |
|---|---|---|---|
| `batch_size` | volume | above 0 | The batch this system usually makes |
| `batch_capacity` | volume | above 0 | The largest batch it can make |
| `mash_capacity` | volume | above 0 | Mash tun volume |
| `boil_capacity` | volume | above 0 | Usable kettle volume |
| `pre_boil_volume` | volume | above 0 | Wort volume collected before the boil |
| `boil_time` | duration | above 0 | Usual boil length. A recipe's own boil stage is what counts for that recipe |
| `mash_tun_weight` | mass | above 0 | Mash tun weight |
| `mash_tun_specific_heat` | fraction | above 0 | Specific heat relative to water, so 0.12 means 0.12 cal/g/°C |
| `mash_tun_deadspace` | volume | 0 or more | Liquid left in the mash or lauter tun |
| `boil_off_per_hour` | volume | 0 or more | Volume lost in one hour of boiling |
| `boil_off_fraction_per_hour` | fraction | at most 100 % | Share of the volume lost in one hour of boiling |
| `kettle_top_up` | volume | 0 or more | Water added to the kettle |
| `hop_utilization_adjustment` | fraction | above 0 | Adjustment to calculated utilization. May pass 100 % |
| `trub_chiller_loss` | volume | 0 or more | Wort left behind with trub and in the chiller |
| `cooling_loss` | fraction | at most 100 % | Volume lost as wort cools |
| `fermenter_top_up` | volume | 0 or more | Water added to the fermenter |
| `brewhouse_efficiency` | fraction | at most 100 % | Efficiency assumption for this system |

These cover the BeerXML 1.0 EQUIPMENT record apart from its boil-size switch
(below), plus `cooling_loss`, `batch_capacity`, and `boil_capacity`. The first
full test case is the owner's own system, in its stated units.

Boil-off appears twice because brewers state it either way, and no
volume-per-time unit token exists. If one is added, that is a schema MINOR. A
stated zero is a value, and stays different from a value nobody stated.

**There are no defaults.** A value nobody stated is absent, and absent stays
absent: nothing is filled in from a typical system, and a new profile can be
empty. Reading a missing value reports it as missing.

## Provenance and measurement

Every value states where it came from: `{ value, unit, provenance }`, using the
origins of RECIPE_SCHEMA §6. A value the brewer measured has origin `measured`,
may say how in `provenance.note`, and may give `measured_on` (`YYYY-MM-DD`). Only
a measured value has a measurement date.

Measured values enter a recipe only through a profile snapshot. An AI channel
can't apply a snapshot, because it could label its own numbers measured (C7).
A value edited in the recipe (`set_equipment_field`) takes the channel's
origin and drops any measurement date, because it is no longer that
measurement.

## Versions

`createProfile` makes version 1, and `reviseProfile` makes the next version from
the last. The previous version isn't changed, so the versions are the system's
calibration history, and `changedFields` lists what differs between any two.
Storage is the Recipe Library's job; this package has none.

## Snapshots

`snapshotProfile` gives the data `apply_equipment_snapshot` copies into
`content.equipment`:

```json
{
  "based_on": { "profile": "…", "version": "3", "name": "Garage system" },
  "fields": {
    "boil_capacity": { "value": "40", "unit": "L", "provenance": { "origin": "manually_entered" } },
    "mash_tun_deadspace": {
      "value": "1.5", "unit": "L",
      "provenance": { "origin": "measured", "note": "filled with a jug" },
      "measured_on": "2026-10-01"
    }
  }
}
```

`based_on` records the source for the reader. Nothing resolves it, so a deleted
profile doesn't affect the recipe. Applying a newer version is an explicit edit
with a diff.

## What this doesn't do yet

- **No formula reads equipment.** A snapshot changes no calculated result, and
  the efficiency a calculation uses stays `targets.efficiency`. Connecting the
  two needs a defined rule, so it isn't assumed here.
- **Calculating boil size is not modelled.** A switch for it would promise a
  calculation that doesn't exist, so it waits for the volume formulas
  (FORMULA_COVERAGE: boil-off, shrinkage, losses). Until then `pre_boil_volume`
  is a stated value.
- Grain absorption is not a field yet. It is a volume per mass, with no unit
  token, and no formula reads it.
- Lumina's profiles aren't mapped yet (`batch_size`, `boil_size`,
  `mash_tun_deadspace`, `boil_off_rate`, `efficiency`, `trub_chiller_loss`).
  Mapping them needs a rule for `batch_size`, which states a default batch
  rather than a capacity.
- No storage, UI, calibration suggestions (Phase 7), or device connection.
