import {
  all,
  call,
  delay,
  put,
  race,
  select,
  take,
  takeEvery,
  takeLeading,
} from "redux-saga/effects";
import type { ReduxAction } from "actions/ReduxActionTypes";
import type { DefaultRootState } from "react-redux";
import {
  ReduxActionErrorTypes,
  ReduxActionTypes,
  WidgetReduxActionTypes,
} from "ee/constants/ReduxActionConstants";
import { toast } from "@appsmith/ads";
import { parseJSObject, isJSFunctionProperty } from "@shared/ast";
import UserApi from "ee/api/UserApi";
import ActionAPI from "api/ActionAPI";
import JSActionAPI from "ee/api/JSActionAPI";
import type { CreateJSCollectionRequest } from "ee/api/JSActionAPI";
import { loadAISettings } from "ee/actions/aiAssistantActions";
import {
  getAIArtifact,
  getAIAssistantState,
  type AIArtifact,
} from "ee/selectors/aiAssistantSelectors";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- type only; Ask AI is CE-owned and has no ee/ shim.
import type { AIAssistantReduxState } from "ce/reducers/aiAssistantReducer";
import { getIDETypeByUrl } from "ee/entities/IDE/utils";
import { buildAIRequestContext } from "sagas/AIAssistantRequestContext";
import {
  getAction,
  getDatasources,
  getJSCollection,
  getPlugins,
} from "ee/selectors/entitiesSelector";
import { getCurrentWorkspaceId } from "ee/selectors/selectedWorkspaceSelectors";
import {
  getCurrentApplicationId,
  getCurrentPageId,
} from "selectors/editorSelectors";
import {
  getPluginIdOfPackageName,
  getWidget,
  getWidgets,
} from "sagas/selectors";
import { getDataTree } from "selectors/dataTreeSelectors";
import { getBlockUIState } from "selectors/blockSelectors";
import { validateResponse } from "sagas/ErrorSagas";
import { batchUpdateWidgetProperty } from "actions/controlActions";
import {
  deleteActionSuccess,
  fetchActionsForPage,
} from "actions/pluginActionActions";
import {
  deleteJSCollectionSuccess,
  fetchJSCollectionsForPage,
} from "actions/jsActionActions";
import { updateJSCollectionBody } from "actions/jsPaneActions";
import {
  appendBlockChatMessage,
  appendBlockLog,
  clearBlockChat,
  clearBlockLogs,
  setBlockAgentStatus,
  setBlockStatus,
  type BlockChatMessage,
  type BlockLayoutUpdate,
} from "actions/blockActions";
import type { BlockUIState } from "reducers/uiReducers/blockReducer";
import type { Action } from "entities/Action";
import type { JSCollection } from "entities/JSCollection";
import type { Datasource } from "entities/Datasource";
import type { Plugin } from "entities/Plugin";
import { PluginPackageName, PluginType } from "entities/Plugin";
import type { ApiResponse } from "api/ApiResponses";
import type { CanvasWidgetsReduxState } from "ee/reducers/entityReducers/canvasWidgetsReducer";
import type { FlattenedWidgetProps } from "WidgetProvider/types";
import {
  DEFAULT_API_ACTION_CONFIG,
  DEFAULT_DATASOURCE_NAME,
} from "PluginActionEditor/constants/ApiEditorConstants";
import { ActionRunBehaviour } from "PluginActionEditor/types/PluginActionTypes";
import { generateReactKey } from "utils/generators";
import { GridDefaults } from "constants/WidgetConstants";
import {
  BLOCK_WIDGET_TYPE,
  BlockState,
  MAX_BLOCK_SNAPSHOTS,
} from "widgets/BlockWidget/constants";
import {
  applyBlockDefinitionChanges,
  BlockDefinitionError,
  materializeBlockQuery,
  materializeBlockText,
  mergePermissions,
  parseBlockAgentResponse,
  parseBlockGenerationResponse,
  tokenizeBlockQuery,
  tokenizeBlockText,
  type BlockDefinition,
  type BlockEntityNames,
  type BlockPermission,
  type BlockPermissionStatus,
  type BlockQuery,
  type BlockSnapshot,
} from "widgets/BlockWidget/definition";
import {
  actionToBlockQuery,
  restQueryToActionConfiguration,
} from "widgets/BlockWidget/entityMapping";
import type {
  BlockQueryRef,
  BlockWidgetProps,
} from "widgets/BlockWidget/widget";

const AI_MODE_GENERATE = "block_generate";
const AI_MODE_AGENT = "block_agent";
const AI_SETTINGS_TIMEOUT_MS = 10000;
const REFETCH_TIMEOUT_MS = 15000;
const NEW_WIDGET_TIMEOUT_MS = 5000;
const MIN_BLOCK_COLUMNS = 4;
const MIN_BLOCK_ROWS = 8;

/** A datasource the LLM may use, as described to it. Never includes configuration or credentials. */
interface BlockDatasourceInfo {
  id: string;
  name: string;
  plugin: string;
  queryKind: "rest" | "datasource";
}

interface AIResponseBody {
  responseMeta?: { success?: boolean; error?: { message?: string } };
  data?: { response?: string; error?: string };
  errorMessage?: string;
  message?: string;
}

