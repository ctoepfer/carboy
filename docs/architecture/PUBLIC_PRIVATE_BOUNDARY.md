# Public / Private Boundary

Carboy is two independent repositories with a one-way dependency.

| | `ctoepfer/carboy` (this repository) | `ctoepfer/carboy-bridge` |
|---|---|---|
| Visibility | Public | Private |
| License | Apache-2.0 | Proprietary |
| Deployed as | Installed application (desktop first, later mobile) | Separately hosted service |
| Required by the other? | No | Yes: reuses the public Recipe Core and contracts |

## The dependency rule

```
carboy-bridge (private)  ──depends on──▶  carboy Recipe Core + contracts (public)
carboy (public)          ──never depends on──▶  carboy-bridge
```

- The public repository must build and test with no access to the private
  repository, its packages, its service, or its credentials.
- The application may contain an **optional public Bridge client** that speaks
  the public Bridge protocol. The application works fully when the Bridge is
  not installed, not configured, or unreachable.
- The Bridge reuses the public Recipe Core in-process. It never implements a
  second recipe model, validator, or calculation engine.
- Private implementation details (account system, billing, infrastructure,
  operations, business terms) never enter the public repository.

## What the public repository owns

| Area | Responsibilities |
|---|---|
| **Recipe Core** | Canonical recipe model; calculations; validation; deterministic edit operations; ingredient and equipment models; provenance; import/export; units and numerical precision |
| **Contracts** (public, versioned) | Canonical recipe format and schema; revision envelope and canonical hashing; edit command contract (also the AI proposal format); Bridge sync/API protocol definitions, so others can build compatible services |
| **Application** | Recipe editor; ingredient and equipment management; batch records; interactive process graph; local persistence; accessibility and keyboard/touch interaction; brand configuration |
| **Optional integrations** | Local AI providers and bring-your-own-key APIs; local desktop AI connector; hardware subsystem (BrewIO); open shop connector interfaces; public Bridge API client |

## What the private repository owns

Hosted recipe library; online synchronization; user accounts and
authentication; AI-assistant integrations (remote MCP endpoint); API access
control; billing and subscriptions; usage limits; operational monitoring and
security.

## Rules for data crossing the boundary

- Documents synced through the Bridge use the public canonical format and
  revision envelope unchanged.
- Bridge-specific metadata lives in clearly separated, optional fields or
  sidecar records. The local application ignores what it doesn't understand
  and can always open and edit a recipe that went through the Bridge.
- AI-assisted changes arriving through the Bridge are proposals of typed edit
  commands, validated by Recipe Core and accepted by the user. They never
  silently mutate a recipe.
- A lapsed subscription never blocks export of a user's recipes.

## How the Bridge consumes the public code

Pending the toolchain decision (ADR 0004). Whatever the mechanism (published
versioned packages, or a pinned source dependency), it must:

- pin an exact released version of Recipe Core and the contracts;
- run the public parity fixtures in the Bridge's own CI;
- never require the public repository to know about the private one.

See also [ADR 0002](adr/0002-open-core-boundary.md) and
[ADR 0007](adr/0007-ai-integration-tiers.md).
