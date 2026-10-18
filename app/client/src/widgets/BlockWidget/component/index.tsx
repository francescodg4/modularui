import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { Button, Spinner, Text } from "@appsmith/ads";
import type { AppThemeProperties } from "entities/AppTheming";
import type { Color } from "constants/Colors";
import WidgetStyleContainer from "components/designSystems/appsmith/WidgetStyleContainer";
import type { BoxShadow } from "components/designSystems/appsmith/WidgetStyleContainer";
import CustomComponent from "widgets/CustomWidget/component";
import type { DynamicHeight } from "utils/WidgetFeatures";
import type { LayoutSystemTypes } from "layoutSystems/types";
import { selectCombinedPreviewMode } from "selectors/gitModSelectors";
import { getBlockUIState } from "selectors/blockSelectors";
import { appendBlockLog } from "actions/blockActions";
import { BLOCK_REFRESH_EVENT, BlockState } from "../constants";
import type { BlockStateType } from "../constants";
import {
  hasUnapprovedPermissions,
  type BlockPermission,
  type BlockSettingsSchema,
  type BlockView,
} from "../definition";
import type { BlockControllerState } from "../widget";
import PromptArea from "./PromptArea";
import GearMenu from "./GearMenu";
import BlockPanel, { type BlockPanelSection } from "./BlockPanel";
import { stopCanvasEvents } from "./utils";

const HEADER_HEIGHT = 32;
const BANNER_HEIGHT = 36;
/** Delay before the first run, so the controller JS object is parsed before it is called. */
const FIRST_RUN_DELAY_MS = 500;
const FIRST_RUN_RETRY_DELAY_MS = 2000;
const MIN_REFRESH_MINUTES = 0.25;

const Wrapper = styled.div`
  position: relative;
  height: 100%;
  width: 100%;

  &:hover .t--block-gear {
    opacity: 1;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-2);
  height: ${HEADER_HEIGHT}px;
  min-height: ${HEADER_HEIGHT}px;
  padding: 0 40px 0 var(--ads-v2-spaces-4);
  border-bottom: 1px solid var(--ads-v2-color-border);
  overflow: hidden;

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ads-v2-spaces-3);
  height: ${BANNER_HEIGHT}px;
  min-height: ${BANNER_HEIGHT}px;
  padding: 0 var(--ads-v2-spaces-4);
  background: var(--ads-v2-color-bg-warning);
  color: var(--ads-v2-color-fg-warning);
  font-size: 12px;
  overflow: hidden;
`;

const GearSlot = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  opacity: 0.6;
  transition: opacity 0.1s ease-in;
`;

const UpdatingChip = styled.div`
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-2);
  padding: 2px 8px;
  border-radius: var(--ads-v2-border-radius);
  background: var(--ads-v2-color-bg);
  border: 1px solid var(--ads-v2-color-border);
  font-size: 12px;
