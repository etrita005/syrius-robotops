import React, { useState, useCallback } from "react";
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  Content,
  Theme,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SkipToContent,
} from "@carbon/react";
import { Light, Asleep } from "@carbon/react/icons";
import { ToastProvider } from "./hooks/useToast.js";
import { ActiveSolutionHeader } from "./components/solution/ActiveSolutionHeader.js";
import { SolutionSelector } from "./components/solution/SolutionSelector.js";
import { ArtifactManager } from "./components/artifact/ArtifactManager.js";
import { UploadDropZone } from "./components/artifact/UploadDropZone.js";
import { useActiveSolution } from "./hooks/useActiveSolution.js";
import { useSolutions } from "./hooks/useSolutions.js";
import { useArtifacts } from "./hooks/useArtifacts.js";
import { RecentSolutionsDropdown } from "./components/common/RecentSolutionsDropdown.js";
import { useRecentSolutions } from "./hooks/useRecentSolutions.js";
import RobotsView from "./components/robots/RobotsView.js";
import TasksView from "./components/tasks/TasksView.js";
import { SystemLogsView } from "./components/system-logs/SystemLogsView.js";

type TopView = "solutions" | "artifacts" | "system-logs";
type SolutionSubView = "robots" | "tasks";
type ThemeMode = "white" | "g100";

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("robotops_theme");
    if (stored === "white" || stored === "g100") return stored;
  } catch {
    // ignore
  }
  return "white";
}

function storeTheme(theme: ThemeMode) {
  try {
    localStorage.setItem("robotops_theme", theme);
  } catch {
    // ignore
  }
}

export default function App() {
  const { activeId, activeMeta, activate, deactivate } = useActiveSolution();
  const { entries, remove: removeRecent } = useRecentSolutions();
  const [currentView, setCurrentView] = useState<TopView>("solutions");
  const [subView, setSubView] = useState<SolutionSubView>("robots");
  const [inWorkspace, setInWorkspace] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  const isDark = theme === "g100";
  const textSecondary = isDark ? "#c6c6c6" : "#525252";
  const textTertiary = isDark ? "#a0a0a0" : "#8d8d8d";

  const solutionsState = useSolutions();
  const artifactsState = useArtifacts();

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "white" ? "g100" : "white";
      storeTheme(next);
      return next;
    });
  }, []);

  const sidebarItems: { key: SolutionSubView; label: string }[] = [
    { key: "robots", label: "Robots" },
    { key: "tasks", label: "Tasks" },
  ];

  const handleActivateSolution = async (id: string) => {
    await activate(id);
    setInWorkspace(true);
    setSubView("robots");
  };

  const renderSolutionContent = () => {
    if (!inWorkspace || !activeId) {
      return (
        <SolutionSelector
          solutions={solutionsState.items}
          corruptedIds={solutionsState.corruptedIds}
          loading={solutionsState.loading}
          onRefresh={solutionsState.refresh}
          onActivate={handleActivateSolution}
        />
      );
    }

    const isDark = theme === "g100";

    return (
      <div style={{ display: "flex", height: "100%" }}>
        <div
          style={{
            width: "220px",
            background: isDark ? "#262626" : "#f4f4f4",
            borderRight: isDark ? "1px solid #393939" : "1px solid #e0e0e0",
            padding: "1rem 0",
            flexShrink: 0,
          }}
        >
          {sidebarItems.map((item) => (
            <div
              key={item.key}
              onClick={() => setSubView(item.key)}
              style={{
                padding: "0.75rem 1.5rem",
                cursor: "pointer",
                background: subView === item.key ? (isDark ? "#393939" : "#e0e0e0") : "transparent",
                color: isDark ? "#f4f4f4" : "#161616",
                fontSize: "0.875rem",
                fontWeight: subView === item.key ? 600 : 400,
                borderLeft: subView === item.key ? "3px solid #0f62fe" : "3px solid transparent",
                transition: "background 0.2s ease, border-color 0.2s ease, font-weight 0.2s ease",
              }}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
          {subView === "robots" && (
            <RobotsView
              solutionId={activeId}
              onBackToSolutions={() => setInWorkspace(false)}
            />
          )}
          {subView === "tasks" && (
            <TasksView
              solutionId={activeId}
              onBackToSolutions={() => setInWorkspace(false)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <ToastProvider>
      <Theme theme={theme}>
        <style>{`
          .cds--header__nav {
            display: flex !important;
          }
          html, body, #root, #root > .cds--white, #root > .cds--g100 {
            background-color: ${isDark ? "#161616" : "#ffffff"};
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
          }
        `}</style>
        <a href="#main-content" className="cds--visually-hidden">
          Skip to main content
        </a>
        <Header aria-label="RobotOps Studio">
          <SkipToContent />
          <HeaderName prefix="RobotOps">Studio</HeaderName>
          <HeaderNavigation aria-label="Main navigation">
            <HeaderMenuItem
              onClick={() => {
                setCurrentView("solutions");
                if (inWorkspace) setInWorkspace(false);
              }}
              isActive={currentView === "solutions"}
            >
              Solutions
            </HeaderMenuItem>
            <HeaderMenuItem
              onClick={() => {
                setCurrentView("artifacts");
                if (inWorkspace) setInWorkspace(false);
              }}
              isActive={currentView === "artifacts"}
            >
              Artifacts
            </HeaderMenuItem>
            <HeaderMenuItem
              onClick={() => {
                setCurrentView("system-logs");
                if (inWorkspace) setInWorkspace(false);
              }}
              isActive={currentView === "system-logs"}
            >
              System Logs
            </HeaderMenuItem>
          </HeaderNavigation>
          <HeaderGlobalBar>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0 0.5rem" }}>
              <RecentSolutionsDropdown
                entries={entries}
                onSelect={(id) => {
                  setCurrentView("solutions");
                  handleActivateSolution(id);
                }}
                onRemove={removeRecent}
              />
              <HeaderGlobalAction
                aria-label={theme === "white" ? "Switch to dark mode" : "Switch to light mode"}
                onClick={toggleTheme}
              >
                {theme === "white" ? <Asleep size={20} /> : <Light size={20} />}
              </HeaderGlobalAction>
            </div>
          </HeaderGlobalBar>
        </Header>

        {activeId && inWorkspace && <ActiveSolutionHeader />}

        {inWorkspace && activeId ? (
          <div id="main-content" style={{ overflow: "hidden" }}>
            {renderSolutionContent()}
          </div>
        ) : (
          <Content id="main-content">
            {currentView === "solutions" && renderSolutionContent()}
            {currentView === "artifacts" && (
              <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
                <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Artifact Manager
                </h1>
                <p style={{ color: textSecondary, fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                  Global binary artifacts shared across all solutions.
                </p>
                <UploadDropZone onUploadComplete={artifactsState.refresh} />
                <ArtifactManager
                  artifacts={artifactsState.items}
                  total={artifactsState.total}
                  loading={artifactsState.loading}
                  error={artifactsState.error}
                  onRefresh={artifactsState.refresh}
                />
              </div>
            )}
            {currentView === "system-logs" && (
              <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", padding: "1.5rem", boxSizing: "border-box" }}>
                <SystemLogsView />
              </div>
            )}
          </Content>
        )}
      </Theme>
    </ToastProvider>
  );
}
