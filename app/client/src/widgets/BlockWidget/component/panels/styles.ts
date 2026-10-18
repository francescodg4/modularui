import styled from "styled-components";

export const PanelBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-4);
  padding: var(--ads-v2-spaces-4) 0;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-3);
`;

export const SpacedRow = styled(Row)`
  justify-content: space-between;
`;

export const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ads-v2-spaces-4);
`;

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-2);
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const ListItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ads-v2-spaces-3);
  padding: var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
`;

export const ListItemText = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-1);
  min-width: 0;

  span {
    overflow-wrap: anywhere;
  }
`;

export const Muted = styled.span`
  color: var(--ads-v2-color-fg-muted);
  font-size: 12px;
`;

export const CodeArea = styled.textarea`
  width: 100%;
  min-height: 280px;
  resize: vertical;
  padding: var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
  font-family: var(--ads-v2-font-family-code, monospace);
  font-size: 12px;
  line-height: 1.5;
  tab-size: 2;
  white-space: pre;
  color: var(--ads-v2-color-fg);
  background: var(--ads-v2-color-bg-subtle);

  &:focus {
    outline: none;
    border-color: var(--ads-v2-color-border-emphasis-plus);
  }
`;

export const LogList = styled.div`
  max-height: 220px;
  overflow: auto;
  padding: var(--ads-v2-spaces-2) var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
  font-family: var(--ads-v2-font-family-code, monospace);
  font-size: 12px;
  line-height: 1.6;
  background: var(--ads-v2-color-bg-subtle);
`;

export const LogLine = styled.div<{ isError?: boolean }>`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: ${({ isError }) =>
    isError ? "var(--ads-v2-color-fg-error)" : "var(--ads-v2-color-fg)"};
`;

export const NativeSelect = styled.select`
  height: 36px;
  padding: 0 var(--ads-v2-spaces-3);
  border: 1px solid var(--ads-v2-color-border);
  border-radius: var(--ads-v2-border-radius);
  font-family: inherit;
  font-size: 14px;
  color: var(--ads-v2-color-fg);
  background: var(--ads-v2-color-bg);
`;

export const FieldLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: var(--ads-v2-spaces-2);
  font-size: 14px;
  color: var(--ads-v2-color-fg);
`;
