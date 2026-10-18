import React, { useState } from "react";
import { useDispatch } from "react-redux";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@appsmith/ads";
import { deleteBlock, duplicateBlock, resetBlock } from "actions/blockActions";
import type { BlockPanelSection } from "./BlockPanel";
import ConfirmModal from "./ConfirmModal";
import { stopCanvasEvents } from "./utils";

interface GearMenuProps {
  widgetId: string;
  hasController: boolean;
  onOpenSection: (section: BlockPanelSection) => void;
}

type PendingAction = "reset" | "delete" | null;

const CONFIRMATIONS = {
  reset: {
    title: "Reset block",
    message:
      "The block goes back to an empty prompt. Its view, settings, controller, queries and snapshots are removed. Your data is not affected.",
    confirmLabel: "Reset",
  },
  delete: {
    title: "Delete block",
    message:
      "The block, its controller JS object and its queries are deleted. Your data is not affected.",
    confirmLabel: "Delete",
  },
};

function GearMenu({ hasController, onOpenSection, widgetId }: GearMenuProps) {
  const dispatch = useDispatch();
  const [pending, setPending] = useState<PendingAction>(null);

  const confirm = () => {
    if (pending === "reset") dispatch(resetBlock({ widgetId }));

    if (pending === "delete") dispatch(deleteBlock({ widgetId }));

    setPending(null);
  };

  return (
    <>
      {/* Not modal: the items open dialogs, and a modal menu would leave the page unclickable after it closes. */}
      <Menu modal={false}>
        <MenuTrigger>
          <Button
            aria-label="Block menu"
            data-testid="t--block-gear-button"
            isIconButton
            kind="secondary"
            size="sm"
            startIcon="settings-2-line"
          />
        </MenuTrigger>
        <MenuContent align="end" {...stopCanvasEvents} width="200px">
          <MenuItem
            onSelect={() => onOpenSection("settings")}
            startIcon="settings-line"
          >
            Settings
          </MenuItem>
          <MenuItem
            onSelect={() => onOpenSection("prompt")}
            startIcon="ai-chat"
          >
            Prompt
          </MenuItem>
          <MenuItem
            onSelect={() => onOpenSection("snapshots")}
            startIcon="timer-line"
          >
            Snapshots
          </MenuItem>
          <MenuItem
            onSelect={() => onOpenSection("layout")}
            startIcon="layout-2-line"
          >
            Layout
          </MenuItem>
          {hasController && (
            <MenuItem
              onSelect={() => onOpenSection("script")}
              startIcon="js-function"
            >
              Script
            </MenuItem>
          )}
          <MenuItem
            onSelect={() => onOpenSection("permissions")}
            startIcon="lock-2-line"
          >
            Permissions
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={() => dispatch(duplicateBlock({ widgetId }))}
            startIcon="file-copy-2-line"
          >
            Duplicate
          </MenuItem>
          <MenuItem
            onSelect={() => setPending("reset")}
            startIcon="restart-line"
          >
            Reset
          </MenuItem>
          <MenuItem
            className="error-menuitem"
            onSelect={() => setPending("delete")}
            startIcon="delete-bin-line"
          >
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
      {pending && (
        <ConfirmModal
          {...CONFIRMATIONS[pending]}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

export default GearMenu;
