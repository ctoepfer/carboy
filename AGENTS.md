# Carboy — working instructions for contributors and coding agents

These instructions apply to everything in this repository (`ctoepfer/carboy`,
public, Apache-2.0). The private service lives in a separate repository,
`ctoepfer/carboy-bridge`; nothing here may depend on it.

## Before you change anything

1. Read [`docs/project/STATUS.md`](docs/project/STATUS.md). It is the source of
   truth for the current phase, active milestone, and next task — not chat
   history and not this file.
2. Read the phase section for the active phase in
   [`docs/project/PROJECT_PLAN.md`](docs/project/PROJECT_PLAN.md) and the
   relevant ADRs in [`docs/architecture/adr/`](docs/architecture/adr/).
3. Inspect before changing. Link findings to real paths, symbols, and tests.

## While working

- Implement the smallest useful deliverable for the active phase. Do not start
  later phases or scaffold future modules "while you're there."
- Do not create empty packages or directories to mirror the planned layout.
  A directory appears when it receives real code or real fixtures.
- Respect module boundaries ([`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md)).
  Recipe Core has no UI, storage, AI, device, network, or shell dependency.
- Preserve the [invariants](docs/architecture/INVARIANTS.md) and the
  [public/private boundary](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md):
  this repository must build and test without the private repository.
- AI output never writes recipe state directly. It becomes a proposal that is
  validated by Recipe Core and accepted by the user.
- Never invent calculation formulas, ingredient data, device protocols, shop
  endpoints, or store policies. Cite sources; mark unknowns as unknown.
- Do not copy content from `codesamples/brewpanel/docs/hardware_internal/` (git-ignored,
  unreviewed research) into Carboy.
- A proposed ADR is not a decision. No language, framework, or build tool is
  selected yet: do not treat Tauri, TypeScript, Rust, Python, SQLite, or any
  other candidate as chosen until its ADR says `Accepted`.
- Never modify the source projects this work ports from (Lumina, brewconvert,
  brewpanel); read them only.

## Product name

"Carboy" is a permanent codename, not the brand. The user-facing brand lives
only in [`identity/identity.json`](identity/identity.json). Code and data stay
brand-neutral; never write a brand candidate into code, data formats, or
docs. Rules: [`docs/architecture/NAMING.md`](docs/architecture/NAMING.md).

## Front-end requirements

- WCAG 2.1 Level AA is the minimum; target WCAG 2.2 AA. Every drag interaction
  needs a non-drag alternative (WCAG 2.2 SC 2.5.7). Every essential workflow
  must be completable by keyboard.
- Reuse shared design tokens and components before adding page-specific CSS.

## After meaningful work

Update `docs/project/STATUS.md` (completed work with verification, blockers,
next concrete task), `docs/project/NEXT_ACTIONS.md`, and
`docs/project/DECISIONS.md` / ADRs when a decision changes. Write resumable
notes ("wire X into Y in `path`"), not vague TODOs. If you are unsure whether
something is done, write "Needs confirmation."

Do not mark a phase complete because its interfaces exist while the required
behavior is stubbed. Publication, store submission, repository creation, and
other external actions require the owner's explicit authorization.
