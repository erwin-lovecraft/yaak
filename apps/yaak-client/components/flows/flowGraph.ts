import type { Edge, Node } from "@xyflow/react";
import type { Flow, NodeKind, NodeRun } from "@yaakapp-internal/rpc-schema";
import { generateId } from "../../lib/generateId";

export type FlowNodeData = {
  title: string;
  operation: NodeKind;
  run?: NodeRun | null;
};

export type FlowCanvasNode = Node<FlowNodeData, "flow">;

export const SUCCESS_HANDLE = "success";
export const FAIL_HANDLE = "fail";

export type NodeKindType = NodeKind["type"];

export const NODE_KIND_LABELS: Record<NodeKindType, string> = {
  httpRequest: "HTTP Request",
  extract: "Extract",
  timer: "Timer",
  delay: "Delay",
};

export function defaultOperation(type: NodeKindType): NodeKind {
  switch (type) {
    case "httpRequest":
      return { type, requestId: "" };
    case "extract":
      return { type, path: "", output: "" };
    case "timer":
      return { type, intervalSecs: 60 };
    case "delay":
      return { type, millis: 1000 };
  }
}

export function createCanvasNode(
  type: NodeKindType,
  position: { x: number; y: number },
): FlowCanvasNode {
  return {
    id: generateId(),
    type: "flow",
    position,
    data: { title: NODE_KIND_LABELS[type], operation: defaultOperation(type) },
  };
}

/** Collapse the canvas into the `Flow` the backend runs. */
export function toFlow(id: string, name: string, nodes: FlowCanvasNode[], edges: Edge[]): Flow {
  const hasIncoming = new Set(edges.map((e) => e.target));
  const target = (nodeId: string, handle: string) =>
    edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null;

  // The start is the left-most node nothing points at.
  const start = nodes
    .filter((n) => !hasIncoming.has(n.id))
    .sort((a, b) => a.position.x - b.position.x)[0];

  return {
    id,
    name,
    startNodeId: start?.id ?? nodes[0]?.id ?? null,
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.data.title,
      position: n.position,
      operation: n.data.operation,
      success: target(n.id, SUCCESS_HANDLE),
      fail: target(n.id, FAIL_HANDLE),
    })),
  };
}
