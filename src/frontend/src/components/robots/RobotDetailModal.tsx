import { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  Button,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
} from "@carbon/react";
import { RobotDefinition, formatAddressDisplay, parseAddressInput, formatInfoValue } from "../../types/robot.js";

interface RobotDetailModalProps {
  open: boolean;
  robot: RobotDefinition | null;
  onClose: () => void;
  onSave: (patch: Partial<Pick<RobotDefinition, "alias" | "address" | "port">>) => Promise<void>;
}

const sectionCardStyle: React.CSSProperties = {
  marginBottom: "1rem",
  border: "1px solid var(--cds-border-subtle, #e0e0e0)",
  borderRadius: "4px",
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.625rem 1rem",
  backgroundColor: "var(--cds-layer-02, #f4f4f4)",
  borderBottom: "1px solid var(--cds-border-subtle, #e0e0e0)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--cds-text-primary, #161616)",
  margin: 0,
};

const sectionBodyStyle: React.CSSProperties = {
  padding: "1rem",
};

const fieldsGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

export default function RobotDetailModal({ open, robot, onClose, onSave }: RobotDetailModalProps) {
  const [editedAlias, setEditedAlias] = useState("");
  const [editedAddress, setEditedAddress] = useState("");
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [addressInvalidText, setAddressInvalidText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && robot) {
      setEditedAlias(robot.alias);
      setEditedAddress(formatAddressDisplay(robot.address, robot.port));
      setAddressInvalid(false);
      setAddressInvalidText("");
    }
  }, [open, robot]);

  if (!robot) return null;

  const hasChanges =
    editedAlias !== robot.alias ||
    editedAddress !== formatAddressDisplay(robot.address, robot.port);

  const handleSave = async () => {
    if (!hasChanges) return;

    if (editedAddress.trim()) {
      const parsed = parseAddressInput(editedAddress);
      if (!parsed) {
        setAddressInvalid(true);
        setAddressInvalidText("Format: <IP>:<port> or <mDNS>:<port> (port defaults to 22).");
        return;
      }
    }

    setSaving(true);
    try {
      const patch: Partial<Pick<RobotDefinition, "alias" | "address" | "port">> = {};
      if (editedAlias !== robot.alias) patch.alias = editedAlias;
      if (editedAddress !== formatAddressDisplay(robot.address, robot.port)) {
        const parsed = parseAddressInput(editedAddress);
        if (parsed) {
          patch.address = parsed.host;
          patch.port = parsed.port;
        }
      }
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  };

  const deviceHeaders = [
    { key: "name", header: "Name" },
    { key: "firmwareVersion", header: "Firmware version" },
    { key: "hardwareVersion", header: "Hardware version" },
    { key: "serialNumber", header: "SN" },
    { key: "hardwareId", header: "Hardware ID" },
    { key: "online", header: "Status" },
  ];

  const deviceRows = robot.hardwareDeviceTree.map((d) => ({
    id: d.hardwareId,
    name: d.name,
    firmwareVersion: d.firmwareVersion,
    hardwareVersion: d.hardwareVersion,
    serialNumber: d.serialNumber,
    hardwareId: d.hardwareId,
    online: d.online ? (
      <span style={{ display: "flex", alignItems: "center" }}>
        <span className="status-pulse-dot" />
        <Tag type="green">Online</Tag>
      </span>
    ) : (
      <Tag type="red">Offline</Tag>
    ),
  }));

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={`Robot Details — ${robot.alias}`}
      onRequestClose={onClose}
      passiveModal
    >
      <div className="modal-content-enter" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "0.5rem" }}>
        {/* Section 1: Basic Info */}
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h4 style={sectionTitleStyle}>Basic Info</h4>
          </div>
          <div style={{ ...sectionBodyStyle, ...fieldsGroupStyle }}>
            <TextInput
              id="rd-alias"
              labelText="Alias"
              value={editedAlias}
              onChange={(e) => setEditedAlias(e.target.value)}
            />
            <TextInput
              id="rd-address"
              labelText="Address"
              placeholder="IP:port or mDNS:port (e.g. 192.168.1.101:22)"
              value={editedAddress}
              onChange={(e) => {
                setEditedAddress(e.target.value);
                if (addressInvalid) {
                  const parsed = parseAddressInput(e.target.value);
                  if (parsed) {
                    setAddressInvalid(false);
                    setAddressInvalidText("");
                  }
                }
              }}
              invalid={addressInvalid}
              invalidText={addressInvalidText}
              onBlur={() => {
                if (editedAddress.trim()) {
                  const parsed = parseAddressInput(editedAddress);
                  if (!parsed) {
                    setAddressInvalid(true);
                    setAddressInvalidText("Format: <IP>:<port> or <mDNS>:<port> (port defaults to 22).");
                  } else {
                    setAddressInvalid(false);
                    setAddressInvalidText("");
                  }
                }
              }}
            />
            <TextInput id="rd-model" labelText="Model" value={formatInfoValue(robot.model)} readOnly />
            <TextInput id="rd-robotsn" labelText="Robot SN" value={formatInfoValue(robot.robotSN)} readOnly />
            <TextInput id="rd-thingsid" labelText="Things ID" value={formatInfoValue(robot.thingsId)} readOnly />
            <TextInput id="rd-vendorid" labelText="Vendor ID" value={formatInfoValue(robot.vendorId)} readOnly />
            <TextInput id="rd-productid" labelText="Product ID" value={formatInfoValue(robot.productId)} readOnly />
            <TextInput id="rd-mainboardsn" labelText="Mainboard SN" value={formatInfoValue(robot.mainboardSN)} readOnly />
            <TextInput id="rd-mainboardid" labelText="Mainboard ID" value={formatInfoValue(robot.mainboardId)} readOnly />
            <TextInput id="rd-mainsomsn" labelText="Main SOM SN" value={formatInfoValue(robot.mainSOMSN)} readOnly />
          </div>
        </section>

        {/* Section 2: Software Versions */}
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h4 style={sectionTitleStyle}>Software Versions</h4>
          </div>
          <div style={{ ...sectionBodyStyle, ...fieldsGroupStyle }}>
            <TextInput id="sw-megacosmos" labelText="megacosmOS" value={formatInfoValue(robot.megaCosmOSVersion)} readOnly />
            <TextInput id="sw-movebase" labelText="Movebase" value={formatInfoValue(robot.movebaseVersion)} readOnly />
            <TextInput id="sw-ggr" labelText="GGR" value={formatInfoValue(robot.ggrVersion)} readOnly />
          </div>
        </section>

        {/* Section 3: Hardware Versions */}
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h4 style={sectionTitleStyle}>Hardware Versions</h4>
            <Button kind="ghost" size="sm" onClick={() => {}}>
              Read
            </Button>
          </div>
          <div style={sectionBodyStyle}>
            <DataTable rows={deviceRows} headers={deviceHeaders}>
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                <Table {...getTableProps()} size="sm">
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => {
                        const { key, ...headerProps } = getHeaderProps({ header: h });
                        return (
                          <TableHeader key={key} {...headerProps}>
                            {h.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => {
                      const { key, ...rowProps } = getRowProps({ row: r });
                      return (
                        <TableRow key={key} {...rowProps}>
                          {r.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </DataTable>
          </div>
        </section>

        {/* Section 4: Other Info */}
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h4 style={sectionTitleStyle}>Other Info</h4>
            <Button kind="ghost" size="sm" onClick={() => {}}>
              Read
            </Button>
          </div>
          <div style={sectionBodyStyle}>
            <span style={{ color: "var(--cds-text-secondary, #525252)", fontSize: "0.875rem" }}>No data</span>
          </div>
        </section>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
        <Button kind="primary" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
