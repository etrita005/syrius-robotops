import { useState, useEffect, useCallback } from "react";
import { activeSolutionManager } from "../state/activeSolutionManager.js";
import { recentSolutionsManager } from "../state/recentSolutionsManager.js";
import { SolutionMeta } from "../types/solution.js";
import { solutionApi } from "../api/solutionApi.js";

export function useActiveSolution() {
  const [activeId, setActiveId] = useState<string | null>(
    activeSolutionManager.getActiveId()
  );
  const [activeMeta, setActiveMeta] = useState<SolutionMeta | null>(
    activeSolutionManager.getActiveMeta()
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = activeSolutionManager.onChange((id) => {
      setActiveId(id);
      setActiveMeta(activeSolutionManager.getActiveMeta());
    });

    if (activeId && !activeMeta) {
      setLoading(true);
      solutionApi
        .get(activeId)
        .then((meta) => {
          if (meta) activeSolutionManager.setActive(activeId, meta);
          else activeSolutionManager.clear();
        })
        .catch(() => {
          activeSolutionManager.clear();
        })
        .finally(() => setLoading(false));
    }

    return unsub;
  }, []);

  const activate = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const meta = await solutionApi.get(id);
      if (!meta) throw new Error("Solution not found");
      activeSolutionManager.setActive(id, meta);
      recentSolutionsManager.recordAccess(id, meta.name);
    } catch {
      activeSolutionManager.clear();
      throw new Error("NO_ACTIVE_SOLUTION");
    } finally {
      setLoading(false);
    }
  }, []);

  const deactivate = useCallback(() => {
    activeSolutionManager.clear();
  }, []);

  return { activeId, activeMeta, loading, activate, deactivate };
}
