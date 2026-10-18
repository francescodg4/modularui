import React from "react";
import styled from "styled-components";
import { useSelector } from "react-redux";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tab,
  TabPanel,
  Tabs,
  TabsList,
} from "@appsmith/ads";
import { getWidget } from "sagas/selectors";
import type { BlockControllerState, BlockWidgetProps } from "../widget";
import { stopCanvasEvents } from "./utils";
import SettingsPanel from "./panels/SettingsPanel";
import AgentPanel from "./panels/AgentPanel";
import SnapshotsPanel from "./panels/SnapshotsPanel";
import LayoutPanel from "./panels/LayoutPanel";
import ScriptPanel from "./panels/ScriptPanel";
import PermissionsPanel from "./panels/PermissionsPanel";

export type BlockPanelSection =
  | "settings"
  | "prompt"
  | "snapshots"
  | "layout"
  | "script"
  | "permissions";

const StyledModalContent = styled(ModalContent)`
  width: 760px;
  max-width: 90vw;
  height: 80vh;

  .block-panel-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .block-panel-tab {
    flex: 1;
    overflow: auto;
  }
`;

interface BlockPanelProps {
  widgetId: string;
  section: BlockPanelSection;
  onSectionChange: (section: BlockPanelSection) => void;
  onClose: () => void;
  controllerState?: BlockControllerState;
  onRun: () => void;
  runStatus: "idle" | "running" | "error";
  setDragDisabled: (disabled: boolean) => void;
}

/** The sections of the gear menu, in one modal so the user can move between them. */
function BlockPanel(props: BlockPanelProps) {
  const widget = useSelector((state) => getWidget(state, props.widgetId)) as
    | BlockWidgetProps
    | undefined;

  if (!widget) return null;

  const hasController = Boolean(widget.blockControllerId);

  return (
    <Modal
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose();
      }}
      open
    >
      <StyledModalContent
        {...stopCanvasEvents}
        data-testid="t--block-panel"
        onMouseEnter={() => props.setDragDisabled(true)}
        onMouseLeave={() => props.setDragDisabled(false)}
      >
        <ModalHeader>{widget.title || widget.widgetName}</ModalHeader>
        <ModalBody>
          <Tabs
            className="block-panel-tabs"
            onValueChange={(value) =>
              props.onSectionChange(value as BlockPanelSection)
            }
            value={props.section}
          >
            <TabsList>
              <Tab value="settings">Settings</Tab>
              <Tab value="prompt">Prompt</Tab>
              <Tab value="snapshots">Snapshots</Tab>
              <Tab value="layout">Layout</Tab>
              {hasController && <Tab value="script">Script</Tab>}
              <Tab value="permissions">Permissions</Tab>
            </TabsList>
            <TabPanel className="block-panel-tab" value="settings">
              <SettingsPanel widget={widget} />
            </TabPanel>
            <TabPanel className="block-panel-tab" value="prompt">
              <AgentPanel widgetId={widget.widgetId} />
            </TabPanel>
            <TabPanel className="block-panel-tab" value="snapshots">
              <SnapshotsPanel widget={widget} />
            </TabPanel>
            <TabPanel className="block-panel-tab" value="layout">
              <LayoutPanel widget={widget} />
            </TabPanel>
            {hasController && (
              <TabPanel className="block-panel-tab" value="script">
                <ScriptPanel
                  controllerState={props.controllerState}
                  onOpenSnapshots={() => props.onSectionChange("snapshots")}
                  onRun={props.onRun}
                  runStatus={props.runStatus}
                  widget={widget}
                />
              </TabPanel>
            )}
            <TabPanel className="block-panel-tab" value="permissions">
              <PermissionsPanel widget={widget} />
            </TabPanel>
          </Tabs>
        </ModalBody>
      </StyledModalContent>
    </Modal>
  );
}

export default BlockPanel;
