/**
 * BillingExtensions SDK Example - Background Service Worker
 *
 * This shows how to use the SDK in a MV3 service worker context.
 * The SDK is fully MV3-safe and doesn't rely on persistent state.
 *
 * Note: AutoSync only activates in extension UI pages (popup, options),
 * NOT in the service worker. In the service worker, you call methods explicitly.
 */

// In production, import like:
// import { createBillingExtensionsClient } from '@billingextensions/sdk';

const CONFIG = {
  appId: "your-app-id-from-dashboard",
  publicKey: "pk_test_your-public-key",
};

/**
 * Initialize client on demand
 *
 * In MV3 service workers, avoid keeping global state.
 * Create the client fresh when needed - it will reuse the
 * extensionUserId from chrome.storage.local automatically.
 */
async function getClient() {
  // In production:
  // const { createBillingExtensionsClient } = await import('@billingextensions/sdk');
  // return createBillingExtensionsClient(CONFIG);

  // For demo, return null
  return null;
}

/**
 * Example: Check entitlement before allowing a feature
 */
async function checkEntitlement() {
  const client = await getClient();
  if (!client) {
    console.log("[Demo] SDK not configured - skipping entitlement check");
    return false;
  }

  try {
    const status = await client.getUser();
    return status.entitled;
  } catch (error) {
    console.error("Failed to check entitlement:", error);
    return false;
  }
}

/**
 * Example: Respond to messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_ENTITLEMENT") {
    // Handle async response
    checkEntitlement()
      .then((entitled) => {
        sendResponse({ entitled });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (message.type === "GET_USER_STATUS") {
    getClient()
      .then(async (client) => {
        if (!client) {
          sendResponse({ error: "SDK not configured" });
          return;
        }
        const status = await client.getUser();
        sendResponse({ status });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });

    return true;
  }
});

/**
 * Example: Listen for extension install/update
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`Extension ${details.reason}:`, details);

  // On install, you might want to pre-fetch user status
  // so it's cached when they open the popup
  if (details.reason === "install") {
    getClient()
      .then(async (client) => {
        if (client) {
          await client.getUser();
          console.log("Pre-fetched user status on install");
        }
      })
      .catch((error) => {
        console.error("Failed to pre-fetch status:", error);
      });
  }
});

console.log("BillingExtensions Example - Service Worker loaded");
