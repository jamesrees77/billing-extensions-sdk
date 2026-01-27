#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [, , cmd, appId, publicKey] = process.argv;

if (cmd !== "init" || !appId || !publicKey) {
  console.error("Usage: billingextensions init <appId> <publicKey>");
  process.exit(1);
}

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error(`manifest.json not found in ${root}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Ensure MV3 + service worker
manifest.manifest_version = 3;
manifest.background = manifest.background ?? {};
const swFile: string = manifest.background.service_worker ?? "background.js";
manifest.background.service_worker = swFile;

// Add required permissions
manifest.permissions = mergeStringArray(manifest.permissions, ["storage", "alarms"]);
manifest.host_permissions = mergeStringArray(manifest.host_permissions, [
  "https://billingextensions.com/*",
]);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// Create/patch service worker file
const swPath = path.join(root, swFile);

if (!fs.existsSync(swPath)) {
  fs.writeFileSync(swPath, swTemplate(appId, publicKey), "utf8");
} else {
  const current = fs.readFileSync(swPath, "utf8");
  const updated = injectInit(current, appId, publicKey);
  fs.writeFileSync(swPath, updated, "utf8");
}

console.log("✅ BillingExtensions initialized");
console.log(`- Updated: ${manifestPath}`);
console.log(`- Updated: ${swPath}`);

function mergeStringArray(existing: unknown, add: string[]) {
  const base = Array.isArray(existing) ? existing.filter((x) => typeof x === "string") : [];
  const set = new Set<string>(base as string[]);
  for (const item of add) set.add(item);
  return Array.from(set);
}

function swTemplate(appId: string, publicKey: string) {
  return `/* billingextensions:init */
import BillingExtensionsSDK from "@billingextensions/sdk";

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

function injectInit(file: string, appId: string, publicKey: string) {
  const marker = "/* billingextensions:init */";
  if (file.includes(marker)) return file; // idempotent
  return swTemplate(appId, publicKey) + "\n" + file;
}
