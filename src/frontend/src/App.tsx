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

type View = "solutions" | "artifacts";

export default function App() {
  const { activeId, activate } = useActiveSolution();
  const { entries, recordAccess, remove: removeRecent } = useRecentSolutions();
  const [currentView, setCurrentView] = useState<View>("solutions");

  const solutionsState = useSolutions();
  const artifactsState = useArtifacts();

  return (
    <Theme theme="g100">
      <Header aria-label="RobotOps Studio">
        <HeaderName prefix="RobotOps">Studio</HeaderName>
        <HeaderNavigation aria-label="Main navigation">
          <HeaderMenuItem
            onClick={() => setCurrentView("solutions")}
            isCurrent={currentView === "solutions"}
          >
            Solutions
          </HeaderMenuItem>
          <HeaderMenuItem
            onClick={() => setCurrentView("artifacts")}
            isCurrent={currentView === "artifacts"}
          >
            Artifacts
          </HeaderMenuItem>
        </HeaderNavigation>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <RecentSolutionsDropdown
            entries={entries}
            onSelect={(id) => activate(id)}
            onRemove={removeRecent}
          />
        </div>
      </Header>

      {activeId && <ActiveSolutionHeader />}

      <Content>
        {currentView === "solutions" && (
          <SolutionSelector
            solutions={solutionsState.items}
            corruptedIds={solutionsState.corruptedIds}
            loading={solutionsState.loading}
            onRefresh={solutionsState.refresh}
          />
        )}
        {currentView === "artifacts" && (
          <>
            <UploadDropZone onUploadComplete={artifactsState.refresh} />
            <ArtifactManager
              artifacts={artifactsState.items}
              total={artifactsState.total}
              loading={artifactsState.loading}
              error={artifactsState.error}
              onRefresh={artifactsState.refresh}
            />
          </>
        )}
      </Content>
    </Theme>
  );
}
