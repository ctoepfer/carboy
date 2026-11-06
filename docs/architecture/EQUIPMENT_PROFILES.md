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
| `batch_capacity` | volume | above 0 | Largest batch the system makes |
| `mash_capacity` | volume | above 0 | Usable mash tun volume |
| `boil_capacity` | volume | above 0 | Usable kettle volume |
| `pre_boil_volume` | volume | above 0 | Wort volume usually collected before the boil |
| `mash_tun_deadspace` | volume | 0 or more | Liquid left in the mash tun |
| `trub_chiller_loss` | volume | 0 or more | Wort left behind with trub and in the chiller |
| `boil_off_per_hour` | volume | 0 or more | Volume lost in one hour of boiling |
| `brewhouse_efficiency` | fraction | at most 100 % | Efficiency assumption for this system |

`boil_off_per_hour` is a volume because there is no volume-per-time unit
token. If one is added, that is a schema MINOR.

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
- Grain absorption is not a field yet. It is a volume per mass, with no unit
  token, and no formula reads it.
- Lumina's profiles aren't mapped yet (`batch_size`, `boil_size`,
  `mash_tun_deadspace`, `boil_off_rate`, `efficiency`, `trub_chiller_loss`).
  Mapping them needs a rule for `batch_size`, which states a default batch
  rather than a capacity.
- No storage, UI, calibration suggestions (Phase 7), or device connection.
