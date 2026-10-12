# ADR 0007: AI integration tiers and the proposal boundary

- Status: Proposed
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Carboy should work with AI in three ways: an in-app assistant, desktop AI
tools on the same machine, and cloud assistants (paid connector, ADR 0002).
AI arithmetic is unreliable and AI output can be malformed, so AI must never
own recipe correctness.

## Decision (proposed)

**One tool surface, three tiers.** Carboy defines a provider-neutral set of
AI operations — scoped reads (recipe, revision history, batches, catalog
lookups, calculation explanations) and proposal submission (a list of typed
editor commands with rationale). All tiers use this same surface:

| Tier | Transport | Cost |
|---|---|---|
| 1. In-app assistant | Local model or the user's API key, called from the shell's Rust side | Free |
| 2. Local AI connector | MCP endpoint on the local machine for desktop AI clients | Free |
| 3. AI Bridge | Separately hosted private service (`carboy-bridge`): authenticated MCP endpoint, online recipe library synced to the app | Paid, opt-in |

**Proposal boundary** (all tiers):

- AI writes only proposals: typed editor commands, never raw recipe JSON.
  Two refinements under review with the AI Bridge plan (Bridge ADR B-0006):
  a brand-new recipe built from commands applied to an empty template may
  enter the library marked `ai_proposed` and "unreviewed" (it overwrites
  nothing); and importing a recipe the user supplies (BeerXML or native) is
  a parse path through Recipe Format labeled `imported`, not an AI write.
- Recipe Core validates every command; invalid proposals are rejected with
  reasons and never partially applied.
- The user reviews a diff (ingredients, process, recalculated results) and
  accepts; acceptance is one undoable operation with AI provenance.
- AI-supplied numbers are inputs to Recipe Core, never substitutes for its
  calculations.
- No AI tier has storage, export, or actuator privileges.
- API keys live in platform secret storage and never enter prompts, logs, or
  exports. Remote providers show a preview of what will be sent.

Whether some proposals may auto-apply to an unsaved draft (still undoable) is
open (D-014).

## Consequences

- The editor command contract (Phase 2/4) is also the AI write contract;
  design it for both.
- Tier 2 defines the tool surface that Tier 3 reuses, so Tier 3 is mostly
  hosting, auth, and relay.

## Evidence required to accept

Phase 8: malformed and invalid proposals cannot mutate state; provider
failure/cancellation leaves the app usable; disabling AI leaves the app
complete.
