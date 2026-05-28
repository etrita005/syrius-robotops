import { useState, useEffect, useCallback } from "react";
import { solutionApi } from "../api/solutionApi.js";
import { SolutionMeta, SolutionListResult } from "../types/solution.js";

export function useSolutions(options?: {
  filter?: { name?: string; tags?: string[] };
  sort?: { field: string; order: string };
}) {
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
      const data = await solutionApi.list(options);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [options?.filter?.name, options?.filter?.tags?.join(","), options?.sort?.field, options?.sort?.order]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...result, loading, error, refresh };
}
