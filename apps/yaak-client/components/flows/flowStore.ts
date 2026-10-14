import type { Edge } from "@xyflow/react";
import { atom } from "jotai";
import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { activeWorkspaceIdAtom } from "../../hooks/useActiveWorkspace";
import { generateId } from "../../lib/generateId";
import { jotaiStore } from "../../lib/jotai";
import { setWorkspaceSearchParams } from "../../lib/setWorkspaceSearchParams";
import type { FlowCanvasNode } from "./flowGraph";

/** A flow as it is edited. Kept in memory for now; persistence comes later. */
export interface FlowDoc {
  id: string;
  workspaceId: string;
  name: string;
  nodes: FlowCanvasNode[];
  edges: Edge[];
}

export const flowDocsAtom = atom<FlowDoc[]>([]);

export const activeFlowIdAtom = atom<string | null>(null);

export const activeFlowAtom = atom((get) => {
  const id = get(activeFlowIdAtom);
  return get(flowDocsAtom).find((f) => f.id === id) ?? null;
});

export function useSubscribeActiveFlowId() {
  const { flow_id } = useSearch({ strict: false });
  useEffect(() => jotaiStore.set(activeFlowIdAtom, flow_id ?? null), [flow_id]);
}

export function openFlow(id: string) {
  setWorkspaceSearchParams({ flow_id: id, request_id: null, folder_id: null });
}

export function createFlow(): string | null {
  const workspaceId = jotaiStore.get(activeWorkspaceIdAtom);
  if (workspaceId == null) return null;
  const docs = jotaiStore.get(flowDocsAtom);
  const count = docs.filter((f) => f.workspaceId === workspaceId).length;
  const flow: FlowDoc = {
    id: generateId(),
    workspaceId,
    name: `Flow ${count + 1}`,
    nodes: [],
    edges: [],
  };
  jotaiStore.set(flowDocsAtom, [...docs, flow]);
  openFlow(flow.id);
  return flow.id;
}

export function patchFlow(id: string, patch: Partial<Pick<FlowDoc, "name" | "nodes" | "edges">>) {
  jotaiStore.set(flowDocsAtom, (docs) => docs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

export function deleteFlow(id: string) {
  jotaiStore.set(flowDocsAtom, (docs) => docs.filter((f) => f.id !== id));
  if (jotaiStore.get(activeFlowIdAtom) === id) setWorkspaceSearchParams({ flow_id: null });
}
