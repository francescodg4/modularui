import { ReduxActionTypes } from "ee/constants/ReduxActionConstants";
import type { BlockPermissionStatus } from "widgets/BlockWidget/definition";

export type BlockStatus = "idle" | "generating" | "applying" | "error";

export interface BlockChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type BlockLogLevel = "info" | "error";

export type BlockLogSource = "controller" | "view" | "block";

export interface BlockLogEntry {
  time: string;
  level: BlockLogLevel;
  source: BlockLogSource;
  message: string;
}

export interface BlockLayoutUpdate {
  title?: string;
  showTitle?: boolean;
  leftColumn?: number;
  topRow?: number;
  columns?: number;
  rows?: number;
}

export const generateBlock = (payload: {
  widgetId: string;
  description: string;
}) => ({
  type: ReduxActionTypes.BLOCK_GENERATE_INIT,
  payload,
});

export const sendBlockAgentMessage = (payload: {
  widgetId: string;
  message: string;
}) => ({
  type: ReduxActionTypes.BLOCK_AGENT_SEND,
  payload,
});

export const setBlockStatus = (payload: {
  widgetId: string;
  status: BlockStatus;
  error?: string;
}) => ({
  type: ReduxActionTypes.BLOCK_SET_STATUS,
  payload,
});

export const setBlockAgentStatus = (payload: {
  widgetId: string;
  isBusy: boolean;
  error?: string;
}) => ({
  type: ReduxActionTypes.BLOCK_SET_AGENT_STATUS,
  payload,
});

export const appendBlockChatMessage = (payload: {
  widgetId: string;
  message: BlockChatMessage;
}) => ({
  type: ReduxActionTypes.BLOCK_APPEND_CHAT_MESSAGE,
  payload,
});

export const clearBlockChat = (payload: { widgetId: string }) => ({
  type: ReduxActionTypes.BLOCK_CLEAR_CHAT,
  payload,
});

export const appendBlockLog = (payload: {
  widgetId: string;
  level: BlockLogLevel;
  source: BlockLogSource;
  message: string;
}) => ({
  type: ReduxActionTypes.BLOCK_APPEND_LOG,
  payload: { ...payload, time: new Date().toISOString() },
});

export const clearBlockLogs = (payload: { widgetId: string }) => ({
  type: ReduxActionTypes.BLOCK_CLEAR_LOGS,
  payload,
});

export const takeBlockSnapshot = (payload: {
  widgetId: string;
  name: string;
}) => ({
  type: ReduxActionTypes.BLOCK_TAKE_SNAPSHOT,
  payload,
});

export const restoreBlockSnapshot = (payload: {
  widgetId: string;
  snapshotId: string;
}) => ({
  type: ReduxActionTypes.BLOCK_RESTORE_SNAPSHOT,
  payload,
});

export const deleteBlockSnapshot = (payload: {
  widgetId: string;
  snapshotId: string;
}) => ({
  type: ReduxActionTypes.BLOCK_DELETE_SNAPSHOT,
  payload,
});

export const saveBlockController = (payload: {
  widgetId: string;
  body: string;
}) => ({
  type: ReduxActionTypes.BLOCK_SAVE_CONTROLLER,
  payload,
});

export const updateBlockLayout = (payload: {
  widgetId: string;
  layout: BlockLayoutUpdate;
}) => ({
  type: ReduxActionTypes.BLOCK_UPDATE_LAYOUT,
  payload,
});

/** Sets the status of one permission, or of every permission when `permissionId` is omitted. */
export const setBlockPermissionStatus = (payload: {
  widgetId: string;
  permissionId?: string;
  status: BlockPermissionStatus;
}) => ({
  type: ReduxActionTypes.BLOCK_SET_PERMISSION_STATUS,
  payload,
});

export const duplicateBlock = (payload: { widgetId: string }) => ({
  type: ReduxActionTypes.BLOCK_DUPLICATE,
  payload,
});

export const resetBlock = (payload: { widgetId: string }) => ({
  type: ReduxActionTypes.BLOCK_RESET,
  payload,
});

export const deleteBlock = (payload: { widgetId: string }) => ({
  type: ReduxActionTypes.BLOCK_DELETE,
  payload,
});
