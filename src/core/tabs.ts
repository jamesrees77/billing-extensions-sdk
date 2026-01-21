/**
 * Tab Opening Utilities
 *
 * Handles opening URLs in new tabs, supporting both
 * chrome.tabs API (service worker) and window.open (UI context).
 */

import { createRuntimeError, type BillingExtensionsError } from "./errors.js";

/**
 * Check if chrome.tabs API is available
 */
function isChromeTabsAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    chrome.tabs !== undefined &&
    typeof chrome.tabs.create === "function"
  );
}

/**
 * Open a URL in a new tab
 *
 * Uses chrome.tabs.create when available (service worker, background),
 * falls back to window.open for UI contexts.
 */
export async function openUrl(url: string): Promise<void> {
  // Validate URL
  if (!url || typeof url !== "string") {
    throw createRuntimeError("Invalid URL provided");
  }

  try {
    // Prefer chrome.tabs.create
    if (isChromeTabsAvailable()) {
      await openWithChromeTabsApi(url);
      return;
    }

    // Fall back to window.open for UI pages
    if (typeof window !== "undefined" && typeof window.open === "function") {
      openWithWindowOpen(url);
      return;
    }

    throw createRuntimeError(
      "No method available to open URL. Neither chrome.tabs nor window.open is accessible."
    );
  } catch (error) {
    // Re-throw if already a BillingExtensionsError
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      typeof (error as { type: unknown }).type === "string"
    ) {
      throw error as BillingExtensionsError;
    }

    throw createRuntimeError(
      `Failed to open URL: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Open URL using chrome.tabs.create
 */
function openWithChromeTabsApi(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, () => {
      if (chrome.runtime.lastError) {
        reject(createRuntimeError(chrome.runtime.lastError.message ?? "Failed to create tab"));
        return;
      }
      resolve();
    });
  });
}

/**
 * Open URL using window.open
 */
function openWithWindowOpen(url: string): void {
  const newWindow = window.open(url, "_blank");

  if (!newWindow) {
    throw createRuntimeError(
      "Failed to open new window. Pop-up blocker may be preventing this action."
    );
  }
}
