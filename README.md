# BillingExtensionsSDK

Accept payments in your Chrome extension (subscriptions + paid access) with a simple SDK that stays in sync **without requiring a content script**.

```js
// background.js (service worker)
import BillingExtensionsSDK from "@billingextensions/sdk";

const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: "my-new-app",
  publicKey: "app_publicKey",
});
client.enableBackgroundStatusTracking();
```

---

## Menu

- [Secure server-side API](#secure-server-side-api-optional--the-sdk-works-without-this)
- [Important setup order](#important-setup-order-dont-skip-this)
- [Install](#install)
  - [Option A — npm](#option-a--npm-recommended)
  - [Init](#init-recommended)
  - [Option B — drop in the dist file](#option-b--drop-in-the-dist-file-no-npm)
- [Required Chrome permissions](#before-you-start-required-chrome-permissions---already-done-if-you-ran-the-init-script)
- [Quick start (MV3 service worker)](#quick-start-mv3-service-worker---already-done-if-you-ran-the-init-script)
- [Using the SDK](#using-the-sdk)
  - [Gating paid features](#gating-paid-features)
  - [Listening for updates](#listening-for-updates)
  - [Open billing / manage subscription](#open-billing--manage-subscription)
  - [Get available plans](#get-available-plans)
  - [AutoSync & background tracking](#autosync--background-tracking)
  - [Force refresh (skip caches)](#force-refresh-skip-caches)
- [How it works](#how-it-works-in-plain-english)
- [No content script required](#no-content-script-required-default)
- [Instant updates (optional content script)](#instant-updates-optional-content-script)
- [Types](#types)
- [Full API Reference](#full-api-reference)
- [Troubleshooting](#troubleshooting)
- [License / Support](#license--support)

---

## Secure server-side API (optional — the SDK works without this)

The SDK is designed to be secure even if you don’t run a backend. However, if your extension has a backend (recommended for anything sensitive), you can verify subscription status server-side using the BillingExtensions API: **https://billingextensions.com/docs**.

This is useful when you need to:
- gate paid features securely (don’t trust the client alone)
- protect expensive operations (e.g. LLM calls)
- keep your own database in sync with BillingExtensions/Stripe
- stop sending subscription status from the extension to your backend — your server can check it directly via HTTPS whenever it needs to

---

## Important setup order (don’t skip this)

1) **Sign up to BillingExtensions** (https://billingextensions.com)  
2) **Connect Stripe** in the BillingExtensions dashboard  
3) **Create your App** (your extension)  
4) **Create your Plans** (subscriptions / tiers)  
5) Add the SDK to your extension and initialize it

> Take these steps before following the rest of this guide.

---

## Install

### Option A — npm (recommended)

```bash
npm install @billingextensions/sdk
```

### Init (recommended)

The init script scaffolds the minimum setup for you:

- adds the required `permissions` (and optional `alarms`) in `manifest.json`
- adds required `host_permissions` (if needed)
- generates a ready-to-run MV3 service worker example (the “Quick start” setup)

```bash
npx billingextensions init <appId> <publicKey>
```

> You can still set everything up manually if you prefer — init is just a shortcut.

---

### Option B — drop in the dist file (no npm)

If you don’t want npm, copy the prebuilt file(s) into your extension:

- `dist/BillingExtensionsSDK.js`  
  Use for classic `<script>` include (non-module).
- `dist/BillingExtensionsSDK.module.js`  
  Use for ESM import (`type="module"` / bundlers).
- `dist/BillingExtensionsSDK.content.js`  
  Optional content script for **instant** post-checkout refresh messaging.
- `dist/index.cjs`  
  CommonJS build (Node/bundlers that want CJS).

---

## Before you start: required Chrome permissions - (already done if you ran the init script)

BillingExtensionsSDK uses Chrome storage for caching and cross-context sync.

Add this to your `manifest.json` **before** initializing the client:

```json
{
  "permissions": ["storage"],
  "host_permissions": ["https://billingextensions.com/*"]
}
```

> Note: `host_permissions` should match the BillingExtensions API domain your extension calls.

### Optional (recommended): background polling via alarms - (already done if you ran the init script)

If you want the SDK to poll in the background (default: ~1 minute *while an extension UI stays open*), also add:

```json
{
  "permissions": ["storage", "alarms"]
}
```

> If you don’t add `alarms`, the SDK will still work — it just won’t schedule alarm-based polling.

---

## Quick start (MV3 service worker) - (already done if you ran the init script)

This is the typical “background-first” setup.

```js
// background.js (service worker)

import BillingExtensionsSDK from "@billingextensions/sdk";

const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: "my-new-app",
  publicKey: "app_ENNSXktPl1kOxQ2bQbb96",
});

client.enableBackgroundStatusTracking();

// ✅ Your “listener” (like extpay.onPaid)
client.onStatusChanged((next, prev, diff) => {
  if (!prev?.paid && next.paid) {
    console.log("User paid! ✅", next);
    buildContextMenu();
  }

  buildContextMenu();
  console.log("status change", { diff, prev, next });
});
```

---

## Using the SDK

### Gating paid features

```js
const status = await client.getUser();

if (!status.paid) {
  await client.openManageBilling();
  return;
}

// ✅ user is paid
```
**Returns (`Promise<UserStatus>`) — key fields (as used by the SDK)**
- `extensionUserId: string` — @description Unique identifier for this extension user
- `paid: boolean` —  @description Whether the user has an active paid subscription
- `subscriptionStatus: string` — @description Subscription status: none, active, trialing, past_due, canceled.
- `plan: PlanType (See plans below)` — @description Current plan info, or null if no subscription.
- `currentPeriodEnd: string | null` - @description End of current billing period (ISO 8601)
- `cancelAtPeriodEnd: boolean` - @description Whether the subscription will cancel at period end

> The full shape of `UserStatus` comes from the BillingExtensions OpenAPI schema (`components["schemas"]["UserStatus"]`).

---

### Listening for updates

```js
const unsubscribe = client.onStatusChanged((next, prev, diff) => {
  if (!prev?.paid && next.paid) console.log("Upgraded ✅");
  if (prev?.paid && !next.paid) console.log("Downgraded ❌");
  console.log(diff);
});

// later
unsubscribe();
```

**Handler args**
- `next: UserStatus`
- `prev: UserStatus | null`
- `diff: StatusDiff`

**StatusDiff meaning**
- `entitlementChanged` — paid access changed
- `planChanged` — plan info changed (`id`, `nickname`, `status`, `currentPeriodEnd`)
- `usageChanged` — usage info changed (`used`, `limit`, `resetsAt`)

---

### Open billing / manage subscription (if the user has paid / subscribed, use this to open up a url for them to manage the subscription)

```js
await client.openManageBilling();
```

**Returns**
- `Promise<void>`

Under the hood the SDK creates a paywall session and opens `response.url` in a new tab.

---

### Get available plans

```js
const plans = await client.getPlans();
console.log(plans);
```

**Returns (`Promise<PlansForSdk[]>`)**
- `id: string` — @description Unique identifier for this plan
- `name: string` —  @description Plan name
- `priceAmount: number` — @description Price in smallest currency unit (e.g., cents)
- `currency: string` - @description ISO 4217 currency code (e.g., usd)
- `billingType: string` - @description Billing type: one_time or recurring
- `interval: string | null` - @description Billing interval: month, year, etc. (null for one_time)
- `intervalCount: number` - @description Number of intervals between billings


---

### AutoSync & background tracking

#### AutoSync (enabled by default)

```js
client.enableAutoSync({
  // AutoSyncOptions (see DEFAULT_AUTOSYNC_OPTIONS)
});

client.disableAutoSync();
```

#### Background status tracking (recommended)

```js
client.enableBackgroundStatusTracking({ periodInMinutes: 1 });
```

**Options**
- `periodInMinutes?: number` *(default: 1)*

---

### Force refresh (skip caches)

```js
const status1 = await client.getUser({ forceRefresh: true });
const status2 = await client.refresh();
```

**Returns**
- `Promise<UserStatus>`

---

## How it works (in plain English)

- The SDK fetches the user’s status from the BillingExtensions API.
- It caches status briefly (TTL ~30s) to keep things fast.
- It writes status into `chrome.storage` so every extension context stays in sync.
- Updates happen via:
  - AutoSync (enabled by default)
  - background tracking (optional alarms polling; default 1 minute **while UI stays open**)
  - optional instant refresh messaging from the content script (if you add it)

---

## No content script required (default)

By default, you **do not need** a content script.

In normal flows, the user pays, Stripe refreshes/redirects, and when the user opens your extension again the SDK will fetch the latest status right away.

---

## Instant updates (optional content script)

If you want the UI to update instantly even while the extension UI stays open during checkout, you *can* add the provided content script build.

This is optional on purpose:
- Adding a content script often triggers extra Chrome warnings and can make the review process take longer.
- BillingExtensionsSDK defaults to a no-content-script approach to reduce review friction.

The SDK listens for a runtime message of type:

- `BILLINGEXTENSIONS_CHECKOUT_RETURNED`

---

## Types

These are the types used in the README (from your SDK’s `types.ts`).

```ts
export type BillingExtensionsClientConfig = {
  /** Immutable app ID from the BillingExtensions dashboard */
  appId: string;
  /** Publishable public key */
  publicKey: string;
};

export type GetUserOptions = {
  /** Force refresh from API, ignoring cache (default: false) */
  forceRefresh?: boolean;
};

export type StatusDiff = {
  /** True if entitled status changed */
  entitlementChanged: boolean;
  /** True if plan info changed (id, nickname, status, or currentPeriodEnd) */
  planChanged: boolean;
  /** True if usage info changed (used, limit, or resetsAt) */
  usageChanged: boolean;
};

export type StatusChangeHandler = (
  next: UserStatus,
  prev: UserStatus | null,
  diff: StatusDiff
) => void;

// OpenAPI-backed (authoritative shapes)
export type PlanForSDK = components["schemas"]["Plan"];
export type UserStatus = components["schemas"]["UserStatus"];
```

---

## Full API Reference

### `BillingExtensionsSDK.createBillingExtensionsClient(config)`

Creates a configured client.

**Params**
- `config.appId: string` *(required)*
- `config.publicKey: string` *(required)*

**Returns**
- `BillingExtensionsClient`

---

### `client.getUser(opts?)`

Fetch the current user status (cached, with SWR-style revalidation).

**Options**
- `forceRefresh?: boolean`

**Returns**
- `Promise<UserStatus>`

Key fields used by the SDK:
- `paid: boolean`
- `plan: object | null`
- `usage: object | null | undefined`

---

### `client.refresh()`

Force a fresh status fetch from the API and update the cache.

**Returns**
- `Promise<UserStatus>`

---

### `client.openManageBilling()`

Open the hosted billing / checkout page in a new tab.

**Returns**
- `Promise<void>`

---

### `client.onStatusChanged(handler)`

Subscribe to status updates across all extension contexts.

**Handler**
- `StatusChangeHandler(next, prev, diff)`

**Returns**
- `() => void` unsubscribe function

---

### `client.enableAutoSync(opts?)`

Enable automatic background syncing (enabled by default).

**Returns**
- `void`

---

### `client.disableAutoSync()`

Disable AutoSync.

**Returns**
- `void`

---

### `client.enableBackgroundStatusTracking(opts?)`

Enable background tracking:
- listens for instant refresh messages after checkout
- optionally polls via `chrome.alarms` if permitted

**Options**
- `periodInMinutes?: number` *(default: 1)*

**Returns**
- `void`

---

### `client.getPlans()`

Fetch the list of plans configured for your app.

**Returns**
- `Promise<PlanForSDK[]>`

---

## Troubleshooting

### “My UI didn’t update after checkout”

In most cases the update will feel **instant**.

That’s because Stripe typically reloads/redirects after payment, and when the user opens your extension again the SDK will fetch the latest status right away (and also revalidate in the background).

The ~1 minute timing only applies when the user **keeps your extension UI open the whole time** (e.g. they pay in another tab and never close the popup/options page). In that case, background tracking can update status on the next poll.

If you want truly instant updates even while the extension UI stays open, you can add the optional content script build — but it’s optional on purpose:

- Adding a content script often triggers extra Chrome warnings and can make the review process take longer.
- BillingExtensionsSDK defaults to a no-content-script approach to reduce review friction.

### “Alarms polling isn’t working”
- Ensure your manifest includes `"alarms"` permission.
- The SDK degrades gracefully if alarms aren’t available.

### “I’m seeing localhost URLs”
If your billing URL points to localhost in production:
- verify the app/environment base URL configuration in your dashboard/backend,
- and ensure you’re using the correct environment variables.

---

## License / Support

TODO: add your license and support contact.
