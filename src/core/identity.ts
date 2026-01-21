/**
 * Identity Management
 *
 * Handles the persistent extensionUserId stored in chrome.storage.local.
 */

import { getFromLocalStorage, setInLocalStorage } from "./storage.js";

/**
 * Storage key for the extension user ID
 */
const EXTENSION_USER_ID_KEY = "extensionUserId";

/**
 * Cached user ID to avoid repeated storage reads
 */
let cachedUserId: string | null = null;

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID() if available, otherwise falls back to manual generation
 */
function generateUUID(): string {
  // Try native crypto.randomUUID() first
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 generation using crypto.getRandomValues()
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (8, 9, a, or b)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  // Last resort fallback using Math.random() (not cryptographically secure)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create the extension user ID
 *
 * - Reads from chrome.storage.local
 * - If missing, generates a UUID and stores it
 * - Caches the result in memory
 */
export async function getOrCreateExtensionUserId(): Promise<string> {
  // Return cached value if available
  if (cachedUserId !== null) {
    return cachedUserId;
  }

  // Try to read from storage
  const storedId = await getFromLocalStorage<string>(EXTENSION_USER_ID_KEY);

  if (storedId !== undefined && typeof storedId === "string" && storedId.length > 0) {
    cachedUserId = storedId;
    return storedId;
  }

  // Generate new ID
  const newId = generateUUID();

  // Store it
  await setInLocalStorage(EXTENSION_USER_ID_KEY, newId);

  // Cache it
  cachedUserId = newId;

  return newId;
}

/**
 * Get the cached user ID without making storage calls
 * Returns null if not yet loaded
 */
export function getCachedExtensionUserId(): string | null {
  return cachedUserId;
}

/**
 * Clear the cached user ID (mainly for testing)
 */
export function clearCachedExtensionUserId(): void {
  cachedUserId = null;
}

/**
 * Get the Chrome extension ID if available
 */
export function getExtensionId(): string | undefined {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return chrome.runtime.id;
  }
  return undefined;
}
