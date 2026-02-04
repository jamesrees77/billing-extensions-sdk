/**
 * BillingExtensions SDK
 *
 * TypeScript SDK for browser extension billing with MV3 support.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════════════════
// Client Factory
// ═══════════════════════════════════════════════════════════════════════════

export { createBillingExtensionsClient } from "./client/createClient.js";

// ═══════════════════════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════════════════════

export type {
  // Client
  BillingExtensionsClient,
  BillingExtensionsClientConfig,

  // User Status
  UserStatus,

  // Plans
  PlanForSDK,

  // Paywall Session
  PaywallSessionResponse,

  // Change Detection
  StatusDiff,
  StatusChangeHandler,

  // AutoSync
  AutoSyncOptions,

  // Options
  GetUserOptions,

  // Errors
  BillingExtensionsError,
} from "./client/types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Error Utilities
// ═══════════════════════════════════════════════════════════════════════════

export { isBillingExtensionsError } from "./core/errors.js";

// ═══════════════════════════════════════════════════════════════════════════
// Content Script
// ═══════════════════════════════════════════════════════════════════════════

export { startContentScript } from "./content/startContentScript.js";

// Auto-run content script detection (safe-guarded to only run in content script context)
import "./content/auto.js";
