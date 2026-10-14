# Carboy — working instructions for contributors and coding agents

These instructions apply to everything in this repository (`ctoepfer/carboy`,
public, Apache-2.0). The private service lives in a separate repository,
`ctoepfer/carboy-bridge`; nothing here may depend on it.

## Before you change anything

1. Read [`docs/ROADMAP.md`](docs/ROADMAP.md) for the current phase and the
   accepted decisions, and the relevant ADRs in
   [`docs/architecture/adr/`](docs/architecture/adr/).
2. **Maintainers and their agents:** the working status (active milestone,
   next task, open decisions) lives in the private planning repository,
   checked out beside this one as `../carboy-planning/`. If it is present,
   read its `project/STATUS.md` first; it is the source of truth for the
   next task — not chat history and not this file.
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

## What stays out of this repository

Planning notes and status, local machine paths, reading notes or any text,
tables, or worked examples from books (cite works in
[`docs/references/BIBLIOGRAPHY.md`](docs/references/BIBLIOGRAPHY.md) and
record formulas in our own words), and comparisons with other brewing
software. Naming file formats Carboy imports or exports is fine.

## After meaningful work

Maintainers: update the planning repository's `project/STATUS.md`
(completed work with verification, blockers, next concrete task),
`project/NEXT_ACTIONS.md`, and `project/DECISIONS.md`. In this repository,
update ADRs when a decision changes, and [`docs/ROADMAP.md`](docs/ROADMAP.md)
when the phase changes or a decision is accepted. Write resumable
notes ("wire X into Y in `path`"), not vague TODOs. If you are unsure whether
something is done, write "Needs confirmation."

Do not mark a phase complete because its interfaces exist while the required
behavior is stubbed. Publication, store submission, repository creation, and
other external actions require the owner's explicit authorization.
