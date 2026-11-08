/*
 * Prototype sample data. Recipe text here is user content (U12), not UI
 * strings, so it lives here and not in messages.js.
 *
 * Sources:
 * - Example recipes: docs/product/EXAMPLE_BEER_RECIPES.md, revision 2. Masses
 *   in grams, temperatures in °C, as printed there. "Stated" statistics are that
 *   document's external reference estimates, never Carboy results.
 * - Schwarzbier: fixtures/parity/lumina/ultimate-coffee-schwarzbier.json (the
 *   owner's recipe, cleared for publication). Only what the fixture holds:
 *   grain, hops, batch volume. No culture, mash schedule, or fermentation, so it
 *   is the realistic missing-data case.
 * - "Layout test" recipe: synthetic, for length and missing values. Not a recipe.
 *
 * Shapes are simplified from RECIPE_SCHEMA (ingredients, additions that place
 * an ingredient in a stage, stages with steps). Not the native format.
 */
(function () {
  "use strict";

  function builder(prefix) {
    let n = 0;
    const id = (k) => `${prefix}-${k}${++n}`;
    const recipe = { ingredients: [], stages: [], additions: [], notes: [] };
    const byName = new Map();
    const stageByKind = new Map();
    return {
      recipe,
      stage(kind, name, steps = [], params = null) {
        const s = { id: id("s"), kind, name, params, steps: steps.map((text) => ({ id: id("t"), text })) };
        recipe.stages.push(s);
        if (!stageByKind.has(kind)) stageByKind.set(kind, s);
        return s;
      },
      add(kind, name, value, unit, props, stageKind, timing) {
        let ing = byName.get(name);
        if (!ing) {
          ing = { id: id("i"), kind, name, props: props || {} };
          byName.set(name, ing);
          recipe.ingredients.push(ing);
        }
        const stage = typeof stageKind === "string" ? stageByKind.get(stageKind) : stageKind;
        recipe.additions.push({ id: id("a"), ing: ing.id, stage: stage.id, amount: { v: value, u: unit }, timing });
        return ing;
      },
      note(text) { recipe.notes.push({ id: id("n"), text }); },
    };
  }

  const malt = (color, ppg) => ({
    color: color == null ? undefined : { v: color, u: "degL", origin: "stated" },
    potential: ppg == null ? undefined : { v: ppg, u: "ppg", origin: "stated" },
  });
  const hop = (aa) => ({ alpha: aa == null ? undefined : { v: aa, u: "%", origin: "stated" } });

  // Shared shape for the example recipes: mash or steep, boil, ferment, package.
  function example(o) {
    const b = builder(o.id);
    const r = b.recipe;
    Object.assign(r, {
      id: o.id, name: o.name, lang: "en", beverage: "beer", style: o.style, variant: o.variant,
      origin: "example", status: "unbrewed", batch: { v: "18.93", u: "L" }, equipment: null,
      stated: o.stated, revision: 1, updated: "2026-11-06",
    });
    if (o.variant === "allGrain") b.stage("mash", "Mash", [o.mash]);
    else b.stage("steep", "Steep", ["68 °C for 30 min in 1–2 gal water"]);
    b.stage("boil", "Boil", ["60 min"]);
    b.stage("fermentation", "Fermentation", o.ferment);
    b.stage("packaging", "Packaging", [o.carb]);
    for (const [name, g, color, ppg, where, timing] of o.grain) b.add("fermentable", name, g, "g", malt(color, ppg), where, timing);
    for (const [name, g, aa, where, timing] of o.hops) b.add("hop", name, g, "g", hop(aa), where, timing);
    for (const [name, count, timing] of o.cultures) b.add("culture", name, count, "packet", {}, "fermentation", timing);
    (o.notes || []).forEach((t) => b.note(t));
    return r;
  }

  const MASH = () => ["mash", "Mash, 60 min"];

  function build() {
    const recipes = [];

    recipes.push(example({
      id: "apa-ag", name: "American Pale Ale", variant: "allGrain", style: "BJCP 2021 18B",
      stated: { og: "1.057", fg: "1.012", abv: "5.8", ibu: "31", srm: "6" },
      mash: "66.7 °C for 60 min",
      ferment: ["Pitch at 18 °C", "Hold 18–19 °C", "Allow 20–21 °C to finish"],
      carb: "2.4 volumes CO₂",
      grain: [["American two-row pale malt", "4763", "2", "37", ...MASH()], ["Crystal 40L", "227", "40", "34", ...MASH()]],
      hops: [["Cascade", "25.5", "6", "boil", "60 min before end"], ["Cascade", "28.3", "6", "boil", "15 min before end"],
        ["Cascade", "28.3", "6", "boil", "5 min before end"], ["Cascade", "28", "6", "fermentation", "Dry hop, 3 days near end"]],
      cultures: [["SafAle US-05 (11.5 g)", "1", "At pitch"]],
      notes: ["Restrained crystal malt and layered Cascade additions provide a classic citrus-forward pale ale."],
    }));

    recipes.push(example({
      id: "apa-dme", name: "American Pale Ale", variant: "extract", style: "BJCP 2021 18B",
      stated: { og: "1.056", fg: "1.012", abv: "5.7", ibu: "31", srm: "6" },
      ferment: ["Pitch at 18 °C", "Hold 18–19 °C", "Allow 20–21 °C to finish"],
      carb: "2.4 volumes CO₂",
      grain: [["Light DME", "2948", "3", "44", "boil", "Dissolve before boil"], ["Crystal 40L", "227", "40", "34", "steep", "Steep 30 min"]],
      hops: [["Cascade", "25.5", "6", "boil", "60 min before end"], ["Cascade", "28.3", "6", "boil", "15 min before end"],
        ["Cascade", "28.3", "6", "boil", "5 min before end"], ["Cascade", "28", "6", "fermentation", "Dry hop, 3 days near end"]],
      cultures: [["SafAle US-05 (11.5 g)", "1", "At pitch"]],
    }));

    recipes.push(example({
      id: "red-ag", name: "Irish Red Ale", variant: "allGrain", style: "BJCP 2021 15A",
      stated: { og: "1.048", fg: "1.012", abv: "4.8", ibu: "21", srm: "11" },
      mash: "67.2 °C for 60 min",
      ferment: ["Pitch at 18 °C", "Hold 18–19 °C", "Allow 20 °C to finish"],
      carb: "2.1 volumes CO₂",
      grain: [["British pale ale malt", "3969", "3", "37", ...MASH()], ["Crystal 60L", "227", "60", "34", ...MASH()],
        ["Roasted barley, 300L", "57", "300", "25", ...MASH()]],
      hops: [["East Kent Goldings", "34.0", "5", "boil", "60 min before end"]],
      cultures: [["SafAle S-04 (11.5 g)", "1", "At pitch"]],
    }));

    recipes.push(example({
      id: "stout-ag", name: "Dry Irish Stout", variant: "allGrain", style: "BJCP 2021 15B",
      stated: { og: "1.044", fg: "1.010", abv: "4.5", ibu: "27", srm: "31" },
      mash: "65.6 °C for 60 min",
      ferment: ["Pitch at 18 °C", "Hold 18–20 °C", "Allow 21 °C to finish"],
      carb: "1.9 volumes CO₂",
      grain: [["British pale ale malt", "2948", "3", "37", ...MASH()], ["Flaked barley", "680", "2", "32", ...MASH()],
        ["Roasted barley, 500L", "340", "500", "25", ...MASH()], ["Chocolate malt, 350L", "57", "350", "28", ...MASH()]],
      hops: [["East Kent Goldings", "42.5", "5", "boil", "60 min before end"]],
      cultures: [["SafAle US-05 (11.5 g)", "1", "At pitch"]],
    }));

    recipes.push(example({
      id: "hefe-ag", name: "Hefeweizen", variant: "allGrain", style: "BJCP 2021 10A",
      stated: { og: "1.053", fg: "1.012", abv: "5.3", ibu: "14", srm: "4" },
      mash: "66.7 °C for 60 min",
      ferment: ["Pitch at 18 °C", "Hold 18–20 °C", "Package fresh"],
      carb: "2.8 volumes CO₂",
      grain: [["Wheat malt", "2722", "2", "38", ...MASH()], ["Pilsner malt", "1814", "1.7", "37", ...MASH()]],
      hops: [["Hallertau Mittelfrüh", "28.3", "4", "boil", "60 min before end"]],
      cultures: [["LalBrew Munich Classic (11 g)", "1", "At pitch"]],
      notes: ["Add 0.25 lb rinsed rice hulls as a nonfermentable lautering aid."],
    }));

    recipes.push(example({
      id: "marzen-ag", name: "Märzen", variant: "allGrain", style: "BJCP 2021 6A",
      stated: { og: "1.060", fg: "1.014", abv: "6.0", ibu: "21", srm: "9" },
      mash: "66.7 °C for 60 min",
      ferment: ["Pitch at 10 °C", "Hold 10–12 °C", "Within 2–5 points of FG: 16–18 °C for 2–3 days",
        "Cool gradually", "Lager at 1–3 °C for 4–6 weeks"],
      carb: "2.5 volumes CO₂",
      grain: [["Munich I malt", "2948", "7", "35", ...MASH()], ["Vienna malt", "1588", "4", "36", ...MASH()],
        ["Pilsner malt", "794", "1.7", "37", ...MASH()], ["Caramunich I, 35L", "113", "35", "34", ...MASH()]],
      hops: [["Hallertau Mittelfrüh", "42.5", "4", "boil", "60 min before end"], ["Hallertau Mittelfrüh", "14.2", "4", "boil", "10 min before end"]],
      cultures: [["SafLager W-34/70 (11.5 g)", "2", "At pitch"]],
    }));

    const dubbel = example({
      id: "dubbel-ag", name: "Belgian Dubbel", variant: "allGrain", style: "BJCP 2021 26B",
      stated: { og: "1.069", fg: "1.012", abv: "7.4", ibu: "19", srm: "17" },
      mash: "65.6 °C for 60 min",
      ferment: ["Pitch at 18 °C", "Hold 48 hours", "Rise gradually to 22–24 °C", "Condition 3–6 weeks"],
      carb: "2.6 volumes CO₂",
      grain: [["Belgian Pilsner malt", "4763", "1.7", "37", ...MASH()], ["Munich I malt", "454", "7", "35", ...MASH()],
        ["Special B, 180L", "113", "180", "30", ...MASH()], ["Caramunich II, 45L", "227", "45", "34", ...MASH()],
        ["Dark Belgian candi syrup, 90 SRM", "454", null, "32", "boil", "10 min before end"]],
      hops: [["Styrian Goldings", "36.9", "5", "boil", "60 min before end"]],
      cultures: [["LalBrew Abbaye (11 g)", "2", "At pitch"]],
      notes: ["Add the syrup with 10 minutes left in the boil, stirring to avoid scorching."],
    });
    // The document gives the syrup's colour as 90 SRM, not in °L like the
    // grains. Colour scales convert only by formula (RECIPE_CORE §3), so the
    // prototype stores it in its own unit rather than converting it.
    dubbel.ingredients.find((i) => i.name.startsWith("Dark Belgian")).props.color = { v: "90", u: "SRM", origin: "stated" };
    const specialB = dubbel.additions.find((a) => dubbel.ingredients.find((i) => i.id === a.ing).name.startsWith("Special B"));
    dubbel.proposal = {
      id: "proposal-1",
      author: "assistant",
      rationale: "Reduce Special B slightly for a less raisin-forward finish.",
      changes: [{ addition: specialB.id, from: { v: "113", u: "g" }, to: { v: "85", u: "g" } }],
      created: "2026-11-06",
    };
    recipes.push(dubbel);

    // The owner's recipe, as far as the parity fixture records it.
    {
      const b = builder("schwarz");
      const r = b.recipe;
      Object.assign(r, {
        id: "schwarz", name: "Ultimate Coffee Schwarzbier", lang: "en", beverage: "beer", style: null, variant: "allGrain",
        origin: "owner", status: "draft", batch: { v: "23.015", u: "L" }, equipment: null, stated: null,
        revision: 1, updated: "2026-10-13",
      });
      b.stage("mash", "Mash");
      b.stage("boil", "Boil", ["60 min"]);
      for (const [name, kg, color, ppg] of [["German Pilsner Malt", "3034.533", "1.8", "37.26"], ["Weyermann Munich I", "1254", "7", "36.8"],
        ["Vienna Malt", "376", "3.5", "36.8"], ["Weyermann Carafa Special II", "294.835", "425", "32.2"], ["Weyermann Caramunich I", "125", "38", "34.04"]]) {
        b.add("fermentable", name, kg, "g", malt(color, ppg), "mash", "Mash");
      }
      b.add("hop", "Magnum", "21.262142", "g", hop("12"), "boil", "60 min before end");
      b.add("hop", "Hallertau Mittelfrueh", "17", "g", hop("4"), "boil", "10 min before end");
      recipes.push(r);
    }

    // Synthetic long recipe: realistic shape, placeholder amounts.
    {
      const b = builder("long");
      const r = b.recipe;
      Object.assign(r, {
        id: "long", name: "Layout test: long recipe (synthetic, do not brew)", lang: "en", beverage: "beer", style: null,
        variant: "allGrain", origin: "synthetic", status: "draft", batch: { v: "40", u: "L" }, equipment: null, stated: null,
        revision: 3, updated: "2026-11-07",
      });
      const mash = b.stage("mash", "Step mash", ["Acid rest 40 °C, 15 min", "Protein rest 52 °C, 10 min", "Beta rest 63 °C, 35 min",
        "Alpha rest 72 °C, 20 min", "Mash out 78 °C, 10 min"]);
      const lauter = b.stage("lauter", "Lauter and sparge", ["Sparge at 76 °C to 48 L"]);
      const boil = b.stage("boil", "Boil", ["90 min"]);
      const whirl = b.stage("whirlpool", "Whirlpool", ["Hop stand at 80 °C, 25 min"]);
      b.stage("chilling", "Chilling", ["To 12 °C"]);
      const primary = b.stage("fermentation", "Primary fermentation", ["Pitch at 12 °C", "Hold 12 °C for 7 days", "Free rise to 18 °C"]);
      const dry = b.stage("fermentation", "Dry hop", ["Hold 16 °C"]);
      const cond = b.stage("conditioning", "Conditioning", ["Crash to 2 °C", "Hold 3 weeks"]);
      const pkg = b.stage("packaging", "Packaging", ["2.5 volumes CO₂"]);
      const grains = [["Pilsner malt", "5200", "1.7", "37"], ["Munich I malt", "1800", "7", "35"], ["Vienna malt", "1200", "4", "36"],
        ["Wheat malt", "900", "2", "38"], ["Flaked barley", "400", "2", "32"], ["Caramunich I, 35L", "300", "35", "34"],
        ["Crystal 60L", "250", "60", "34"], ["Special B, 180L", "120", "180", "30"], ["Chocolate malt, 350L", "60", "350", "28"],
        ["Roasted barley, 500L", "40", "500", "25"], ["Smoked malt, local maltster", "500", null, null], ["Acidulated malt", "200", null, "27"]];
      for (const [name, g, c, p] of grains) b.add("fermentable", name, g, "g", malt(c, p), mash, "Mash");
      b.add("water_agent", "Gypsum", "4", "g", {}, mash, "Mash");
      b.add("water_agent", "Calcium chloride", "3", "g", {}, mash, "Mash");
      b.add("water_agent", "Lactic acid 80%", "2", "mL", {}, lauter, "Sparge water");
      const hops = [["Magnum", "12", "30", "90 min before end"], ["Hallertau Mittelfrüh", "4", "25", "60 min before end"],
        ["Styrian Goldings", "5", "20", "45 min before end"], ["East Kent Goldings", "5", "20", "30 min before end"],
        ["Cascade", "6", "25", "20 min before end"], ["Hallertau Mittelfrüh", "4", "30", "15 min before end"],
        ["Experimental hop, code unknown", null, "20", "10 min before end"], ["Cascade", "6", "30", "5 min before end"],
        ["Styrian Goldings", "5", "20", "Flameout"]];
      for (const [name, aa, g, t] of hops) b.add("hop", name, g, "g", hop(aa), boil, t);
      b.add("other", "Kettle finings", "1", "tablet", {}, boil, "15 min before end");
      b.add("other", "Yeast nutrient", "2", "g", {}, boil, "10 min before end");
      b.add("fermentable", "Dark Belgian candi syrup, 90 SRM", "400", "g", { potential: { v: "32", u: "ppg", origin: "stated" } }, boil, "10 min before end");
      b.add("hop", "Cascade", "40", "g", hop("6"), whirl, "Hop stand");
      b.add("hop", "East Kent Goldings", "30", "g", hop("5"), whirl, "Hop stand");
      b.add("hop", "Experimental hop, code unknown", "40", "g", hop(null), whirl, "Hop stand");
      b.add("culture", "SafLager W-34/70 (11.5 g)", "3", "packet", {}, primary, "At pitch");
      b.add("culture", "LalBrew Abbaye (11 g)", "1", "packet", {}, primary, "Day 3");
      b.add("hop", "Cascade", "60", "g", hop("6"), dry, "Dry hop, day 1");
      b.add("hop", "Experimental hop, code unknown", "60", "g", hop(null), dry, "Dry hop, day 1");
      b.add("hop", "Hallertau Mittelfrüh", "30", "g", hop("4"), dry, "Dry hop, day 4");
      b.add("other", "Gelatin", "5", "g", {}, cond, "Day 2 of cold crash");
      b.add("fermentable", "Priming sugar", "180", "g", {}, pkg, "At bottling");
      b.note("Synthetic recipe for testing long lists, missing values, and multi-step stages. Amounts are placeholders. Do not brew.");
      recipes.push(r);
    }

    return recipes;
  }

  window.PROTOTYPE_DATA = { build };
})();
