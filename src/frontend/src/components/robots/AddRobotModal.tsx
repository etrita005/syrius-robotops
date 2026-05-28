import { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
} from "@carbon/react";
import { CreateRobotInput } from "../../types/robot.js";

interface AddRobotModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: CreateRobotInput) => Promise<void>;
}

let robotCounter = 0;
const generateDefaultAlias = () => {
  robotCounter++;
  return `Robot-${robotCounter}`;
};

export default function AddRobotModal({ open, onClose, onAdd }: AddRobotModalProps) {
  const [address, setAddress] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAlias(generateDefaultAlias());
    }
  }, [open]);

  const reset = () => {
    setAddress("");
    setAlias("");
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = async () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({ address: trimmed, alias: alias.trim() || undefined });
      handleClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="Add Robot"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestClose={handleClose}
      onRequestSubmit={handleAdd}
      primaryButtonDisabled={
        submitting || !address.trim()
      }
    >
      {error && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
        <TextInput
          id="robot-address"
          labelText="Address *"
          placeholder="IP address or mDNS hostname"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <TextInput
          id="robot-alias"
          labelText="Alias"
          placeholder="Robot alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>
    </Modal>
  );
}
