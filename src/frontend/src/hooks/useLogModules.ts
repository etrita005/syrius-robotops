import { useState, useEffect, useCallback } from "react";
import { systemLogApi } from "../api/systemLogApi.js";

export function useLogModules() {
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemLogApi.listModules();
      setModules(data.modules);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { modules, loading, error, refresh };
}
