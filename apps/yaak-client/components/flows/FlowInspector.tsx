import { httpRequestsAtom } from "@yaakapp-internal/models";
import { VStack } from "@yaakapp-internal/ui";
import { useAtomValue } from "jotai";
import { resolvedModelNameWithFolders } from "../../lib/resolvedModelName";
import { Button } from "../core/Button";
import { Input } from "../core/Input";
import { PlainInput } from "../core/PlainInput";
import { Select } from "../core/Select";
import type { FlowCanvasNode, FlowNodeData } from "./flowGraph";

interface Props {
  node: FlowCanvasNode;
  onChange: (id: string, patch: Partial<FlowNodeData>) => void;
  onDelete: (id: string) => void;
}

export function FlowInspector({ node, onChange, onDelete }: Props) {
  const requests = useAtomValue(httpRequestsAtom);
  const { data } = node;
  const op = data.operation;

  return (
    <VStack space={3} className="p-3 overflow-y-auto">
      <PlainInput
        label="Title"
        name="title"
        size="sm"
        forceUpdateKey={node.id}
        defaultValue={data.title}
        onChange={(title) => onChange(node.id, { title })}
      />

      {op.type === "httpRequest" && (
        <Select
          label="Request"
          name="request"
          size="sm"
          filterable
          value={op.requestId}
          onChange={(requestId) => onChange(node.id, { operation: { ...op, requestId } })}
          options={[
            { label: "Select request…", value: "" },
            ...requests.map((r) => ({ label: resolvedModelNameWithFolders(r), value: r.id })),
          ]}
        />
      )}

      {op.type === "extract" && (
        <>
          <Input
            label="JSONPath or XPath"
            name="path"
            size="sm"
            stateKey={`flow.${node.id}.path`}
            forceUpdateKey={node.id}
            placeholder="$.data.id"
            help="Reads the output of the node connected before this one. Fails if that node produced nothing."
            autocompleteVariables
            autocompleteFunctions
            defaultValue={op.path}
            onChange={(path) => onChange(node.id, { operation: { ...op, path } })}
          />
          <PlainInput
            label="Save as variable (optional)"
            name="output"
            size="sm"
            forceUpdateKey={node.id}
            defaultValue={op.output}
            onChange={(output) => onChange(node.id, { operation: { ...op, output } })}
          />
        </>
      )}

      {op.type === "delay" && (
        <PlainInput
          label="Wait (milliseconds)"
          name="millis"
          type="number"
          size="sm"
          forceUpdateKey={node.id}
          help="Waits, then continues to the next node. The previous node's output passes through."
          defaultValue={String(op.millis)}
          onChange={(v) =>
            onChange(node.id, {
              operation: { ...op, millis: Math.max(0, Math.floor(Number(v)) || 0) },
            })
          }
        />
      )}

      {op.type === "timer" && (
        <PlainInput
          label="Run every (seconds)"
          name="interval"
          type="number"
          size="sm"
          forceUpdateKey={node.id}
          help="Press Start to run the flow repeatedly at this interval, until you press Stop."
          defaultValue={String(op.intervalSecs)}
          onChange={(v) =>
            onChange(node.id, {
              operation: { ...op, intervalSecs: Math.max(1, Math.floor(Number(v)) || 1) },
            })
          }
        />
      )}

      {data.run && (
        <div className="text-xs">
          <div className="font-semibold mb-1">Last run: {data.run.status}</div>
          {data.run.error && <div className="text-danger mb-1">{data.run.error}</div>}
          <pre className="max-h-48 overflow-auto bg-surface-highlight rounded p-2 whitespace-pre-wrap break-all">
            {data.run.output}
          </pre>
        </div>
      )}

      <Button size="sm" color="danger" variant="border" onClick={() => onDelete(node.id)}>
        Delete node
      </Button>
    </VStack>
  );
}
