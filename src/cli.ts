#!/usr/bin/env node
/**
 * BillingExtensions CLI
 *
 * Usage:
 *   billingextensions init <appId> <publicKey> [--classic|--module] [--npm] [--sw <path>]
 *
 * Examples:
 *   npx -p @billingextensions/sdk billingextensions init <appId> <publicKey>
 *   npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --classic
 *   npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --module
 *   npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --npm
 *   npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --sw background/service-worker.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Mode = "classic" | "module";
type ImportStrategy = "vendored" | "npm";

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "--help" || cmd === "-h") {
  printHelp(0);
}

if (cmd !== "init") {
  console.error(`Unknown command: ${cmd}`);
  printHelp(1);
}

// Parse args: init <appId> <publicKey> [flags]
const appId = argv[1];
const publicKey = argv[2];
if (!appId || !publicKey) {
  console.error("Missing <appId> and/or <publicKey>.");
  printHelp(1);
}

const flags = argv.slice(3);
const parsed = parseFlags(flags);

// Validate mode flags
if (parsed.forceClassic && parsed.forceModule) {
  console.error("Please pass only one of --classic or --module (not both).");
  process.exit(1);
}

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error(`manifest.json not found in ${root}`);
  process.exit(1);
}

const manifest = readJson(manifestPath);

// Determine service worker path (CLI flag wins, then manifest, then default)
manifest.manifest_version = 3;
manifest.background = manifest.background ?? {};
const swRel: string =
  parsed.swPath ??
  manifest.background.service_worker ??
  "background/service-worker.js";
manifest.background.service_worker = swRel;

const swAbs = path.join(root, swRel);
ensureDir(path.dirname(swAbs));

const swExists = fs.existsSync(swAbs);
const swContents = swExists ? fs.readFileSync(swAbs, "utf8") : "";

// Decide mode (classic/module)
const mode: Mode = decideMode(manifest, swContents, {
  forceClassic: parsed.forceClassic,
  forceModule: parsed.forceModule,
});

// Decide import strategy (vendored file vs npm import)
// - Explicit --npm forces npm strategy (only meaningful in module mode)
// - Auto-detect npm strategy if SW already uses bare-specifier imports (e.g. "react", "@scope/pkg")
// - Otherwise default to vendored
const importStrategy: ImportStrategy = decideImportStrategy({
  swContents,
  mode,
  forceNpm: parsed.forceNpm,
});

applyManifestPatches(manifest, mode);

// Write manifest back
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// Ensure SW file exists
if (!swExists) {
  fs.writeFileSync(swAbs, "", "utf8");
}

// Copy SDK artifact next to SW only if vendored
const copiedFile =
  importStrategy === "vendored"
    ? copySdkArtifactNextToServiceWorker(swAbs, mode)
    : null;

// Inject init snippet (idempotent)
const current = fs.readFileSync(swAbs, "utf8");
const updated = injectInit(current, appId, publicKey, mode, importStrategy);
fs.writeFileSync(swAbs, updated, "utf8");

console.log("✅ BillingExtensions initialized");
console.log(`- Mode: ${mode}`);
console.log(`- Import: ${importStrategy}${importStrategy === "npm" ? " (@billingextensions/sdk)" : ""}`);
console.log(`- Updated: ${manifestPath}`);
console.log(`- Updated: ${swAbs}`);
if (copiedFile) console.log(`- Copied: ${copiedFile}`);

if (importStrategy === "npm") {
  // Helpful guidance: npm import requires bundling, otherwise Chrome will fail
  console.log(
    `\nℹ️  Note: npm imports require a bundler/build step. Chrome extension runtimes cannot resolve "@billingextensions/sdk" directly.\n` +
      `   If you are not using a bundler, rerun with --classic or omit --npm.\n`
  );
}

function printHelp(exitCode: number): never {
  console.log(`
BillingExtensions CLI

Usage:
  billingextensions init <appId> <publicKey> [--classic|--module] [--npm] [--sw <path>]

Options:
  --classic       Force classic service worker (importScripts + IIFE build)
  --module        Force module service worker (type: "module" + ESM build)
  --npm           Use npm import "@billingextensions/sdk" (requires bundler; module mode only)
  --sw <path>     Override background service worker file path
  -h, --help      Show help

Examples:
  npx -p @billingextensions/sdk billingextensions init <appId> <publicKey>
  npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --classic
  npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --module
  npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --npm
  npx -p @billingextensions/sdk billingextensions init <appId> <publicKey> --sw background/service-worker.js
`.trim());
  process.exit(exitCode);
}

function parseFlags(flags: string[]) {
  let forceClassic = false;
  let forceModule = false;
  let forceNpm = false;
  let swPath: string | undefined;

  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f === "--classic") {
      forceClassic = true;
      continue;
    }
    if (f === "--module") {
      forceModule = true;
      continue;
    }
    if (f === "--npm") {
      forceNpm = true;
      continue;
    }
    if (f === "--sw") {
      const val = flags[i + 1];
      if (!val) {
        console.error("Missing value for --sw");
        process.exit(1);
      }
      swPath = val;
      i++;
      continue;
    }
    console.error(`Unknown flag: ${f}`);
    process.exit(1);
  }

  return { forceClassic, forceModule, forceNpm, swPath };
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    console.error(`Failed to parse JSON: ${filePath}`);
    process.exit(1);
  }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function decideMode(
  manifest: any,
  sw: string,
  opts: { forceClassic: boolean; forceModule: boolean }
): Mode {
  if (opts.forceClassic) return "classic";
  if (opts.forceModule) return "module";

  const manifestWantsModule = manifest?.background?.type === "module";
  const hasImportScripts = sw.includes("importScripts(");

  if (hasImportScripts) return "classic";
  if (manifestWantsModule) return "module";

  const hasEsmSyntax =
    /\bimport\s+[^;]+from\s+['"][^'"]+['"]/.test(sw) ||
    /\bexport\s+/.test(sw);

  return hasEsmSyntax ? "module" : "classic";
}

function decideImportStrategy(args: {
  swContents: string;
  mode: Mode;
  forceNpm: boolean;
}): ImportStrategy {
  // npm import only makes sense for module SW (or at least ESM source)
  if (args.forceNpm) {
    if (args.mode !== "module") {
      console.error(`--npm requires module mode. Re-run with --module --npm`);
      process.exit(1);
    }
    return "npm";
  }

  if (args.mode !== "module") {
    return "vendored";
  }

  // Auto-detect bundler-style bare imports in existing SW
  // e.g. import x from "react"; import y from "@scope/pkg";
  const hasBareImport = /\bimport\s+[^;]*from\s+['"](?!\.{0,2}\/|\/)[^'"]+['"]/.test(
    args.swContents
  );

  return hasBareImport ? "npm" : "vendored";
}

function applyManifestPatches(manifest: any, mode: Mode) {
  // Required permissions
  manifest.permissions = mergeStringArray(manifest.permissions, [
    "storage",
    "alarms",
  ]);
  manifest.host_permissions = mergeStringArray(manifest.host_permissions, [
    "https://billingextensions.com/*",
  ]);

  // Handle module/classic SW type
  if (mode === "module") {
    manifest.background.type = "module";
  } else {
    if (manifest.background && "type" in manifest.background) {
      delete manifest.background.type;
    }
  }
}

function mergeStringArray(existing: unknown, add: string[]) {
  const base = Array.isArray(existing)
    ? existing.filter((x) => typeof x === "string")
    : [];
  const set = new Set<string>(base as string[]);
  for (const item of add) set.add(item);
  return Array.from(set);
}

function copySdkArtifactNextToServiceWorker(swAbs: string, mode: Mode) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const artifactName =
    mode === "module"
      ? "BillingExtensionsSDK.module.js"
      : "BillingExtensionsSDK.js";

  const src = path.join(__dirname, artifactName);
  if (!fs.existsSync(src)) {
    console.error(
      `Could not find ${artifactName} next to CLI build.\nExpected: ${src}\nDid you run 'npm run build' before packing/publishing?`
    );
    process.exit(1);
  }

  const dest = path.join(path.dirname(swAbs), artifactName);
  fs.copyFileSync(src, dest);
  return dest;
}

function injectInit(
  file: string,
  appId: string,
  publicKey: string,
  mode: Mode,
  importStrategy: ImportStrategy
) {
  const marker = "/* billingextensions:init */";
  if (file.includes(marker)) return file; // idempotent

  const snippet =
    mode === "module"
      ? moduleTemplate(appId, publicKey, importStrategy)
      : classicTemplate(appId, publicKey);

  return snippet + "\n" + file;
}

