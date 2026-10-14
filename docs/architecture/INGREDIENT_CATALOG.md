# Ingredient Catalog v0 (draft): hierarchy, substitution, inventory

- Status: **v0.2. IQ1–IQ4 decided (owner, 2026-10-13; §7); §2.2–§2.6 (cultures, evidence, conflicts, research imports) proposed the same day, YQ1–YQ5 open (§8).** Planning; implementation in Phase 3. Builds on RECIPE_SCHEMA §7.2
  (ingredient snapshots, `catalog_ref`, property table) and the Ingredient
  Catalog module ([OVERVIEW.md §2](OVERVIEW.md#2-modules)).
- Date: 2026-10-13
- Decision owner: Charles Toepfer
- Freezes: Phase 3 (catalog); the recipe-schema member in §3 with schema 1.0
  (Phase 2).

## 1. Idea (owner, 2026-10-13)

Ingredients are organized in a **hierarchy** from general to specific, and a
recipe can name the level it actually needs. Instead of a bare product code,
an ale yeast is shown as

```text
American Ale (Chico) / White Labs WLP001
American Ale (Chico) / Fermentis SafAle US-05
```

The group ("American Ale (Chico)") says what the recipe needs; the product
says what the brewer chose. This makes substitution, search, and inventory
matching straightforward, and keeps the catalog organized.

*Refined the same day (§2.1–§2.2):* groups are named by **function**
("Clean American ale / WLP001"). Lineage names such as "Chico" are claims
about strain ancestry; they live as evidenced relations between strains,
because sources disagree about which products share a lineage.

It suits Carboy's multi-beverage focus. The same shape applies to every
ingredient kind:

| Kind | Example path (illustrative, unsourced) |
|---|---|
| Culture (beer) | *S. cerevisiae* → "Clean American ale" (function) → maker's product → strain |
| Culture (wine) | *S. cerevisiae* → "Champagne-method sparkling" (function) → maker's product → strain |
| Culture (sake) | *Aspergillus oryzae* (koji) or *S. cerevisiae* (sake yeast) → function → product → strain |
| Hop | Variety → form (pellet, cryo/lupulin, whole) → grower or supplier lot |
| Malt | Type (pale ale malt, Pilsner, crystal by colour band) → maltster's product |
| Honey | Floral source → region or supplier |
| Apple | Cider-apple class (sweet, sharp, bittersweet, bittersharp) → variety |
| Grape / juice | Variety → region or supplier |
| Rice (sake) | Variety → polishing ratio |

## 2. Model

The Ingredient Catalog module owns these kinds of record (cultures add the
organism and strain records of §2.2):

| Record | What it is | Example |
|---|---|---|
| **Group** | A node in a per-kind tree: a name, a parent, a **level** (§2.1), a description, optional **substitution notes**, and optional **typical property ranges** for display only | "Clean American ale" under *S. cerevisiae* › "Ale" |
| **Product** | A specific purchasable item: maker, product name, product code, aliases, per-product properties (from the maker's data sheet), and one primary group | White Labs WLP001 "California Ale", aliases `WLP001`, `California Ale` |
| **Relation** | A typed link between records, with one or more **evidence** entries (§2.3) | product A *same strain as* product B; product C *not same strain as* product A |
| **Source** | A citable work or data set: bibliographic entry, kind, date, and **redistribution status** (§2.6) | A genomics paper; a maker's data sheet; a community compilation |

Rules:

1. **One primary tree per kind.** A product has exactly one primary group, so
   display and browsing are unambiguous. The tree's upper levels organize
   (§2.1); its leaf groups are functional. A placement elsewhere (a second
   origin, a lineage) is a relation, not a second parent.
2. **Calculations read product properties only.** Group ranges are
   descriptive ("typical attenuation 73–80 %") and are never used in a
   calculation, because a group range is not a measurement of what was used.
3. **Every group placement and relation carries evidence** (§2.3): which
   source says it, what kind of evidence it is, and how certain the source
   is. The UI shows that ("same strain: genomic study, 2016"; "contested"),
   never a bare "same as". Unknown stays unknown. (This replaces the single
   `published` / `reported` / `functional` scale of the first draft, which
   mixed what kind of evidence a claim has with how strong it is.)
4. **User-defined groups and products** are allowed (custom entries), are
   marked as such, and can be shared as data packs ([ADR 0008](adr/0008-extension-model.md), tier A).
5. **Aliases drive import matching.** BeerXML and other imports carry only a
   name or code; the importer proposes a catalog product from aliases, and
   the user confirms during import review. No silent match.

6. **Lot values belong to inventory, not products.** Malt colour, hop alpha
   acid and crop year, and yeast production date vary by lot; the product
   carries the maker's stated range, the inventory item the lot's actual
   value (§5).
7. **Safety- and diet-relevant properties are explicit**: for example
   `diastatic` (STA1-positive yeast, which can over-attenuate and
   over-carbonate if substituted for a non-diastatic strain) and allergens
   (gluten source grains). Substitution previews warn when they change.

### 2.1 Levels: organizational above, functional at the leaves

Each group has a level kind:

- **Organizational** levels make the catalog browsable: taxonomy, origin,
  process role. They are facts that need a source like any other (current
  taxonomy for organisms; maker or breeder for origin), and they are **not**
  evidence that two items substitute for each other: two *Brettanomyces*
  species share a genus and still differ in practice.
- **Functional** levels (the leaves, and optionally one level above them)
  group items that do the same job in a recipe. Substitution ranks
  candidates by these levels only (§4).

Proposed levels per kind (owner's first grouping draft, 2026-10-13, kept
privately until sourced). Genetic lineage is **not** a tree level: it is a
graph of relations between strains (§2.2), because research revises it and
a strain can relate to several others.

| Kind | Organizational levels | Functional leaf | Product |
|---|---|---|---|
| Culture | Organism type (yeast, mould, bacteria) → genus → species (current taxonomy, synonyms kept) | Fermentation behaviour ("Clean American ale", "Dry, attenuative British", "Champagne-method sparkling", "Kettle-souring lactic", "Ginjō sake yeast") | Maker's product, which references a **strain** (§2.2) |
| Hop | Origin region (Continental Europe, UK, US Pacific Northwest, Southern Hemisphere) → aroma family (oil profile) | **Variety** (Cascade, Saaz); variety-to-variety substitutes are functional relations | Supplier, form (pellet, cryo, whole), crop year at lot level |
| Malt and grain | Process role (base, kilned/toasted, caramel/crystal, roasted, adjunct) | Malt type, with colour band where it defines the type ("Light crystal 10–40 °L", "Pilsner base") | Maltster's product |
| Honey | Floral source family | Varietal (orange blossom, clover, buckwheat) | Producer or lot |
| Fruit and juice | Botanical type (pome, stone, berry, citrus, grape) → for grapes: species and colour | Variety; for cider apples, the class (sweet, sharp, bittersweet, bittersharp) | Supplier or lot |
| Rice and koji (sake) | Rice type (sake rice, table rice); koji organism | Rice variety and polishing ratio band; koji use (ginjo, general) | Supplier |

Names follow current taxonomy, with former names kept as aliases (for
example lactic bacteria renamed in the 2020 *Lactobacillus* genus split).

**Display.** Lists show the leaf and the product ("Clean American ale /
WLP001"); a breadcrumb or tree view shows the organizational path
(*S. cerevisiae* › Ale › Clean American ale). The accessible name always
includes the leaf (USABILITY U6).

### 2.2 Cultures: organism, strain, product, group

Reviewing a large community yeast-equivalency compilation (2026-10-13;
private notes) showed that one record per product can't hold what is
actually known. Four things vary independently:

| Record | Question it answers | Example (illustrative) |
|---|---|---|
| **Organism** (taxon) | What species is it? | *Saccharomyces cerevisiae*; *S. pastorianus*; *Aspergillus oryzae*; *Oenococcus oeni*; *Lactiplantibacillus plantarum* (synonym *Lactobacillus plantarum*) |
| **Strain** | Which biological strain is it? | A brewery's house strain; a wine strain sold under several names; a numbered sake yeast |
| **Product** | What can be bought? | A maker's liquid or dry product, with format, status (active, discontinued), and data-sheet properties |
| **Functional group** | What job does it do in a recipe? | "Clean American ale", "Champagne-method sparkling", "Ginjō sake yeast" |

- A product references **one strain, several strains with roles (a
  blend), or none** ("strain unknown"). It still has exactly one primary
  functional group (rule 1).
- **Strain identity is a relation, not a merge.** Two products are never
  folded into one record because a source says they are the same strain;
  they get a `same_strain` relation with evidence, which can later be
  contested or withdrawn.
- **Lineage is a graph between strains** (`derived_from`, `sibling_of`,
  `related_to`), not tree levels, because research keeps revising it.
- **Species is a strain property with evidence.** Product names can mislead
  (a product named "lager" can be an ale yeast); the substitution preview
  checks species and `diastatic` from the strain, not the name.
- **The same records serve every beverage**: wine strains sold under several
  names, cider and mead yeasts, malolactic bacteria, sake yeasts, and koji
  moulds are organism → strain → product → group, like beer yeasts. There
  is no yeast-only or beer-only subsystem.

### 2.3 Relations and evidence

**Relation types** (the closed set; adding one is a catalog-schema change):

| Type | Between | Meaning |
|---|---|---|
| `same_strain` | product ↔ product, or product → strain | Biologically the same strain (within normal culture drift) |
| **`not_same_strain`** | product ↔ product | A source says they are **not** the same strain. A first-class claim, never dropped |
| `blend_contains` | product → strain | The product is a blend containing this strain |
| `derived_from`, `sibling_of`, `related_to` | strain ↔ strain | Lineage; `related_to` carries a stated closeness when the source gives one |
| `member_of` | strain → organism | Species membership |
| `functional_peer` | product ↔ product | Does the same job in practice, no identity claim |
| **`not_substitutable_for`** | product → product (or group) | A source says don't substitute, with the reason |
| `in_group` | product → group | Group placement (the primary group, rule 1, is one of these) |

**Evidence**, one or more per relation (and per property claim):

| Member | Values |
|---|---|
| `source` | A Source record (bibliographic entry, date, redistribution status) |
| `kind` | `genomic`, `manufacturer`, `trial` (side-by-side fermentations), `sensory`, `compiled` (a secondary compilation), `community` (forum or anecdote), `editorial` (the curator's own reasoning) |
| `certainty` | `confirmed`, `likely`, `uncertain` (e.g. "50/50"), as stated by the source |
| `stance` | `supports` or `contradicts` the relation |
| `observed`, `locator`, `note` | Date of the evidence, page/table/row, free text |

### 2.4 Negative claims, conflicts, and change

- **Negative relations are kept and enforced.** Any grouping, clustering, or
  "same strain" display treats `not_same_strain` as a hard boundary: two
  products asserted not to be the same are never shown as the same, even if
  a chain of positive relations would connect them. Positive equivalence is
  **not transitive** by default (A ≈ B and B ≈ C doesn't give A ≈ C), because
  sources mean "close enough", not identity.
- **Conflicts are represented, not resolved silently.** A relation's status
  is derived from its evidence: `supported`, `contested` (evidence on both
  sides), `refuted` (only contradicting evidence remains in force), or
  `unreviewed`. A contested relation is shown as contested, with both sides.
- **Evidence is never deleted.** Newer evidence is added; older evidence is
  marked `superseded_by` when the source itself is revised (a study's
  published version replacing its preprint). Catalog versions record when a
  relation's status changed, so a recipe can show "this substitution was
  considered equivalent when the recipe was written".
- **Products change too.** `status` (`active`, `discontinued`, with dates)
  and data-sheet versions are kept; a discontinued product stays resolvable
  for old recipes.

### 2.5 Strain equivalence is not substitution suitability

Two different questions:

1. **Are these the same strain?** A fact about organisms, answered by
   evidence (§2.3).
2. **Is this a good substitute in this recipe?** A judgement about a
   recipe, answered by comparing properties against the recipe's context:
   beverage, intended style, fermentation temperature, target attenuation
   and alcohol, format and pitch, `diastatic`, phenolic (POF), species.

The same strain can be a poor substitute (a dry and a liquid format need
different pitching; lots differ), and a different strain can be a good one
(a functional peer). So substitution (§4) **uses** identity as one input,
never as the answer, and it always shows the differences that matter for
the recipe.

### 2.6 Importing research data: claims, not catalog

Research spreadsheets and compilations are useful maps of what to check.
They are not authoritative, and their licences often don't allow
redistribution.

- **Sources carry a redistribution status**: `redistributable` (with the
  licence), `reference-only` (may be cited, not copied), or `unknown`
  (treated as reference-only).
- **Import produces claims in a staging area, never catalog records.** Each
  imported row becomes candidate products, relations (positive **and**
  negative), and property claims, with evidence `kind: compiled`, the
  source, the row as locator, and status `unreviewed`. Formatting that
  carries meaning (colour codes for evidence or uncertainty, strikethrough
  for discontinued) is read, not discarded.
- **Promotion is a curator decision.** A claim enters the curated catalog
  only with independent evidence the project may cite: the primary study,
  the maker's data sheet, a recorded trial. The compiled source may stay as
  an additional, `compiled` evidence entry; it is never the only one.
- **User packs.** A user may import a research spreadsheet into their own
  local data pack (ADR 0008 tier A). Its claims stay marked unreviewed and
  pack-scoped, are never merged into the curated catalog (IQ3), and are not
  redistributed by the project.
- **Nothing reference-only ships.** The distributed catalog contains only
  records whose sources are redistributable or are the project's own
  wording of facts with citations.



Proposed addition to the ingredient snapshot (RECIPE_SCHEMA §7.2; schema
MINOR, decided with schema 1.0):

```json
{
  "id": "…",
  "kind": "culture",
  "name": "California Ale",
  "properties": { "attenuation": { "value": "0.78", "unit": "fraction" } },
  "catalog_ref": { "catalog": "…", "item": "<product>", "version": "…" },
  "group_ref":   { "catalog": "…", "item": "<group>",   "version": "…" }
}
```

- `group_ref` (optional) records the level the recipe **needs**;
  `catalog_ref` the product **used**. A recipe may have a group and no
  product ("any clean American ale yeast"), which then has no product
  properties; calculations that need them report a missing input rather than
  using the group's range.
- Both are references for display and matching; the snapshot's `properties`
  stay what calculations read (invariant 6).

## 4. Substitution

- **Substitute** is an editor command (`substitute_ingredient`: replace the
  product in an ingredient snapshot, keep its additions), previewed with a
  diff and recalculated statistics like every other edit. Nothing substitutes
  automatically.
- Candidates are ranked by **functional** distance only: same leaf group
  first, then sibling leaves under the same functional parent, then
  `functional_peer` relations. Strain identity (`same_strain`, supported)
  raises a candidate within its group; it never admits one on its own.
  Organizational closeness (same genus, same region) never ranks a
  candidate. Each candidate shows the property differences (attenuation,
  flocculation, temperature range, alpha acid) and the evidence behind its
  relations, including contested ones.
- **Excluded or flagged:** anything with `not_substitutable_for`; a change
  of species or of `diastatic` or POF status is shown as a warning that
  needs explicit acceptance (§2.5).
- Hops need quantity adjustment on substitution (alpha acid differs); the
  preview shows the amount that keeps the calculated IBU, as a proposal the
  user accepts.

## 5. Inventory (CQ1: deferred)

**Owner, 2026-10-13:** a complete personal inventory module is deferred
beyond the initial release. In this phase: **no stock balances, no
automatic deductions, no lot accounting.**

What this phase does instead is keep the door open without schema
disruption later:

- Catalog products have stable identities and the hierarchy above, so a
  future inventory item can reference a product and match a recipe at the
  product level first, then the group level ("Recipe needs a clean American
  ale yeast; you have one from that group").
- The shopping-list contract (Phase 11 shop connector) lists needs by
  product or group with quantities, so an inventory can later subtract
  what is on hand before the list is built.
- Lot-level values (rule 6) have a defined home for when inventory arrives.

## 6. Data sources and rights

- Product properties come from makers' published data sheets, cited per
  product with date and version. Facts are recorded in our own words;
  descriptions are not copied (D-009).
- Taxonomy, strain identity, and lineage need citable evidence (§2.3):
  current taxonomy for species, genomics research for strain identity and
  clades, makers for product facts. The owner's ale-yeast draft (lineage
  names such as Chico, Fuller's, Whitbread, Boddingtons/Manchester, Burton,
  Ringwood) becomes functional groups plus lineage relations; a community
  compilation already contradicts several of its placements (private
  review notes), which is the case §2.4 is designed for. Placements without
  citable evidence ship as functional groups only, or not at all.
- Research compilations are handled as claims to verify (§2.6), not as
  sources to copy.
- Maker and product names are used only to identify products (nominative
  use); the catalog doesn't use makers' logos or marketing text.

## 7. Decisions (owner, 2026-10-13)

| # | Decision |
|---|---|
| IQ1 | **Approved:** group/product hierarchy and optional `group_ref` in recipes (schema MINOR). Recipe snapshots stay authoritative for historical calculations |
| IQ2 | "Group / Product" in detailed ingredient lists and tables. Compact controls may show the product first if the functional group stays available through a secondary label, tooltip, or accessible name |
| IQ3 | A **project-curated official catalog**, plus optional user-defined and community data packs. Source provenance, confidence, and pack identity are kept; unverified community data is never silently merged into the curated catalog |
| IQ4 | Start with **cultures, hops, and malt/grain**; expand to honey, fruit, sugar sources, grape/juice, rice/koji, nutrients, and other kinds as supported formulas and import formats need them. **Not a beer-only design.** Biological taxonomy, functional groups, and substitution relations stay distinct |

## 8. Open questions (proposed 2026-10-13)

| # | Question | Recommendation |
|---|---|---|
| YQ1 | Add **organism** and **strain** records for cultures (§2.2), separate from products and groups? | Yes; it is the only way to keep identity, lineage, and function apart, and it covers wine, cider, mead, sake, koji, and bacteria the same way |
| YQ2 | Replace the single confidence scale with **evidence kind + certainty + stance** per evidence entry (§2.3)? | Yes |
| YQ3 | Make `not_same_strain` and `not_substitutable_for` first-class and **equivalence non-transitive** (§2.4)? | Yes |
| YQ4 | Research imports go to a **staging area** as unreviewed claims; promotion needs independent, citable evidence; reference-only sources never ship (§2.6)? | Yes |
| YQ5 | Allow users to import research spreadsheets into **their own local packs** (unreviewed, never merged, never redistributed)? | Yes, after the pack format exists (Phase 4) |

