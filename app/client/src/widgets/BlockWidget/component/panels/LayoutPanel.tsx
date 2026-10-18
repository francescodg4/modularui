import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Input, Switch } from "@appsmith/ads";
import { updateBlockLayout } from "actions/blockActions";
import type { BlockWidgetProps } from "../../widget";
import { FieldGrid, Muted, PanelBody, SpacedRow } from "./styles";

interface LayoutPanelProps {
  widget: BlockWidgetProps;
}

interface LayoutDraft {
  title: string;
  showTitle: boolean;
  leftColumn: string;
  topRow: string;
  columns: string;
  rows: string;
}

function toDraft(widget: BlockWidgetProps): LayoutDraft {
  return {
    title: widget.title || "",
    showTitle: widget.showTitle !== false,
    leftColumn: String(widget.leftColumn),
    topRow: String(widget.topRow),
    columns: String(widget.rightColumn - widget.leftColumn),
    rows: String(widget.bottomRow - widget.topRow),
  };
}

/**
 * Size, position and title visibility. Sizes are in grid units: the canvas is 64 columns wide and a row is 10px.
 * Styling and theming stay in the property pane's Style tab.
 */
function LayoutPanel({ widget }: LayoutPanelProps) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState<LayoutDraft>(() => toDraft(widget));

  useEffect(() => {
    setDraft(toDraft(widget));
  }, [
    widget.title,
    widget.showTitle,
    widget.leftColumn,
    widget.rightColumn,
    widget.topRow,
    widget.bottomRow,
  ]);

  const update = (patch: Partial<LayoutDraft>) =>
    setDraft({ ...draft, ...patch });

  const apply = () => {
    dispatch(
      updateBlockLayout({
        widgetId: widget.widgetId,
        layout: {
          title: draft.title,
          showTitle: draft.showTitle,
          leftColumn: Number(draft.leftColumn),
          topRow: Number(draft.topRow),
          columns: Number(draft.columns),
          rows: Number(draft.rows),
        },
      }),
    );
  };

  return (
    <PanelBody>
      <FieldGrid>
        <Input
          label="Title"
          onChange={(title) => update({ title })}
          size="md"
          value={draft.title}
        />
        <div style={{ alignSelf: "flex-end" }}>
          <Switch
            isSelected={draft.showTitle}
            onChange={(showTitle) => update({ showTitle })}
          >
            Show title
          </Switch>
        </div>
        <Input
          label="Width (columns)"
          onChange={(columns) => update({ columns })}
          size="md"
          type="number"
          value={draft.columns}
        />
        <Input
          label="Height (rows)"
          onChange={(rows) => update({ rows })}
          size="md"
          type="number"
          value={draft.rows}
        />
        <Input
          label="Left (column)"
          onChange={(leftColumn) => update({ leftColumn })}
          size="md"
          type="number"
          value={draft.leftColumn}
        />
        <Input
          label="Top (row)"
          onChange={(topRow) => update({ topRow })}
          size="md"
          type="number"
          value={draft.topRow}
        />
      </FieldGrid>
      <SpacedRow>
        <Muted>
          The canvas is 64 columns wide. A change that overlaps another widget
          is refused; you can also drag and resize the block on the canvas.
        </Muted>
        <Button onClick={apply} size="md">
          Apply
        </Button>
      </SpacedRow>
    </PanelBody>
  );
}

export default LayoutPanel;
