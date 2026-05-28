import { useState } from "react";
import {
  Modal,
  Tabs,
  Tab,
  TabPanels,
  TabPanel,
  TextInput,
  TextArea,
  ButtonSet,
  Button,
  InlineNotification,
} from "@carbon/react";
import { CreateRobotInput } from "../../types/robot.js";

interface AddRobotModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: CreateRobotInput) => Promise<void>;
  onBatchAdd: (inputs: CreateRobotInput[]) => Promise<void>;
}

export default function AddRobotModal({ open, onClose, onAdd, onBatchAdd }: AddRobotModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [address, setAddress] = useState("");
  const [alias, setAlias] = useState("");
  const [batchText, setBatchText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAddress("");
    setAlias("");
    setBatchText("");
    setError(null);
    setSubmitting(false);
    setActiveTab(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSingleAdd = async () => {
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

  const handleBatchAdd = async () => {
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const inputs: CreateRobotInput[] = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return { address: parts[0], alias: parts[1] || undefined };
    });

    setError(null);
    setSubmitting(true);
    try {
      await onBatchAdd(inputs);
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
      modalHeading="Add Robots"
      primaryButtonText={activeTab === 0 ? "Add" : "Batch Add"}
      secondaryButtonText="Cancel"
      onRequestClose={handleClose}
      onRequestSubmit={activeTab === 0 ? handleSingleAdd : handleBatchAdd}
      primaryButtonDisabled={
        submitting || (activeTab === 0 ? !address.trim() : !batchText.trim())
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
      <Tabs
        selectedIndex={activeTab}
        onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
      >
        <Tab>Single</Tab>
        <Tab>Batch</Tab>
        <TabPanels>
          <TabPanel>
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
                placeholder="Optional alias (defaults to address)"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
          </TabPanel>
          <TabPanel>
            <div style={{ marginTop: "1rem" }}>
              <TextArea
                id="robot-batch"
                labelText="Addresses *"
                placeholder="Enter one address per line...&#10;Optional: alias after comma, e.g. 192.168.1.101, AGV-01"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={8}
              />
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Modal>
  );
}
