import { blockReducer, DEFAULT_BLOCK_UI_STATE } from "./blockReducer";
import {
  appendBlockChatMessage,
  appendBlockLog,
  clearBlockChat,
  setBlockAgentStatus,
  setBlockStatus,
} from "actions/blockActions";
import { MAX_BLOCK_LOGS } from "widgets/BlockWidget/constants";

describe("blockReducer", () => {
  it("tracks the generation status of each block separately", () => {
    let state = blockReducer(
      {},
      setBlockStatus({
        widgetId: "w1",
        status: "error",
        error: "No AI provider",
      }),
    );

    state = blockReducer(
      state,
      setBlockStatus({ widgetId: "w2", status: "generating" }),
    );

    expect(state.w1).toEqual({
      ...DEFAULT_BLOCK_UI_STATE,
      status: "error",
      error: "No AI provider",
    });
    expect(state.w2.status).toBe("generating");
  });

  it("appends chat messages and clears them with the agent error", () => {
    let state = blockReducer(
      {},
      appendBlockChatMessage({
        widgetId: "w1",
        message: { role: "user", content: "Hi" },
      }),
    );

    state = blockReducer(
      state,
      setBlockAgentStatus({ widgetId: "w1", isBusy: false, error: "Failed" }),
    );
    expect(state.w1.chat).toEqual([{ role: "user", content: "Hi" }]);

    state = blockReducer(state, clearBlockChat({ widgetId: "w1" }));
    expect(state.w1.chat).toEqual([]);
    expect(state.w1.agentError).toBeUndefined();
  });

  it("keeps only the most recent logs", () => {
    let state = {};

    for (let i = 0; i < MAX_BLOCK_LOGS + 5; i++) {
      state = blockReducer(
        state,
        appendBlockLog({
          widgetId: "w1",
          level: "info",
          source: "block",
          message: `run ${i}`,
        }),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = (state as any).w1.logs;

    expect(logs).toHaveLength(MAX_BLOCK_LOGS);
    expect(logs[0].message).toBe("run 5");
    expect(logs[MAX_BLOCK_LOGS - 1].message).toBe(`run ${MAX_BLOCK_LOGS + 4}`);
  });
});
