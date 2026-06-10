import { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
} from "@carbon/react";
import { CreateRobotInput, parseAddressInput } from "../../types/robot.js";

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
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [addressInvalidText, setAddressInvalidText] = useState("");

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
    setAddressInvalid(false);
    setAddressInvalidText("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validateAddress = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAddressInvalid(true);
      setAddressInvalidText("Address is required.");
      return false;
    }
    const parsed = parseAddressInput(trimmed);
    if (!parsed) {
      setAddressInvalid(true);
      setAddressInvalidText("Format: <IP>:<port> or <mDNS>:<port> (port defaults to 22).");
      return false;
    }
    setAddressInvalid(false);
    setAddressInvalidText("");
    return true;
  };

  const handleAdd = async () => {
    const trimmed = address.trim();
    if (!validateAddress(address)) return;
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
        submitting || !address.trim() || addressInvalid
      }
    >
      {error && (
        <div className="notif-anim">
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            onCloseButtonClick={() => setError(null)}
            style={{ marginBottom: "1rem" }}
          />
        </div>
      )}
      <div className="modal-content-enter" style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
        <TextInput
          id="robot-address"
          labelText="Address *"
          placeholder="IP:port or mDNS:port (e.g. 192.168.1.101:22)"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            if (addressInvalid) validateAddress(e.target.value);
          }}
          invalid={addressInvalid}
          invalidText={addressInvalidText}
          onBlur={() => { if (address.trim()) validateAddress(address); }}
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
