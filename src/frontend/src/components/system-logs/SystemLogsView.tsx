import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Button,
  Loading,
  Tag,
} from "@carbon/react";
import { Download } from "@carbon/react/icons";
import { useLogFiles } from "../../hooks/useLogFiles.js";
import { useLogModules } from "../../hooks/useLogModules.js";
import { useLogQuery } from "../../hooks/useLogQuery.js";
import { systemLogApi } from "../../api/systemLogApi.js";
import type { LogEntry, LogLevel, LogQueryRequest } from "../../types/systemLog.js";
import { useToast } from "../../hooks/useToast.js";

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "#8d8d8d",
  debug: "#525252",
  info: "#198038",
  warn: "#f1c21b",
  error: "#da1e28",
  fatal: "#8a3ffc",
};

const ALL_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

const QUICK_RANGES: { label: string; value: number }[] = [
  { label: "Last 15 min", value: 15 * 60 * 1000 },
  { label: "Last 30 min", value: 30 * 60 * 1000 },
  { label: "Last 1 hour", value: 60 * 60 * 1000 },
  { label: "Last 6 hours", value: 6 * 60 * 60 * 1000 },
  { label: "Last 24 hours", value: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "Custom", value: -1 },
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function toLocalDatetimeISO(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

export function SystemLogsView() {
  const { files, loading: filesLoading, error: filesError } = useLogFiles();
  const { modules, loading: modulesLoading } = useLogModules();

  const [quickRangeIdx, setQuickRangeIdx] = useState(1);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(["info", "warn", "error"]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);

  const buildQueryRequest = useCallback((): LogQueryRequest => {
    const req: LogQueryRequest = { limit: 500 };
    const range = QUICK_RANGES[quickRangeIdx];
    if (range && range.value > 0) {
      const to = new Date();
      const from = new Date(to.getTime() - range.value);
      req.from = from.toISOString();
      req.to = to.toISOString();
    } else if (customFrom && customTo) {
      req.from = new Date(customFrom).toISOString();
      req.to = new Date(customTo).toISOString();
    } else {
      const to = new Date();
      const from = new Date(to.getTime() - QUICK_RANGES[1].value);
      req.from = from.toISOString();
      req.to = to.toISOString();
    }
    if (selectedLevels.length > 0 && selectedLevels.length < ALL_LEVELS.length) {
      req.levels = selectedLevels;
    }
    if (selectedModules.length > 0) {
      req.modules = selectedModules;
    }
    if (searchQ.trim()) {
      req.q = searchQ.trim();
    }
    return req;
  }, [quickRangeIdx, customFrom, customTo, selectedLevels, selectedModules, searchQ]);

  const queryReq = useMemo(() => buildQueryRequest(), [buildQueryRequest]);
  const { entries, truncated, parseErrorCount, loading: queryLoading, error: queryError, loadNextPage } = useLogQuery(queryReq);
  const { showToast } = useToast();

  useEffect(() => {
    if (filesError) {
      showToast("error", "Failed to load files", filesError, 0);
    }
  }, [filesError, showToast]);

  useEffect(() => {
    if (queryError) {
      showToast("error", "Query error", queryError, 0);
    }
  }, [queryError, showToast]);

  useEffect(() => {
    if (parseErrorCount > 0) {
      showToast("warning", "Parse errors", `${parseErrorCount} line(s) could not be parsed`, 0);
    }
  }, [parseErrorCount, showToast]);

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  const toggleModule = (mod: string) => {
    setSelectedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleDownloadBundle = async () => {
    const req = buildQueryRequest();
    if (!req.from || !req.to) return;
    setDownloadLoading(true);
    try {
      const blob = await systemLogApi.downloadBundle({ from: req.from, to: req.to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fmt = (iso: string) => iso.replace(/[-:T.Z]/g, "").slice(0, 14);
      a.href = url;
      a.download = `robotops-logs-${fmt(req.from)}-${fmt(req.to)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>System Logs</h1>
        <p style={{ color: "#525252", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
          Backend service runtime logs (read-only view of pino-roll output)
        </p>
      </div>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        <div style={{ width: "300px", flexShrink: 0, background: "white", border: "1px solid #e0e0e0", borderRadius: "4px", padding: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 600 }}>Log Files</h3>
          {filesLoading && <Loading small withOverlay={false} />}
          {!filesLoading && files.length === 0 && (
            <p style={{ color: "#525252", fontSize: "0.8rem" }}>No log files found.</p>
          )}
          {files.map((f) => (
            <div
              key={f.name}
              style={{
                padding: "0.5rem",
                marginBottom: "0.5rem",
                background: "#fafafa",
                border: "1px solid #e0e0e0",
                borderRadius: "4px",
                fontSize: "0.8rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "#0f62fe", fontWeight: 500, fontSize: "0.85rem" }}>{f.name}</span>
                {f.isActive && <Tag size="sm" type="green">ACTIVE</Tag>}
              </div>
              <div style={{ color: "#525252", marginBottom: "0.25rem" }}>
                {f.size >= 1_000_000
                  ? `${(f.size / 1_000_000).toFixed(1)} MB`
                  : f.size >= 1_000
                    ? `${(f.size / 1_000).toFixed(1)} KB`
                    : `${f.size} B`}
                {" · "}
                modified {formatTime(f.mtime)}
              </div>
              <a
                href={systemLogApi.downloadFileUrl(f.name)}
                download={f.name}
                style={{ fontSize: "0.8rem", color: "#0f62fe", textDecoration: "none" }}
              >
                <Download size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />
                Download
              </a>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            background: "white",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            padding: "1rem",
            marginBottom: "1rem",
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#525252", marginRight: "0.25rem" }}>
                Time range
              </span>
              <select
                value={quickRangeIdx}
                onChange={(e) => {
                  setQuickRangeIdx(Number(e.target.value));
                }}
                style={{
                  padding: "4px 8px",
                  border: "1px solid #8d8d8d",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  background: "#f4f4f4",
                }}
              >
                {QUICK_RANGES.map((r, i) => (
                  <option key={r.label} value={i}>{r.label}</option>
                ))}
              </select>
              {quickRangeIdx === QUICK_RANGES.length - 1 && (
                <>
                  <input
                    type="datetime-local"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{ padding: "4px 8px", border: "1px solid #8d8d8d", borderRadius: "4px", fontSize: "0.8rem" }}
                  />
                  <span style={{ fontSize: "0.8rem" }}>→</span>
                  <input
                    type="datetime-local"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{ padding: "4px 8px", border: "1px solid #8d8d8d", borderRadius: "4px", fontSize: "0.8rem" }}
                  />
                </>
              )}
              <div style={{ flex: 1 }} />
              <Button size="sm" onClick={handleDownloadBundle} disabled={downloadLoading}>
                ↓ Download zip
              </Button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>Levels</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {ALL_LEVELS.map((lvl) => (
                    <Tag
                      key={lvl}
                      size="sm"
                      type={selectedLevels.includes(lvl) ? "green" : "cool-gray"}
                      style={{ cursor: "pointer", opacity: selectedLevels.includes(lvl) ? 1 : 0.6 }}
                      onClick={() => toggleLevel(lvl)}
                    >
                      {lvl.toUpperCase()}
                    </Tag>
                  ))}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>Modules</span>
                <select
                  multiple={false}
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) toggleModule(val);
                    e.target.value = "";
                  }}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #8d8d8d",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    background: "#f4f4f4",
                    minWidth: "160px",
                  }}
                >
                  <option value="">{modulesLoading ? "Loading..." : selectedModules.length === 0 ? "All modules" : `${selectedModules.length} selected`}</option>
                  {modules.filter((m) => !selectedModules.includes(m)).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {selectedModules.length > 0 && (
                  <div style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {selectedModules.map((m) => (
                      <Tag key={m} size="sm" filter onClick={() => toggleModule(m)}>{m}</Tag>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>Search msg</span>
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="keyword..."
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #8d8d8d",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    width: "160px",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{
            background: "white",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            overflow: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ background: "#f4f4f4" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", width: "100px" }}>Time</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", width: "60px" }}>Level</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0", width: "120px" }}>Module</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {queryLoading && entries.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "2rem", textAlign: "center" }}>
                      <Loading small withOverlay={false} />
                    </td>
                  </tr>
                )}
                {!queryLoading && entries.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#525252" }}>
                      No log entries found for the selected time range.
                    </td>
                  </tr>
                )}
                {entries.map((entry, idx) => (
                  <tr
                    key={`${entry.time}-${idx}`}
                    style={{ borderBottom: "1px solid #e8e8e8" }}
                    title={JSON.stringify(entry.extra, null, 2)}
                  >
                    <td style={{ padding: "6px 12px", fontSize: "0.75rem", whiteSpace: "nowrap", color: "#525252" }}>
                      {formatTime(entry.time)}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        borderRadius: "4px",
                        background: LEVEL_COLORS[entry.level] ?? "#8d8d8d",
                        color: "white",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}>
                        {entry.level}
                      </span>
                    </td>
                    <td style={{ padding: "6px 12px", color: "#0f62fe", fontSize: "0.8rem", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.module || "-"}
                    </td>
                    <td style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                      <span>{entry.msg}</span>
                      {Object.keys(entry.extra).length > 0 && (
                        <span style={{ color: "#8d8d8d", fontSize: "0.75rem", marginLeft: "4px" }}>
                          {JSON.stringify(entry.extra).substring(0, 80)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated && (
              <div style={{ padding: "0.75rem", textAlign: "center", background: "#f4f4f4", borderTop: "1px solid #e0e0e0" }}>
                <Button size="sm" onClick={loadNextPage} disabled={queryLoading}>
                  Load more entries
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
