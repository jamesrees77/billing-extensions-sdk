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
    const response = await http.post<UserStatusResponse>("/v1/sdk/user", {});
    return response;
  };

  /**
   * Core refresh implementation
   */
  const doRefresh = async (): Promise<UserStatus> => {
    const prev = currentStatus;
    const next = await fetchStatus();

    // Update current status
    currentStatus = next;

    // Cache the new status
    await saveCachedStatus(next);

    // Notify handlers
    notifyHandlers(next, prev);

    return next;
  };

  /**
   * Wrapper for AutoSync refresh (doesn't throw)
   */
  const autoSyncRefresh = async (): Promise<void> => {
    try {
      await doRefresh();
    } catch {
      // AutoSync errors are silent
    }
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
            return cached;
          }
        }

        // Fetch from API
        return await doRefresh();
      } catch (error) {
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
        const response = await http.post<SessionResponse>("/v1/sdk/paywall-sessions", {});
        await openUrl(response.url);

        // Mark that we should refresh on next focus
        markPendingPostActionRefresh(updateAutoSyncState);
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onStatusChanged(handler: StatusChangeHandler): () => void {
      handlers.add(handler);

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

    disableAutoSync(): void {
      updateAutoSyncState({ enabled: false });
      deactivateAutoSync(autoSyncState, updateAutoSyncState);
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