function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;

  return fallback;
}

// ---------------------------------------------------------------------------------------------------------------------
// LLM access
// ---------------------------------------------------------------------------------------------------------------------

/** Returns the configured AI provider, loading the AI settings first if needed. */
function* getAIProvider() {
  let aiState: AIAssistantReduxState = yield select(getAIAssistantState);

  if (!aiState.isEnabled || !aiState.provider) {
    yield put(loadAISettings());

    const { timeout } = (yield race({
      settings: take(ReduxActionTypes.UPDATE_AI_SETTINGS),
      timeout: delay(AI_SETTINGS_TIMEOUT_MS),
    })) as { settings?: unknown; timeout?: boolean };

    if (timeout) {
      throw new Error("Could not load the AI settings. Please try again.");
    }

    aiState = yield select(getAIAssistantState);
  }

  if (!aiState.isEnabled || !aiState.provider) {
    throw new Error(
      "The AI assistant is not enabled. An administrator can enable it in Admin settings > AI.",
    );
  }

  return aiState.provider;
}

/** Sends one request to the organization's AI provider through the server and returns the raw reply text. */
function* requestAI(
  mode: string,
  prompt: string,
  context: unknown,
  conversationHistory?: BlockChatMessage[],
) {
  const provider: string = yield call(getAIProvider);
  const artifact: AIArtifact = yield select(
    getAIArtifact,
    getIDETypeByUrl(window.location.pathname),
  );
  const requestContext = buildAIRequestContext(
    { mode, currentValue: JSON.stringify(context) },
    null,
    artifact,
  );

  const response: unknown = yield call(
    UserApi.requestAIResponse,
    provider,
    prompt,
    requestContext,
    conversationHistory && conversationHistory.length > 0
      ? conversationHistory
      : undefined,
  );
  const raw = response as (AIResponseBody & { data?: unknown }) | undefined;
  const body = (raw?.responseMeta !== undefined ? raw : raw?.data) as
    | AIResponseBody
    | undefined;

  if (body?.responseMeta?.success && body.data?.response) {
    return body.data.response;
  }

  throw new Error(
    body?.responseMeta?.error?.message ||
      body?.data?.error ||
      body?.errorMessage ||
      body?.message ||
      "The AI request failed. Check the AI settings.",
  );
}

/** The workspace datasources a block can use: REST APIs and databases that take their query as text. */
function* getBlockDatasources() {
  const datasources: Datasource[] = yield select(getDatasources);
  const plugins: Plugin[] = yield select(getPlugins);
  const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const result: BlockDatasourceInfo[] = [];

  datasources.forEach((datasource) => {
    const plugin = pluginsById.get(datasource.pluginId);

    if (!plugin || !datasource.id) return;

    if (
      plugin.type === PluginType.API &&
      plugin.packageName === PluginPackageName.REST_API
    ) {
      result.push({
        id: datasource.id,
        name: datasource.name,
        plugin: plugin.name,
        queryKind: "rest",
      });
    } else if (
      plugin.type === PluginType.DB &&
      plugin.packageName !== PluginPackageName.MONGO
    ) {
      result.push({
        id: datasource.id,
        name: datasource.name,
        plugin: plugin.name,
        queryKind: "datasource",
      });
    }
  });

  return result;
}

