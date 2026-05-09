#!/usr/bin/env node
/**
 * Dep guard for the ClawForge platform packages.
 *
 * Walks every TypeScript file under `packages/<pkg>/src/` and verifies that any
 * `@clawforgeai/*` import is declared in that package's `dependencies` (or
 * `peerDependencies`/`devDependencies`). Fails on undeclared imports — this
 * catches accidental cross-package dependencies that would break the dependency
 * DAG documented in `docs/technical-strategy.md`.
 *
 * Usage:
 *   node scripts/check-deps.mjs
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const packagesDir = join(repoRoot, "packages");

const SCOPE = "@clawforgeai/";
const IMPORT_RE = /(?:^|[^\w])(?:import|export)\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

async function listDirs(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function walkTs(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      await walkTs(full, files);
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractScopedImports(source) {
  const found = new Set();
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const spec = match[1];
      if (spec.startsWith(SCOPE)) {
        // Take only the package name (`@scope/name`), drop subpaths.
        const segments = spec.split("/");
        if (segments.length >= 2) {
          found.add(`${segments[0]}/${segments[1]}`);
        }
      }
    }
  }
  return found;
}

async function main() {
  const pkgDirs = await listDirs(packagesDir);
  if (pkgDirs.length === 0) {
    console.log("check-deps: no packages found under packages/ — nothing to check");
    return;
  }

  const errors = [];

  for (const name of pkgDirs) {
    const pkgRoot = join(packagesDir, name);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8"));
    } catch (err) {
      errors.push(`${name}: cannot read package.json (${String(err)})`);
      continue;
    }
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);

    const tsFiles = await walkTs(join(pkgRoot, "src"));
    for (const file of tsFiles) {
      const source = await readFile(file, "utf8");
      const imports = extractScopedImports(source);
      for (const dep of imports) {
        if (dep === manifest.name) continue;
        if (!declared.has(dep)) {
          errors.push(
            `${manifest.name}: undeclared import "${dep}" in ${relative(repoRoot, file)} — add to dependencies in ${relative(repoRoot, join(pkgRoot, "package.json"))}`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("check-deps: violations found:");
    for (const err of errors) console.error("  - " + err);
    process.exit(1);
  }
  console.log(`check-deps: ${pkgDirs.length} package(s) OK`);
}

main().catch((err) => {
  console.error("check-deps: unexpected error", err);
  process.exit(2);
});
