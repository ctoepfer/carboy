<script>
  // Child of SvelteFlow, so it can use useSvelteFlow() for setViewport.
  import { useSvelteFlow } from "@xyflow/svelte";
  let { onready } = $props();
  const flow = useSvelteFlow();
  $effect(() => onready((v) => flow.setViewport(v)));
</script>