function moduleTemplate(
  appId: string,
  publicKey: string,
  importStrategy: ImportStrategy
) {
  const importLine =
    importStrategy === "npm"
      ? `import * as BillingExtensionsSDK from "@billingextensions/sdk";`
      : `import * as BillingExtensionsSDK from "./BillingExtensionsSDK.module.js";`;

  return `/* billingextensions:init */
${importLine}

const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: ${JSON.stringify(appId)},
  publicKey: ${JSON.stringify(publicKey)},
});

// Enables (recommended):
// - message-based instant refresh triggers
// - optional alarms-based polling (if permission exists)
client.enableBackgroundStatusTracking();

// ✅ Your “listener”
client.onStatusChanged((next, prev, diff) => {
  if (prev && !prev?.paid && next.paid) {
    console.log("User paid! ✅", next);
    // do premium logic here (rebuild menus, unlock background features, etc.)
  }

  // you can also rebuild on any change
  console.log("status change", { diff, prev, next });
});
`;
}

function classicTemplate(appId: string, publicKey: string) {
  return `/* billingextensions:init */
importScripts("./BillingExtensionsSDK.js");

const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: ${JSON.stringify(appId)},
  publicKey: ${JSON.stringify(publicKey)},
});

// Enables (recommended):
// - message-based instant refresh triggers
// - optional alarms-based polling (if permission exists)
client.enableBackgroundStatusTracking();

// ✅ Your “listener”
client.onStatusChanged((next, prev, diff) => {
  if (prev && !prev?.paid && next.paid) {
    console.log("User paid! ✅", next);
    // do premium logic here (rebuild menus, unlock background features, etc.)
  }

  // you can also rebuild on any change
  console.log("status change", { diff, prev, next });
});
`;
}
