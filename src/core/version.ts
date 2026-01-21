/**
 * SDK Version - injected at build time by tsup
 */

declare const __SDK_VERSION__: string;

/**
 * Get the SDK version string
 */
export function getSDKVersion(): string {
  // __SDK_VERSION__ is defined by tsup at build time
  // Fallback for development/testing
  if (typeof __SDK_VERSION__ !== "undefined") {
    return __SDK_VERSION__;
  }
  return "0.2.0";
}
