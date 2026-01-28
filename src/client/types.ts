import type { components } from "../generated/openapi-types";
/**
 * BillingExtensions SDK Public Types
 */

// Re-export error types
export type { BillingExtensionsError } from "../core/errors.js";

/**
 * Client configuration
 */
export type BillingExtensionsClientConfig = {
  /** Immutable app ID from the BillingExtensions dashboard */
  appId: string;
  /** Publishable public key */
  publicKey: string;
};

/**
 * Plan information returned by the SDK plans endpoint
 */
export type PlanForSDK = components["schemas"]["Plan"];

/**
 * User status returned by the API
 */
export type UserStatus = components["schemas"]["UserStatus"];

export type PaywallSessionResponse = components["schemas"]["PaywallSessionResponse"];

/**
 * Status diff - describes what changed between two statuses
 */
export type StatusDiff = {
  /** True if entitled status changed */
  entitlementChanged: boolean;
  /** True if plan info changed (id, nickname, status, or currentPeriodEnd) */
  planChanged: boolean;
  /** True if usage info changed (used, limit, or resetsAt) */
  usageChanged: boolean;
};

/**
 * Status change handler
 */
export type StatusChangeHandler = (
  next: UserStatus,
  prev: UserStatus | null,
  diff: StatusDiff
) => void;

/**
 * AutoSync configuration options
 */
export type AutoSyncOptions = {
  /** Refresh status when AutoSync activates (default: true) */
  refreshOnInit?: boolean;
  /** Refresh status when window gains focus or becomes visible (default: true) */
  refreshOnFocus?: boolean;
  /** Refresh status when network comes back online (default: true) */
  refreshOnOnline?: boolean;
  /** Debounce time in milliseconds (default: 300) */
  debounceMs?: number;
  /** Minimum interval between refreshes in milliseconds (default: 3000) */
  minIntervalMs?: number;
};

/**
 * Options for getUser method
 */
export type GetUserOptions = {
  /** Force refresh from API, ignoring cache (default: false) */
  forceRefresh?: boolean;
};

/**
 * BillingExtensions Client Interface
 */
export interface BillingExtensionsClient {
  /**
   * Get the current user status
   *
   * Returns cached status if available and not stale.
   * If no cache exists, fetches from API.
   *
   * @param opts - Options for getting user status
   * @returns Promise resolving to the user status
   * @throws BillingExtensionsError
   */
  getUser(opts?: GetUserOptions): Promise<UserStatus>;

  /**
   * Force refresh user status from the API
   *
   * Always makes an API call, ignoring cache.
   * Triggers status change handlers if status changed.
   *
   * @returns Promise resolving to the user status
   * @throws BillingExtensionsError
   */
  refresh(): Promise<UserStatus>;

  /**
   * Open the billing management portal
   *
   * Creates a portal session via API and opens the URL.
   *
   * @throws BillingExtensionsError
   */
  openManageBilling(): Promise<void>;

  /**
   * Register a handler to be called when user status changes
   *
   * @param handler - Function called with (nextStatus, prevStatus, diff)
   * @returns Unsubscribe function to remove the handler
   */
  onStatusChanged(handler: StatusChangeHandler): () => void;

  /**
   * Enable AutoSync (enabled by default)
   *
   * AutoSync automatically refreshes status on focus, visibility changes,
   * and network reconnection. Only activates in extension UI pages
   * (chrome-extension:// or moz-extension:// protocols).
   *
   * @param opts - AutoSync configuration options
   */
  enableAutoSync(opts?: AutoSyncOptions): void;

  /**
   * Enable background status tracking (recommended)
   *
   * Call this in your service worker/background script. It does two things:
   * 1. Warms the cache with an initial refresh so getUser() is fast when the popup opens
   * 2. Sets up a message listener for the optional content script's checkout return notification
   */
  enableBackgroundStatusTracking(): void;

  /**
   * Disable AutoSync
   */
  disableAutoSync(): void;

  /**
   * Get available plans
   *
   * Fetches the list of available plans from the API.
   *
   * @returns Promise resolving to an array of plans
   * @throws BillingExtensionsError
   */
  getPlans(): Promise<PlanForSDK[]>;
}

/**
 * Cached status with metadata
 */
export type CachedStatus = {
  status: UserStatus;
  fetchedAt: number; // Unix timestamp in milliseconds
};

/**
 * Internal AutoSync state
 */
export type AutoSyncState = {
  enabled: boolean;
  activated: boolean;
  options: Required<AutoSyncOptions>;
  lastRefreshAt: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingPostActionRefresh: boolean;
  cleanup: (() => void) | null;
};
