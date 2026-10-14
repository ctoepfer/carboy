# Ingredient Catalog v0 (draft): hierarchy, substitution, inventory

- Status: **Draft v0. Planning only.** Builds on RECIPE_SCHEMA §7.2
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
| **Group** | A node in a per-kind tree: a name, a parent, a description, and optional **typical property ranges** for display only | "American Ale (Chico lineage)" under "Ale yeast" |
| **Product** | A specific purchasable item: maker, product name, product code, aliases, per-product properties (from the maker's data sheet), and one primary group | White Labs WLP001 "California Ale", aliases `WLP001`, `California Ale` |
| **Relation** | A typed, sourced link between products or groups | WLP001 *reported same origin as* Wyeast 1056 |

Rules:

1. **One primary tree per kind.** A product has exactly one primary group, so
   display and browsing are unambiguous. Other classifications (genetic
   clade vs. brewing use) are relations or tags, not a second tree.
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
- Candidates are ranked: same group first, then sibling groups, then
  `functional` relations; each candidate shows the property differences
  (attenuation, flocculation, temperature range, alpha acid) and the
  relation's confidence and source.
- Hops need quantity adjustment on substitution (alpha acid differs); the
  preview shows the amount that keeps the calculated IBU, as a proposal the
  user accepts.

## 5. Inventory (CQ1)

If the personal inventory (D-028 CQ1) is accepted, the hierarchy is what
makes it useful:

- Inventory items are products with amounts on hand (and lot data where it
  matters: hop crop year, yeast production date).
- A recipe's ingredient matches inventory **at the product level first,
  then the group level**: "Recipe needs a Chico-lineage ale yeast; you have
  SafAle US-05 (same group)".
- Brewing a batch deducts what was used; the shopping list lists only what
  is missing at the level the recipe needs.

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

## 7. Open questions

| # | Question | Recommendation |
|---|---|---|
| IQ1 | Adopt group → product hierarchy with `group_ref` in recipes? | Yes; schema MINOR with 1.0 |
| IQ2 | Display format: "Group / Product" everywhere, or product first with the group as secondary text? | "Group / Product" in lists and the ingredient table; product alone where space is short, with the group in its accessible name |
| IQ3 | Who curates the shared tree: the project only, or contributed packs too? | Project curates the shipped tree; user and pack groups are marked as such |
| IQ4 | Start with which kinds? | Cultures and hops (substitution matters most), then malt, then non-beer kinds with the formulas that need them |
