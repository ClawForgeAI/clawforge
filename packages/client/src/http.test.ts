import { describe, expect, it } from "vitest";
import { HttpClient, HttpError } from "./http.js";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeMockFetch(handler: (url: string, init?: FetchInit) => Promise<Response> | Response): typeof fetch {
  return (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url: string }).url;
    return handler(url, init);
  }) as typeof fetch;
}

describe("HttpClient", () => {
  it("sends Authorization: Bearer and Accept: application/json", async () => {
    let capturedHeaders: unknown;
    const fetchImpl = makeMockFetch((_url, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    const http = new HttpClient({ baseUrl: "https://example.test", token: "tk-1", fetchImpl });
    await http.get("/api/v1/test");
    expect(capturedHeaders).toMatchObject({
      Authorization: "Bearer tk-1",
      Accept: "application/json",
    });
  });

  it("serializes body and sets content-type on POST", async () => {
    let capturedBody: unknown;
    let capturedHeaders: unknown;
    const fetchImpl = makeMockFetch((_url, init) => {
      capturedBody = init?.body;
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      });
    });
    const http = new HttpClient({ baseUrl: "https://example.test", token: "tk", fetchImpl });
    await http.post("/api/v1/x", { foo: "bar" });
    expect(capturedBody).toBe(JSON.stringify({ foo: "bar" }));
    expect((capturedHeaders as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns parsed JSON when content-type is application/json", async () => {
    const fetchImpl = makeMockFetch(
      () =>
        new Response(JSON.stringify({ a: 1 }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const http = new HttpClient({ baseUrl: "https://example.test", token: "tk", fetchImpl });
    const result = await http.get<{ a: number }>("/x");
    expect(result.a).toBe(1);
  });

  it("returns text body when content-type is not JSON (e.g. YAML)", async () => {
    const fetchImpl = makeMockFetch(
      () =>
        new Response("name: test\nrules: []", {
          headers: { "content-type": "text/yaml" },
        }),
    );
    const http = new HttpClient({ baseUrl: "https://example.test", token: "tk", fetchImpl });
    const result = await http.get<string>("/policy.yaml");
    expect(result).toContain("name: test");
  });

  it("throws HttpError with status and body on non-OK", async () => {
    const fetchImpl = makeMockFetch(() => new Response("policy not found", { status: 404, statusText: "Not Found" }));
    const http = new HttpClient({ baseUrl: "https://example.test", token: "tk", fetchImpl });
    await expect(http.get("/missing")).rejects.toBeInstanceOf(HttpError);
    await expect(http.get("/missing")).rejects.toThrow(/404/);
  });

  it("strips trailing slashes from baseUrl", async () => {
    let capturedUrl = "";
    const fetchImpl = makeMockFetch((url) => {
      capturedUrl = url;
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });
    const http = new HttpClient({ baseUrl: "https://example.test///", token: "tk", fetchImpl });
    await http.get("/api/v1/x");
    expect(capturedUrl).toBe("https://example.test/api/v1/x");
  });
});
