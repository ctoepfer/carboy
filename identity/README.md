# Identity configuration

`identity.json` is the single place the user-facing product identity is
defined: display name, short name, and (later) logo and icons under
`assets/`. The default development identity is "Carboy".

- Change the `brand` section to rebrand. Nothing else in the repository
  should need to change.
- `codename` and `technicalIdentifiers` are not branding. They are stable and
  must never be derived from `brand`.
- No application reads this file yet; once the toolchain is selected, the
  application build reads it for window titles, the about box, installers,
  and store metadata.

Policy and the persistent-identifier register:
[`docs/architecture/NAMING.md`](../docs/architecture/NAMING.md).
