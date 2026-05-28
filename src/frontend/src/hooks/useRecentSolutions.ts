import { useState, useEffect } from "react";
import { recentSolutionsManager } from "../state/recentSolutionsManager.js";
import { RecentSolutionEntry } from "../types/solution.js";

export function useRecentSolutions() {
  const [entries, setEntries] = useState<RecentSolutionEntry[]>(
    recentSolutionsManager.getList()
  );

  useEffect(() => {
    const unsub = recentSolutionsManager.onChange((updated) => {
      setEntries(updated);
    });
    return unsub;
  }, []);

  const recordAccess = (id: string, name: string) => {
    recentSolutionsManager.recordAccess(id, name);
  };

  const remove = (id: string) => {
    recentSolutionsManager.remove(id);
  };

  const clear = () => {
    recentSolutionsManager.clear();
  };

  return { entries, recordAccess, remove, clear };
}
