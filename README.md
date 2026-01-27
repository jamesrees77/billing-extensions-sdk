# BillingExtensionsSDK

Accept payments in your Chrome extension (subscriptions + paid access) with a simple SDK that stays in sync **without requiring a content script**. 

---

## Secure server-side API (recommended if you have a backend - but not needed. The SDK will work without.)

If your extension has a backend (recommended for anything sensitive), you can verify subscription status server-side using the BillingExtensions API: **<LINK TO API>**.

This is useful when you need to:
- gate paid features securely (don’t trust the client alone),
- protect expensive operations (e.g. LLM calls),
- keep your own database in sync with BillingExtensions/Stripe.

Because entitlement checks happen over HTTPS on your server, you avoid exposing “paid/unpaid” logic purely in the extension — and you can keep most payment logic off the client entirely.


## Important setup order (don’t skip this)

1) **Connect Stripe** in the BillingExtensions dashboard  
2) **Create your App** (your extension)  
3) **Create your Plans** (subscriptions / tiers)  
4) Add the SDK to your extension and initialize it

> You **cannot create the app** until Stripe is connected.

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
  "permissions": ["storage"]
  "host_permissions": [
    "https://billingextensions.com/*"
  ],
}
```

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

// If using npm/bundler:
import BillingExtensionsSDK from "<PACKAGE_NAME_PLACEHOLDER>"; // placeholder

// If using dist directly (example):
// import BillingExtensionsSDK from "./BillingExtensionsSDK.module.js";

const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: "my-new-app",
  publicKey: "app_ENNSXktPl1kOxQ2bQbb96",
});

// Enables:
// - message-based instant refresh triggers
// - optional alarms-based polling (if permission exists)
client.enableBackgroundStatusTracking();

// ✅ Your “listener” (like extpay.onPaid)
client.onStatusChanged((next, prev, diff) => {
  // paid just flipped false -> true
  if (!prev?.paid && next.paid) {
    console.log("User paid! ✅", next);
    // do premium logic here (rebuild menus, unlock background features, etc.)
    buildContextMenu();
  }

  // you can also rebuild on any change
  buildContextMenu();

  console.log("status change", { diff, prev, next });
});
```

---

## Gating paid features

When you need to check if the user is paid:

```js
const status = await client.getUser();

if (!status.paid) {
  await client.openManageBilling(); // sends them to checkout / manage page
  return;
}

// ✅ user is paid
```

### Force refresh (skip caches)

```js
const status = await client.getUser({ forceRefresh: true });
```

Or:

```js
const status = await client.refresh();
```

---

## How it works (in plain English)

- The SDK fetches the user’s status from the BillingExtensions API (`GET api/v1/sdk/user`).
- It caches status briefly (storage TTL ~30s) to keep things fast.
- It writes the latest status into `chrome.storage`.
- Every extension context (background/popup/options) can listen to the same storage change event and update consistently.
- Updates happen via:
  - **AutoSync** (enabled by default)
  - **Background tracking** (optional alarms-based polling, default ~1 minute while an extension UI stays open)
  - **Optional instant refresh** via content-script messaging when the user returns from checkout

---

## No content script required (default)

By default, you **do not need** a content script.

This means:
- fewer warnings,
- less surface area,
- and the SDK still stays updated via refresh + polling.

In normal flows, the user pays, Stripe refreshes/redirects, and when the user opens your extension again the SDK will fetch the latest status right away.

---

## Instant updates (optional content script)

If you want the UI to update instantly even while the extension UI stays open during checkout, you *can* add the provided content script build.

This is optional on purpose:
- Adding a content script often triggers extra Chrome warnings and can make the review process take longer.
- BillingExtensionsSDK defaults to a no-content-script approach to reduce review friction.

The SDK listens for a runtime message of type:

- `BILLINGEXTENSIONS_CHECKOUT_RETURNED`

When received, it silently refreshes status → writes the cache → triggers `onStatusChanged` everywhere.

### Add the content script to your manifest

