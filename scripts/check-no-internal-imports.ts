#!/usr/bin/env bun
/**
 * Ensures main process does not import from worker service internal/ folders.
 * Worker services (faces, geolocate, search, favorite-exporter) must expose
 * public APIs (queries.ts, database.ts, setup.ts, poi.ts, etc.); main process
 * must not load from their internal/.
 *
 * Run: bun run scripts/check-no-internal-imports.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const WORKER_SERVICES = ["faces", "geolocate", "search", "favorite-exporter"];
const SERVER_ROOT = join(import.meta.dir, "..", "server");

function* walkTsFiles(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      yield* walkTsFiles(full);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function isInsideService(filePath: string, serviceName: string): boolean {
  const rel = filePath.replace(SERVER_ROOT + "/", "");
  return rel.startsWith(`services/${serviceName}/`);
}

const violations: Array<{ file: string; line: number; importPath: string; service: string }> = [];

for (const filePath of walkTsFiles(SERVER_ROOT)) {
  const content = readFileSync(filePath, "utf-8");
  const relPath = filePath.replace(SERVER_ROOT + "/", "");

  for (const [i, line] of content.split("\n").entries()) {
    const importMatch = line.match(
      /(?:import|from)\s+["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)/
    );
    if (!importMatch) continue;

    const importPath = importMatch[1] ?? importMatch[2];
    if (!importPath) continue;

    for (const service of WORKER_SERVICES) {
      if (importPath.includes(`/${service}/internal/`) || importPath.includes(`\\${service}\\internal\\`)) {
        if (isInsideService(filePath, service)) continue;
        violations.push({
          file: relPath,
          line: i + 1,
          importPath,
          service,
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("ERROR: Main process must not import from worker service internal/ folders.\n");
  console.error("Worker services (faces, geolocate, search, favorite-exporter) must expose");
  console.error("public APIs. Use queries.ts, database.ts, setup.ts, poi.ts, etc.\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} imports from ${v.service}/internal/`);
    console.error(`    -> ${v.importPath}\n`);
  }
  process.exit(1);
}

console.log("OK: No main process imports from worker service internal/ folders.");
