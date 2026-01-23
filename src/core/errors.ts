export type BillingExtensionsErrorType =
  | "ConfigError"
  | "RuntimeError"
  | "NetworkError"
  | "Unauthorized"
  | "ApiError";

export class BillingExtensionsError extends Error {
  type: BillingExtensionsErrorType;
  status?: number;
  code?: string;

  constructor(
    type: BillingExtensionsErrorType,
    message: string,
    opts?: { status?: number; code?: string; cause?: unknown }
  ) {
    super(message, opts?.cause ? ({ cause: opts.cause } as any) : undefined);

    this.type = type;

    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.code !== undefined) this.code = opts.code;

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "BillingExtensionsError";
  }
}

export function isBillingExtensionsError(error: unknown): error is BillingExtensionsError {
  return error instanceof BillingExtensionsError;
}

export function createConfigError(message: string) {
  return new BillingExtensionsError("ConfigError", message);
}

export function createRuntimeError(message: string, cause?: unknown) {
  return new BillingExtensionsError("RuntimeError", message, { cause });
}

export function createNetworkError(message: string, cause?: unknown) {
  return new BillingExtensionsError("NetworkError", message, { cause });
}

export function createUnauthorizedError(message: string, cause?: unknown) {
  return new BillingExtensionsError("Unauthorized", message, { status: 401, cause });
}

export function createApiError(
  status: number,
  message: string,
  code?: string,
  cause?: unknown
) {
  const opts: { status?: number; code?: string; cause?: unknown } = { status, cause };

  if (code !== undefined) opts.code = code;

  return new BillingExtensionsError("ApiError", message, opts);
}

export function normalizeError(error: unknown): BillingExtensionsError {
  if (error instanceof BillingExtensionsError) return error;

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return createNetworkError("Request was aborted", error);
    }

    if (
      error.name === "TypeError" &&
      (error.message.toLowerCase().includes("fetch") ||
        error.message.toLowerCase().includes("network"))
    ) {
      return createNetworkError(error.message, error);
    }

    return createRuntimeError(error.message || "An unknown error occurred", error);
  }

  if (typeof error === "string") {
    return createRuntimeError(error);
  }

  // This is your #<Object> case — capture something
  let msg = "An unknown error occurred";
  try {
    msg = typeof error === "object" ? JSON.stringify(error) : String(error);
  } catch {
    // ignore
  }
  return createRuntimeError(msg, error);
}
