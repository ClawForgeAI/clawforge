declare global {
  interface Window {
    __CLAWFORGE_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

function normalizeApiUrl(value?: string) {
  return value?.trim().replace(/\/$/, "");
}

export function getApiBase() {
  if (typeof window !== "undefined") {
    const runtimeUrl = normalizeApiUrl(window.__CLAWFORGE_CONFIG__?.apiUrl);
    if (runtimeUrl) {
      return runtimeUrl;
    }
  }

  return normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:4100";
}
