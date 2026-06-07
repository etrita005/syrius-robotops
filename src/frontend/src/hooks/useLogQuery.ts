import { useState, useEffect, useCallback, useRef } from "react";
import { systemLogApi } from "../api/systemLogApi.js";
import type { LogEntry, LogQueryRequest } from "../types/systemLog.js";

export function useLogQuery(req: LogQueryRequest) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);
  const [parseErrorCount, setParseErrorCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqKey = JSON.stringify(req);
  const reqRef = useRef(reqKey);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await systemLogApi.query(req);
      setEntries(result.entries);
      setCursor(result.nextCursor);
      setTruncated(result.truncated);
      setParseErrorCount(result.parseErrorCount);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reqKey]);

  useEffect(() => {
    if (reqRef.current !== reqKey) {
      reqRef.current = reqKey;
    }
    reload();
  }, [reload]);

  const loadNextPage = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const result = await systemLogApi.query({ ...req, cursor });
      setEntries((prev) => [...prev, ...result.entries]);
      setCursor(result.nextCursor);
      setTruncated(result.truncated);
      setParseErrorCount((prev) => prev + result.parseErrorCount);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, reqKey]);

  return { entries, truncated, parseErrorCount, loading, error, loadNextPage, reload };
}
