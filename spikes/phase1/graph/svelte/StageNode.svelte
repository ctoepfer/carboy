<script>
  import { Handle, Position } from "@xyflow/svelte";
  let { data } = $props();
  const shown = $derived(data.stage.additions.slice(0, 4));
</script>

<div class="stage">
  <!-- Connection points are decorative here (connecting is off); hide them from assistive technology. -->
  <Handle type="target" position={Position.Left} aria-hidden="true" />
  <strong>{data.stage.name}</strong>
  {#if shown.length > 0}
    <ul>
      {#each shown as a (a)}<li>{a}</li>{/each}
      {#if data.stage.additions.length > 4}<li>and {data.stage.additions.length - 4} more</li>{/if}
    </ul>
  {/if}
  <Handle type="source" position={Position.Right} aria-hidden="true" />
</div>
