import { describe, expect, it } from "vitest";
import {
  API_KEY_LIVE_PREFIX,
  API_KEY_LOOKUP_PREFIX_LENGTH,
  API_KEY_TEST_PREFIX,
  isApiKey,
  parseApiKey,
} from "./api-key.js";

const LIVE_KEY = `${API_KEY_LIVE_PREFIX}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
const TEST_KEY = `${API_KEY_TEST_PREFIX}BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB`;
const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1MSJ9.signaturepart";

describe("isApiKey", () => {
  it("recognises cf_live_ tokens", () => {
    expect(isApiKey(LIVE_KEY)).toBe(true);
  });

  it("recognises cf_test_ tokens", () => {
    expect(isApiKey(TEST_KEY)).toBe(true);
  });

  it("rejects JWT-shaped tokens", () => {
    expect(isApiKey(SAMPLE_JWT)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isApiKey("")).toBe(false);
  });
});

describe("parseApiKey", () => {
  it("returns null for non-API-key tokens", () => {
    expect(parseApiKey(SAMPLE_JWT)).toBeNull();
  });

  it("classifies a cf_live_ token as live", () => {
    const parsed = parseApiKey(LIVE_KEY);
    expect(parsed).not.toBeNull();
    expect(parsed!.environment).toBe("live");
  });

  it("classifies a cf_test_ token as test", () => {
    const parsed = parseApiKey(TEST_KEY);
    expect(parsed!.environment).toBe("test");
  });

  it("computes lookupPrefix as the first 16 chars (matches server keyPrefix)", () => {
    const parsed = parseApiKey(LIVE_KEY)!;
    expect(parsed.lookupPrefix).toBe(LIVE_KEY.slice(0, API_KEY_LOOKUP_PREFIX_LENGTH));
    expect(parsed.lookupPrefix.length).toBe(16);
    expect(parsed.lookupPrefix.startsWith("cf_live_")).toBe(true);
  });

  it("preserves the original token for downstream bcrypt verification", () => {
    const parsed = parseApiKey(LIVE_KEY)!;
    expect(parsed.token).toBe(LIVE_KEY);
  });
});
