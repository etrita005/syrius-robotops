import { useState, useEffect } from "react";
import {
  Modal,
  Tabs,
  Tab,
  TabPanels,
  TabPanel,
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
import { useThemeColor } from "../../hooks/useThemeColors.js";

interface RobotDetailModalProps {
  open: boolean;
  robot: RobotDefinition | null;
  onClose: () => void;
  onSave: (patch: Partial<Pick<RobotDefinition, "alias" | "address" | "port">>) => Promise<void>;
}

export default function RobotDetailModal({ open, robot, onClose, onSave }: RobotDetailModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [editedAlias, setEditedAlias] = useState("");
  const [editedAddress, setEditedAddress] = useState("");
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [addressInvalidText, setAddressInvalidText] = useState("");
  const [saving, setSaving] = useState(false);

  const textSecondary = useThemeColor("#525252", "#c6c6c6");

  useEffect(() => {
    if (open && robot) {
      setEditedAlias(robot.alias);
      setEditedAddress(formatAddressDisplay(robot.address, robot.port));
      setActiveTab(0);
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
    { key: "firmwareVersion", header: "Firmware" },
    { key: "hardwareVersion", header: "Hardware" },
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

  const renderKeyValueList = (obj: Record<string, string>) => {
    return Object.entries(obj).map(([k, v]) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
        <span style={{ color: textSecondary }}>{k}</span>
        <span>{v}</span>
      </div>
    ));
  };

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={`Robot Details — ${robot.alias}`}
      onRequestClose={onClose}
      passiveModal
    >
      <div className="modal-content-enter">
        <Tabs
        selectedIndex={activeTab}
        onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
      >
        <Tab>Basic Info</Tab>
        <Tab>Other Info</Tab>
        <Tab>Software Versions</Tab>
        <Tab>Hardware Versions</Tab>
        <TabPanels>
          <TabPanel>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
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
          </TabPanel>
           <TabPanel>
             <div style={{ marginTop: "1rem" }}>
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
           </TabPanel>
           <TabPanel>
             <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
                <section>
                  <h5 style={{ marginBottom: "0.5rem" }}>OS Versions</h5>
                  <TextInput id="sw-megacosmos" labelText="megacosmOS" value={formatInfoValue(robot.megaCosmOSVersion)} readOnly />
                  <TextInput id="sw-movebase" labelText="Movebase" value={formatInfoValue(robot.movebaseVersion)} readOnly />
                  <TextInput id="sw-ggr" labelText="GGR" value={formatInfoValue(robot.ggrVersion)} readOnly />
                </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>MCU Firmware</h5>
                 {renderKeyValueList(robot.mcuFirmwareVersions)}
               </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>Actuator Firmware</h5>
                 {renderKeyValueList(robot.actuatorFirmwareVersions)}
               </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>Sensor Firmware</h5>
                 {renderKeyValueList(robot.sensorFirmwareVersions)}
               </section>
             </div>
           </TabPanel>
           <TabPanel>
             <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
                <section>
                  <h5 style={{ marginBottom: "0.5rem" }}>Main Control</h5>
                  <TextInput id="hw-maincontrol" labelText="Main Control Hardware Version" value={formatInfoValue(robot.mainControlHardwareVersion)} readOnly />
                </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>MCU Hardware</h5>
                 {renderKeyValueList(robot.mcuHardwareVersions)}
               </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>Actuator Hardware</h5>
                 {renderKeyValueList(robot.actuatorHardwareVersions)}
               </section>
               <section>
                 <h5 style={{ marginBottom: "0.5rem" }}>Sensor Hardware</h5>
                 {renderKeyValueList(robot.sensorHardwareVersions)}
               </section>
             </div>
           </TabPanel>
         </TabPanels>
       </Tabs>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
        <Button kind="primary" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      </div>
    </Modal>
  );
}
