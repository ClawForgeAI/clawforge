export interface HttpClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface HttpRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${body}`);
    this.name = "HttpError";
  }
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(req: HttpRequest): Promise<T> {
    const url = `${this.baseUrl}${req.path.startsWith("/") ? req.path : `/${req.path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await this.fetchImpl(url, {
      method: req.method,
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: req.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(response.status, response.statusText, body);
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "GET", path, signal });
  }
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "POST", path, body, signal });
  }
  patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body, signal });
  }
}
