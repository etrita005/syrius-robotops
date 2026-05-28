import { useState, useEffect, useCallback } from "react";
import { solutionApi } from "../api/solutionApi.js";
import { SolutionListResult } from "../types/solution.js";

export function useSolutions() {
  const [result, setResult] = useState<SolutionListResult>({
    items: [],
    corruptedIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await solutionApi.list();
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...result, loading, error, refresh };
}
