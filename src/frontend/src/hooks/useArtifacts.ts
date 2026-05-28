import { useState, useEffect, useCallback } from "react";
import { artifactApi } from "../api/artifactApi.js";
import { ArtifactMeta, ArtifactListResult } from "../types/artifact.js";

export function useArtifacts(options?: {
  filter?: { fileName?: string; contentType?: string; tags?: string[] };
  sort?: { field: string; order: string };
}) {
  const [result, setResult] = useState<ArtifactListResult>({
    items: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await artifactApi.list(options);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [options?.filter?.fileName, options?.filter?.contentType, options?.filter?.tags?.join(","), options?.sort?.field, options?.sort?.order]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...result, loading, error, refresh };
}
