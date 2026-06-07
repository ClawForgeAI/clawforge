/**
 * Client for fetching organization policies from the ClawForge control plane.
 */

import type { OrgPolicy, SessionTokens } from "../types.js";

export async function fetchEffectivePolicy(params: {
  controlPlaneUrl: string;
  orgId: string;
  userId: string;
  accessToken: string;
}): Promise<OrgPolicy> {
  const url = `${params.controlPlaneUrl}/api/v1/policies/${encodeURIComponent(params.orgId)}/effective?userId=${encodeURIComponent(params.userId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch org policy (${response.status}): ${text}`);
  }

  return (await response.json()) as OrgPolicy;
}

export async function refreshSessionToken(params: {
  controlPlaneUrl: string;
  refreshToken: string;
}): Promise<SessionTokens> {
  const response = await fetch(`${params.controlPlaneUrl}/api/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "refresh_token",
      refreshToken: params.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Session refresh failed (${response.status})`);
  }

  return (await response.json()) as SessionTokens;
}
