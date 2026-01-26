/**
 * BillingExtensions Client Factory
 *
 * Creates a configured client instance for interacting with the BillingExtensions API.
 */

import {
  createConfigError,
  normalizeError,
} from "../core/errors.js";
import { createHttpClient } from "../core/http.js";
import { computeStatusDiff, hasAnyChange } from "../core/diff.js";
import { openUrl } from "../core/tabs.js";
import {
  getFromBestStorage,
  setInBestStorage,
} from "../core/storage.js";
import {
  activateAutoSync,
  createAutoSyncState,
  deactivateAutoSync,
  DEFAULT_AUTOSYNC_OPTIONS,
  markPendingPostActionRefresh,
  mergeAutoSyncOptions,
} from "../core/autosync.js";
import type {
  AutoSyncOptions,
  AutoSyncState,
  BillingExtensionsClient,
  BillingExtensionsClientConfig,
  CachedStatus,
  GetUserOptions,
  PlanForSDK,
  StatusChangeHandler,
  UserStatus,
} from "./types.js";

/**
 * Storage key for cached status
 */
const STATUS_CACHE_KEY = "billingextensions_status_cache";

/**
 * Default cache TTL in milliseconds (30 seconds)
 */
const DEFAULT_CACHE_TTL_MS = 30_000;

const CHECKOUT_RETURN_MESSAGE = "BILLINGEXTENSIONS_CHECKOUT_RETURNED";
const DEFAULT_BG_ALARM_NAME = "billingextensions_status_tracking";
const DEFAULT_BG_POLL_MINUTES = 1;

const LAST_SWR_AT_KEY = "billingextensions_last_swr_at";
const SWR_COOLDOWN_MS = 5_000;

/**
 * API response types
 */
type UserStatusResponse = UserStatus;

type SessionResponse = {
  url: string;
};

/**
 * Validate client configuration
 */
function validateConfig(config: BillingExtensionsClientConfig): void {
  if (!config.appId || typeof config.appId !== "string") {
    throw createConfigError("appId is required and must be a non-empty string");
  }

  if (!config.publicKey || typeof config.publicKey !== "string") {
    throw createConfigError("publicKey is required and must be a non-empty string");
  }
}

/**
 * Create a BillingExtensions client
 *
 * @param config - Client configuration with appId and publicKey
 * @returns BillingExtensionsClient instance
 * @throws BillingExtensionsError with type "ConfigError" if configuration is invalid
 */
export function createBillingExtensionsClient(
  config: BillingExtensionsClientConfig
): BillingExtensionsClient {
  // Validate configuration
  validateConfig(config);

  // Create HTTP client
  const http = createHttpClient({
    appId: config.appId,
    publicKey: config.publicKey,
  });

  // Internal state
  let currentStatus: UserStatus | null = null;
  const handlers = new Set<StatusChangeHandler>();
  let autoSyncState = createAutoSyncState();

  /**
   * Update AutoSync state immutably
   */
  const updateAutoSyncState = (updates: Partial<AutoSyncState>) => {
    autoSyncState = { ...autoSyncState, ...updates };
  };

  /**
   * Get current AutoSync state (for use in listeners)
   */
  const getAutoSyncState = (): AutoSyncState => autoSyncState;

  /**
   * Notify all registered handlers of status change
   */
  const notifyHandlers = (next: UserStatus, prev: UserStatus | null) => {
    const diff = computeStatusDiff(prev, next);

    // Don't notify if nothing meaningful changed
    if (prev !== null && !hasAnyChange(diff)) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(next, prev, diff);
      } catch {
        // Don't let handler errors break the SDK
      }
    }
  };

  let storageListenerAttached = false;

const attachStorageStatusListener = () => {
  if (storageListenerAttached) return;
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

  storageListenerAttached = true;

  chrome.storage.onChanged.addListener((changes) => {
    const change = changes[STATUS_CACHE_KEY];
    if (!change?.newValue) return;

    const cached = change.newValue as CachedStatus;
    if (!cached?.status) return;

    // Use the storage change's oldValue for prev, not currentStatus.
    // This ensures we get the actual previous value even if doRefresh()
    // already updated currentStatus in-memory before this listener fired.
    const oldCached = change.oldValue as CachedStatus | undefined;
    const prev = oldCached?.status ?? null;
    const next = cached.status;

    currentStatus = next;
    notifyHandlers(next, prev);
  });
};

