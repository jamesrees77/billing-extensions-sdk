/**
 * AutoSync Module
 *
 * Handles automatic status refresh on focus, visibility, and network changes.
 * Only activates in extension UI pages (chrome-extension://, moz-extension://).
 */

import type { AutoSyncOptions, AutoSyncState } from "../client/types.js";

/**
 * Default AutoSync options
 */
export const DEFAULT_AUTOSYNC_OPTIONS: Required<AutoSyncOptions> = {
  refreshOnInit: true,
  refreshOnFocus: true,
  refreshOnOnline: true,
  debounceMs: 300,
  minIntervalMs: 3000,
};

/**
 * Allowed protocols for AutoSync activation
 * These are extension UI page protocols - NOT content scripts
 */
const ALLOWED_PROTOCOLS = new Set([
  "chrome-extension:",
  "moz-extension:",
  "safari-extension:",
]);

/**
 * Check if the current context is an extension UI page
 *
 * AutoSync should only activate in extension UI contexts, not:
 * - Content scripts running on regular websites
 * - Service workers (no window/document)
 * - Regular web pages
 */
export function isExtensionUiContext(): boolean {
  // Must have window and document (not service worker)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  // Must have location with a protocol
  if (typeof location === "undefined" || typeof location.protocol !== "string") {
    return false;
  }

  // Check if protocol is an extension UI protocol
  return ALLOWED_PROTOCOLS.has(location.protocol);
}

/**
 * Create initial AutoSync state
 */
export function createAutoSyncState(
  options: AutoSyncOptions = {}
): AutoSyncState {
  return {
    enabled: true, // Enabled by default
    activated: false,
    options: { ...DEFAULT_AUTOSYNC_OPTIONS, ...options },
    lastRefreshAt: 0,
    debounceTimer: null,
    pendingPostActionRefresh: false,
    cleanup: null,
  };
}

/**
 * Merge new options into existing state
 */
export function mergeAutoSyncOptions(
  state: AutoSyncState,
  options: AutoSyncOptions = {}
): AutoSyncState {
  return {
    ...state,
    options: { ...state.options, ...options },
  };
}

/**
 * Check if enough time has passed since last refresh
 */
export function canRefresh(state: AutoSyncState): boolean {
  const now = Date.now();
  return now - state.lastRefreshAt >= state.options.minIntervalMs;
}

/**
 * Create a debounced refresh trigger
 *
 * @param state - Current AutoSync state
 * @param doRefresh - The actual refresh function to call
 * @param updateState - Function to update state after scheduling
 */
export function scheduleRefresh(
  state: AutoSyncState,
  doRefresh: () => Promise<void>,
  updateState: (updates: Partial<AutoSyncState>) => void
): void {
  // Clear existing timer
  if (state.debounceTimer !== null) {
    clearTimeout(state.debounceTimer);
  }

  // Check rate limit
  if (!canRefresh(state)) {
    // Schedule for when rate limit allows
    const waitTime = state.options.minIntervalMs - (Date.now() - state.lastRefreshAt);
    const timer = setTimeout(() => {
      void executeRefresh(doRefresh, updateState);
    }, waitTime);
    updateState({ debounceTimer: timer });
    return;
  }

  // Debounce the refresh
  const timer = setTimeout(() => {
    void executeRefresh(doRefresh, updateState);
  }, state.options.debounceMs);

  updateState({ debounceTimer: timer });
}

/**
 * Execute the refresh and update timing state
 */
async function executeRefresh(
  doRefresh: () => Promise<void>,
  updateState: (updates: Partial<AutoSyncState>) => void
): Promise<void> {
  updateState({ lastRefreshAt: Date.now(), debounceTimer: null });
  try {
    await doRefresh();
  } catch {
    // Errors are handled by the refresh function itself
  }
}

/**
 * Set up AutoSync event listeners
 *
 * @param state - Current AutoSync state
 * @param doRefresh - The actual refresh function to call
 * @param updateState - Function to update state
 * @returns Cleanup function to remove listeners
 */
export function setupAutoSyncListeners(
  state: AutoSyncState,
  doRefresh: () => Promise<void>,
  updateState: (updates: Partial<AutoSyncState>) => void
): () => void {
  // Guard: only activate in extension UI context
  if (!isExtensionUiContext()) {
    return () => {
      // No-op cleanup
    };
  }

  const listeners: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];

  // Helper to add tracked listeners
  const addListener = (target: EventTarget, event: string, handler: EventListener) => {
    target.addEventListener(event, handler);
    listeners.push({ target, event, handler });
  };

  // Focus/visibility handler
  if (state.options.refreshOnFocus) {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh(state, doRefresh, updateState);
      }
    };

    const handleFocus = () => {
      scheduleRefresh(state, doRefresh, updateState);
    };

    addListener(document, "visibilitychange", handleVisibility);
    addListener(window, "focus", handleFocus);
  }

  // Online handler
  if (state.options.refreshOnOnline) {
    const handleOnline = () => {
      scheduleRefresh(state, doRefresh, updateState);
    };

    addListener(window, "online", handleOnline);
  }

  // Cleanup function
  return () => {
    for (const { target, event, handler } of listeners) {
      target.removeEventListener(event, handler);
    }
    listeners.length = 0;

    // Clear any pending timer
    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
      updateState({ debounceTimer: null });
    }
  };
}

/**
 * Activate AutoSync (call once on init)
 */
export async function activateAutoSync(
  state: AutoSyncState,
  doRefresh: () => Promise<void>,
  updateState: (updates: Partial<AutoSyncState>) => void
): Promise<void> {
  // Don't activate if disabled
  if (!state.enabled) {
    return;
  }

  // Don't activate twice
  if (state.activated) {
    return;
  }

  // Guard: only activate in extension UI context
  if (!isExtensionUiContext()) {
    return;
  }

  // Set up listeners
  const cleanup = setupAutoSyncListeners(state, doRefresh, updateState);
  updateState({ activated: true, cleanup });

  // Initial refresh if enabled
  if (state.options.refreshOnInit) {
    scheduleRefresh(state, doRefresh, updateState);
  }
}

/**
 * Deactivate AutoSync
 */
export function deactivateAutoSync(
  state: AutoSyncState,
  updateState: (updates: Partial<AutoSyncState>) => void
): void {
  if (state.cleanup) {
    state.cleanup();
  }
  updateState({ activated: false, cleanup: null });
}

/**
 * Mark that a post-action refresh should happen on next focus
 * (Used after openCheckout/openManageBilling)
 */
export function markPendingPostActionRefresh(
  updateState: (updates: Partial<AutoSyncState>) => void
): void {
  updateState({ pendingPostActionRefresh: true });
}

/**
 * Clear the pending post-action refresh flag
 */
export function clearPendingPostActionRefresh(
  updateState: (updates: Partial<AutoSyncState>) => void
): void {
  updateState({ pendingPostActionRefresh: false });
}
