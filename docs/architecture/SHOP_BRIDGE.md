# Shop Bridge: an open ingredient-ordering protocol (future workstream)

- Status: **Design for a future workstream. Not implemented; no code, no
  contracts frozen.** It refines Phase 11 (local homebrew shop connector)
  and does **not** change Phase 2 scope.
- Date: 2026-10-14
- Decision owner: Charles Toepfer
- Builds on: invariant 10 (vendor-neutral shop connections), the product
  brief's shop integration principles, [INGREDIENT_CATALOG.md](INGREDIENT_CATALOG.md)
  §3 and §5 (requirement, preferred product, alternatives, shopping
  lists), [OVERVIEW.md](OVERVIEW.md) (Shop Integration module),
  [ADR 0008](adr/0008-extension-model.md) (external integrations, tier B).

"Carboy Shop Bridge" is the working name of the workstream. Like every
contract, the protocol's identifiers are brand-neutral
([NAMING.md](NAMING.md)): paths under `{base}/shop/v0`, schema IDs without
the codename or brand.

## 1. Purpose

A brewer sends a recipe's shopping requirements to a participating
homebrew shop of their choice, reviews the shop's matching products,
current prices, and alternatives, and buys through that shop. Any shop can
take part, from one with only an email inbox to one with a full online
store.

