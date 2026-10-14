import { activeWorkspaceIdAtom } from "../hooks/useActiveWorkspace";
import { createFlow, flowDocsAtom, openFlow } from "../components/flows/flowStore";
import { jotaiStore } from "../lib/jotai";

/** Open the first flow of the active workspace, creating one if there are none. */
export function openFlows() {
  const workspaceId = jotaiStore.get(activeWorkspaceIdAtom);
  if (workspaceId == null) return;
  const first = jotaiStore.get(flowDocsAtom).find((f) => f.workspaceId === workspaceId);
  if (first) openFlow(first.id);
  else createFlow();
}
