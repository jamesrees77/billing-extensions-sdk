/**
 * BillingExtensions SDK Error Types
 *
 * All SDK methods throw only these typed errors - never random/unknown errors.
 */

export type BillingExtensionsError =
  | { type: "ConfigError"; message: string }
  | { type: "RuntimeError"; message: string }
  | { type: "NetworkError"; message: string }
  | { type: "Unauthorized"; message: string }
  | { type: "ApiError"; status: number; code?: string; message: string };

/**
 * Type guard to check if an error is a BillingExtensionsError
 */
export function isBillingExtensionsError(error: unknown): error is BillingExtensionsError {
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, unknown>;
  return (
    typeof e["type"] === "string" &&
    ["ConfigError", "RuntimeError", "NetworkError", "Unauthorized", "ApiError"].includes(
      e["type"] as string
    ) &&
    typeof e["message"] === "string"
  );
}

/**
 * Create a ConfigError
 */
export function createConfigError(message: string): BillingExtensionsError {
  return { type: "ConfigError", message };
}

/**
 * Create a RuntimeError
 */
export function createRuntimeError(message: string): BillingExtensionsError {
  return { type: "RuntimeError", message };
}

/**
 * Create a NetworkError
 */
export function createNetworkError(message: string): BillingExtensionsError {
  return { type: "NetworkError", message };
}

/**
 * Create an Unauthorized error
 */
export function createUnauthorizedError(message: string): BillingExtensionsError {
  return { type: "Unauthorized", message };
}

/**
 * Create an ApiError
 */
export function createApiError(
  status: number,
  message: string,
  code?: string
): BillingExtensionsError {
  return code !== undefined
    ? { type: "ApiError", status, code, message }
    : { type: "ApiError", status, message };
}

/**
 * Normalize any unknown error into a BillingExtensionsError
 */
export function normalizeError(error: unknown): BillingExtensionsError {
  // Already a BillingExtensionsError
  if (isBillingExtensionsError(error)) {
    return error;
  }

  // Standard Error object
  if (error instanceof Error) {
    // Network-related errors
    if (
      error.name === "TypeError" &&
      (error.message.includes("fetch") || error.message.includes("network"))
    ) {
      return createNetworkError(error.message);
    }
    if (error.name === "AbortError") {
      return createNetworkError("Request was aborted");
    }
    return createRuntimeError(error.message);
  }

  // String error
  if (typeof error === "string") {
    return createRuntimeError(error);
  }

  // Unknown error type
  return createRuntimeError("An unknown error occurred");
}
