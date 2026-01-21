/**
 * BillingExtensions SDK Example - Popup
 *
 * This is a minimal example showing how to use the SDK in a popup.
 * In a real extension, you would import from '@billingextensions/sdk'.
 *
 * Note: For this example to work, you need to:
 * 1. Build the SDK: npm run build
 * 2. Copy the built files or use a bundler
 */

// In production, import like:
// import { createBillingExtensionsClient } from '@billingextensions/sdk';

// For this example, we'll simulate the SDK structure
// Replace this with actual SDK import in production

const CONFIG = {
  appId: "your-app-id-from-dashboard",
  publicKey: "pk_test_your-public-key",
};

// DOM Elements
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const contentEl = document.getElementById("content");
const entitledStatusEl = document.getElementById("entitled-status");
const planInfoEl = document.getElementById("plan-info");
const planNameEl = document.getElementById("plan-name");
const planStatusEl = document.getElementById("plan-status");
const planRenewsEl = document.getElementById("plan-renews");
const btnCheckout = document.getElementById("btn-checkout");
const btnManage = document.getElementById("btn-manage");
const btnRefresh = document.getElementById("btn-refresh");

// SDK Client (initialize when SDK is imported)
let client = null;

/**
 * Initialize the SDK and load initial status
 */
async function init() {
  try {
    // In production, uncomment this:
    // const { createBillingExtensionsClient } = await import('@billingextensions/sdk');
    // client = createBillingExtensionsClient(CONFIG);

    // For demo purposes, show mock data
    // Remove this and use real SDK in production
    showMockDemo();
    return;

    // Real implementation:
    // const status = await client.getUser();
    // renderStatus(status);
    //
    // // Listen for status changes (AutoSync is enabled by default)
    // client.onStatusChanged((next, prev, diff) => {
    //   console.log("Status changed:", { next, prev, diff });
    //   renderStatus(next);
    // });
  } catch (err) {
    showError(err.message || "Failed to initialize");
  }
}

/**
 * Render user status to the UI
 */
function renderStatus(status) {
  hideLoading();
  showContent();

  // Entitlement status
  if (status.entitled) {
    entitledStatusEl.textContent = "✓ Entitled";
    entitledStatusEl.className = "status-value entitled";
    btnCheckout.classList.add("hidden");
  } else {
    entitledStatusEl.textContent = "✗ Not Entitled";
    entitledStatusEl.className = "status-value not-entitled";
    btnCheckout.classList.remove("hidden");
  }

  // Plan info
  if (status.plan) {
    planInfoEl.classList.remove("hidden");
    planNameEl.textContent = status.plan.nickname || status.plan.id;
    planStatusEl.textContent = formatPlanStatus(status.plan.status);
    planRenewsEl.textContent = status.plan.currentPeriodEnd
      ? formatDate(status.plan.currentPeriodEnd)
      : "-";
  } else {
    planInfoEl.classList.add("hidden");
  }
}

/**
 * Show mock demo data (remove in production)
 */
function showMockDemo() {
  hideLoading();
  showContent();

  // Show demo status
  const mockStatus = {
    extensionUserId: "demo-user-123",
    entitled: false,
    plan: undefined,
    usage: undefined,
  };

  renderStatus(mockStatus);

  // Demo button handlers
  btnCheckout.addEventListener("click", () => {
    alert(
      "In production, this would call:\nclient.openCheckout()\n\nwhich opens the Stripe checkout page."
    );
  });

  btnManage.addEventListener("click", () => {
    alert(
      "In production, this would call:\nclient.openManageBilling()\n\nwhich opens the Stripe customer portal."
    );
  });

  btnRefresh.addEventListener("click", () => {
    alert(
      "In production, this would call:\nclient.refresh()\n\nwhich fetches the latest status from the API."
    );
  });
}

/**
 * Set up real button handlers (use in production)
 */
function setupButtonHandlers() {
  btnCheckout.addEventListener("click", async () => {
    try {
      await client.openCheckout();
    } catch (err) {
      showError(err.message || "Failed to open checkout");
    }
  });

  btnManage.addEventListener("click", async () => {
    try {
      await client.openManageBilling();
    } catch (err) {
      showError(err.message || "Failed to open billing portal");
    }
  });

  btnRefresh.addEventListener("click", async () => {
    try {
      const status = await client.refresh();
      renderStatus(status);
    } catch (err) {
      showError(err.message || "Failed to refresh status");
    }
  });
}

/**
 * Format plan status for display
 */
function formatPlanStatus(status) {
  const statusMap = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    canceled: "Canceled",
    incomplete: "Incomplete",
  };
  return statusMap[status] || status;
}

/**
 * Format ISO date string
 */
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

/**
 * UI Helpers
 */
function hideLoading() {
  loadingEl.classList.add("hidden");
}

function showContent() {
  contentEl.classList.remove("hidden");
}

function showError(message) {
  hideLoading();
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

// Initialize on load
init();
