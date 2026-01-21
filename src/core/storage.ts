/**
 * Chrome Storage Wrapper
 *
 * Provides a unified interface for chrome.storage.local and chrome.storage.session.
 * Handles environments where chrome APIs may not be available.
 */

import { createRuntimeError, type BillingExtensionsError } from "./errors.js";

/**
 * Check if Chrome storage API is available
 */
function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage !== undefined &&
    chrome.storage.local !== undefined
  );
}

/**
 * Check if session storage is available (MV3)
 */
function isSessionStorageAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage !== undefined &&
    chrome.storage.session !== undefined
  );
}

/**
 * Get a value from chrome.storage.local
 */
export async function getFromLocalStorage<T>(key: string): Promise<T | undefined> {
  if (!isChromeStorageAvailable()) {
    throw createRuntimeError("chrome.storage.local is not available");
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result: { [key: string]: unknown }) => {
      if (chrome.runtime.lastError) {
        reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage read failed"));
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

/**
 * Set a value in chrome.storage.local
 */
export async function setInLocalStorage<T>(key: string, value: T): Promise<void> {
  if (!isChromeStorageAvailable()) {
    throw createRuntimeError("chrome.storage.local is not available");
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage write failed"));
        return;
      }
      resolve();
    });
  });
}

/**
 * Get a value from chrome.storage.session (falls back to local if unavailable)
 */
export async function getFromSessionStorage<T>(key: string): Promise<T | undefined> {
  // Try session storage first (MV3)
  if (isSessionStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.get([key], (result: { [key: string]: unknown }) => {
        if (chrome.runtime.lastError) {
          reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage read failed"));
          return;
        }
        resolve(result[key] as T | undefined);
      });
    });
  }

  // Fall back to local storage
  return getFromLocalStorage<T>(key);
}

/**
 * Set a value in chrome.storage.session (falls back to local if unavailable)
 */
export async function setInSessionStorage<T>(key: string, value: T): Promise<void> {
  // Try session storage first (MV3)
  if (isSessionStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage write failed"));
          return;
        }
        resolve();
      });
    });
  }

  // Fall back to local storage
  return setInLocalStorage<T>(key, value);
}

/**
 * Remove a value from session storage
 */
export async function removeFromSessionStorage(key: string): Promise<void> {
  if (isSessionStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage remove failed"));
          return;
        }
        resolve();
      });
    });
  }

  // Fall back to local storage
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(createRuntimeError(chrome.runtime.lastError.message ?? "Storage remove failed"));
          return;
        }
        resolve();
      });
    });
  }
}

/**
 * Safe wrapper that catches storage errors and returns them as BillingExtensionsError
 */
export async function safeStorageGet<T>(
  getter: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: BillingExtensionsError }> {
  try {
    const value = await getter();
    return { ok: true, value };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      typeof (error as { type: unknown }).type === "string"
    ) {
      return { ok: false, error: error as BillingExtensionsError };
    }
    return { ok: false, error: createRuntimeError(String(error)) };
  }
}
