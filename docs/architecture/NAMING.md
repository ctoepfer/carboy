# Naming and Rebranding Policy

**Carboy is a permanent project codename, not the product brand.** The final
user-facing name is undecided. This policy keeps three kinds of names apart
so a future rebrand changes one configuration file and some assets, and
nothing that users' data or other software depends on.

## Three kinds of names

| Kind | Examples | Changes on rebrand? | Where it lives |
|---|---|---|---|
| **Codename** | Repositories `carboy`, `carboy-bridge`; package and module names; docs; internal tooling | **No.** Kept after any rebrand | Code and docs |
| **Brand** (user-facing) | Display name, short name, logo, icons, store listing text, website | **Yes** | [`identity/identity.json`](../../identity/identity.json) and `identity/assets/` only |
| **Data and protocol identifiers** | Recipe schema IDs and versions, recipe/revision IDs, native file extension and media type, API paths and versions, edit command names | **Never**, after first release | Defined by the contracts; deliberately **brand-neutral** |

The default development display name is "Carboy". Release builds read the
display name, short name, logo, and icons from the identity configuration;
UI text never contains a typed-in product name.

## Rules

1. **No brand in code.** Package names, module names, directories, database
   tables, schema properties, identifiers, CSS classes, log categories, and
   environment-variable prefixes use the codename or neutral names. They are
   never derived from `brand.displayName`.
2. **No brand in data.** A saved recipe, batch, export, or sync document must
   not contain the product brand or codename in any field the software
   interprets. Changing the brand must not change recipe schemas, stored
   recipe identities, calculation results, or API compatibility.
3. **Data-format identifiers are brand-neutral and decided once.** The native
   file extension, media type, and schema `$id` base are chosen in Phase 0
   contract work (D-016) and named after what they contain (for example, a
   recipe format), not after the product. A provisional brand is never used.
4. **No OS bundle identifiers yet.** Reverse-DNS application IDs, URL
   schemes, and per-OS data-folder names are permanent once published. They
   are not created until the toolchain is selected and their conventions are
   reviewed (Phase 1), and they are recorded in an ADR before Phase 6.
5. **Brand candidates stay out of the code.** Candidate names and their
   trademark research are business records kept in the private
   `carboy-bridge` repository. This public repository refers only to "the
   brand" and the identity configuration.

## Persistent identifiers register

| Identifier | Status | Decided in |
|---|---|---|
| Repository names | `ctoepfer/carboy`, `ctoepfer/carboy-bridge` | D-004 |
| Package namespace | Pending; uses the codename, chosen with the toolchain | ADR 0004 / Phase 1 |
| Native recipe file extension and media type | Pending; brand-neutral | D-016 (Phase 0) |
| Schema `$id` base | Pending; brand-neutral | Recipe schema v0 (Phase 0) |
| OS application/bundle IDs, URL scheme, data-folder names | **Not created**; review conventions first | Phase 1 review, ADR before Phase 6 |
| Bridge API base path and version | Pending; brand-neutral | Bridge contract (Phase 13 prerequisite) |
| User-facing brand | Undecided; development default "Carboy" | Owner, before Phase 6 |

## Rebranding procedure

1. Set `brand` in `identity/identity.json` and add the new assets under
   `identity/assets/`.
2. Update store listings, website, and domains.
3. Nothing else: repositories, packages, data formats, and APIs keep their
   codename or neutral identifiers.

If step 3 is ever not true, that is a bug against this policy.
