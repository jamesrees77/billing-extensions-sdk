/**
 * HTTP Client
 *
 * Provides a type-safe fetch wrapper with proper error handling,
 * timeout support, and BillingExtensions-specific headers.
 */

import {
  createApiError,
  createNetworkError,
  createUnauthorizedError,
  normalizeError,
} from "./errors.js";
import { getExtensionId, getOrCreateExtensionUserId } from "./identity.js";
import { getSDKVersion } from "./version.js";

/**
 * Production API origin - not configurable publicly
 */
const API_ORIGIN = "https://billingextensions.com/";

/**
 * Internal development override (not exported)
 * Can be set via environment or build-time injection for local dev
 */
declare const __DEV_API_ORIGIN__: string | undefined;

function getApiOrigin(): string {
  // Allow internal dev override (never exposed to public API)
  if (typeof __DEV_API_ORIGIN__ !== "undefined" && __DEV_API_ORIGIN__) {
    return __DEV_API_ORIGIN__;
  }
  return API_ORIGIN;
}

function isNgrokOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).host;
    return host.includes("ngrok");
  } catch {
    return false;
  }
}

/**
 * Detect if the extension is running in development mode (unpacked).
 * Unpacked extensions don't have an update_url in their manifest,
 * while store-installed extensions do.
 */
async function isDevelopmentMode(): Promise<boolean> {
 
  try {
    if (typeof chrome !== "undefined") {
      const info = await chrome.management.getSelf();
      // Unpacked extensions don't have update_url
      return info.installType === "development";
    }
  } catch {
    // If we can't determine, assume not in dev mode
  }
  return false;
}

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * HTTP request configuration
 */
export type HttpRequestConfig = {
  appId: string;
  publicKey: string;
  /** Optional fetch implementation for dependency injection (testing) */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
};

/**
 * HTTP request options
 */
type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
};

/**
 * API response shape for error responses
 */
type ApiErrorResponse = {
  error?: {
    message?: string;
    code?: string;
  };
  message?: string;
  code?: string;
};

/**
 * Make an HTTP request to the BillingExtensions API
 */
export async function httpRequest<T>(
  config: HttpRequestConfig,
  options: RequestOptions
): Promise<T> {
  const { appId, publicKey, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  const { method, path, body } = options;

  // Get extension user ID (creates if necessary)
  const extensionUserId = await getOrCreateExtensionUserId();

  // Build URL
  const url = `${getApiOrigin()}${path}`;
  

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${publicKey}`,
    "X-App-Id": appId,
    "X-Extension-User-Id": extensionUserId,
    "X-SDK-Version": getSDKVersion(),
    "X-Test-Mode": (await isDevelopmentMode()) ? "true" : "false",
  };

    // Ngrok: skip the browser warning/interstitial (prevents HTML responses)
    if (isNgrokOrigin(getApiOrigin())) {
      headers["ngrok-skip-browser-warning"] = "true";
    }

  // Add extension ID if available
  const extensionId = getExtensionId();
  if (extensionId) {
    headers["X-Extension-Id"] = extensionId;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Build request options - only include body if provided (exactOptionalPropertyTypes)
    const requestInit: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetchImpl(url, requestInit);

    clearTimeout(timeoutId);

    // Handle non-OK responses
    if (!response.ok) {
      return handleErrorResponse(response);
    }


    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      // Try to capture something meaningful for debugging
      const text = await response.text().catch(() => "");
      const snippet = text.replace(/\s+/g, " ").slice(0, 200);
    
      // Use ApiError to preserve status, but include method/url + content-type
      throw createApiError(
        response.status,
        [
          `Expected JSON but got "${contentType || "unknown"}".`,
          `method=${method}`,
          `url=${url}`,
          `snippet="${snippet}"`,
        ].join(" ")
      );
    }

    // Parse successful response
    const data: unknown = await response.json();
    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createNetworkError(`Request timed out after ${timeoutMs}ms`);
    }

    // Handle fetch errors (network issues)
    if (error instanceof TypeError) {
      throw createNetworkError(error.message || "Network request failed");
    }

    // Re-throw if already a BillingExtensionsError
    throw normalizeError(error);
  }
}

/**
 * Handle error responses from the API
 */
async function handleErrorResponse(response: Response): Promise<never> {
  const status = response.status;

  // Try to parse error body
  let errorBody: ApiErrorResponse | null = null;
  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    // Body might not be JSON
  }

  // Extract message and code
  const message =
    errorBody?.error?.message ?? errorBody?.message ?? response.statusText ?? "Unknown error";
  const code = errorBody?.error?.code ?? errorBody?.code;

  // Handle specific status codes
  if (status === 401) {
    throw createUnauthorizedError(message);
  }

  throw createApiError(status, message, code);
}

/**
 * Create a configured HTTP client factory
 */
export function createHttpClient(config: HttpRequestConfig) {
  return {
    get: <T>(path: string) => httpRequest<T>(config, { method: "GET", path }),
    post: <T>(path: string, body?: unknown) => httpRequest<T>(config, { method: "POST", path, body }),
    put: <T>(path: string, body?: unknown) => httpRequest<T>(config, { method: "PUT", path, body }),
    delete: <T>(path: string) => httpRequest<T>(config, { method: "DELETE", path }),
  };
}
