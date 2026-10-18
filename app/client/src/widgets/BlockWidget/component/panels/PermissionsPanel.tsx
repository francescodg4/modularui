import React from "react";
import { useDispatch } from "react-redux";
import { Button, Callout, Tag, Text } from "@appsmith/ads";
import { setBlockPermissionStatus } from "actions/blockActions";
import {
  hasUnapprovedPermissions,
  type BlockPermissionStatus,
} from "../../definition";
import type { BlockWidgetProps } from "../../widget";
import {
  List,
  ListItem,
  ListItemText,
  Muted,
  PanelBody,
  Row,
  SpacedRow,
} from "./styles";

interface PermissionsPanelProps {
  widget: BlockWidgetProps;
}

const STATUS_LABELS: Record<BlockPermissionStatus, string> = {
  pending: "Needs approval",
  approved: "Approved",
  revoked: "Revoked",
};

/**
 * Review the capabilities the block declares. A block runs only when every declared permission is approved. What a
 * permission allows is not enforced yet (the current model is permissive); approval records the user's consent.
 */
function PermissionsPanel({ widget }: PermissionsPanelProps) {
  const dispatch = useDispatch();
  const permissions = widget.blockPermissions || [];

  const setStatus = (status: BlockPermissionStatus, permissionId?: string) =>
    dispatch(
      setBlockPermissionStatus({
        widgetId: widget.widgetId,
        permissionId,
        status,
      }),
    );

  if (permissions.length === 0) {
    return (
      <PanelBody>
        <Text kind="body-m">This block declares no permissions.</Text>
      </PanelBody>
    );
  }

  return (
    <PanelBody>
      <Callout kind="info">
        Approval is required before the block runs. Enforcement is permissive
        for now: approving records your consent, and revoking a permission
        pauses the block, but the script is not sandboxed.
      </Callout>
      <List>
        {permissions.map((permission) => (
          <ListItem key={permission.id}>
            <ListItemText>
              <Text kind="body-m">{permission.id}</Text>
              {permission.description && (
                <Muted>{permission.description}</Muted>
              )}
            </ListItemText>
            <Row>
              <Tag
                isClosable={false}
                kind={permission.status === "approved" ? "info" : "neutral"}
              >
                {STATUS_LABELS[permission.status]}
              </Tag>
              {permission.status === "approved" ? (
                <Button
                  kind="secondary"
                  onClick={() => setStatus("revoked", permission.id)}
                  size="sm"
                >
                  Revoke
                </Button>
              ) : (
                <Button
                  onClick={() => setStatus("approved", permission.id)}
                  size="sm"
                >
                  {permission.status === "revoked" ? "Re-approve" : "Approve"}
                </Button>
              )}
            </Row>
          </ListItem>
        ))}
      </List>
      {hasUnapprovedPermissions(permissions) && (
        <SpacedRow>
          <Muted>The block is paused until every permission is approved.</Muted>
          <Button onClick={() => setStatus("approved")} size="md">
            Approve all
          </Button>
        </SpacedRow>
      )}
    </PanelBody>
  );
}

export default PermissionsPanel;
