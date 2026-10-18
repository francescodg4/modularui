import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Input, Text } from "@appsmith/ads";
import {
  deleteBlockSnapshot,
  restoreBlockSnapshot,
  takeBlockSnapshot,
} from "actions/blockActions";
import { MAX_BLOCK_SNAPSHOTS } from "../../constants";
import type { BlockWidgetProps } from "../../widget";
import ConfirmModal from "../ConfirmModal";
import { List, ListItem, ListItemText, Muted, PanelBody, Row } from "./styles";

interface SnapshotsPanelProps {
  widget: BlockWidgetProps;
}

function formatDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Snapshots freeze the block's view, settings, controller and queries. They hold no data and no credentials, so
 * restoring one never touches data.
 */
function SnapshotsPanel({ widget }: SnapshotsPanelProps) {
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const snapshots = [...(widget.blockSnapshots || [])].reverse();

  const take = () => {
    dispatch(
      takeBlockSnapshot({
        widgetId: widget.widgetId,
        name: name.trim() || `Snapshot ${new Date().toLocaleString()}`,
      }),
    );
    setName("");
  };

  const restoring = snapshots.find((snapshot) => snapshot.id === restoreId);

  return (
    <PanelBody>
      <Row>
        <div style={{ flex: 1 }}>
          <Input
            label="Snapshot name"
            onChange={setName}
            placeholder="Working version"
            size="md"
            value={name}
          />
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <Button
            data-testid="t--block-take-snapshot"
            onClick={take}
            size="md"
            startIcon="timer-line"
          >
            Take snapshot
          </Button>
        </div>
      </Row>
      <Muted>
        Up to {MAX_BLOCK_SNAPSHOTS} snapshots are kept; the oldest are removed
        first. The agent takes one automatically before each change.
      </Muted>
      {snapshots.length === 0 ? (
        <Text kind="body-m">No snapshots yet.</Text>
      ) : (
        <List>
          {snapshots.map((snapshot) => (
            <ListItem key={snapshot.id}>
              <ListItemText>
                <Text kind="body-m">{snapshot.name}</Text>
                <Muted>{formatDate(snapshot.createdAt)}</Muted>
              </ListItemText>
              <Row>
                <Button
                  kind="secondary"
                  onClick={() => setRestoreId(snapshot.id)}
                  size="sm"
                >
                  Restore
                </Button>
                <Button
                  aria-label={`Delete snapshot ${snapshot.name}`}
                  isIconButton
                  kind="tertiary"
                  onClick={() =>
                    dispatch(
                      deleteBlockSnapshot({
                        widgetId: widget.widgetId,
                        snapshotId: snapshot.id,
                      }),
                    )
                  }
                  size="sm"
                  startIcon="delete-bin-line"
                />
              </Row>
            </ListItem>
          ))}
        </List>
      )}
      {restoring && (
        <ConfirmModal
          confirmLabel="Restore"
          message={`The block's view, settings, controller and queries are replaced with "${restoring.name}". The current version is saved as a snapshot first.`}
          onCancel={() => setRestoreId(null)}
          onConfirm={() => {
            dispatch(
              restoreBlockSnapshot({
                widgetId: widget.widgetId,
                snapshotId: restoring.id,
              }),
            );
            setRestoreId(null);
          }}
          title="Restore snapshot"
        />
      )}
    </PanelBody>
  );
}

export default SnapshotsPanel;
