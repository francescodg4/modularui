import React from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Text,
} from "@appsmith/ads";
import { stopCanvasEvents } from "./utils";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal(props: ConfirmModalProps) {
  return (
    <Modal
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onCancel();
      }}
      open
    >
      <ModalContent {...stopCanvasEvents} style={{ width: "440px" }}>
        <ModalHeader>{props.title}</ModalHeader>
        <ModalBody>
          <Text kind="body-m">{props.message}</Text>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={props.onCancel} size="md">
            Cancel
          </Button>
          <Button kind="error" onClick={props.onConfirm} size="md">
            {props.confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default ConfirmModal;
