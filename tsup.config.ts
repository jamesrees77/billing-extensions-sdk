import { defineConfig } from "tsup";

const define = {
  __SDK_VERSION__: JSON.stringify(process.env.npm_package_version || "0.2.0"),
  __DEV_API_ORIGIN__: JSON.stringify("https://f8e3f5799e50.ngrok-free.app/"), 
};

export default defineConfig([
  // 1) Normal package build (npm)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
    define,
  },

  // 2) Drop-in MV3 build (IIFE) -> dist/BillingExtensionsSDK.js
  {
    entry: { BillingExtensionsSDK: "src/index.ts" },
    format: ["iife"],
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2019",
    outDir: "dist",
    globalName: "BillingExtensionsSDK",
    define,
    outExtension: () => ({ js: ".js" }),
  },

  // 3) Named ESM module build -> dist/BillingExtensionsSDK.module.js
  {
    entry: { BillingExtensionsSDK: "src/index.ts" },
    format: ["esm"],
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
    define,
    outExtension: () => ({ js: ".module.js" }),
  },
    // 4) Content script build (optional “instant” signal) -> dist/BillingExtensionsSDK.content.js
    {
        entry: { "BillingExtensionsSDK.content": "src/content/checkout-return-listener.ts" },
        format: ["iife"],
        splitting: false,
        sourcemap: false,
        clean: false,
        treeshake: true,
        minify: true,
        target: "es2019",
        outDir: "dist",
        define,
        outExtension: () => ({ js: ".js" }),
      },
  // 5) CLI (Node) -> dist/cli.js for `npx billingextensions ...`
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    splitting: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    minify: false,
    target: "node18",
    outDir: "dist",
    platform: "node",
    tsconfig: "tsconfig.cli.json",
    define,
    outExtension: () => ({ js: ".js" }),
  },
]);