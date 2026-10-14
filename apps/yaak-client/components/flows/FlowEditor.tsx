import "@xyflow/react/dist/style.css";
import type { Connection, Edge, NodeChange } from "@xyflow/react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { HStack } from "@yaakapp-internal/ui";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { activeFlowAtom, patchFlow } from "./flowStore";
import type { FlowDoc } from "./flowStore";
import { Button } from "../core/Button";
import type { FlowCanvasNode, FlowNodeData, NodeKindType } from "./flowGraph";
import { createCanvasNode, FAIL_HANDLE, NODE_KIND_LABELS } from "./flowGraph";
import { flowRunsAtom, runFlowOnce, runningFlowIdsAtom, startFlow, stopFlow } from "./flowRunner";
import { FlowInspector } from "./FlowInspector";
import { FlowNodeCard } from "./FlowNodeCard";

const nodeTypes = { flow: FlowNodeCard };

export function FlowEditor() {
  const flow = useAtomValue(activeFlowAtom);
  if (flow == null) return null;
  // Keyed so each flow gets its own canvas state.
  return (
    <ReactFlowProvider key={flow.id}>
      <FlowEditorInner flow={flow} />
    </ReactFlowProvider>
  );
}

function FlowEditorInner({ flow }: { flow: FlowDoc }) {
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<FlowCanvasNode[]>(flow.nodes);
  const [edges, setEdges] = useState<Edge[]>(flow.edges);
  const runs = useAtomValue(flowRunsAtom)[flow.id];
  const ticking = useAtomValue(runningFlowIdsAtom).has(flow.id);
  const hasTimer = nodes.some((n) => n.data.operation.type === "timer");

  // Results come from the runner, so they keep arriving while the flow ticks in the background.
  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, run: runs?.[n.id] ?? null } })),
    [nodes, runs],
  );

  // Write the canvas back so switching flows, or leaving the page, keeps it.
  useEffect(() => patchFlow(flow.id, { nodes, edges }), [flow.id, nodes, edges]);

  const selected = displayNodes.find((n) => n.selected) ?? null;

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowCanvasNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) =>
      setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );
  // A handle drives one edge: connecting again replaces the previous target.
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) =>
        addEdge(
          c,
          es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
        ),
      ),
    [],
  );

  const addNode = (type: NodeKindType) => {
    const el = document.querySelector(".react-flow");
    const rect = el?.getBoundingClientRect();
    const position = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2 - 128,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 3,
    });
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { ...createCanvasNode(type, position), selected: true },
    ]);
  };

  const patchNode = useCallback((id: string, patch: Partial<FlowNodeData>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, []);

  const defaultEdgeOptions = useMemo(() => ({ animated: false }), []);
  const failEdgeStyle = useCallback(
    (e: Edge): Edge =>
      e.sourceHandle === FAIL_HANDLE ? { ...e, style: { stroke: "var(--color-danger)" } } : e,
    [],
  );

  return (
    <div className="flex flex-col h-full w-full">
      <HStack space={2} className="p-2 border-b border-border" alignItems="center">
        <div className="px-2 text-sm font-semibold">{flow.name}</div>
        {(Object.keys(NODE_KIND_LABELS) as NodeKindType[]).map((type) => (
          <Button key={type} size="sm" variant="border" onClick={() => addNode(type)}>
            + {NODE_KIND_LABELS[type]}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="border"
          disabled={nodes.length === 0}
          onClick={() => void runFlowOnce(flow.id)}
        >
          Run once
        </Button>
        {hasTimer && (
          <Button
            size="sm"
            color={ticking ? "danger" : "primary"}
            onClick={() => (ticking ? stopFlow(flow.id) : startFlow(flow.id))}
          >
            {ticking ? "Stop" : "Start"}
          </Button>
        )}
      </HStack>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={displayNodes}
            edges={edges.map(failEdgeStyle)}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={["Backspace", "Delete"]}
            colorMode="system"
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <div className="w-80 border-l border-border overflow-y-auto">
          {selected ? (
            <FlowInspector node={selected} onChange={patchNode} onDelete={deleteNode} />
          ) : (
            <div className="p-4 text-sm text-text-subtle">
              Add a node, then connect its Success and Fail outputs to the next nodes. The flow
              starts at the left-most node with no incoming connection.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
