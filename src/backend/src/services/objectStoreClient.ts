export interface ObjectStoreClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

interface ObjectStoreResource {
  name: string;
  type: "file" | "directory";
  contentType?: string;
  size?: number;
}

export class ObjectStoreClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config: ObjectStoreClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
  }

  private async request(
    method: string,
    path: string,
    body?: Buffer | string,
    contentType?: string,
    headers?: Record<string, string>
  ): Promise<Response> {
    const url = `${this.baseUrl}/api/obs/${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const fetchHeaders: Record<string, string> = { ...headers };
        if (contentType) {
          fetchHeaders["Content-Type"] = contentType;
        }

        const init: RequestInit = {
          method,
          headers: fetchHeaders,
          signal: AbortSignal.timeout(this.timeout),
        };

        if (body !== undefined) {
          init.body = typeof body === "string" ? body : body;
        }

        const response = await fetch(url, init);

        if (response.status >= 500 && attempt < this.retries) {
          lastError = new Error(`Server error: ${response.status}`);
          await this.delay(attempt);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.retries) {
          await this.delay(attempt);
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private delay(attempt: number): Promise<void> {
    const baseMs = 200;
    const maxMs = 5000;
    const ms = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async put(
    path: string,
    body: Buffer | string,
    contentType?: string,
    headers?: Record<string, string>
  ): Promise<Response> {
    return this.request("PUT", path, body, contentType, headers);
  }

  async get(path: string): Promise<Response> {
    return this.request("GET", path);
  }

  async delete(path: string): Promise<Response> {
    return this.request("DELETE", path);
  }

  async list(path: string): Promise<ObjectStoreResource[]> {
    const response = await this.get(path);
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Failed to list ${path}: ${response.status}`);
    }
    return response.json();
  }

  async getJson<T>(path: string): Promise<T | null> {
    const response = await this.get(path);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to get ${path}: ${response.status}`);
    }
    return response.json();
  }

  async putJson(path: string, data: unknown, headers?: Record<string, string>): Promise<void> {
    const body = JSON.stringify(data);
    const response = await this.put(path, body, "application/json", headers);
    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to put ${path}: ${response.status} - ${err}`);
    }
  }

  async putBuffer(path: string, data: Buffer, contentType: string, headers?: Record<string, string>): Promise<void> {
    const response = await this.put(path, data, contentType, headers);
    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to put ${path}: ${response.status} - ${err}`);
    }
  }

  async deletePath(path: string): Promise<boolean> {
    const response = await this.delete(path);
    return response.status === 204;
  }

  async exists(path: string): Promise<boolean> {
    const response = await this.get(path);
    return response.ok;
  }
}