`;

export interface BlockComponentProps {
  widgetId: string;
  widgetName: string;
  blockState: BlockStateType;
  title: string;
  showTitle: boolean;
  srcDoc: BlockView;
  settings: Record<string, unknown>;
  settingsSchema: BlockSettingsSchema;
  blockControllerId?: string;
  controllerState?: BlockControllerState;
  permissions: BlockPermission[];
  onRefresh?: string;
  isEditor: boolean;
  width: number;
  height: number;
  theme: AppThemeProperties;
  backgroundColor?: Color;
  borderColor?: Color;
  borderWidth?: number;
  borderRadius?: number;
  boxShadow?: BoxShadow;
  dynamicHeight: DynamicHeight;
  layoutSystemType?: LayoutSystemTypes;
  runController: (onComplete?: (success: boolean) => void) => void;
  setDragDisabled: (disabled: boolean) => void;
}

type RunStatus = "idle" | "running" | "error";

function stringifyConsoleArgs(args: unknown): string {
  const list = Array.isArray(args) ? args : [args];

  return list
    .map((arg) => {
      if (typeof arg === "string") return arg;

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function BlockComponent(props: BlockComponentProps) {
  const {
    blockState,
    controllerState,
    isEditor,
    onRefresh,
    permissions,
    runController,
    settings,
    widgetId,
  } = props;
  const dispatch = useDispatch();
  const isPreviewMode = useSelector(selectCombinedPreviewMode);
  const blockUI = useSelector((state) => getBlockUIState(state, widgetId));
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [panelSection, setPanelSection] = useState<BlockPanelSection | null>(
    null,
  );
  const isRunningRef = useRef(false);
  // Event handlers handed to the iframe are captured when it loads, and timers outlive renders; both go through
  // this ref so they always call the latest `run`.
  const runRef = useRef<(reason: string) => void>(() => undefined);

  const showEditorChrome = isEditor && !isPreviewMode;
  const isReady = blockState === BlockState.READY;
  const isPaused = hasUnapprovedPermissions(permissions);
  const canRun = isReady && !isPaused && Boolean(onRefresh);

  const run = useCallback(
    (reason: string) => {
      if (isRunningRef.current) return;

      isRunningRef.current = true;
      setRunStatus("running");

      runController((success) => {
        isRunningRef.current = false;
        setRunStatus(success ? "idle" : "error");
        dispatch(
          appendBlockLog({
            widgetId,
            level: success ? "info" : "error",
            source: "block",
            message: success
              ? `Controller run (${reason}) finished`
              : `Controller run (${reason}) failed. Open the debugger for details.`,
          }),
        );

        if (!success && reason === "load") {
          // The controller may not be parsed yet right after the block was generated or the page loaded.
          setTimeout(
            () => runRef.current("load retry"),
            FIRST_RUN_RETRY_DELAY_MS,
          );
        }
      });
    },
    [dispatch, runController, widgetId],
  );

  runRef.current = run;

  const settingsKey = JSON.stringify(settings);

  useEffect(() => {
    if (!canRun) return;

    const timer = setTimeout(() => runRef.current("load"), FIRST_RUN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [canRun, onRefresh, settingsKey, props.blockControllerId]);

  const refreshMinutes = Number(settings.refreshMinutes);

  useEffect(() => {
    if (!canRun || !(refreshMinutes > 0)) return;

    const interval = setInterval(
      () => runRef.current("interval"),
      Math.max(refreshMinutes, MIN_REFRESH_MINUTES) * 60000,
    );

    return () => clearInterval(interval);
  }, [canRun, refreshMinutes]);

  const model = useMemo(
    () => ({
      settings,
      data: controllerState?.data ?? null,
      error: controllerState?.error ?? null,
      updatedAt: controllerState?.updatedAt ?? null,
      status: runStatus === "running" ? "loading" : runStatus,
      paused: isPaused,
    }),
    [settings, controllerState, runStatus, isPaused],
  );

  const handleViewEvent = useCallback(
    (eventName: string) => {
      if (eventName === BLOCK_REFRESH_EVENT) {
        if (canRun) runRef.current("view");

        return;
      }

      dispatch(
        appendBlockLog({
          widgetId,
          level: "info",
          source: "view",
          message: `The view triggered "${eventName}", which blocks do not handle. Use "${BLOCK_REFRESH_EVENT}".`,
        }),
      );
    },
    [canRun, dispatch, widgetId],
  );

  const handleViewConsole = useCallback(
    (type: string, args: unknown) => {
      if (type !== "error" && type !== "warn") return;

      dispatch(
        appendBlockLog({
          widgetId,
          level: type === "error" ? "error" : "info",
          source: "view",
          message: stringifyConsoleArgs(args),
        }),
      );
    },
    [dispatch, widgetId],
  );

  // The view only reads the model; blocks keep their state in settings and the controller.
  const ignoreModelUpdate = useCallback(() => undefined, []);

  const showHeader = isReady && props.showTitle && Boolean(props.title);
  const showBanner = isReady && isPaused;
  const borderWidth = Number(props.borderWidth) || 0;
  const viewHeight = Math.max(
    props.height -
      (showHeader ? HEADER_HEIGHT : 0) -
      (showBanner ? BANNER_HEIGHT : 0) -
      borderWidth * 2,
    0,
  );
  const viewWidth = Math.max(props.width - borderWidth * 2, 0);

  const renderBody = () => {
    if (!isReady) {
      return showEditorChrome ? (
        <PromptArea
          setDragDisabled={props.setDragDisabled}
          widgetId={widgetId}
        />
      ) : null;
    }

    return (
      <CustomComponent
        dynamicHeight={props.dynamicHeight}
        execute={handleViewEvent}
        height={viewHeight}
        layoutSystemType={props.layoutSystemType}
        minDynamicHeight={0}
        model={model}
        onConsole={handleViewConsole}
        renderMode={isEditor ? "EDITOR" : "DEPLOYED"}
        srcDoc={props.srcDoc}
        theme={props.theme}
        update={ignoreModelUpdate}
        widgetId={widgetId}
        width={viewWidth}
      />
    );
  };

  return (
    <Wrapper data-testid="t--block-widget">
      <WidgetStyleContainer
        backgroundColor={props.backgroundColor}
        borderColor={props.borderColor}
        borderRadius={props.borderRadius}
        borderWidth={borderWidth}
        boxShadow={props.boxShadow}
        widgetId={widgetId}
      >
        <Column>
          {showHeader && (
            <Header>
              <Text kind="heading-xs">{props.title}</Text>
            </Header>
          )}
          {showBanner && (
            <Banner>
              <span>
                {showEditorChrome
                  ? "This block runs once its permissions are approved."
                  : "This block is paused until its permissions are approved in the editor."}
              </span>
              {showEditorChrome && (
                <span {...stopCanvasEvents}>
                  <Button
                    kind="secondary"
                    onClick={() => setPanelSection("permissions")}
                    size="sm"
                  >
                    Review
                  </Button>
                </span>
              )}
            </Banner>
          )}
          {renderBody()}
        </Column>
      </WidgetStyleContainer>
      {showEditorChrome && isReady && (
        <GearSlot className="t--block-gear" {...stopCanvasEvents}>
          <GearMenu
            hasController={Boolean(props.blockControllerId)}
            onOpenSection={setPanelSection}
            widgetId={widgetId}
          />
        </GearSlot>
      )}
      {showEditorChrome && isReady && blockUI.status === "applying" && (
        <UpdatingChip>
          <Spinner size="sm" />
          Updating block…
        </UpdatingChip>
      )}
      {showEditorChrome && panelSection && (
        <BlockPanel
          controllerState={controllerState}
          onClose={() => setPanelSection(null)}
          onRun={() => runRef.current("manual")}
          onSectionChange={setPanelSection}
          runStatus={runStatus}
          section={panelSection}
          setDragDisabled={props.setDragDisabled}
          widgetId={widgetId}
        />
      )}
    </Wrapper>
  );
}

export default BlockComponent;