**Not part of it:** the proprietary AI Bridge (this protocol and its
client are open source and independent of it), payments (always on the
retailer's own checkout), shop inventory management, and any Carboy-hosted
account or subscription.

## 2. Principles

| # | Rule | From |
|---|---|---|
| B1 | **Open and independent.** The protocol, its schemas, the client in the app, and a conformance suite are open source. Nothing depends on the AI Bridge or on any Carboy-hosted service | ADR 0002; invariant 9 |
| B2 | **No privileged retailer.** Pacific Brewing Supplies is the first implementation and uses only the public contract: no private endpoints, no special code paths, no default selection, no ranking advantage | Invariant 10; product brief |
| B3 | **The user chooses a shop, or none.** No default shop; the app works fully without one | Invariant 10 |
| B4 | **The retailer is authoritative** for products, availability, prices, tax, payment, fulfilment, and confirmed orders. Carboy shows what the shop said and when, and never presents catalog membership or an old quote as stock | INGREDIENT_CATALOG §5 |
| B5 | **Fresh quote, explicit choices.** Before checkout the user sees a current quote, and every substitution (by Carboy's suggestion or the shop's) is shown and approved explicitly | INGREDIENT_CATALOG §4–§5 |
| B6 | **Share only what the transaction needs.** Lines (product or requirement, quantity, options), never the recipe, its notes, or its name unless the user adds them; personal data only on the retailer's own checkout | Invariant 1; privacy |
| B7 | **Distinct records.** Recipe requirement, preferred product, approved alternatives (recipe); the line chosen for this purchase (shopping list); the purchased product (order); the actual product used (batch). None overwrites another | INGREDIENT_CATALOG §3 |
| B8 | **Versioned, idempotent, authenticated.** Versioned contracts with capability negotiation; an idempotency key on every request that creates something; authentication where a customer is involved | SYNC_PROTOCOL conventions |
| B9 | **Realistic for small shops.** The lowest level needs no software at all; each level above it adds one capability a shop can adopt when it wants | Owner, 2026-10-14 |
| B10 | **Untrusted input.** Catalog feeds, quotes, and order updates from shops are validated like any import; nothing a shop sends can change a recipe | Threat model (planned) |
| B11 | **Services come from the retailer's advertised capabilities.** Preparation, packaging, handling, and fulfilment options (milling, splitting, cold-pack, pickup, delivery, …) are offered only when the selected shop declares them, for the product, order contents, fulfilment method, and current availability in question. Carboy assumes no service is universally available. The app presents only supported options, obtains a retailer-validated quote for the chosen configuration, and requires confirmation before checkout. The capability model is extensible: a shop can introduce a new service without any change to Recipe Core (§6.1) | Owner, 2026-10-14 |

## 3. Capability levels

A shop declares the highest level it supports; the app uses the best level
both sides support and falls back gracefully.

| Level | What the shop provides | What the brewer gets | Shop effort |
|---|---|---|---|
| **L0 Order request** | An email address (or a form) | A shopping list sent as a readable message plus an attached file (structured lines, also as CSV); the shop replies by its usual means | None: any shop, today |
| **L1 Catalog matching** | A published catalog file (JSON or CSV export from its POS or store) on any web host, refreshed when convenient | Lines matched to the shop's SKUs and package sizes before sending; prices shown only with the file's "as of" time, if present | Export a file |
| **L2 Quote** | A quote endpoint | Current price, availability, and offered substitutions per line, with an expiry | A plugin or small service |
| **L3 Cart handoff** | A cart endpoint | The accepted quote becomes a cart on the shop's site; the brewer pays on the shop's own checkout page | A plugin |
| **L4 Order integration** | Order status and confirmation | Order status in the app; on confirmation, the purchased products are offered for the batch record (user-approved, never automatic) | A plugin with order hooks |

## 4. Flow

1. **Shopping list** (app): from the recipe (or a planned batch), per
   ingredient: the requirement (`group_ref`), the preferred product
   (`catalog_ref`), approved alternatives, and the quantity needed.
2. **Purchase Resolver** (app, §5): turns each line into candidate
   purchasable items at the chosen shop.
3. **Send or quote:** L0 sends the list; L1 sends matched lines; L2 asks for
   a quote.
4. **Review:** the brewer sees per line the preferred product, the shop's
   offer, alternatives with their differences and warnings (diastatic
   status, species, colour or alpha-acid changes, "why related"), surplus
   from package rounding, and prices with their source and time. Service
   options (§6.1) appear only as the shop declares them for each line and
   for the chosen fulfilment method; changing one asks for a new quote.
5. **Approve:** explicit choices per line; if a choice changes calculated
   outcomes, the batch or recipe preview shows the change (INGREDIENT_CATALOG
   §4); applying to the recipe is the reviewed `substitute_ingredient` edit.
6. **Checkout** (L3): only after the brewer confirms a retailer-validated
   quote for the exact configuration (lines, options, fulfilment); then the
   shop's checkout page, opened in the system
   browser; payment, address, and account (if any) stay with the shop.
7. **Order** (L4): status updates; on confirmation the purchased products
   can be recorded on the batch as the actual products, with the user's
   approval.

## 5. Purchase Resolver

A component of the Shop Integration module (in the open app), using
Recipe Core for quantities and the Ingredient Catalog for products and
relations. It **proposes**; the user decides.

- **Quantity to packages.** Converts the recipe quantity with Recipe Core's
  exact units to the shop's package sizes, rounds up to whole packages
  (never down), and shows the surplus. Count items (yeast packs, tablets)
  are matched by count only; the number of yeast packs is the user's
  choice, since no pitch-rate formula is enabled.
- **Matching order.** The preferred product at this shop; then the
  brewer's approved alternatives; then catalog suggestions from the same
  functional group with their evidence. Strain identity raises a suggestion
  within its group; it never admits one on its own (INGREDIENT_CATALOG §4).
- **Shop options** come only from the selected shop's declared services
  (B11, §6.1), such as grain milling, hop form, or split packaging. The
  Resolver offers an option only where the declaration says it applies
  (this product, this quantity, this fulfilment method, available now);
  a line can't be sent with an option the shop didn't declare, and the
  absence of a declaration means "not offered", never a default.
- **Never** treats catalog membership as availability, never selects a
  substitution silently, and never changes a recipe.

## 6. Public contracts

Each is a versioned JSON Schema in this repository, with fixtures and a
conformance suite. Field lists here are indicative, not final.

| Contract | Level | Purpose | Key members (indicative) |
|---|---|---|---|
| **Shop descriptor** | All | What a shop supports and where | protocol versions, highest level, contact for L0, endpoints, currency, locale, authentication methods, fulfilment methods offered, order-level service declarations (§6.1), links to the shop's terms and privacy policy |
| **Shopping request** | L0+ | The lines a brewer wants | request ID (UUIDv7, also the idempotency key), lines: requirement (functional group name and code), preferred product (maker, name, code), approved alternatives, quantity with unit, options; optional free-text note from the user. No recipe content |
| **Catalog feed** | L1+ | The shop's purchasable items | SKU, name, maker and maker's product code, package quantity and unit, product-level service declarations (§6.1), optional catalog references (group, product), optional price with currency and "as of" time, last-updated time |
| **Quote** | L2+ | Current offer for a given configuration | quote ID, expiry, fulfilment method, per line: offered SKU(s), package count, unit price, availability with time, selected services as accepted, rejected, or changed by the shop (with reason and any charge), substitution offered (marked as such, with reason), line notes; order-level services; totals as estimates; tax "at checkout" where not computed |
| **Cart handoff** | L3+ | Turn an accepted quote into a cart | quote ID, accepted lines, idempotency key; returns the shop's cart reference and checkout URL |
| **Order status** | L4 | Track the order | order reference, status (received, confirmed, ready for pickup, shipped, completed, cancelled), lines as fulfilled, any shop-side substitution (always reported), timestamps |

### 6.1 Service declarations (extensible)

A shop describes each service it offers as data; Carboy renders and sends
what the shop declared and knows nothing else about it.

- **Declaration** (indicative): a service identifier namespaced by the
  shop (for example `example-shop:milling`), the shop's own label and
  description in its locale, scope (order, line, or product), the
  parameters the brewer chooses from (enumerated choices, or a bounded
  quantity), and **applicability**: which products or catalog groups,
  quantity limits, fulfilment methods, and whether it is available now or
  from when.
- **Discovery is per context.** A service applies only where its
  declaration says so; the app evaluates applicability for the current
  lines and fulfilment method and hides everything else. Applicability in
  a catalog feed is advisory; the quote is authoritative and may accept,
  reject, or change a selection, always reported per line.
- **Unknown services work.** A service type Carboy has never seen is shown
  with the shop's label and choices and passed through unchanged, so a
  shop adds a service by declaring it. No change to Recipe Core, the
  recipe schema, or the app's code is needed; nothing a service declares
  can change a recipe or a calculation.
- **Optional shared vocabulary.** The protocol may later publish a short
  list of well-known service identifiers (for example milling) so the
  Purchase Resolver can match a brewer's stated preference across shops.
  A well-known identifier is never assumed available: a shop that doesn't
  declare it doesn't offer it.
- **Validation:** declarations are untrusted input (B10): length limits,
  plain text only, bounded choices, and a schema version per declaration.

Conventions shared with the sync protocol: diagnostics with stable codes,
RFC 3339 timestamps, decimal strings for quantities and money, Recipe
Core's unit tokens, capability negotiation by version, and retries made
safe by idempotency keys.

**Authentication.** L0 and L1 need none. Quotes may be anonymous. Cart and
order calls that involve a customer use the shop's own sign-in through the
system browser (OAuth 2.0 authorization code with PKCE where the shop
supports it) or an anonymous cart token. No Carboy-hosted account.

## 7. Adapters

Adapters connect a shop's existing system to the contract. They are
external integrations (ADR 0008, tier B), maintained in their own
repositories, and must pass the conformance suite.

| Platform | Likely shape | Levels |
|---|---|---|
| Any shop | Email ordering; CSV catalog export from its POS | L0–L1 |
| Drupal Commerce | A Drupal module (the first implementation, at Pacific Brewing Supplies) | L1–L4 |
| Shopify | An app using the platform's public APIs | L1–L3, L4 if order hooks allow |
| WooCommerce | A WordPress plugin | L1–L4 |
| Other POS systems | A catalog export or a small service in front of the POS | L1–L2 |

Platform API capabilities and terms must be verified for each adapter
before it is designed; nothing above is a claim about a platform's
current API.

## 8. Neutrality

- The reference implementation at Pacific Brewing Supplies uses only the
  public contract and passes the same conformance suite as anyone else.
- No default shop; no ordering of shops by commercial relationship. If a
  shop directory is ever added, it is opt-in for shops, ordered neutrally
  (for example by distance or name), and has no paid placement (open
  question).
- The app's code has no shop-specific branches; a shop's identity is data.
- The project discloses its relationship with Pacific Brewing Supplies
  (product brief).

## 9. Phases (proposal)

The workstream lives in **Phase 11** and depends on the catalog (Phase 3),
editing and the threat model (Phase 4), and batches (Phase 7). Nothing
here starts before those.

| Step | Content | Exit evidence |
|---|---|---|
| SB0 Contracts | Draft the six schemas and the service-declaration model (§6.1), fixtures, conformance suite, and a sandbox shop | Schemas reviewed; sandbox passes its own suite, including a service the client has never seen |
| SB1 L0 + Resolver | Shopping list with requirement, preferred, alternatives; Purchase Resolver; email/file export | A shop with no software receives a usable order request |
| SB2 L1 | Catalog feed import (JSON, CSV) with validation; matching and package rounding; reference catalog from Pacific Brewing Supplies | Matching on two unrelated catalogs, one from a small shop's CSV |
| SB3 L2–L3 | Quote and cart handoff; Drupal Commerce adapter; one second platform adapter to prove neutrality | Quote → shop checkout on two platforms; substitutions always explicit |
| SB4 L4 | Order status; purchased products offered to the batch record | Order lifecycle with cancellation and shop substitutions reported |

## 10. Open questions

| # | Question | Recommendation |
|---|---|---|
| BQ1 | How do users find shops: a URL or QR code only, or also a neutral directory? | URL/QR first; a directory only if neutral (opt-in, no paid placement) |
| BQ2 | Who maintains platform adapters: the project or the community? | Project maintains the conformance suite and one reference adapter; others are community-maintained against the suite |
| BQ3 | May quotes be cached offline for later review? | Yes, labelled with their time and expiry; checkout always requests a fresh quote |
| BQ4 | Price display: tax-inclusive or exclusive, by locale? | Follow the shop's declaration in the descriptor; never compute tax in Carboy |
| BQ5 | Cancellations and returns | Retailer's process; L4 reports status only |
