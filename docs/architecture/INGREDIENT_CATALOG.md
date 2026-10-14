# Ingredient Catalog v0 (draft): hierarchy, substitution, inventory

- Status: **v0. IQ1–IQ4 decided (owner, 2026-10-13; §7).** Planning; implementation in Phase 3. Builds on RECIPE_SCHEMA §7.2
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

It suits Carboy's multi-beverage focus. The same shape applies to every
ingredient kind:

| Kind | Example path (illustrative, unsourced) |
|---|---|
| Culture (beer) | *S. cerevisiae* → ale clade → "Chico" lineage → maker's product |
| Culture (wine) | *S. cerevisiae* → wine strains → sparkling / high-alcohol group → maker's product |
| Culture (sake) | *Aspergillus oryzae* (koji) and sake yeast groups → maker's product |
| Hop | Variety → form (pellet, cryo/lupulin, whole) → grower or supplier lot |
| Malt | Type (pale ale malt, Pilsner, crystal by colour band) → maltster's product |
| Honey | Floral source → region or supplier |
| Apple | Cider-apple class (sweet, sharp, bittersweet, bittersharp) → variety |
| Grape / juice | Variety → region or supplier |
| Rice (sake) | Variety → polishing ratio |

## 2. Model

The Ingredient Catalog module owns three kinds of record:

| Record | What it is | Example |
|---|---|---|
| **Group** | A node in a per-kind tree: a name, a parent, a **level** (§2.1), a description, optional **substitution notes**, and optional **typical property ranges** for display only | "Clean American ale" under *S. cerevisiae* › "Ale" |
| **Product** | A specific purchasable item: maker, product name, product code, aliases, per-product properties (from the maker's data sheet), and one primary group | White Labs WLP001 "California Ale", aliases `WLP001`, `California Ale` |
| **Relation** | A typed, sourced link between products or groups | WLP001 *reported same origin as* Wyeast 1056 |

Rules:

1. **One primary tree per kind.** A product has exactly one primary group, so
   display and browsing are unambiguous. The tree's upper levels organize
   (§2.1); its leaf groups are functional. A placement elsewhere (a second
   origin, a lineage) is a relation, not a second parent.
2. **Calculations read product properties only.** Group ranges are
   descriptive ("typical attenuation 73–80 %") and are never used in a
   calculation, because a group range is not a measurement of what was used.
3. **Every group placement and relation carries provenance**: a source
   citation and a **confidence** level:

   | Confidence | Meaning | Example source |
   |---|---|---|
   | `published` | The maker states it, or peer-reviewed research shows it | Maker's data sheet; a genomics study |
   | `reported` | Widely reported in brewing literature or by labs indirectly, not confirmed by the maker | Brewing books, trade articles |
   | `functional` | Behaves similarly in practice; no claim of shared origin | Fermentation trials, data-sheet ranges |

   The UI shows the confidence ("reported same origin"), never just "same
   as". Unknown stays unknown.
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
privately until sourced):

| Kind | Organizational levels | Functional leaf | Product |
|---|---|---|---|
| Culture | Organism type (yeast, bacteria) → genus → species → genetic group or clade where published (ale heritage groups; lager Saaz / Frohberg types) | Fermentation behaviour ("Clean American ale", "Dry, attenuative British", "Kettle-souring lactic") | Maker's strain |
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

## 3. Recipes

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
  product ("any Chico-lineage ale yeast"), which then has no product
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
  `functional` relations. Organizational closeness (same genus, same region)
  never ranks a candidate by itself; each candidate shows the property differences
  (attenuation, flocculation, temperature range, alpha acid) and the
  relation's confidence and source.
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
  product level first, then the group level ("Recipe needs a Chico-lineage
  ale yeast; you have SafAle US-05").
- The shopping-list contract (Phase 11 shop connector) lists needs by
  product or group with quantities, so an inventory can later subtract
  what is on hand before the list is built.
- Lot-level values (rule 6) have a defined home for when inventory arrives.

## 6. Data sources and rights

- Product properties come from makers' published data sheets, cited per
  product with date and version. Facts are recorded in our own words;
  descriptions are not copied (D-009).
- Group names and the genetic levels of the tree need citable sources:
  genomics research for clade names, brewing literature for lineage
  nicknames, each with the confidence in §2. Example: the owner's ale-yeast
  tree (clade "Beer 1" with Chico, Fuller's, Whitbread, Boddingtons /
  Manchester, Burton, and Ringwood lineages) is a good starting outline;
  each placement must be sourced before it ships, and placements that can't
  be sourced ship as `functional` groups or not at all.
- Maker and product names are used only to identify products (nominative
  use); the catalog doesn't use makers' logos or marketing text.

## 7. Decisions (owner, 2026-10-13)

| # | Decision |
|---|---|
| IQ1 | **Approved:** group/product hierarchy and optional `group_ref` in recipes (schema MINOR). Recipe snapshots stay authoritative for historical calculations |
| IQ2 | "Group / Product" in detailed ingredient lists and tables. Compact controls may show the product first if the functional group stays available through a secondary label, tooltip, or accessible name |
| IQ3 | A **project-curated official catalog**, plus optional user-defined and community data packs. Source provenance, confidence, and pack identity are kept; unverified community data is never silently merged into the curated catalog |
| IQ4 | Start with **cultures, hops, and malt/grain**; expand to honey, fruit, sugar sources, grape/juice, rice/koji, nutrients, and other kinds as supported formulas and import formats need them. **Not a beer-only design.** Biological taxonomy, functional groups, and substitution relations stay distinct |
