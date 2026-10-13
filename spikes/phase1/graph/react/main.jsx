import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../shared/app.css";
import { renderNav } from "../shared/nav.js";
import { isAuto } from "../shared/measure.js";
import { ARIA_LABELS, largeRecipe, moveStage, sampleRecipe, toGraph } from "../shared/process.js";
import { runAuto } from "../shared/auto.js";
import pkg from "../package.json";

renderNav(document.getElementById("header"), "graph-react", 1);

function StageNode({ data }) {
  const { stage } = data;
  const shown = stage.additions.slice(0, 4);
  return (
    <div className="stage">
      <Handle type="target" position={Position.Left} />
      <strong>{stage.name}</strong>
      {shown.length > 0 && (
        <ul>
          {shown.map((a) => <li key={a}>{a}</li>)}
          {stage.additions.length > 4 && <li>and {stage.additions.length - 4} more</li>}
        </ul>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { stage: StageNode };

function Editor() {
  const [recipe, setRecipe] = useState(sampleRecipe);
  const graph = useMemo(() => toGraph(recipe), [recipe]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const flow = useReactFlow();
  const canvas = useRef(null);

  useEffect(() => {
    setNodes(graph.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    setEdges(graph.edges);
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectionChange = useCallback(({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null), []);
  const index = recipe.stages.findIndex((s) => s.id === selectedId);
  const selected = index >= 0 ? recipe.stages[index] : null;

  const move = (delta) => {
    const next = moveStage(recipe, selectedId, delta);
    if (next === recipe) return;
    setRecipe(next);
    const at = next.stages.findIndex((s) => s.id === selectedId);
    setAnnouncement(`${selected.name} moved to position ${at + 1} of ${next.stages.length}`);
  };

  useEffect(() => {
    isAuto().then((auto) => auto && runAuto({
      framework: "react",
      versions: { "@xyflow/react": pkg.devDependencies["@xyflow/react"], react: pkg.devDependencies.react },
      root: canvas.current,
      setRecipe,
      setViewport: (v) => flow.setViewport(v),
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <h1>Process graph: React Flow</h1>
      <div className="toolbar" role="toolbar" aria-label="Graph tools">
        <label>
          Recipe{" "}
          <select onChange={(e) => setRecipe(e.target.value === "large" ? largeRecipe() : sampleRecipe())}>
            <option value="small">Sample (8 stages)</option>
            <option value="large">Large (provisional, 40 stages)</option>
          </select>
        </label>
        <button id="move-earlier" disabled={!selected || index === 0} onClick={() => move(-1)}>Move stage earlier</button>
        <button id="move-later" disabled={!selected || index === recipe.stages.length - 1} onClick={() => move(1)}>Move stage later</button>
      </div>
      <p id="announce" className="sr-only" aria-live="polite">{announcement}</p>
      <div className="layout">
        <div className="canvas" ref={canvas} data-order={recipe.stages.map((s) => s.id).join(",")}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            nodesFocusable
            edgesFocusable={false}
            nodesConnectable={false}
            fitView
            minZoom={0.1}
            deleteKeyCode={null}
            ariaLabelConfig={ARIA_LABELS}
            aria-label={`Process graph of ${recipe.name}`}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside aria-labelledby="inspector-title">
          <h2 id="inspector-title">Selected stage</h2>
          {selected ? (
            <>
              <p>
                <strong>{selected.name}</strong> ({selected.kind}), position {index + 1} of {recipe.stages.length}
              </p>
              <ul>{selected.additions.map((a) => <li key={a}>{a}</li>)}</ul>
            </>
          ) : (
            <p>None. Tab to a stage and press Enter to select it.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  </StrictMode>,
);
