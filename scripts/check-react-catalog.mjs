#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workspacePath = fileURLToPath(new URL("../pnpm-workspace.yaml", import.meta.url));
const workspace = readFileSync(workspacePath, "utf8");

function readCatalogValue(name) {
  const match = workspace.match(new RegExp(`^\\s{2}${escapeRegExp(name)}:\\s*([^#\\n]+)`, "m"));
  if (!match) {
    throw new Error(`Missing pnpm workspace catalog entry for ${name}`);
  }

  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const reactVersion = readCatalogValue("react");
const reactDomVersion = readCatalogValue("react-dom");

if (reactVersion !== reactDomVersion) {
  console.error("React catalog mismatch detected:");
  console.error(`  react: ${reactVersion}`);
  console.error(`  react-dom: ${reactDomVersion}`);
  process.exit(1);
}

const installedPackages = JSON.parse(
  execFileSync(
    "pnpm",
    ["list", "react", "react-dom", "--depth=-1", "--recursive", "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  ),
);

const mismatches = [];
for (const project of installedPackages) {
  const dependencies = {
    ...(project.dependencies ?? {}),
    ...(project.unsavedDependencies ?? {}),
  };

  for (const [name, expectedVersion] of Object.entries({
    react: reactVersion,
    "react-dom": reactDomVersion,
  })) {
    const dependency = dependencies[name];
    if (!dependency) {
      continue;
    }

    const actualVersion = extractInstalledVersion(name, dependency);
    if (actualVersion !== expectedVersion) {
      mismatches.push({
        project: project.name ?? project.path,
        name,
        expectedVersion,
        actualVersion,
      });
    }
  }
}

if (mismatches.length > 0) {
  console.error("React catalog mismatch detected in installed workspace dependencies:");
  for (const mismatch of mismatches) {
    console.error(
      `  ${mismatch.project}: ${mismatch.name} expected ${mismatch.expectedVersion}, got ${mismatch.actualVersion}`,
    );
  }
  process.exit(1);
}

console.log(`React catalog and installed workspace dependencies are aligned at ${reactVersion}.`);

function extractInstalledVersion(name, dependency) {
  const exactVersion = typeof dependency.version === "string"
    ? dependency.version.match(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
    : null;
  if (exactVersion) {
    return exactVersion[0];
  }

  const pattern = new RegExp(`${escapeRegExp(name)}@(\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?)`);
  for (const candidate of [dependency.version, dependency.path, dependency.resolved]) {
    if (typeof candidate !== "string") {
      continue;
    }
    const match = candidate.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return "unknown";
}
