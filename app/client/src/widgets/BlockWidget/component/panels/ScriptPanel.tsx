import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Link, Text } from "@appsmith/ads";
import type { DefaultRootState } from "react-redux";
import history from "utils/history";
import {
  apiEditorIdURL,
  jsCollectionIdURL,
  queryEditorIdURL,
} from "ee/RouteBuilder";
import { getJSCollection } from "ee/selectors/entitiesSelector";
import { PluginType } from "entities/Plugin";
import { getBlockUIState } from "selectors/blockSelectors";
import { clearBlockLogs, saveBlockController } from "actions/blockActions";
import type { BlockControllerState, BlockWidgetProps } from "../../widget";
import {
  CodeArea,
  List,
  ListItem,
  ListItemText,
  LogLine,
  LogList,
  Muted,
  PanelBody,
  Row,
  SpacedRow,
} from "./styles";

interface ScriptPanelProps {
  widget: BlockWidgetProps;
  controllerState?: BlockControllerState;
  runStatus: "idle" | "running" | "error";
  onRun: () => void;
  onOpenSnapshots: () => void;
}

interface DisplayLog {
  key: string;
  time: string;
  source: string;
  message: string;
  isError: boolean;
}

function formatTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function controllerLogs(state?: BlockControllerState): DisplayLog[] {
  const logs = Array.isArray(state?.logs) ? state?.logs || [] : [];

  return logs.map((entry, index) => {
    const isString = typeof entry === "string";

    return {
      key: `controller-${index}`,
      time: isString ? "" : entry.time || "",
      source: "script",
      message: isString ? entry : String(entry.message ?? ""),
      isError: false,
    };
  });
}

/**
 * Inspect and debug the block's controller: edit its JS object, run it, and read the logs of the block, its view and
 * the script itself. The full JS editor and the query editors are one click away.
 */
function ScriptPanel(props: ScriptPanelProps) {
  const { controllerState, widget } = props;
  const dispatch = useDispatch();
  const collection = useSelector((state: DefaultRootState) =>
    widget.blockControllerId
      ? getJSCollection(state, widget.blockControllerId)
      : undefined,
  );
  const actions = useSelector(
    (state: DefaultRootState) => state.entities.actions,
  );
  const queries = useMemo(
    () =>
      (widget.blockQueries || []).map((ref) => ({
        key: ref.key,
        action: actions.find((entry) => entry.config.id === ref.actionId)
          ?.config,
      })),
    [actions, widget.blockQueries],
  );
  const { logs } = useSelector((state: DefaultRootState) =>
    getBlockUIState(state, widget.widgetId),
  );
  const [draft, setDraft] = useState(collection?.body || "");

  useEffect(() => {
    setDraft(collection?.body || "");
  }, [collection?.body]);

  if (!collection) {
    return (
      <PanelBody>
        <Text kind="body-m">
          The controller JS object of this block was not found. It may have been
          deleted; restore a snapshot to recreate it.
        </Text>
        <Row>
          <Button kind="secondary" onClick={props.onOpenSnapshots} size="md">
            Open snapshots
          </Button>
        </Row>
      </PanelBody>
    );
  }

  const isDirty = draft !== collection.body;
  const allLogs: DisplayLog[] = [
    ...logs.map((entry, index) => ({
      key: `block-${index}`,
      time: entry.time,
      source: entry.source,
      message: entry.message,
      isError: entry.level === "error",
    })),
    ...controllerLogs(controllerState),
  ];

  const openQuery = (
    action: NonNullable<(typeof queries)[number]["action"]>,
  ) => {
    history.push(
      action.pluginType === PluginType.API
        ? apiEditorIdURL({ baseApiId: action.baseId })
        : queryEditorIdURL({ baseQueryId: action.baseId }),
    );
  };

  return (
    <PanelBody>
      <SpacedRow>
        <Text kind="heading-xs">{collection.name}</Text>
        <Row>
          <Link
            onClick={() =>
              history.push(
                jsCollectionIdURL({ baseCollectionId: collection.baseId }),
              )
            }
            startIcon="external-link-line"
          >
            Open in JS editor
          </Link>
        </Row>
      </SpacedRow>
      <CodeArea
        aria-label="Controller script"
        data-testid="t--block-script"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Keep Tab inside the editor instead of moving focus.
          if (event.key === "Tab") {
            event.preventDefault();
            const target = event.currentTarget;
            const { selectionEnd, selectionStart } = target;
            const next =
              draft.slice(0, selectionStart) + "  " + draft.slice(selectionEnd);

            setDraft(next);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = selectionStart + 2;
            });
          }
        }}
        spellCheck={false}
        value={draft}
      />
      <SpacedRow>
        <Row>
          <Button
            isDisabled={!isDirty}
            onClick={() =>
              dispatch(
                saveBlockController({ widgetId: widget.widgetId, body: draft }),
              )
            }
            size="md"
          >
            Save script
          </Button>
          <Button
            isDisabled={!isDirty}
            kind="tertiary"
            onClick={() => setDraft(collection.body || "")}
            size="md"
          >
            Discard changes
          </Button>
        </Row>
        <Row>
          <Button
            kind="secondary"
            onClick={props.onOpenSnapshots}
            size="md"
            startIcon="timer-line"
          >
            Restore a snapshot
          </Button>
          <Button
            isLoading={props.runStatus === "running"}
            kind="secondary"
            onClick={props.onRun}
            size="md"
            startIcon="play-line"
          >
            Run
          </Button>
        </Row>
      </SpacedRow>
      {controllerState?.error && (
        <LogLine isError>Controller error: {controllerState.error}</LogLine>
      )}
      {controllerState?.updatedAt && (
        <Muted>
          Last successful update: {formatTime(controllerState.updatedAt)}
        </Muted>
      )}
      {queries.length > 0 && (
        <>
          <Text kind="heading-xs">Queries</Text>
          <List>
            {queries.map(({ action, key }) => (
              <ListItem key={key}>
                <ListItemText>
                  <Text kind="body-m">{action ? action.name : key}</Text>
                  <Muted>
                    {action
                      ? `${action.pluginType === PluginType.API ? "REST API" : "Datasource query"}${action.datasource?.name && action.datasource.name !== "DEFAULT_REST_DATASOURCE" ? ` · ${action.datasource.name}` : ""}`
                      : "Not found: restore a snapshot to recreate it"}
                  </Muted>
                </ListItemText>
                {action && (
                  <Button
                    kind="tertiary"
                    onClick={() => openQuery(action)}
                    size="sm"
                    startIcon="external-link-line"
                  >
                    Open
                  </Button>
                )}
              </ListItem>
            ))}
          </List>
        </>
      )}
      <SpacedRow>
        <Text kind="heading-xs">Logs</Text>
        <Button
          isDisabled={logs.length === 0}
          kind="tertiary"
          onClick={() =>
            dispatch(clearBlockLogs({ widgetId: widget.widgetId }))
          }
          size="sm"
        >
          Clear
        </Button>
      </SpacedRow>
      <LogList data-testid="t--block-logs">
        {allLogs.length === 0 ? (
          <Muted>No logs yet. Run the controller to see its activity.</Muted>
        ) : (
          allLogs.map((entry) => (
            <LogLine isError={entry.isError} key={entry.key}>
              {entry.time ? `[${formatTime(entry.time)}] ` : ""}
              {entry.source}: {entry.message}
            </LogLine>
          ))
        )}
      </LogList>
      <Muted>
        Script logs come from the controller&apos;s <code>log()</code> calls.
        Full errors also appear in the debugger.
      </Muted>
    </PanelBody>
  );
}

export default ScriptPanel;
