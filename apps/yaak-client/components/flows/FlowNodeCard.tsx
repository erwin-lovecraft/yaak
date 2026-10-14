import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { httpRequestsAtom } from "@yaakapp-internal/models";
import { Icon } from "@yaakapp-internal/ui";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import type { FlowCanvasNode } from "./flowGraph";
import { FAIL_HANDLE, NODE_KIND_LABELS, SUCCESS_HANDLE } from "./flowGraph";

const ICONS = {
  httpRequest: "send_horizontal",
  extract: "filter",
  timer: "clock",
  delay: "circle_pause",
} as const;

export function FlowNodeCard({ data, selected }: NodeProps<FlowCanvasNode>) {
  const requests = useAtomValue(httpRequestsAtom);
  const op = data.operation;
  const status = data.run?.status;

  let summary = "";
  if (op.type === "httpRequest") {
    const r = requests.find((r) => r.id === op.requestId);
    summary = r == null ? "No request selected" : `${r.method} ${r.name || r.url}`;
  } else if (op.type === "extract") {
    summary = op.path ? (op.output ? `${op.path} → ${op.output}` : op.path) : "Not configured";
  } else if (op.type === "delay") {
    summary = `Wait ${op.millis}ms`;
  } else {
    summary = `Every ${op.intervalSecs}s`;
  }

  return (
    <div
      className={classNames(
        "w-64 rounded-lg border bg-surface text-text shadow-md text-sm",
        selected ? "border-primary" : "border-border",
        status === "success" && "ring-2 ring-success",
        status === "fail" && "ring-2 ring-danger",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-highlight rounded-t-lg">
        <Icon icon={ICONS[op.type]} />
        <div className="font-semibold truncate">{data.title}</div>
        <div className="ml-auto text-xs text-text-subtle">{NODE_KIND_LABELS[op.type]}</div>
      </div>
      <div className="px-3 py-2 text-xs text-text-subtle font-mono truncate">{summary}</div>
      <div className="relative h-12 border-t border-border">
        <div className="absolute right-3 top-1 text-xs">Success</div>
        <Handle type="source" position={Position.Right} id={SUCCESS_HANDLE} style={{ top: 14 }} />
        <div className="absolute right-3 top-7 text-xs">Fail</div>
        <Handle type="source" position={Position.Right} id={FAIL_HANDLE} style={{ top: 36 }} />
      </div>
    </div>
  );
}
