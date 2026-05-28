import React, { useState } from "react";
import { Header, HeaderName, HeaderNavigation, HeaderMenuItem, Content, Theme } from "@carbon/react";
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

type TopView = "solutions" | "artifacts";
type SolutionSubView = "robots" | "upgrade" | "maps" | "configs" | "diagnostics" | "logs";

export default function App() {
  const { activeId, activeMeta, activate, deactivate } = useActiveSolution();
  const { entries, remove: removeRecent } = useRecentSolutions();
  const [currentView, setCurrentView] = useState<TopView>("solutions");
  const [subView, setSubView] = useState<SolutionSubView>("robots");
  const [inWorkspace, setInWorkspace] = useState(false);

  const solutionsState = useSolutions();
  const artifactsState = useArtifacts();

  const sidebarItems: { key: SolutionSubView; label: string }[] = [
    { key: "robots", label: "Robots" },
    { key: "upgrade", label: "Upgrade Packages" },
    { key: "maps", label: "Maps" },
    { key: "configs", label: "Program Configs" },
    { key: "diagnostics", label: "Diagnostics" },
    { key: "logs", label: "Logs" },
  ];

  const handleActivateSolution = async (id: string) => {
    await activate(id);
    setInWorkspace(true);
    setSubView("robots");
  };

  const handleSwitchSolution = () => {
    setInWorkspace(false);
    deactivate();
  };

  const renderSolutionContent = () => {
    // If not in workspace, show the solution selector list
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

    // In workspace mode: show sidebar + sub-view
    return (
      <div style={{ display: "flex", height: "calc(100vh - 96px)" }}>
        {/* Left sidebar */}
        <div
          style={{
            width: "220px",
            background: "#f4f4f4",
            borderRight: "1px solid #e0e0e0",
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
                background: subView === item.key ? "#e0e0e0" : "transparent",
                color: "#161616",
                fontSize: "0.875rem",
                fontWeight: subView === item.key ? 600 : 400,
                borderLeft: subView === item.key ? "3px solid #0f62fe" : "3px solid transparent",
              }}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {subView === "robots" && (
            <RobotsView
              solutionId={activeId}
              onBackToSolutions={() => setInWorkspace(false)}
            />
          )}
          {subView !== "robots" && (
            <div style={{ padding: "2rem" }}>
              <h3 style={{ marginBottom: "1rem" }}>
                {sidebarItems.find((i) => i.key === subView)?.label}
              </h3>
              <p style={{ color: "#525252" }}>
                This feature is not yet implemented.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Theme theme="white">
      <Header aria-label="RobotOps Studio">
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
            onClick={() => setCurrentView("artifacts")}
            isActive={currentView === "artifacts"}
          >
            Artifacts
          </HeaderMenuItem>
        </HeaderNavigation>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <RecentSolutionsDropdown
            entries={entries}
            onSelect={(id) => {
              setCurrentView("solutions");
              handleActivateSolution(id);
            }}
            onRemove={removeRecent}
          />
        </div>
      </Header>

      {activeId && inWorkspace && <ActiveSolutionHeader />}

      <Content>
        {currentView === "solutions" && renderSolutionContent()}
        {currentView === "artifacts" && (
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Artifact Manager
            </h1>
            <p style={{ color: "#525252", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
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
      </Content>
    </Theme>
  );
}
