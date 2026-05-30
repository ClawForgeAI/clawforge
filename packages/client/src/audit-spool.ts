import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AuditEntry } from "@clawforgeai/policy-schema";

const DEFAULT_PATH = "./.clawforge-spool";
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB

export interface AuditSpoolOptions {
  agentDid: string;
  /**
   * Filesystem location. If it ends in `.jsonl` it's treated as a full file
   * path; otherwise it's treated as a directory and the spool file lives at
   * `${path}/audit-<agentDid>.jsonl`.
   */
  path?: string;
  /** Hard cap on the spool file size. Default 50 MiB. */
  maxBytes?: number;
  logger?: { warn: (msg: string) => void };
}

/**
 * Local-disk write-ahead log for AGT audit entries. The batcher writes here
 * when the HTTP transport fails and drains on the next successful flush.
 *
 * Storage format: JSON-Lines, one `AuditEntry` per line. Sync writes give
 * us crash durability — if the process is killed between an `appendSync`
 * and the next transport attempt, the entries are still on disk and the
 * next process picks them up via `readAll()`.
 *
 * Cap enforcement: when `appendSync` would push the file past `maxBytes`,
 * we drop the oldest lines until the new batch fits, then rewrite the file
 * atomically (write to .tmp, rename). The dropped entries are gone for good
 * — chain integrity for the spool consumer (server-side `/verify`) will
 * surface as a `linkage` break, which is the honest answer.
 */
export class AuditSpool {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly logger?: AuditSpoolOptions["logger"];

  constructor(opts: AuditSpoolOptions) {
    const base = opts.path ?? DEFAULT_PATH;
    this.filePath = base.endsWith(".jsonl") ? base : join(base, `audit-${this.sanitize(opts.agentDid)}.jsonl`);
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.logger = opts.logger;
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  /** Path the spool lives at (mostly for tests). */
  get path(): string {
    return this.filePath;
  }

  /** Current spool size in bytes (0 if file doesn't exist). */
  size(): number {
    try {
      return statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * Read every entry currently in the spool. Corrupted lines (from a
   * partial write) are skipped with a warning rather than poisoning the
   * chain.
   */
  readAll(): AuditEntry[] {
    if (!existsSync(this.filePath)) return [];
    const raw = readFileSync(this.filePath, "utf8");
    if (raw.length === 0) return [];
    const lines = raw.split("\n").filter((line) => line.length > 0);
    const out: AuditEntry[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        out.push(JSON.parse(lines[i]) as AuditEntry);
      } catch (err) {
        this.logger?.warn(
          `[clawforge audit-spool] skipping corrupted entry at line ${i + 1}: ${(err as Error).message}`,
        );
      }
    }
    return out;
  }

  /**
   * Append a batch of entries to the spool synchronously. If the resulting
   * file would exceed `maxBytes`, the oldest lines are dropped until the
   * batch fits, then the file is rewritten atomically.
   */
  appendSync(entries: AuditEntry[]): void {
    if (entries.length === 0) return;

    const newPayload = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const newBytes = Buffer.byteLength(newPayload, "utf8");

    if (newBytes > this.maxBytes) {
      // Single batch alone is bigger than the cap — keep only the most
      // recent suffix that fits. Drop the rest with a warning.
      let bytes = 0;
      const kept: string[] = [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const line = JSON.stringify(entries[i]);
        const lineBytes = Buffer.byteLength(line + "\n", "utf8");
        if (bytes + lineBytes > this.maxBytes) break;
        kept.unshift(line);
        bytes += lineBytes;
      }
      const dropped = entries.length - kept.length;
      if (dropped > 0) {
        this.logger?.warn(
          `[clawforge audit-spool] batch exceeds maxBytes (${this.maxBytes}); dropped ${dropped} oldest entries`,
        );
      }
      writeFileSync(this.filePath, kept.join("\n") + (kept.length > 0 ? "\n" : ""));
      return;
    }

    const existingSize = this.size();
    if (existingSize + newBytes <= this.maxBytes) {
      appendFileSync(this.filePath, newPayload);
      return;
    }

    // Combined would overflow — drop oldest existing lines to make room
    const existingLines = existsSync(this.filePath)
      ? readFileSync(this.filePath, "utf8")
          .split("\n")
          .filter((line) => line.length > 0)
      : [];
    let bytes = newBytes;
    const kept: string[] = [];
    for (let i = existingLines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(existingLines[i] + "\n", "utf8");
      if (bytes + lineBytes > this.maxBytes) break;
      kept.unshift(existingLines[i]);
      bytes += lineBytes;
    }
    const dropped = existingLines.length - kept.length;
    if (dropped > 0) {
      this.logger?.warn(
        `[clawforge audit-spool] maxBytes (${this.maxBytes}) hit; dropped ${dropped} oldest entries to make room`,
      );
    }
    const rewritten = kept.length > 0 ? kept.join("\n") + "\n" : "";
    writeFileSync(this.filePath, rewritten + newPayload);
  }

  /** Truncate the spool. Called after a successful transport. */
  clear(): void {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, "");
    }
  }

  /** DID is used in the filename — make sure it can't break out of the dir. */
  private sanitize(did: string): string {
    return did.replace(/[^a-zA-Z0-9._:-]/g, "_");
  }
}
