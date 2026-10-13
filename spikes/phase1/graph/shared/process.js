// Spike process model: stages in a linear chain, additions shown on their
// stage (RECIPE_SCHEMA §7.3, Q5: dry hop etc. are additions, not nodes).

const SMALL = [
  ["mash", "Mash", ["Pilsner malt 4.31 kg", "Wheat malt 0.68 kg", "Vienna malt 0.34 kg", "Acidulated malt 0.11 kg", "Gypsum 3 g"]],
  ["sparge", "Sparge", ["Calcium chloride 1 g"]],
  ["boil", "Boil 60 min", ["Cane sugar 0.23 kg", "Styrian Goldings 28 g at 60 min", "Saaz 28 g at flameout"]],
  ["whirlpool", "Whirlpool", ["Dried rosemary 2 g", "Dried peppermint 3 g"]],
  ["chilling", "Chilling", []],
  ["fermentation", "Fermentation", ["Saison yeast 1 pack", "Dry hop: Saaz 20 g, day 5"]],
  ["conditioning", "Conditioning", []],
  ["packaging", "Packaging", ["Priming sugar 120 g"]],
];

export function sampleRecipe() {
  return {
    name: "Verdant Reverie Saison (spike sample)",
    stages: SMALL.map(([kind, name, additions], i) => ({ id: `s${i}`, kind, name, additions })),
  };
}

/**
 * Provisional "large recipe" until the performance budget is measured from
 * the owner's recipes (PHASE1_SPIKE_PLAN step 3). Defaults: 40 stages with
 * 8 additions each, roughly 5x a typical recipe.
 */
export function largeRecipe(stages = 40, additionsPerStage = 8) {
  const kinds = ["mash", "boil", "whirlpool", "fermentation", "conditioning"];
  return {
    name: `Large recipe (provisional: ${stages} stages x ${additionsPerStage} additions)`,
    stages: Array.from({ length: stages }, (_, i) => ({
      id: `s${i}`,
      kind: kinds[i % kinds.length],
      name: `${kinds[i % kinds.length]} ${i + 1}`,
      additions: Array.from({ length: additionsPerStage }, (_, j) => `Ingredient ${i + 1}.${j + 1}`),
    })),
  };
}

export const COLUMN = 260;
export const ROW = 220;
export const PER_ROW = 6;

export function position(index) {
  return { x: (index % PER_ROW) * COLUMN, y: Math.floor(index / PER_ROW) * ROW };
}

export function stageLabel(stage, index, total) {
  const n = stage.additions.length;
  return `Stage ${index + 1} of ${total}: ${stage.name}, ${n} addition${n === 1 ? "" : "s"}`;
}

export function toGraph(recipe) {
  const total = recipe.stages.length;
  const nodes = recipe.stages.map((stage, i) => ({
    id: stage.id,
    type: "stage",
    position: position(i),
    data: { stage, index: i, total },
    ariaLabel: stageLabel(stage, i, total),
  }));
  const edges = recipe.stages.slice(1).map((stage, i) => ({
    id: `f${i}`,
    source: recipe.stages[i].id,
    target: stage.id,
    ariaLabel: `Transfer from ${recipe.stages[i].name} to ${stage.name}`,
  }));
  return { nodes, edges };
}

/**
 * Non-drag alternative (WCAG 2.2 SC 2.5.7): the equivalent of the editor
 * command move_stage (EDITOR_COMMANDS §5.5). Returns a new recipe, or the
 * same one if the move is impossible.
 */
export function moveStage(recipe, stageId, delta) {
  const i = recipe.stages.findIndex((s) => s.id === stageId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= recipe.stages.length) return recipe;
  const stages = [...recipe.stages];
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return { ...recipe, stages };
}

/**
 * Screen-reader text for the graph (xyflow ariaLabelConfig). The library
 * default says "Press delete to remove it", but stages are only removed
 * through editor commands with review, so the Delete key is disabled and the
 * description says what the page actually does.
 */
// xyflow 12.12 / Svelte Flow 1.7 read "keyboardDisabled" when keyboard
// support is ON and "default" when it is off (A11yDescriptions), so both keys
// carry the same text. Keyboard support is always on here.
const NODE_DESCRIPTION =
  "Press Enter or Space to select this stage; its details appear under Selected stage. Arrow keys then move it on the canvas. To change the stage order, use Move stage earlier or Move stage later.";
export const ARIA_LABELS = {
  "node.a11yDescription.default": NODE_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": NODE_DESCRIPTION,
  "edge.a11yDescription.default": "Transfer between stages.",
};
