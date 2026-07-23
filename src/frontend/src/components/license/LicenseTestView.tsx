import React, { useState, useCallback, useEffect } from "react";
import {
  TextInput,
  NumberInput,
  Dropdown,
  DatePicker,
  DatePickerInput,
  Button,
  Tile,
  InlineNotification,
  Loading,
  Theme,
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from "@carbon/react";
import { Light, Asleep } from "@carbon/react/icons";
import { ToastProvider, useToast } from "../../hooks/useToast.js";
import {
  connect as apiConnect,
  disconnect as apiDisconnect,
  getSession,
  readConfig,
  applyConfig,
  restartApp,
} from "../../api/licenseTestApi.js";
import type { LicenseConfig, ConnectionStatus, SessionResponse, ReadResponse } from "../../types/licenseTest.js";
import {
  VALID_LICENSE_TYPES,
  LICENSE_KEY_LICENSES,
  LICENSE_KEY_TYPE,
  LICENSE_KEY_AUTH_START,
} from "../../types/licenseTest.js";

type ThemeMode = "white" | "g100";

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("robotops_theme");
    if (stored === "white" || stored === "g100") return stored;
  } catch {}
  return "white";
}

function storeTheme(theme: ThemeMode) {
  try {
    localStorage.setItem("robotops_theme", theme);
  } catch {}
}

