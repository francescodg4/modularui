import { createReducer } from "utils/ReducerUtils";
import type { ReduxAction } from "actions/ReduxActionTypes";
import { ReduxActionTypes } from "ee/constants/ReduxActionConstants";
import type {
  BlockChatMessage,
  BlockLogEntry,
  BlockStatus,
} from "actions/blockActions";
import {
  MAX_BLOCK_CHAT_MESSAGES,
  MAX_BLOCK_LOGS,
} from "widgets/BlockWidget/constants";

/**
 * Transient, per-session UI state of each block: generation progress, the agent conversation and run logs.
 * Nothing here is saved: the block's definition lives in the widget DSL and its entities.
 */
export interface BlockUIState {
  status: BlockStatus;
  error?: string;
  isAgentBusy: boolean;
  agentError?: string;
  chat: BlockChatMessage[];
  logs: BlockLogEntry[];
}

export type BlocksReduxState = Record<string, BlockUIState>;

export const DEFAULT_BLOCK_UI_STATE: BlockUIState = {
  status: "idle",
  isAgentBusy: false,
  chat: [],
  logs: [],
};

const initialState: BlocksReduxState = {};

function withBlock(
  state: BlocksReduxState,
  widgetId: string,
  update: (block: BlockUIState) => Partial<BlockUIState>,
): BlocksReduxState {
  const block = state[widgetId] || DEFAULT_BLOCK_UI_STATE;

  return { ...state, [widgetId]: { ...block, ...update(block) } };
}

export const blockReducer = createReducer(initialState, {
  [ReduxActionTypes.BLOCK_SET_STATUS]: (
    state: BlocksReduxState,
    action: ReduxAction<{
      widgetId: string;
      status: BlockStatus;
      error?: string;
    }>,
  ) =>
    withBlock(state, action.payload.widgetId, () => ({
      status: action.payload.status,
      error: action.payload.error,
    })),
  [ReduxActionTypes.BLOCK_SET_AGENT_STATUS]: (
    state: BlocksReduxState,
    action: ReduxAction<{ widgetId: string; isBusy: boolean; error?: string }>,
  ) =>
    withBlock(state, action.payload.widgetId, () => ({
      isAgentBusy: action.payload.isBusy,
      agentError: action.payload.error,
    })),
  [ReduxActionTypes.BLOCK_APPEND_CHAT_MESSAGE]: (
    state: BlocksReduxState,
    action: ReduxAction<{ widgetId: string; message: BlockChatMessage }>,
  ) =>
    withBlock(state, action.payload.widgetId, (block) => ({
      chat: [...block.chat, action.payload.message].slice(
        -MAX_BLOCK_CHAT_MESSAGES,
      ),
    })),
  [ReduxActionTypes.BLOCK_CLEAR_CHAT]: (
    state: BlocksReduxState,
    action: ReduxAction<{ widgetId: string }>,
  ) =>
    withBlock(state, action.payload.widgetId, () => ({
      chat: [],
      agentError: undefined,
    })),
  [ReduxActionTypes.BLOCK_APPEND_LOG]: (
    state: BlocksReduxState,
    action: ReduxAction<BlockLogEntry & { widgetId: string }>,
  ) => {
    const { widgetId, ...entry } = action.payload;

    return withBlock(state, widgetId, (block) => ({
      logs: [...block.logs, entry].slice(-MAX_BLOCK_LOGS),
    }));
  },
  [ReduxActionTypes.BLOCK_CLEAR_LOGS]: (
    state: BlocksReduxState,
    action: ReduxAction<{ widgetId: string }>,
  ) => withBlock(state, action.payload.widgetId, () => ({ logs: [] })),
});
