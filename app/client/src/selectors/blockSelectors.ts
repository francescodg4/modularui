import type { DefaultRootState } from "react-redux";
import {
  DEFAULT_BLOCK_UI_STATE,
  type BlockUIState,
} from "reducers/uiReducers/blockReducer";

export const getBlockUIState = (
  state: DefaultRootState,
  widgetId: string,
): BlockUIState => state.blocks[widgetId] || DEFAULT_BLOCK_UI_STATE;
