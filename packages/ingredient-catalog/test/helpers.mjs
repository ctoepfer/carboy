// Shared test data. Synthetic: "Maker A" and "Maker B" are invented, their
// numbers mean nothing, and nothing here is catalog data. D-009 is open, so
// no bundled data exists yet.
export const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
export const q = (value, unit) => ({ value, unit });

export const CAT = U(1);
export const ID = {
  source: U(10), sheet: U(11), compilation: U(12),
  base: U(20), pilsner: U(21), german: U(22), yeastRoot: U(23), cleanAle: U(24), honey: U(25),
  makerA: U(30), makerB: U(31), makerC: U(32), yeastA: U(33), yeastB: U(34), yeastC: U(35), yeastD: U(36),
  saccharomyces: U(40), brettanomyces: U(41), strainA: U(42), strainB: U(43),
  rel1: U(50), rel2: U(51), rel3: U(52), rel4: U(53), rel5: U(54), rel6: U(55), rel7: U(56), rel8: U(57), rel9: U(58),
  ev1: U(60), ev2: U(61), ev3: U(62), ev4: U(63), ev5: U(64), ev6: U(65), ev7: U(66), ev8: U(67), ev9: U(68), ev10: U(69),
};

export const evidence = (id, kind = "manufacturer", extra = {}) => ({ id, source: ID.sheet, kind, certainty: "confirmed", stance: "supports", ...extra });
export const placed = (id, from, to, ev) => ({ id, type: "in_group", from, to, evidence: [evidence(ev, "editorial")] });

/** A small curated catalog that passes validation. */
export function curated() {
  return {
    format: "ingredient-catalog",
    schema_version: "0.1",
    catalog: CAT,
    version: "1",
    class: "curated",
    name: "Test catalog",
    sources: [
      { id: ID.sheet, title: "Maker data sheet", redistribution: "redistributable", licence: "CC0-1.0" },
      { id: ID.source, title: "A genomics paper", redistribution: "reference-only" },
      { id: ID.compilation, title: "A community compilation", redistribution: "unknown" },
    ],
    groups: [
      { id: ID.base, kind: "fermentable", level: "organizational", name: "Base malts" },
      { id: ID.pilsner, kind: "fermentable", level: "functional", name: "Pilsner base malt", parent: ID.base },
      { id: ID.german, kind: "fermentable", level: "functional", name: "German Pilsner malt", parent: ID.pilsner, aliases: ["Pilsen malt (German)"] },
      { id: ID.yeastRoot, kind: "culture", level: "organizational", name: "Ale yeasts" },
      { id: ID.cleanAle, kind: "culture", level: "functional", name: "Clean American ale", parent: ID.yeastRoot },
    ],
    products: [
      { id: ID.makerA, kind: "fermentable", maker: "Maker A", name: "Pilsner", aliases: ["A Pils"], identifiers: [{ scheme: "maker_code", value: "A-100" }], primary_group: ID.german, properties: { color: { ...q("3.5", "EBC"), source: ID.sheet } }, status: "active" },
      { id: ID.makerB, kind: "fermentable", maker: "Maker B", name: "Pilsner", primary_group: ID.german, properties: { color: q("6", "EBC") }, status: "active" },
      { id: ID.makerC, kind: "fermentable", maker: "Maker C", name: "Pilsner", primary_group: ID.german, properties: {}, status: "active" },
      { id: ID.yeastA, kind: "culture", maker: "Maker A", name: "Clean ale", primary_group: ID.cleanAle, traits: { diastatic: false, phenolic: false }, status: "active" },
      { id: ID.yeastB, kind: "culture", maker: "Maker B", name: "Clean ale", primary_group: ID.cleanAle, traits: { diastatic: true }, status: "active" },
      { id: ID.yeastC, kind: "culture", maker: "Maker C", name: "Clean ale", primary_group: ID.cleanAle, status: "active" },
    ],
    taxa: [
      { id: ID.saccharomyces, rank: "species", name: "Saccharomyces cerevisiae" },
      { id: ID.brettanomyces, rank: "species", name: "Brettanomyces bruxellensis", synonyms: ["Dekkera bruxellensis"] },
    ],
    strains: [
      { id: ID.strainA, name: "Strain A" },
      { id: ID.strainB, name: "Strain B" },
    ],
    relations: [
      placed(ID.rel1, ID.makerA, ID.german, ID.ev1),
      placed(ID.rel2, ID.makerB, ID.german, ID.ev2),
      placed(ID.rel3, ID.makerC, ID.german, ID.ev3),
      placed(ID.rel4, ID.yeastA, ID.cleanAle, ID.ev4),
      placed(ID.rel5, ID.yeastB, ID.cleanAle, ID.ev5),
      placed(ID.rel6, ID.yeastC, ID.cleanAle, ID.ev6),
    ],
  };
}