attachStorageStatusListener();

  /**
   * Load cached status from storage (session preferred, local fallback)
   */
  const loadCachedStatus = async (): Promise<UserStatus | null> => {
    try {
      const cached = await getFromBestStorage<CachedStatus>(STATUS_CACHE_KEY);

      if (!cached) {
        return null;
      }

      // Check if cache is stale
      const age = Date.now() - cached.fetchedAt;
      if (age > DEFAULT_CACHE_TTL_MS) {
        return null;
      }

      return cached.status;
    } catch {
      // Storage errors shouldn't break the SDK
      return null;
    }
  };

  /**
   * Save status to cache (session preferred, local fallback)
   */
  const saveCachedStatus = async (status: UserStatus): Promise<void> => {
    try {
      const cached: CachedStatus = {
        status,
        fetchedAt: Date.now(),
      };
      await setInBestStorage(STATUS_CACHE_KEY, cached);
    } catch {
      // Storage errors shouldn't break the SDK
    }
  };

  /**
   * Fetch status from API
   */
  const fetchStatus = async (): Promise<UserStatus> => {
    const response = await http.get<UserStatusResponse>("api/v1/sdk/user");
    return response;
  };

  /**
   * Core refresh implementation
   * 
   * Note: We don't call notifyHandlers() here because saveCachedStatus() writes
   * to chrome.storage, which triggers the storage.onChanged listener. That listener
   * is the single source of truth for notifying handlers - this ensures all tabs
   * get notified consistently and we don't get duplicate notifications.
   */
  const doRefresh = async (): Promise<UserStatus> => {
    const next = await fetchStatus();

    // Update current status
    currentStatus = next;

    // Cache the new status - this triggers storage.onChanged which notifies handlers
    await saveCachedStatus(next);

    return next;
  };

/**
 * Wrapper for AutoSync refresh (doesn't throw) + dedupes in-flight requests
 */
let refreshInFlight: Promise<void> | null = null;