function formatDateTimeForDisplay(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function isValidIp(ip: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

function LicenseTestContent() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [robotIp, setRobotIp] = useState("");
  const [robotPort, setRobotPort] = useState(22);
  const [config, setConfig] = useState<LicenseConfig>({
    [LICENSE_KEY_LICENSES]: "",
    [LICENSE_KEY_TYPE]: "None",
    [LICENSE_KEY_AUTH_START]: "",
  });
  const [lastOutput, setLastOutput] = useState<string | null>(null);
  const [ipError, setIpError] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [licensesError, setLicensesError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const isConnected = status === "connected";
  const isBusy = status === "connecting" || status === "busy";
  const isDisabled = !isConnected || isBusy;

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session: SessionResponse) => {
        if (cancelled) return;
        if (session.connected && session.robotIp && session.robotPort) {
          setRobotIp(session.robotIp);
          setRobotPort(session.robotPort);
          setStatus("connected");
          return readConfig();
        }
      })
      .then((result: ReadResponse | void) => {
        if (cancelled) return;
        if (result?.config) {
          setConfig(result.config);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleConnect = useCallback(async () => {
    setIpError(null);
    setPortError(null);
    setLastOutput(null);

    if (!robotIp.trim()) {
      setIpError("IP address is required.");
      return;
    }
    if (!isValidIp(robotIp.trim())) {
      setIpError("Invalid IP address format.");
      return;
    }
    if (!Number.isInteger(robotPort) || robotPort < 1 || robotPort > 65535) {
      setPortError("Port must be between 1 and 65535.");
      return;
    }

    setStatus("connecting");
    try {
      const result = await apiConnect(robotIp.trim(), robotPort);
      setConfig(result.config);
      setStatus("connected");
      showToast("success", "Connected", `Connected to ${robotIp}:${robotPort}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setStatus("disconnected");
      setLastOutput(msg);
      showToast("error", "Connection failed", msg);
    }
  }, [robotIp, robotPort, showToast]);

  const handleDisconnect = useCallback(async () => {
    try {
      await apiDisconnect();
      setStatus("disconnected");
      setConfig({ [LICENSE_KEY_LICENSES]: "", [LICENSE_KEY_TYPE]: "None", [LICENSE_KEY_AUTH_START]: "" });
      setLastOutput(null);
      showToast("info", "Disconnected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      showToast("error", "Disconnect failed", msg);
    }
  }, [showToast]);

  const handleRead = useCallback(async () => {
    setStatus("busy");
    try {
      const result = await readConfig();
      setConfig(result.config);
      setStatus("connected");
      showToast("success", "Config read");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Read failed";
      setStatus("connected");
      setLastOutput(msg);
      showToast("error", "Read failed", msg);
    }
  }, [showToast]);

  const handleApply = useCallback(async () => {
    setLicensesError(null);
    setDateError(null);

    const licensesNum = Number(config[LICENSE_KEY_LICENSES]);
    if (!Number.isInteger(licensesNum) || licensesNum < 0) {
      setLicensesError("License count must be a non-negative integer.");
      return;
    }
    if (!config[LICENSE_KEY_AUTH_START] || config[LICENSE_KEY_AUTH_START].trim() === "") {
      setDateError("Authorization start time is required.");
      return;
    }

    setStatus("busy");
    try {
      await applyConfig(config);
      const result = await readConfig();
      setConfig(result.config);
      setStatus("connected");
      showToast("success", "Applied", "License config applied successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Apply failed";
      setStatus("connected");
      setLastOutput(msg);
      showToast("error", "Apply failed", msg);
    }
  }, [config, showToast]);

  const handleRestart = useCallback(async () => {
    setStatus("busy");
    try {
      await restartApp();
      showToast("success", "App restarted", "Android application has been restarted.");
      await new Promise((r) => setTimeout(r, 2000));
      const result = await readConfig();
      setConfig(result.config);
      showToast("success", "Config refreshed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restart failed";
      setLastOutput(msg);
      showToast("error", "Restart failed", msg);
    } finally {
      setStatus("connected");
    }
  }, [showToast]);

  const handleDateChange = useCallback(
    (dates: Date[]) => {
      setDateError(null);
      if (dates.length > 0) {
        const d = dates[0];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        if (config[LICENSE_KEY_AUTH_START]) {
          const existing = config[LICENSE_KEY_AUTH_START];
          const timeMatch = existing.match(/T(\d{2}:\d{2}:\d{2})/);
          const timeStr = timeMatch ? timeMatch[1] : "00:00:00";
          setConfig((prev: LicenseConfig) => ({
            ...prev,
            [LICENSE_KEY_AUTH_START]: `${year}-${month}-${day}T${timeStr}Z`,
          }));
        } else {
          setConfig((prev: LicenseConfig) => ({
            ...prev,
            [LICENSE_KEY_AUTH_START]: `${year}-${month}-${day}T00:00:00Z`,
          }));
        }
      }
    },
    [config]
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateError(null);
      const timeValue = e.target.value;
      const dateStr = config[LICENSE_KEY_AUTH_START]
        ? config[LICENSE_KEY_AUTH_START].split("T")[0]
        : new Date().toISOString().split("T")[0];
      setConfig((prev: LicenseConfig) => ({
        ...prev,
        [LICENSE_KEY_AUTH_START]: `${dateStr}T${timeValue}:00Z`,
      }));
    },
    [config]
  );

  const currentDateTimeValue = config[LICENSE_KEY_AUTH_START] || "";
  const currentDate = currentDateTimeValue ? currentDateTimeValue.split("T")[0] : "";
  const currentTime = currentDateTimeValue
    ? currentDateTimeValue.split("T")[1]?.substring(0, 5) || ""
    : "";

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem" }}>
      <Tile style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.25rem", fontWeight: 600 }}>Robot Connection</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          <TextInput
            id="robot-ip"
            labelText="Robot IP"
            placeholder="192.168.55.1"
            value={robotIp}
            onChange={(e) => { setRobotIp(e.target.value); setIpError(null); }}
            invalid={!!ipError}
            invalidText={ipError ?? undefined}
            disabled={isConnected || isBusy}
            style={{ flex: "2 1 200px" }}
          />
          <NumberInput
            id="robot-port"
            label="Port"
            value={robotPort}
            min={1}
            max={65535}
            onChange={(_e, { value }) => { setRobotPort(Number(value ?? 22)); setPortError(null); }}
            invalid={!!portError}
            invalidText={portError ?? undefined}
            disabled={isConnected || isBusy}
            style={{ flex: "1 1 100px" }}
          />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", paddingTop: "1.5rem" }}>
            {!isConnected ? (
              <Button onClick={handleConnect} disabled={isBusy}>
                {status === "connecting" ? (
                  <>
                    <Loading small withOverlay={false} /> Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            ) : (
              <Button kind="danger" onClick={handleDisconnect} disabled={isBusy}>
                Disconnect
              </Button>
            )}
          </div>
        </div>
        <div style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
          {status === "disconnected" && (
            <span style={{ color: "#8d8d8d" }}>Not connected</span>
          )}
          {status === "connecting" && (
            <span style={{ color: "#f1c21b" }}>Connecting to {robotIp}:{robotPort}...</span>
          )}
          {status === "connected" && (
            <span style={{ color: "#24a148" }}>Connected to {robotIp}:{robotPort}</span>
          )}
          {status === "busy" && (
            <span style={{ color: "#0f62fe" }}>
              <Loading small withOverlay={false} /> Processing...
            </span>
          )}
        </div>
      </Tile>

      <Tile>
        <h2 style={{ marginTop: 0, fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
          License Configuration
        </h2>

        <NumberInput
          id="license-count"
          label="Clear-Janitor Licenses Pool Quota"
          value={config[LICENSE_KEY_LICENSES] ? Number(config[LICENSE_KEY_LICENSES]) : 0}
          min={0}
          onChange={(_e, { value }) => {
            setLicensesError(null);
            setConfig((prev: LicenseConfig) => ({
              ...prev,
              [LICENSE_KEY_LICENSES]: String(value ?? 0),
            }));
          }}
          invalid={!!licensesError}
          invalidText={licensesError ?? undefined}
          disabled={isDisabled}
          style={{ marginBottom: "1rem" }}
        />

        <Dropdown
          id="license-type"
          titleText="Clear-Janitor License Type"
          label="Select license type"
          items={VALID_LICENSE_TYPES}
          selectedItem={config[LICENSE_KEY_TYPE]}
          onChange={({ selectedItem }) => {
            setConfig((prev: LicenseConfig) => ({
              ...prev,
              [LICENSE_KEY_TYPE]: (selectedItem as LicenseConfig[typeof LICENSE_KEY_TYPE]) ?? "None",
            }));
          }}
          disabled={isDisabled}
          style={{ marginBottom: "1rem" }}
        />

        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 400, color: "#525252", marginBottom: "0.5rem" }}>
            Authorization Start Time
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="Y-m-d"
              value={currentDate ? [currentDate] : undefined}
              onChange={(dates) => handleDateChange(dates as Date[])}
            >
              <DatePickerInput
                id="auth-date"
                labelText="Date"
                placeholder="yyyy-mm-dd"
                disabled={isDisabled}
                invalid={!!dateError}
                invalidText={dateError ?? undefined}
              />
            </DatePicker>
            <input
              type="time"
              value={currentTime}
              onChange={handleTimeChange}
              disabled={isDisabled}
              style={{
                height: "40px",
                padding: "0 0.75rem",
                border: dateError ? "2px solid #da1e28" : "1px solid #8d8d8d",
                background: isDisabled ? "#f4f4f4" : "#ffffff",
                fontSize: "0.875rem",
                color: isDisabled ? "#8d8d8d" : "#161616",
              }}
            />
          </div>
          {currentDateTimeValue && (
            <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.25rem" }}>
              ISO 8601: {currentDateTimeValue}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <Button kind="secondary" onClick={handleRead} disabled={isDisabled}>
            {status === "busy" ? <Loading small withOverlay={false} /> : "Read License Config"}
          </Button>
          <Button onClick={handleApply} disabled={isDisabled}>
            {status === "busy" ? <Loading small withOverlay={false} /> : "Apply License Config"}
          </Button>
          {/* <Button kind="danger" onClick={handleRestart} disabled={isDisabled}>
            {status === "busy" ? <Loading small withOverlay={false} /> : "Restart App"}
          </Button> */}
        </div>
      </Tile>

      {lastOutput && (
        <Tile style={{ marginTop: "1.5rem" }}>
          <h3 style={{ marginTop: 0, fontSize: "0.875rem", fontWeight: 600 }}>Last Command Output</h3>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "0.75rem",
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "300px",
              overflow: "auto",
              margin: 0,
            }}
          >
            {lastOutput}
          </pre>
        </Tile>
      )}
    </div>
  );
}

export default function LicenseTestView() {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev: ThemeMode) => {
      const next = prev === "white" ? "g100" : "white";
      storeTheme(next);
      return next;
    });
  }, []);

  return (
    <ToastProvider>
      <Theme theme={theme}>
        <style>{`
          html, body, #root, #root > .cds--white, #root > .cds--g100 {
            height: 100%;
            margin: 0;
          }
          #root > .cds--white, #root > .cds--g100 {
            display: flex;
            flex-direction: column;
          }
          #main-content {
            flex: 1;
            min-height: 0;
            overflow: auto;
          }
        `}</style>
        <Header aria-label="RobotOps Studio - License Test">
          <HeaderName prefix="RobotOps">License Test</HeaderName>
          <HeaderGlobalBar>
            <HeaderGlobalAction
              aria-label={theme === "white" ? "Switch to dark mode" : "Switch to light mode"}
              onClick={toggleTheme}
            >
              {theme === "white" ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
        <div id="main-content">
          <LicenseTestContent />
        </div>
      </Theme>
    </ToastProvider>
  );
}