> You can scope `matches` down if you don’t want `<all_urls>`.

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["BillingExtensionsSDK.content.js"],
      "run_at": "document_start"
    }
  ]
}
```

---

## Listening for updates

### `onStatusChanged(handler)`

Register a listener and react to changes:

```js
const unsubscribe = client.onStatusChanged((next, prev, diff) => {
  if (!prev?.paid && next.paid) {
    console.log("User upgraded ✅");
  }

  if (prev?.paid && !next.paid) {
    console.log("User downgraded / unsubscribed ❌");
  }

  console.log("diff:", diff);
});

// later
unsubscribe();
```

**Why this is reliable:** notifications are driven by `chrome.storage.onChanged`, so every open extension context gets the same updates without duplicates.

---

## AutoSync & background tracking

### AutoSync (enabled by default)

AutoSync is activated automatically when the client is created.
It:
- refreshes status safely (errors are silent),
- dedupes in-flight refresh requests to avoid API spam,
- helps keep status current across normal usage.

You can control it:

```js
client.enableAutoSync({
  // AutoSyncOptions (see DEFAULT_AUTOSYNC_OPTIONS)
});

client.disableAutoSync();
```

You can also import defaults:

```js
import { DEFAULT_AUTOSYNC_OPTIONS } from "<PACKAGE_NAME_PLACEHOLDER>";
```

### Background status tracking (recommended)

This adds:
- a message listener for instant refresh triggers, and
- **optional** `chrome.alarms` polling (if you include `"alarms"` permission)

```js
client.enableBackgroundStatusTracking({ periodInMinutes: 1 });
```

Notes:
- If the `alarms` permission/API isn’t available, the SDK won’t break — it just won’t schedule alarms.
- The SDK kicks one refresh immediately to warm the cache.

---

## Open billing / manage subscription

To send the user to the hosted billing management / checkout flow:

```js
await client.openManageBilling();
```

Under the hood this:
- creates a paywall session (`POST api/v1/sdk/paywall-sessions`)
- opens the returned URL in a new tab
- marks that a refresh should happen after the user returns/focuses

---

## Get available plans

```js
const plans = await client.getPlans();
console.log(plans);
```

This calls:
- `GET api/v1/sdk/plans`

---

## Full API Reference

### `BillingExtensionsSDK.createBillingExtensionsClient(config)`
Creates a configured client.

```js
const client = BillingExtensionsSDK.createBillingExtensionsClient({
  appId: string,
  publicKey: string,
});
```

---

### `client.getUser(opts?)`
Fetches user status with caching and SWR-style revalidation.

- `opts.forceRefresh?: boolean`

Returns: `Promise<UserStatus>`

Example:

```js
const status = await client.getUser();
```

---

### `client.refresh()`
Forces a network refresh and updates the storage cache.

Returns: `Promise<UserStatus>`

```js
const status = await client.refresh();
```

---

### `client.openManageBilling()`
Opens the hosted billing/paywall page for the user.

Returns: `Promise<void>`

```js
await client.openManageBilling();
```

---

### `client.onStatusChanged(handler)`
Registers a change handler.

Handler signature:

```ts
(next: UserStatus, prev: UserStatus | null, diff: {
  entitlementChanged: boolean;
  planChanged: boolean;
  usageChanged: boolean;
}) => void
```

Returns: `() => void` unsubscribe function.

```js
const unsubscribe = client.onStatusChanged((next, prev, diff) => {
  // ...
});

unsubscribe();
```

---

### `client.enableAutoSync(opts?)`
Enables AutoSync and optionally merges options.

Returns: `void`

```js
client.enableAutoSync();
```

---

### `client.disableAutoSync()`
Disables AutoSync.

Returns: `void`

```js
client.disableAutoSync();
```

---

### `client.enableBackgroundStatusTracking(opts?)`
Enables background tracking:
- message-based instant refresh trigger
- optional alarms-based polling

Options:
- `periodInMinutes?: number` (default 1)

Returns: `void`

```js
client.enableBackgroundStatusTracking({ periodInMinutes: 1 });
```

---

### `client.getPlans()`
Fetches plans available for this app.

Returns: `Promise<PlanForSDK[]>`

```js
const plans = await client.getPlans();
```

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
