/**
 * Status Diff Utilities
 *
 * Compares UserStatus objects to determine what has changed.
 */

import type { StatusDiff, UserStatus } from "../client/types.js";

/**
 * Compare two UserStatus objects and return what changed
 */
export function computeStatusDiff(prev: UserStatus | null, next: UserStatus): StatusDiff {
  return {
    entitlementChanged: computeEntitlementChanged(prev, next),
    planChanged: computePlanChanged(prev, next),
    usageChanged: computeUsageChanged(prev, next),
  };
}

/**
 * Check if entitlement changed
 */
function computeEntitlementChanged(prev: UserStatus | null, next: UserStatus): boolean {
  if (prev === null) return true;
  return prev.paid !== next.paid;
}

/**
 * Check if plan changed
 * Compares: id, nickname, status, currentPeriodEnd
 */
function computePlanChanged(prev: UserStatus | null, next: UserStatus): boolean {
  if (prev === null) return next.plan !== undefined && next.plan !== null;

  const prevPlan = prev.plan;
  const nextPlan = next.plan;

  // Both undefined or null - no change
  if ((prevPlan === undefined || prevPlan === null) && (nextPlan === undefined || nextPlan === null)) return false;

  // One undefined/null, one not - changed
  if (prevPlan === undefined || prevPlan === null || nextPlan === undefined || nextPlan === null) return true;

  // Compare all plan fields
  return (
    prevPlan.id !== nextPlan.id ||
    prevPlan.nickname !== nextPlan.nickname ||
    prevPlan.status !== nextPlan.status ||
    prevPlan.currentPeriodEnd !== nextPlan.currentPeriodEnd
  );
}

/**
 * Check if usage changed
 * Compares: used, limit, resetsAt
 */
function computeUsageChanged(prev: UserStatus | null, next: UserStatus): boolean {
  if (prev === null) return next.usage !== undefined && next.usage !== null;

  const prevUsage = prev.usage;
  const nextUsage = next.usage;

  // Both undefined or null - no change
  if ((prevUsage === undefined || prevUsage === null) && (nextUsage === undefined || nextUsage === null)) return false;

  // One undefined/null, one not - changed
  if (prevUsage === undefined || prevUsage === null || nextUsage === undefined || nextUsage === null) return true;

  // Compare all usage fields
  return (
    prevUsage.used !== nextUsage.used ||
    prevUsage.limit !== nextUsage.limit ||
    prevUsage.resetsAt !== nextUsage.resetsAt
  );
}

/**
 * Check if any meaningful change occurred
 */
export function hasAnyChange(diff: StatusDiff): boolean {
  return diff.entitlementChanged || diff.planChanged || diff.usageChanged;
}

/**
 * Check if two UserStatus objects are meaningfully equal
 * (all compared fields are the same)
 */
export function areStatusesEqual(a: UserStatus | null, b: UserStatus | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  const diff = computeStatusDiff(a, b);
  return !hasAnyChange(diff);
}
