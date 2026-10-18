import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { Button, Callout, Spinner, Text } from "@appsmith/ads";
import { clearBlockChat, sendBlockAgentMessage } from "actions/blockActions";
import { getBlockUIState } from "selectors/blockSelectors";
import { PromptInput } from "../PromptArea";
import { Muted, PanelBody, Row, SpacedRow } from "./styles";

const Messages = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-3);
  min-height: 200px;
  max-height: 40vh;
  overflow: auto;
  padding: var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
`;

const Message = styled.div<{ isUser: boolean }>`
  align-self: ${({ isUser }) => (isUser ? "flex-end" : "flex-start")};
  max-width: 85%;
  padding: var(--ads-v2-spaces-2) var(--ads-v2-spaces-3);
  border-radius: var(--ads-v2-border-radius);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.5;
  background: ${({ isUser }) =>
    isUser
      ? "var(--ads-v2-color-bg-brand-secondary)"
      : "var(--ads-v2-color-bg-subtle)"};
  color: ${({ isUser }) =>
    isUser
      ? "var(--ads-v2-color-fg-on-brand-secondary, var(--ads-v2-color-fg))"
      : "var(--ads-v2-color-fg)"};
`;

interface AgentPanelProps {
  widgetId: string;
}

/**
 * Chat with an agent scoped to this block. The agent can change the block's view, settings, controller and queries;
 * changes apply live, and a snapshot is taken before each one so it can be undone from the Snapshots tab.
 */
function AgentPanel({ widgetId }: AgentPanelProps) {
  const dispatch = useDispatch();
  const { agentError, chat, isAgentBusy } = useSelector((state) =>
    getBlockUIState(state, widgetId),
  );
  const [message, setMessage] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [chat.length, isAgentBusy]);

  const send = () => {
    if (!message.trim() || isAgentBusy) return;

    dispatch(sendBlockAgentMessage({ widgetId, message: message.trim() }));
    setMessage("");
  };

  return (
    <PanelBody>
      <Messages data-testid="t--block-agent-messages" ref={messagesRef}>
        {chat.length === 0 && (
          <Muted>
            Describe a change, for example &quot;show temperatures in
            Fahrenheit&quot;, &quot;add a humidity column&quot; or &quot;the
            forecast does not load, fix it&quot;.
          </Muted>
        )}
        {chat.map((entry, index) => (
          <Message isUser={entry.role === "user"} key={index}>
            {entry.content}
          </Message>
        ))}
        {isAgentBusy && (
          <Row>
            <Spinner size="sm" />
            <Text kind="body-s">Working on it…</Text>
          </Row>
        )}
      </Messages>
      {agentError && <Callout kind="error">{agentError}</Callout>}
      <PromptInput
        aria-label="Message to the block agent"
        data-testid="t--block-agent-input"
        disabled={isAgentBusy}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            send();
          }
        }}
        placeholder="What should change?"
        value={message}
      />
      <SpacedRow>
        <Button
          isDisabled={chat.length === 0 || isAgentBusy}
          kind="tertiary"
          onClick={() => dispatch(clearBlockChat({ widgetId }))}
          size="md"
        >
          Clear conversation
        </Button>
        <Button
          isDisabled={!message.trim() || isAgentBusy}
          isLoading={isAgentBusy}
          onClick={send}
          size="md"
          startIcon="send-button"
        >
          Send
        </Button>
      </SpacedRow>
    </PanelBody>
  );
}

export default AgentPanel;