const autoSyncRefresh = async (): Promise<void> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      await doRefresh();
    } catch {
      // AutoSync errors are silent
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

let swrCheckInFlight: Promise<void> | null = null;

const schedulePaidSWRRevalidate = (): void => {
  // avoid stacking multiple storage reads in a single popup open
  if (swrCheckInFlight) return;

  swrCheckInFlight = (async () => {
    try {
      const last = (await getFromBestStorage<number>(LAST_SWR_AT_KEY)) ?? 0;
      const now = Date.now();

      if (now - last < SWR_COOLDOWN_MS) return;

      // persist before refresh so rapid reopens don't spam
      await setInBestStorage(LAST_SWR_AT_KEY, now);

      // silent refresh (deduped)
      await autoSyncRefresh();
    } catch {
      // ignore: storage failures shouldn't break UX
    } finally {
      swrCheckInFlight = null;
    }
  })();
};

  // Background tracking state (per client instance)
let backgroundTrackingEnabled = false;
let alarmListenerAttached = false;
let messageListenerAttached = false;

/**
 * Enable background status tracking.
 * - Always listens for a content-script "checkout returned" message (instant refresh)
 * - Optionally enables chrome.alarms polling if available/allowed (no hard requirement)
 */
const enableBackgroundStatusTracking = (opts?: { periodInMinutes?: number }): void => {
  if (backgroundTrackingEnabled) return;
  backgroundTrackingEnabled = true;

  const periodInMinutes = opts?.periodInMinutes ?? DEFAULT_BG_POLL_MINUTES;

  // 1) Instant refresh trigger via message (works without alarms)
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage && !messageListenerAttached) {
    messageListenerAttached = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === CHECKOUT_RETURN_MESSAGE) {
        void autoSyncRefresh(); // silently refresh + write cache + notify
        sendResponse?.({ ok: true });
        return true;
      }
      return false;
    });
  }

  // 2) Optional polling via alarms (only if permission/API exists)
  if (typeof chrome !== "undefined" && chrome.alarms?.create && chrome.alarms?.onAlarm) {
    try {
      chrome.alarms.create(DEFAULT_BG_ALARM_NAME, { periodInMinutes });
    } catch {
      // likely missing "alarms" permission — ignore
    }

    if (!alarmListenerAttached) {
      alarmListenerAttached = true;

      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === DEFAULT_BG_ALARM_NAME) {
          void autoSyncRefresh();
        }
      });
    }
  }

  // 3) Kick once so cache is warm
  void autoSyncRefresh();
};

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  const client: BillingExtensionsClient = {
    async getUser(opts?: GetUserOptions): Promise<UserStatus> {
      try {
        const forceRefresh = opts?.forceRefresh === true;

        // Return cached if available and not forcing refresh
        if (!forceRefresh && currentStatus !== null) {
          return currentStatus;
        }

        // Try to load from storage cache
        if (!forceRefresh) {
          const cached = await loadCachedStatus();
          if (cached !== null) {
            currentStatus = cached;
          
            // SWR only when cache says paid (fixes paid->unpaid needing 2 opens)
            if (cached.paid === true) {
              schedulePaidSWRRevalidate();
            }
          
            return cached;
          }
        }

        // Fetch from API
        return await doRefresh();
      } catch (error) {
        const e = error as any;

        console.error("[BillingExtensionsSDK] getUser failed");
        console.error("type:", e?.type);
        console.error("message:", e?.message);
      
        // If your errors sometimes include extra fields:
        console.error("full error object:", e);
      
        throw normalizeError(error);
      }
    },

    async refresh(): Promise<UserStatus> {
      try {
        return await doRefresh();
      } catch (error) {
        throw normalizeError(error);
      }
    },

    async openManageBilling(): Promise<void> {
      try {
        const response = await http.post<SessionResponse>("api/v1/sdk/paywall-sessions");
        console.log("[BillingExtensionsSDK] paywall session response:", response);
console.log("[BillingExtensionsSDK] paywall session url:", response?.url, typeof response?.url);
        await openUrl(response.url);

        // Mark that we should refresh on next focus
        markPendingPostActionRefresh(updateAutoSyncState);
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onStatusChanged(handler: StatusChangeHandler): () => void {
      handlers.add(handler);

      // Immediately notify with current status if available
      // This ensures new subscribers don't miss updates from in-flight SWR
      if (currentStatus !== null) {
        try {
          handler(currentStatus, null, {
            entitlementChanged: true,
            planChanged: currentStatus.plan != null,
            usageChanged: false,
          });
        } catch {
          // Don't let handler errors break the SDK
        }
      }

      return () => {
        handlers.delete(handler);
      };
    },

    enableAutoSync(opts?: AutoSyncOptions): void {
      // Update options if provided
      if (opts) {
        autoSyncState = mergeAutoSyncOptions(autoSyncState, opts);
      }

      // Mark as enabled
      updateAutoSyncState({ enabled: true });

      // Activate if not already activated
      void activateAutoSync(getAutoSyncState, autoSyncRefresh, updateAutoSyncState);
    },

    enableBackgroundStatusTracking(opts?: { periodInMinutes?: number }): void {
      enableBackgroundStatusTracking(opts);
    },

    disableAutoSync(): void {
      updateAutoSyncState({ enabled: false });
      deactivateAutoSync(autoSyncState, updateAutoSyncState);
    },

    async getPlans(): Promise<PlanForSDK[]> {
      try {
        const response = await http.get<PlanForSDK[]>("api/v1/sdk/plans");
        return response;
      } catch (error) {
        throw normalizeError(error);
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-initialization
  // ═══════════════════════════════════════════════════════════════════════════

  // AutoSync is enabled by default - activate it
  // (will only actually activate in extension UI contexts via protocol guard)
  void activateAutoSync(getAutoSyncState, autoSyncRefresh, updateAutoSyncState);

  return client;
}

/**
 * Re-export default AutoSync options for reference
 */
export { DEFAULT_AUTOSYNC_OPTIONS };
