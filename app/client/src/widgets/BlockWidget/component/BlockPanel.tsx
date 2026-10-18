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
  /* A fixed height keeps the modal from jumping between tabs; the body scrolls. Do not make the tab panels flex
     items: the tabs root has max-height: fit-content, which collapses a flex: 1 panel to zero height. */
  height: 80vh;
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
            <TabPanel value="settings">
              <SettingsPanel widget={widget} />
            </TabPanel>
            <TabPanel value="prompt">
              <AgentPanel widgetId={widget.widgetId} />
            </TabPanel>
            <TabPanel value="snapshots">
              <SnapshotsPanel widget={widget} />
            </TabPanel>
            <TabPanel value="layout">
              <LayoutPanel widget={widget} />
            </TabPanel>
            {hasController && (
              <TabPanel value="script">
                <ScriptPanel
                  controllerState={props.controllerState}
                  onOpenSnapshots={() => props.onSectionChange("snapshots")}
                  onRun={props.onRun}
                  runStatus={props.runStatus}
                  widget={widget}
                />
              </TabPanel>
            )}
            <TabPanel value="permissions">
              <PermissionsPanel widget={widget} />
            </TabPanel>
          </Tabs>
        </ModalBody>
      </StyledModalContent>
    </Modal>
  );
}

export default BlockPanel;
