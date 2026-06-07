import { useState, useEffect, useCallback } from "react";
import { systemLogApi } from "../api/systemLogApi.js";
import type { LogFileInfo } from "../types/systemLog.js";

export function useLogFiles() {
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemLogApi.listFiles();
      setFiles(data.files);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, error, refresh };
}
