# Developer Setup

## Current state

No language, framework, or build tool has been selected for the product
(ADRs 0003–0007 are Proposed), so there is no product to build yet. The
throwaway Phase 1 spike can be run: see [spikes/phase1/README.md](../../spikes/phase1/README.md)
(`spikes/phase1/spike.sh start | test`). This page grows when the spike
selects the toolchain. Phases and the current focus: [ROADMAP.md](../ROADMAP.md).

## Checkouts

```bash
git clone git@github.com:ctoepfer/carboy.git
```

Default branch: `main`. This repository builds and tests on its own.
Maintainers also keep private repositories (the optional hosted service and
planning notes) checked out beside it as independent repositories, not
submodules; nothing here depends on them
([PUBLIC_PRIVATE_BOUNDARY.md](../architecture/PUBLIC_PRIVATE_BOUNDARY.md)).

## Editor

Workspace files and personal helper scripts are not committed.
Recommended extensions will be added to `.vscode/extensions.json` once the
toolchain is chosen.

## Source projects (read-only)

Recipe Core ports deterministic logic from the maintainer's earlier
projects. Read them; never modify them from here:

| Project | Where |
|---|---|
| brewconvert, brewpanel | [ctoepfer/codesamples](https://github.com/ctoepfer/codesamples) |
| Lumina recipes | Private repository (maintainer access only) |

To rerun brewpanel's tests, use an isolated virtual environment with its
`dev` extra (it needs `pytest-asyncio`).

## Conventions

- Text files: UTF-8, LF line endings, final newline ([`.editorconfig`](../../.editorconfig)).
- Never commit secrets; `.env` files and key material are git-ignored.
- Product naming: [NAMING.md](../architecture/NAMING.md).
- Workflow and documentation duties: [AGENTS.md](../../AGENTS.md).
