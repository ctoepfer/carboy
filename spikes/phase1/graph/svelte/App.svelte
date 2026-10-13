<script>
  import { Background, Controls, SvelteFlow } from "@xyflow/svelte";
  import StageNode from "./StageNode.svelte";
  import Flow from "./Flow.svelte";
  import { isAuto } from "../shared/measure.js";
  import { ARIA_LABELS, largeRecipe, moveStage, sampleRecipe, toGraph } from "../shared/process.js";
  import { runAuto } from "../shared/auto.js";
  import pkg from "../package.json";

  const nodeTypes = { stage: StageNode };
  let recipe = $state.raw(sampleRecipe());
  let nodes = $state.raw([]);
  let edges = $state.raw([]);
  let selectedId = $state(null);
  let announcement = $state("");
  let canvas;
  let setViewport;

  $effect(() => {
    const g = toGraph(recipe);
    nodes = g.nodes.map((n) => ({ ...n, selected: n.id === selectedId }));
    edges = g.edges;
  });

  const index = $derived(recipe.stages.findIndex((s) => s.id === selectedId));
  const selected = $derived(index >= 0 ? recipe.stages[index] : null);

  function move(delta) {
    const next = moveStage(recipe, selectedId, delta);
    if (next === recipe) return;
    const name = selected.name;
    recipe = next;
    const at = next.stages.findIndex((s) => s.id === selectedId);
    announcement = `${name} moved to position ${at + 1} of ${next.stages.length}`;
  }

  async function ready(fn) {
    if (setViewport) return;
    setViewport = fn;
    if (await isAuto()) {
      runAuto({
        framework: "svelte",
        versions: { "@xyflow/svelte": pkg.devDependencies["@xyflow/svelte"], svelte: pkg.devDependencies.svelte },
        root: canvas,
        setRecipe: (r) => (recipe = r),
        setViewport,
      });
    }
  }
</script>

<main>
  <h1>Process graph: Svelte Flow</h1>
  <div class="toolbar" role="toolbar" aria-label="Graph tools">
    <label>
      Recipe
      <select onchange={(e) => (recipe = e.currentTarget.value === "large" ? largeRecipe() : sampleRecipe())}>
        <option value="small">Sample (8 stages)</option>
        <option value="large">Large (provisional, 40 stages)</option>
      </select>
    </label>
    <button id="move-earlier" disabled={!selected || index === 0} onclick={() => move(-1)}>Move stage earlier</button>
    <button id="move-later" disabled={!selected || index === recipe.stages.length - 1} onclick={() => move(1)}>Move stage later</button>
  </div>
  <p id="announce" class="sr-only" aria-live="polite">{announcement}</p>
  <div class="layout">
    <div class="canvas" bind:this={canvas} data-order={recipe.stages.map((s) => s.id).join(",")}>
      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        onselectionchange={({ nodes: sel }) => (selectedId = sel[0]?.id ?? null)}
        nodesFocusable
        edgesFocusable={false}
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        deleteKey={null}
        ariaLabelConfig={ARIA_LABELS}
        aria-label={`Process graph of ${recipe.name}`}
      >
        <Background />
        <Controls showLock={false} />
        <Flow onready={ready} />
      </SvelteFlow>
    </div>
    <aside aria-labelledby="inspector-title">
      <h2 id="inspector-title">Selected stage</h2>
      {#if selected}
        <p><strong>{selected.name}</strong> ({selected.kind}), position {index + 1} of {recipe.stages.length}</p>
        <ul>{#each selected.additions as a (a)}<li>{a}</li>{/each}</ul>
      {:else}
        <p>None. Tab to a stage and press Enter to select it.</p>
      {/if}
    </aside>
  </div>
</main>
