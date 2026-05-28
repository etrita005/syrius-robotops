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
import { RobotDefinition } from "../../types/robot.js";

interface RobotDetailModalProps {
  open: boolean;
  robot: RobotDefinition | null;
  onClose: () => void;
  onSave: (patch: Partial<Pick<RobotDefinition, "alias" | "address">>) => Promise<void>;
}

export default function RobotDetailModal({ open, robot, onClose, onSave }: RobotDetailModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [editedAlias, setEditedAlias] = useState("");
  const [editedAddress, setEditedAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && robot) {
      setEditedAlias(robot.alias);
      setEditedAddress(robot.address);
      setActiveTab(0);
    }
  }, [open, robot]);

  if (!robot) return null;

  const hasChanges =
    editedAlias !== robot.alias || editedAddress !== robot.address;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const patch: Partial<Pick<RobotDefinition, "alias" | "address">> = {};
      if (editedAlias !== robot.alias) patch.alias = editedAlias;
      if (editedAddress !== robot.address) patch.address = editedAddress;
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
      <Tag type="green">Online</Tag>
    ) : (
      <Tag type="red">Offline</Tag>
    ),
  }));

  const renderKeyValueList = (obj: Record<string, string>) => {
    return Object.entries(obj).map(([k, v]) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
        <span style={{ color: "#525252" }}>{k}</span>
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
                value={editedAddress}
                onChange={(e) => setEditedAddress(e.target.value)}
              />
              <TextInput id="rd-model" labelText="Model" value={robot.model} readOnly />
              <TextInput id="rd-robotsn" labelText="Robot SN" value={robot.robotSN} readOnly />
              <TextInput id="rd-thingsid" labelText="Things ID" value={robot.thingsId} readOnly />
              <TextInput id="rd-vendorid" labelText="Vendor ID" value={robot.vendorId} readOnly />
              <TextInput id="rd-productid" labelText="Product ID" value={robot.productId} readOnly />
              <TextInput id="rd-mainboardsn" labelText="Mainboard SN" value={robot.mainboardSN} readOnly />
              <TextInput id="rd-mainboardid" labelText="Mainboard ID" value={robot.mainboardId} readOnly />
              <TextInput id="rd-mainsomid" labelText="Main SOM ID" value={robot.mainSOMId} readOnly />
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
                 <TextInput id="sw-megacosmos" labelText="megaCosmOS" value={robot.megaCosmOSVersion} readOnly />
                 <TextInput id="sw-movebase" labelText="Movebase" value={robot.movebaseVersion} readOnly />
                 <TextInput id="sw-ggr" labelText="GGR" value={robot.ggrVersion} readOnly />
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
                 <TextInput id="hw-maincontrol" labelText="Main Control Hardware Version" value={robot.mainControlHardwareVersion} readOnly />
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
    </Modal>
  );
}
