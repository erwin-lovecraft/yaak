import { platform } from "@yaakapp-internal/platform";
import type { FlowRunResult, NodeRun } from "@yaakapp-internal/rpc-schema";
import { atom } from "jotai";
import { activeEnvironmentIdAtom } from "../../hooks/useActiveEnvironment";
import { jotaiStore } from "../../lib/jotai";
import { showToast } from "../../lib/toast";
import { toFlow } from "./flowGraph";
import { flowDocsAtom } from "./flowStore";

/** Results of the latest run, by flow id and then node id. */
export const flowRunsAtom = atom<Record<string, Record<string, NodeRun>>>({});

/** Flows whose timer is currently ticking. */
export const runningFlowIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const active = new Set<string>();

function findFlow(flowId: string) {
  return jotaiStore.get(flowDocsAtom).find((f) => f.id === flowId) ?? null;
}

/** Run the flow once, from its start node. */
export async function runFlowOnce(flowId: string): Promise<void> {
  const doc = findFlow(flowId);
  if (doc == null || doc.nodes.length === 0) return;
  jotaiStore.set(flowRunsAtom, (r) => ({ ...r, [flowId]: {} }));
  try {
    const result = await platform.rpc<FlowRunResult>("cmd_run_flow", {
      flow: toFlow(doc.id, doc.name, doc.nodes, doc.edges),
      workspaceId: doc.workspaceId,
      environmentId: jotaiStore.get(activeEnvironmentIdAtom) ?? null,
    });
    const byNode = Object.fromEntries(result.runs.map((r) => [r.nodeId, r]));
    jotaiStore.set(flowRunsAtom, (r) => ({ ...r, [flowId]: byNode }));
  } catch (err) {
    showToast({ id: `flow-run-${flowId}`, color: "danger", message: String(err) });
  }
}

/** The interval of the flow's timer node, in seconds. */
export function timerIntervalSecs(flowId: string): number | null {
  const timer = findFlow(flowId)?.nodes.find((n) => n.data.operation.type === "timer");
  return timer?.data.operation.type === "timer" ? timer.data.operation.intervalSecs : null;
}

/**
 * Run the flow now, then again every `intervalSecs` after each run finishes, until stopped.
 * The next tick is scheduled once the current run ends, so runs never overlap, and the interval
 * is read each time so editing the timer takes effect on the next tick. It lives outside React
 * on purpose: leaving the editor does not stop it.
 */
export function startFlow(flowId: string) {
  if (active.has(flowId)) return;
  active.add(flowId);
  jotaiStore.set(runningFlowIdsAtom, (s) => new Set(s).add(flowId));

  const tick = async () => {
    await runFlowOnce(flowId);
    const secs = timerIntervalSecs(flowId);
    if (!active.has(flowId)) return; // Stopped while running
    if (secs == null) return stopFlow(flowId); // Timer node was deleted
    timeouts.set(flowId, setTimeout(tick, secs * 1000));
  };

  void tick();
}

export function stopFlow(flowId: string) {
  const t = timeouts.get(flowId);
  if (t != null) clearTimeout(t);
  timeouts.delete(flowId);
  active.delete(flowId);
  jotaiStore.set(runningFlowIdsAtom, (s) => {
    const next = new Set(s);
    next.delete(flowId);
    return next;
  });
}