/** Rejects queries that reference a datasource that does not exist or cannot run that kind of query. */
function assertDatasourcesExist(
  queries: BlockQuery[],
  datasources: BlockDatasourceInfo[],
) {
  const byId = new Map(
    datasources.map((datasource) => [datasource.id, datasource]),
  );

  queries.forEach((query) => {
    if (!query.datasourceId) return;

    const datasource = byId.get(query.datasourceId);

    if (!datasource) {
      throw new BlockDefinitionError(
        `Query "${query.key}" uses a datasource that does not exist in this workspace. Create the datasource first, then try again.`,
      );
    }

    if (datasource.queryKind !== query.kind) {
      throw new BlockDefinitionError(
        `Query "${query.key}" cannot run on datasource "${datasource.name}" (${datasource.plugin}).`,
      );
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a block
// ---------------------------------------------------------------------------------------------------------------------

function* getBlockWidget(widgetId: string) {
  const widget: BlockWidgetProps | undefined = yield select(
    getWidget,
    widgetId,
  );

  if (!widget || widget.type !== BLOCK_WIDGET_TYPE) {
    throw new Error("The block was not found on this page.");
  }

  return widget;
}

/** The block's queries that still exist, keyed by query key. */
function* getBlockActions(widget: BlockWidgetProps) {
  const actions: Record<string, Action> = {};

  for (const ref of widget.blockQueries || []) {
    const action: Action | undefined = yield select(getAction, ref.actionId);

    if (action) actions[ref.key] = action;
  }

  return actions;
}

function* getBlockController(widget: BlockWidgetProps) {
  if (!widget.blockControllerId) return undefined;

  const collection: JSCollection | undefined = yield select(
    getJSCollection,
    widget.blockControllerId,
  );

  return collection;
}

/**
 * Reads the block's current definition back from the widget and its entities. Edits the user made in the JS editor
 * or the query editors are included, and entity names are replaced with tokens so the result is portable.
 */
function* exportBlockDefinition(widgetId: string) {
  const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
  const actions: Record<string, Action> = yield call(getBlockActions, widget);
  const collection: JSCollection | undefined = yield call(
    getBlockController,
    widget,
  );
  const names: BlockEntityNames = {
    block: widget.widgetName,
    queries: Object.fromEntries(
      Object.entries(actions).map(([key, action]) => [key, action.name]),
    ),
  };
  const queries = Object.entries(actions)
    .map(([key, action]) => actionToBlockQuery(action, key))
    .filter((query): query is BlockQuery => query !== null)
    .map((query) => tokenizeBlockQuery(query, names));

  const definition: BlockDefinition = {
    title: widget.title || "",
    showTitle: widget.showTitle !== false,
    view: widget.srcDoc || { html: "", css: "", js: "" },
    settingsSchema: widget.settingsSchema || {},
    settings: widget.settings || {},
    controller: collection
      ? {
          language: "javascript",
          body: tokenizeBlockText(collection.body || "", names),
        }
      : null,
    queries,
    permissions: (widget.blockPermissions || []).map(({ description, id }) => ({
      id,
      description,
    })),
    dataSource: widget.blockDataSource || null,
  };

  return definition;
}

// ---------------------------------------------------------------------------------------------------------------------
// Applying a definition
// ---------------------------------------------------------------------------------------------------------------------

function* getTakenEntityNames() {
  const widgets: CanvasWidgetsReduxState = yield select(getWidgets);
  const state: DefaultRootState = yield select((s: DefaultRootState) => s);
  const names = new Set<string>();

  Object.values(widgets).forEach((widget) => names.add(widget.widgetName));
  (state.entities.actions || []).forEach(
    (action: { config: { name: string } }) => names.add(action.config.name),
  );
  (state.entities.jsActions || []).forEach(
    (collection: { config: { name: string } }) =>
      names.add(collection.config.name),
  );

  return names;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  let index = 1;

  while (taken.has(name)) {
    name = `${base}${index}`;
    index++;
  }

  taken.add(name);

  return name;
}

function* buildActionPayload(
  query: BlockQuery,
  name: string,
  pageId: string,
  datasources: Datasource[],
) {
  if (query.kind === "datasource") {
    const datasource = datasources.find((d) => d.id === query.datasourceId);

    if (!datasource) {
      throw new BlockDefinitionError(
        `Datasource for query "${query.key}" not found.`,
      );
    }

    const plugins: Plugin[] = yield select(getPlugins);
    const plugin = plugins.find((p) => p.id === datasource.pluginId);

    return {
      name,
      pageId,
      pluginId: datasource.pluginId,
      pluginType: plugin?.type || PluginType.DB,
      datasource: {
        id: datasource.id,
        name: datasource.name,
        pluginId: datasource.pluginId,
      },
      actionConfiguration: {
        body: query.body,
        // Prepared statements: values bound with {{ }} are sent as parameters, not spliced into the query.
        pluginSpecifiedTemplates: [{ value: true }],
      },
    } as unknown as Partial<Action>;
  }

  const restPluginId: string = yield select(
    getPluginIdOfPackageName,
    PluginPackageName.REST_API,
  );
  const workspaceId: string = yield select(getCurrentWorkspaceId);
  const actionConfiguration = {
    ...DEFAULT_API_ACTION_CONFIG,
    ...restQueryToActionConfiguration(query),
  };

  if (query.datasourceId) {
    const datasource = datasources.find((d) => d.id === query.datasourceId);

    return {
      name,
      pageId,
      pluginId: restPluginId,
      pluginType: PluginType.API,
      datasource: {
        id: query.datasourceId,
        name: datasource?.name,
        pluginId: restPluginId,
      },
      actionConfiguration,
    } as unknown as Partial<Action>;
  }

  // An embedded datasource for an unauthenticated API. As in the API editor, the plugin id goes on the
  // datasource only: a top-level plugin id breaks the embedded datasource flow.
  return {
    name,
    pageId,
    pluginType: PluginType.API,
    datasource: {
      name: DEFAULT_DATASOURCE_NAME,
      pluginId: restPluginId,
      workspaceId,
      datasourceConfiguration: { url: query.url || "" },
    },
    actionConfiguration,
  } as unknown as Partial<Action>;
}

function isCompatibleAction(action: Action, query: BlockQuery) {
  if (query.kind === "rest") return action.pluginType === PluginType.API;

  return (
    action.pluginType !== PluginType.API &&
    action.datasource?.id === query.datasourceId
  );
}

function* createAction(payload: Partial<Action>) {
  const response: ApiResponse<Action> = yield call(
    ActionAPI.createAction,
    payload,
  );
  const isValid: boolean = yield validateResponse(response);

  if (!isValid) throw new Error(`Could not create query "${payload.name}".`);

  return response.data;
}

function* updateAction(existing: Action, payload: Partial<Action>) {
  const response: ApiResponse<Action> = yield call(ActionAPI.updateAction, {
    ...existing,
    actionConfiguration: {
      ...existing.actionConfiguration,
      ...payload.actionConfiguration,
    },
    datasource: payload.datasource,
  } as Partial<Action>);
  const isValid: boolean = yield validateResponse(response);

  if (!isValid) throw new Error(`Could not update query "${existing.name}".`);

  return response.data;
}

function* deleteAction(action: Action) {
  const response: ApiResponse = yield call(ActionAPI.deleteAction, action.id);
  const isValid: boolean = yield validateResponse(response);

  if (isValid) yield put(deleteActionSuccess({ id: action.id }));
}

function* deleteCollection(collection: JSCollection) {
  const response: ApiResponse = yield call(
    JSActionAPI.deleteJSCollection,
    collection.id,
  );
  const isValid: boolean = yield validateResponse(response);

  if (isValid) yield put(deleteJSCollectionSuccess({ id: collection.id }));
}

/** Builds the create request of a JS object, declaring its functions and variables the way the JS editor does. */
function* buildCollectionRequest(name: string, body: string) {
  const pageId: string = yield select(getCurrentPageId);
  const workspaceId: string = yield select(getCurrentWorkspaceId);
  const applicationId: string = yield select(getCurrentApplicationId);
  const pluginId: string = yield select(
    getPluginIdOfPackageName,
    PluginPackageName.JS,
  );
  const { parsedObject, success } = parseJSObject(body);

  if (!success) {
    throw new BlockDefinitionError(
      "The controller script has a syntax error and could not be parsed.",
    );
  }

  const request: CreateJSCollectionRequest = {
    name,
    pageId,
    workspaceId,
    applicationId,
    pluginId,
    pluginType: PluginType.JS,
    body,
    variables: parsedObject
      .filter((property) => !isJSFunctionProperty(property))
      .map((property) => ({ name: property.key, value: property.value })),
    actions: parsedObject.filter(isJSFunctionProperty).map((property) => ({
      name: property.key,
      workspaceId,
      pageId,
      runBehaviour: ActionRunBehaviour.MANUAL,
      clientSideExecution: true,
      actionConfiguration: {
        body: property.value,
        timeoutInMillisecond: 0,
        jsArguments: (property.arguments || []).map((argument) => ({
          name: argument.paramName,
          value: argument.defaultValue,
        })),
      },
    })),
  };

  return request;
}

/** Reloads the page's queries and JS objects so the store, and the evaluation, include the block's new entities. */
function* refetchPageEntities(pageId: string) {
  yield put(fetchActionsForPage(pageId));
  yield put(fetchJSCollectionsForPage(pageId));
  yield race({
    done: all([
      take([
        ReduxActionTypes.FETCH_ACTIONS_FOR_PAGE_SUCCESS,
        ReduxActionErrorTypes.FETCH_ACTIONS_FOR_PAGE_ERROR,
      ]),
      take([
        ReduxActionTypes.FETCH_JS_ACTIONS_FOR_PAGE_SUCCESS,
        ReduxActionErrorTypes.FETCH_JS_ACTIONS_FOR_PAGE_ERROR,
      ]),
    ]),
    timeout: delay(REFETCH_TIMEOUT_MS),
  });
}

interface ApplyOptions {
  /** Status of permissions the block did not have before. Defaults to pending. */
  permissions?: BlockPermission[];
  /** Further widget properties to write in the same update, such as snapshots. */
  extraProps?: Record<string, unknown>;
}

/**
 * Applies a definition to a block: creates, updates or deletes its queries and controller JS object, then writes the
 * view, settings and wiring to the widget. Entities that already belong to the block are updated in place, so their
 * names, and anything else that references them, stay stable.
 */
function* applyBlockDefinition(
  widgetId: string,
  definition: BlockDefinition,
  options: ApplyOptions = {},
) {
  const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
  const pageId: string = yield select(getCurrentPageId);
  const datasources: Datasource[] = yield select(getDatasources);
  const blockDatasources: BlockDatasourceInfo[] =
    yield call(getBlockDatasources);

  assertDatasourcesExist(definition.queries, blockDatasources);

  const existingActions: Record<string, Action> = yield call(
    getBlockActions,
    widget,
  );
  const existingCollection: JSCollection | undefined = yield call(
    getBlockController,
    widget,
  );
  const taken: Set<string> = yield call(getTakenEntityNames);

  // Name every query first: query configurations and the controller reference each other by name.
  const reusable: Record<string, Action> = {};
  const names: BlockEntityNames = { block: widget.widgetName, queries: {} };

  definition.queries.forEach((query) => {
    const existing = existingActions[query.key];

    if (existing && isCompatibleAction(existing, query)) {
      reusable[query.key] = existing;
      names.queries[query.key] = existing.name;
    } else {
      names.queries[query.key] = uniqueName(
        `${widget.widgetName}_${query.key}`,
        taken,
      );
    }
  });

  // Remove queries the definition dropped, or that changed kind or datasource and are recreated.
  for (const [key, action] of Object.entries(existingActions)) {
    if (!reusable[key]) yield call(deleteAction, action);
  }

  const queryRefs: BlockQueryRef[] = [];

  for (const query of definition.queries) {
    const materialized = materializeBlockQuery(query, names);
    const payload: Partial<Action> = yield call(
      buildActionPayload,
      materialized,
      names.queries[query.key],
      pageId,
      datasources,
    );
    const existing = reusable[query.key];
    const saved: Action = existing
      ? yield call(updateAction, existing, payload)
      : yield call(createAction, payload);

    queryRefs.push({ key: query.key, actionId: saved.id || existing?.id });
  }

  let controllerId: string | undefined;
  let controllerName: string | undefined;

  if (definition.controller) {
    const body = materializeBlockText(definition.controller.body, names);

    if (existingCollection) {
      controllerId = existingCollection.id;
      controllerName = existingCollection.name;

      if (body !== existingCollection.body) {
        yield put(updateJSCollectionBody(body, existingCollection.id));
        yield race({
          done: take([
            ReduxActionTypes.UPDATE_JS_ACTION_BODY_SUCCESS,
            ReduxActionErrorTypes.UPDATE_JS_ACTION_BODY_ERROR,
          ]),
          timeout: delay(REFETCH_TIMEOUT_MS),
        });
      }
    } else {
      controllerName = uniqueName(`${widget.widgetName}_controller`, taken);

      const request: CreateJSCollectionRequest = yield call(
        buildCollectionRequest,
        controllerName,
        body,
      );
      const response: ApiResponse<JSCollection> = yield call(
        JSActionAPI.createJSCollection,
        request,
      );
      const isValid: boolean = yield validateResponse(response);

      if (!isValid) throw new Error("Could not create the controller.");

      controllerId = response.data.id;
    }
  } else if (existingCollection) {
    yield call(deleteCollection, existingCollection);
  }

  yield call(refetchPageEntities, pageId);

  const permissions = mergePermissions(
    options.permissions ?? widget.blockPermissions ?? [],
    definition.permissions,
  );

  yield put(
    batchUpdateWidgetProperty(widgetId, {
      modify: {
        blockState: BlockState.READY,
        title: definition.title,
        showTitle: definition.showTitle,
        srcDoc: definition.view,
        settingsSchema: definition.settingsSchema,
        settings: definition.settings,
        blockControllerId: controllerId || "",
        blockQueries: queryRefs,
        blockPermissions: permissions,
        blockDataSource: definition.dataSource,
        controllerState: controllerName
          ? `{{ { data: ${controllerName}.data, error: ${controllerName}.error, logs: ${controllerName}.logs, updatedAt: ${controllerName}.updatedAt } }}`
          : "",
        onRefresh: controllerName ? `{{${controllerName}.run()}}` : "",
        ...options.extraProps,
      },
      triggerPaths: ["onRefresh"],
    }),
  );
}

function* logBlock(
  widgetId: string,
  message: string,
  level: "info" | "error" = "info",
) {
  yield put(appendBlockLog({ widgetId, level, source: "block", message }));
}

function newSnapshot(name: string, definition: BlockDefinition): BlockSnapshot {
  return {
    id: generateReactKey(),
    name: name.slice(0, 120),
    createdAt: new Date().toISOString(),
    definition,
  };
}

function withSnapshot(
  snapshots: BlockSnapshot[] | undefined,
  snapshot: BlockSnapshot,
): BlockSnapshot[] {
  return [...(snapshots || []), snapshot].slice(-MAX_BLOCK_SNAPSHOTS);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sagas
// ---------------------------------------------------------------------------------------------------------------------

function* generateBlockSaga(
  action: ReduxAction<{ widgetId: string; description: string }>,
) {
  const { description, widgetId } = action.payload;

  try {
    yield put(setBlockStatus({ widgetId, status: "generating" }));

    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const datasources: BlockDatasourceInfo[] = yield call(getBlockDatasources);
    const reply: string = yield call(requestAI, AI_MODE_GENERATE, description, {
      blockName: widget.widgetName,
      datasources,
    });
    const definition = parseBlockGenerationResponse(reply);

    yield put(setBlockStatus({ widgetId, status: "applying" }));
    // The description is not stored: from here on the saved block is the source of truth.
    yield call(applyBlockDefinition, widgetId, definition, { permissions: [] });
    yield put(setBlockStatus({ widgetId, status: "idle" }));
    yield call(logBlock, widgetId, "Block generated from its description");
  } catch (error) {
    yield put(
      setBlockStatus({
        widgetId,
        status: "error",
        error: errorMessageOf(error, "Could not generate the block."),
      }),
    );
  }
}

function* sendAgentMessageSaga(
  action: ReduxAction<{ widgetId: string; message: string }>,
) {
  const { message, widgetId } = action.payload;
  const uiState: BlockUIState = yield select(getBlockUIState, widgetId);
  const history = uiState.chat.map(({ content, role }) => ({ role, content }));

  yield put(
    appendBlockChatMessage({
      widgetId,
      message: { role: "user", content: message },
    }),
  );
  yield put(setBlockAgentStatus({ widgetId, isBusy: true }));

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const current: BlockDefinition = yield call(
      exportBlockDefinition,
      widgetId,
    );
    const datasources: BlockDatasourceInfo[] = yield call(getBlockDatasources);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataTree: Record<string, any> = yield select(getDataTree);
    const controllerState = dataTree[widget.widgetName]?.controllerState;
    const recentLogs = uiState.logs.slice(-20).map((entry) => ({
      source: entry.source,
      level: entry.level,
      message: entry.message,
    }));

    const reply: string = yield call(
      requestAI,
      AI_MODE_AGENT,
      message,
      {
        definition: current,
        datasources,
        runtime: {
          controllerError: controllerState?.error ?? null,
          lastUpdatedAt: controllerState?.updatedAt ?? null,
          controllerLogs: Array.isArray(controllerState?.logs)
            ? controllerState.logs.slice(-20)
            : [],
          blockLogs: recentLogs,
        },
      },
      history,
    );
    const { changes, reply: text } = parseBlockAgentResponse(reply, current);

    if (changes) {
      yield put(setBlockStatus({ widgetId, status: "applying" }));

      const snapshot = newSnapshot(
        `Before agent change: ${message.slice(0, 60)}`,
        current,
      );

      yield call(
        applyBlockDefinition,
        widgetId,
        applyBlockDefinitionChanges(current, changes),
        {
          extraProps: {
            blockSnapshots: withSnapshot(widget.blockSnapshots, snapshot),
          },
        },
      );
      yield put(setBlockStatus({ widgetId, status: "idle" }));
      yield call(
        logBlock,
        widgetId,
        `Agent applied a change: ${message.slice(0, 80)}`,
      );
    }

    yield put(
      appendBlockChatMessage({
        widgetId,
        message: {
          role: "assistant",
          content: changes
            ? `${text}\n\n(Changes applied. A snapshot of the previous version was saved.)`
            : text,
        },
      }),
    );
    yield put(setBlockAgentStatus({ widgetId, isBusy: false }));
  } catch (error) {
    const errorText = errorMessageOf(error, "The agent request failed.");

    // Keep the conversation alternating between user and assistant, which the providers require.
    yield put(
      appendBlockChatMessage({
        widgetId,
        message: {
          role: "assistant",
          content: `I could not apply that: ${errorText}`,
        },
      }),
    );
    yield put(setBlockStatus({ widgetId, status: "idle" }));
    yield put(
      setBlockAgentStatus({ widgetId, isBusy: false, error: errorText }),
    );
  }
}

function* takeSnapshotSaga(
  action: ReduxAction<{ widgetId: string; name: string }>,
) {
  const { name, widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const definition: BlockDefinition = yield call(
      exportBlockDefinition,
      widgetId,
    );

    yield put(
      batchUpdateWidgetProperty(widgetId, {
        modify: {
          blockSnapshots: withSnapshot(
            widget.blockSnapshots,
            newSnapshot(name, definition),
          ),
        },
      }),
    );
    toast.show(`Snapshot "${name}" saved`, { kind: "success" });
  } catch (error) {
    toast.show(errorMessageOf(error, "Could not take the snapshot."), {
      kind: "error",
    });
  }
}

function* restoreSnapshotSaga(
  action: ReduxAction<{ widgetId: string; snapshotId: string }>,
) {
  const { snapshotId, widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const snapshot = (widget.blockSnapshots || []).find(
      (entry) => entry.id === snapshotId,
    );

    if (!snapshot) throw new Error("The snapshot was not found.");

    yield put(setBlockStatus({ widgetId, status: "applying" }));

    const current: BlockDefinition = yield call(
      exportBlockDefinition,
      widgetId,
    );
    const backup = newSnapshot(`Before restoring "${snapshot.name}"`, current);

    yield call(applyBlockDefinition, widgetId, snapshot.definition, {
      extraProps: {
        blockSnapshots: withSnapshot(widget.blockSnapshots, backup),
      },
    });
    yield put(setBlockStatus({ widgetId, status: "idle" }));
    yield call(logBlock, widgetId, `Restored snapshot "${snapshot.name}"`);
    toast.show(`Restored "${snapshot.name}"`, { kind: "success" });
  } catch (error) {
    yield put(setBlockStatus({ widgetId, status: "idle" }));
    toast.show(errorMessageOf(error, "Could not restore the snapshot."), {
      kind: "error",
    });
  }
}

function* deleteSnapshotSaga(
  action: ReduxAction<{ widgetId: string; snapshotId: string }>,
) {
  const { snapshotId, widgetId } = action.payload;
  const widget: BlockWidgetProps | undefined = yield select(
    getWidget,
    widgetId,
  );

  if (!widget) return;

  yield put(
    batchUpdateWidgetProperty(widgetId, {
      modify: {
        blockSnapshots: (widget.blockSnapshots || []).filter(
          (snapshot) => snapshot.id !== snapshotId,
        ),
      },
    }),
  );
}

function* saveControllerSaga(
  action: ReduxAction<{ widgetId: string; body: string }>,
) {
  const { body, widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);

    if (!widget.blockControllerId)
      throw new Error("This block has no controller.");

    yield put(updateJSCollectionBody(body, widget.blockControllerId));

    const { error } = (yield race({
      success: take(ReduxActionTypes.UPDATE_JS_ACTION_BODY_SUCCESS),
      error: take(ReduxActionErrorTypes.UPDATE_JS_ACTION_BODY_ERROR),
      timeout: delay(REFETCH_TIMEOUT_MS),
    })) as { success?: unknown; error?: unknown; timeout?: boolean };

    if (error) throw new Error("Could not save the script.");

    yield call(logBlock, widgetId, "Script saved");
    toast.show("Script saved", { kind: "success" });
  } catch (error) {
    yield call(
      logBlock,
      widgetId,
      errorMessageOf(error, "Could not save the script."),
      "error",
    );
    toast.show(errorMessageOf(error, "Could not save the script."), {
      kind: "error",
    });
  }
}

function overlaps(
  a: {
    leftColumn: number;
    rightColumn: number;
    topRow: number;
    bottomRow: number;
  },
  b: {
    leftColumn: number;
    rightColumn: number;
    topRow: number;
    bottomRow: number;
  },
) {
  return (
    a.leftColumn < b.rightColumn &&
    b.leftColumn < a.rightColumn &&
    a.topRow < b.bottomRow &&
    b.topRow < a.bottomRow
  );
}

function* updateLayoutSaga(
  action: ReduxAction<{ widgetId: string; layout: BlockLayoutUpdate }>,
) {
  const { layout, widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const widgets: CanvasWidgetsReduxState = yield select(getWidgets);
    const position = {
      leftColumn: Math.round(layout.leftColumn ?? widget.leftColumn),
      topRow: Math.round(layout.topRow ?? widget.topRow),
      rightColumn: 0,
      bottomRow: 0,
    };
    const columns = Math.round(
      layout.columns ?? widget.rightColumn - widget.leftColumn,
    );
    const rows = Math.round(layout.rows ?? widget.bottomRow - widget.topRow);

    position.rightColumn = position.leftColumn + columns;
    position.bottomRow = position.topRow + rows;

    if (
      [position.leftColumn, position.topRow, columns, rows].some(
        (value) => !Number.isFinite(value),
      )
    ) {
      throw new Error("Size and position must be numbers.");
    }

    if (columns < MIN_BLOCK_COLUMNS || rows < MIN_BLOCK_ROWS) {
      throw new Error(
        `A block is at least ${MIN_BLOCK_COLUMNS} columns wide and ${MIN_BLOCK_ROWS} rows high.`,
      );
    }

    if (
      position.leftColumn < 0 ||
      position.topRow < 0 ||
      position.rightColumn > GridDefaults.DEFAULT_GRID_COLUMNS
    ) {
      throw new Error(
        `The block must fit in the ${GridDefaults.DEFAULT_GRID_COLUMNS}-column grid.`,
      );
    }

    const parent = widget.parentId ? widgets[widget.parentId] : undefined;
    const siblings = (parent?.children || [])
      .filter((id) => id !== widgetId)
      .map((id) => widgets[id])
      .filter(
        (sibling): sibling is FlattenedWidgetProps =>
          Boolean(sibling) && !sibling.detachFromLayout,
      );
    const blocking = siblings.find((sibling) => overlaps(position, sibling));

    if (blocking) {
      throw new Error(
        `The new size or position overlaps ${blocking.widgetName}. Move it first or pick another position.`,
      );
    }

    yield put(
      batchUpdateWidgetProperty(widgetId, {
        modify: {
          ...position,
          ...(layout.title !== undefined ? { title: layout.title } : {}),
          ...(layout.showTitle !== undefined
            ? { showTitle: layout.showTitle }
            : {}),
        },
      }),
    );
  } catch (error) {
    toast.show(errorMessageOf(error, "Could not update the layout."), {
      kind: "error",
    });
  }
}

function* setPermissionStatusSaga(
  action: ReduxAction<{
    widgetId: string;
    permissionId?: string;
    status: BlockPermissionStatus;
  }>,
) {
  const { permissionId, status, widgetId } = action.payload;
  const widget: BlockWidgetProps | undefined = yield select(
    getWidget,
    widgetId,
  );

  if (!widget) return;

  yield put(
    batchUpdateWidgetProperty(widgetId, {
      modify: {
        blockPermissions: (widget.blockPermissions || []).map((permission) =>
          !permissionId || permission.id === permissionId
            ? { ...permission, status }
            : permission,
        ),
      },
    }),
  );
  yield call(
    logBlock,
    widgetId,
    `Permission ${permissionId ? `"${permissionId}"` : "(all)"} set to ${status}`,
  );
}

/** Deletes the block's controller and queries. */
function* deleteBlockEntities(widget: BlockWidgetProps) {
  const actions: Record<string, Action> = yield call(getBlockActions, widget);
  const collection: JSCollection | undefined = yield call(
    getBlockController,
    widget,
  );

  for (const action of Object.values(actions)) {
    yield call(deleteAction, action);
  }

  if (collection) yield call(deleteCollection, collection);
}

function* resetBlockSaga(action: ReduxAction<{ widgetId: string }>) {
  const { widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);

    yield call(deleteBlockEntities, widget);
    yield put(
      batchUpdateWidgetProperty(widgetId, {
        modify: {
          blockState: BlockState.EMPTY,
          title: "",
          srcDoc: { html: "", css: "", js: "" },
          settings: {},
          settingsSchema: {},
          blockControllerId: "",
          blockQueries: [],
          blockPermissions: [],
          blockSnapshots: [],
          blockDataSource: null,
          controllerState: "",
          onRefresh: "",
        },
        triggerPaths: ["onRefresh"],
      }),
    );
    yield put(clearBlockChat({ widgetId }));
    yield put(clearBlockLogs({ widgetId }));
    yield put(setBlockStatus({ widgetId, status: "idle" }));
  } catch (error) {
    toast.show(errorMessageOf(error, "Could not reset the block."), {
      kind: "error",
    });
  }
}

function* deleteBlockSaga(action: ReduxAction<{ widgetId: string }>) {
  const { widgetId } = action.payload;

  try {
    const widget: BlockWidgetProps = yield call(getBlockWidget, widgetId);

    yield call(deleteBlockEntities, widget);
    // A single-widget delete: the generic delete would remove every selected widget. Undo is disabled because the
    // block's controller and queries are already gone.
    yield put({
      type: WidgetReduxActionTypes.WIDGET_SINGLE_DELETE,
      payload: {
        widgetId,
        parentId: widget.parentId,
        disallowUndo: true,
        isShortcut: false,
      },
    });
  } catch (error) {
    toast.show(errorMessageOf(error, "Could not delete the block."), {
      kind: "error",
    });
  }
}

function* waitForWidget(widgetId: string) {
  const deadline = Date.now() + NEW_WIDGET_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const widget: BlockWidgetProps | undefined = yield select(
      getWidget,
      widgetId,
    );

    if (widget) return widget;

    yield delay(100);
  }

  throw new Error("The new block did not appear on the canvas.");
}

function* duplicateBlockSaga(action: ReduxAction<{ widgetId: string }>) {
  const { widgetId } = action.payload;

  try {
    const source: BlockWidgetProps = yield call(getBlockWidget, widgetId);
    const definition: BlockDefinition = yield call(
      exportBlockDefinition,
      widgetId,
    );
    const widgets: CanvasWidgetsReduxState = yield select(getWidgets);
    const parent = source.parentId ? widgets[source.parentId] : undefined;

    if (!parent) throw new Error("The block's container was not found.");

    // Below every widget in the same container, so the copy overlaps nothing.
    const topRow = Math.max(
      0,
      ...(parent.children || [])
        .map((id) => widgets[id])
        .filter((child) => child && !child.detachFromLayout)
        .map((child) => child.bottomRow),
    );
    const newWidgetId = generateReactKey();

    yield put({
      type: WidgetReduxActionTypes.WIDGET_ADD_CHILD,
      payload: {
        widgetId: parent.widgetId,
        type: BLOCK_WIDGET_TYPE,
        leftColumn: source.leftColumn,
        topRow,
        columns: source.rightColumn - source.leftColumn,
        rows: source.bottomRow - source.topRow,
        parentRowSpace: source.parentRowSpace,
        parentColumnSpace: source.parentColumnSpace,
        newWidgetId,
        tabId: "0",
        props: {},
      },
    });

    yield call(waitForWidget, newWidgetId);
    yield put(setBlockStatus({ widgetId: newWidgetId, status: "applying" }));
    yield call(applyBlockDefinition, newWidgetId, definition, {
      permissions: source.blockPermissions || [],
      extraProps: { blockSnapshots: source.blockSnapshots || [] },
    });
    yield put(setBlockStatus({ widgetId: newWidgetId, status: "idle" }));
    toast.show(`${source.widgetName} duplicated`, { kind: "success" });
  } catch (error) {
    toast.show(errorMessageOf(error, "Could not duplicate the block."), {
      kind: "error",
    });
  }
}

export default function* blockSagas() {
  yield all([
    takeEvery(ReduxActionTypes.BLOCK_GENERATE_INIT, generateBlockSaga),
    takeLeading(ReduxActionTypes.BLOCK_AGENT_SEND, sendAgentMessageSaga),
    takeEvery(ReduxActionTypes.BLOCK_TAKE_SNAPSHOT, takeSnapshotSaga),
    takeLeading(ReduxActionTypes.BLOCK_RESTORE_SNAPSHOT, restoreSnapshotSaga),
    takeEvery(ReduxActionTypes.BLOCK_DELETE_SNAPSHOT, deleteSnapshotSaga),
    takeEvery(ReduxActionTypes.BLOCK_SAVE_CONTROLLER, saveControllerSaga),
    takeEvery(ReduxActionTypes.BLOCK_UPDATE_LAYOUT, updateLayoutSaga),
    takeEvery(
      ReduxActionTypes.BLOCK_SET_PERMISSION_STATUS,
      setPermissionStatusSaga,
    ),
    takeLeading(ReduxActionTypes.BLOCK_DUPLICATE, duplicateBlockSaga),
    takeLeading(ReduxActionTypes.BLOCK_RESET, resetBlockSaga),
    takeLeading(ReduxActionTypes.BLOCK_DELETE, deleteBlockSaga),
  ]);
}
