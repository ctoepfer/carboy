# Developer Setup

## Current state

What has to happen before there is anything to build: [GETTING_STARTED.md](../project/GETTING_STARTED.md).

No language, framework, or build tool has been selected (ADRs 0003–0007 are
Proposed), so there is nothing to install, build, or test yet. This page
grows when the Phase 1 spike selects the toolchain.

## Checkouts

The public and private repositories are independent Git repositories, side
by side (not submodules; the parent folder is not a repository):

```bash
mkdir -p /mnt/lumina_share/carboy && cd /mnt/lumina_share/carboy
git clone git@github.com:ctoepfer/carboy.git carboy                 # public
git clone git@github.com:ctoepfer/carboy-bridge.git carboy-bridge   # private, if you have access
```

Contributors without access to the private repository need only `carboy`.
Nothing in it requires `carboy-bridge`.

Default branch: `main`.

## VS Code

The owner's multi-root workspace is
`~/Documents/Workspaces/carboy.code-workspace`, outside both repositories. It
opens both checkouts as separate root folders ("Carboy — App & Core",
"Carboy — Bridge"), each with its own Source Control entry. Workspace files
are personal and not committed. The owner's session helpers
(`~/scripts/projects/carboy/start-carboy.sh` and `refresh-carboy.sh`) live
outside both repositories too. Recommended extensions will be added to
`.vscode/extensions.json` once the toolchain is chosen.

## Source projects (read-only)

Recipe Core will port deterministic logic from existing projects. Read them;
never modify them from here:

| Project | Location |
|---|---|
| brewconvert, brewpanel | [ctoepfer/codesamples](https://github.com/ctoepfer/codesamples); local working copy `/mnt/lumina_share/lumina/runtime/coding/repositories/codesamples` |
| Lumina recipes brain | Private Lumina repository; local `/mnt/lumina_share/lumina/brains/recipes/` |

Test results and port sizing: [REUSE_BASELINE.md](../architecture/REUSE_BASELINE.md).
To rerun brewpanel's tests, use an isolated virtual environment with its
`dev` extra (it needs `pytest-asyncio`).

## Conventions

- Text files: UTF-8, LF line endings, final newline ([`.editorconfig`](../../.editorconfig)).
- Never commit secrets; `.env` files and key material are git-ignored.
- Product naming: [NAMING.md](../architecture/NAMING.md).
- Workflow and documentation duties: [AGENTS.md](../../AGENTS.md).
