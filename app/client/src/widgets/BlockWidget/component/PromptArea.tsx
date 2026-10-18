import React, { useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { Button, Callout, Icon, Spinner, Text } from "@appsmith/ads";
import { generateBlock } from "actions/blockActions";
import { getBlockUIState } from "selectors/blockSelectors";
import { stopCanvasEvents } from "./utils";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-3);
  height: 100%;
  padding: var(--ads-v2-spaces-5);
  box-sizing: border-box;
  border: 1px dashed var(--ads-v2-color-border-emphasis);
  border-radius: var(--ads-v2-border-radius);
  background: var(--ads-v2-color-bg-subtle);
  overflow: auto;
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-2);
`;

export const PromptInput = styled.textarea`
  flex: 1;
  min-height: 72px;
  resize: none;
  padding: var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ads-v2-color-fg);
  background: var(--ads-v2-color-bg);

  &:focus {
    outline: none;
    border-color: var(--ads-v2-color-border-emphasis-plus);
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ads-v2-spaces-3);
`;

const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-2);
`;

const PLACEHOLDER =
  "Describe what this block should do and where its data comes from. For example: " +
  '"Current weather and a 5-day forecast for a city, from the Open-Meteo API, refreshed every 30 minutes."';

interface PromptAreaProps {
  widgetId: string;
  setDragDisabled: (disabled: boolean) => void;
}

/**
 * The prompt of an empty block. The description is only used to generate the block: it is sent once and not
 * saved, and the generated widget becomes the source of truth.
 */
function PromptArea({ setDragDisabled, widgetId }: PromptAreaProps) {
  const dispatch = useDispatch();
  const { error, status } = useSelector((state) =>
    getBlockUIState(state, widgetId),
  );
  const [description, setDescription] = useState("");
  const isBusy = status === "generating" || status === "applying";

  const submit = () => {
    if (!description.trim() || isBusy) return;

    dispatch(generateBlock({ widgetId, description: description.trim() }));
  };

  return (
    <Container
      {...stopCanvasEvents}
      onMouseEnter={() => setDragDisabled(true)}
      onMouseLeave={() => setDragDisabled(false)}
    >
      <Title>
        <Icon name="magic-line" size="md" />
        <Text kind="heading-xs">Create a widget from a description</Text>
      </Title>
      <PromptInput
        aria-label="Block description"
        data-testid="t--block-prompt"
        disabled={isBusy}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();

          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            submit();
          }
        }}
        placeholder={PLACEHOLDER}
        value={description}
      />
      {status === "error" && error && <Callout kind="error">{error}</Callout>}
      <Footer>
        {isBusy ? (
          <Progress>
            <Spinner size="sm" />
            <Text kind="body-s">
              {status === "generating"
                ? "Generating the widget…"
                : "Setting up the controller and queries…"}
            </Text>
          </Progress>
        ) : (
          <Text color="var(--ads-v2-color-fg-muted)" kind="body-s">
            Ctrl+Enter to create
          </Text>
        )}
        <Button
          data-testid="t--block-create"
          isDisabled={!description.trim() || isBusy}
          isLoading={isBusy}
          onClick={submit}
          size="sm"
          startIcon="sparkling-filled"
        >
          Create widget
        </Button>
      </Footer>
    </Container>
  );
}

export default PromptArea;
