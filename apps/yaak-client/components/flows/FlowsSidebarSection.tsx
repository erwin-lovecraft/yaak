import { Icon } from "@yaakapp-internal/ui";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import { activeWorkspaceIdAtom } from "../../hooks/useActiveWorkspace";
import { showPrompt } from "../../lib/prompt";
import { ContextMenu } from "../core/Dropdown";
import { IconButton } from "../core/IconButton";
import {
  activeFlowIdAtom,
  createFlow,
  deleteFlow,
  flowDocsAtom,
  openFlow,
  patchFlow,
} from "./flowStore";
import { useState } from "react";
import { stopFlow } from "./flowRunner";

export function FlowsSidebarSection() {
  const workspaceId = useAtomValue(activeWorkspaceIdAtom);
  const activeId = useAtomValue(activeFlowIdAtom);
  const flows = useAtomValue(flowDocsAtom).filter((f) => f.workspaceId === workspaceId);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const rename = async (id: string, current: string) => {
    const name = await showPrompt({
      id: "rename-flow",
      title: "Rename Flow",
      label: "Name",
      defaultValue: current,
      confirmText: "Save",
    });
    if (name) patchFlow(id, { name });
  };

  return (
    <div className="border-t border-border-subtle max-h-56 flex flex-col">
      <div className="flex items-center pl-3 pr-1 py-1 text-xs text-text-subtle">
        <span className="font-semibold uppercase tracking-wide">Flows</span>
        <IconButton
          className="ml-auto"
          size="xs"
          icon="plus"
          title="New Flow"
          iconColor="secondary"
          onClick={() => createFlow()}
        />
      </div>
      <div className="overflow-y-auto pb-1">
        {flows.length === 0 && (
          <div className="px-3 py-1 text-xs text-text-subtlest">No flows yet</div>
        )}
        {flows.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => openFlow(f.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: f.id, x: e.clientX, y: e.clientY });
            }}
            className={classNames(
              "w-full flex items-center gap-2 px-3 py-1 text-sm text-left truncate",
              "hover:bg-surface-highlight",
              f.id === activeId && "bg-surface-active text-text",
            )}
          >
            <Icon icon="git_branch" size="sm" className="text-text-subtle" />
            <span className="truncate">{f.name}</span>
          </button>
        ))}
      </div>
      {menu && (
        <ContextMenu
          triggerPosition={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Rename",
              leftSlot: <Icon icon="pencil" />,
              onSelect: () => {
                const f = flows.find((f) => f.id === menu.id);
                if (f) void rename(f.id, f.name);
              },
            },
            {
              color: "danger",
              label: "Delete",
              leftSlot: <Icon icon="trash" />,
              onSelect: () => {
                stopFlow(menu.id);
                deleteFlow(menu.id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
