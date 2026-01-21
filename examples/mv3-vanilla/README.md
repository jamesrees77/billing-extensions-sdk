# MV3 Vanilla Example

A minimal example showing how to use the BillingExtensions SDK in a Manifest V3 Chrome extension.

## Setup

1. Build the SDK from the root:
   ```bash
   cd ../..
   npm install
   npm run build
   ```

2. In a real extension, install the SDK:
   ```bash
   npm install @billingextensions/sdk
   ```

3. Update `popup.js` and `background.js` with your actual `appId` and `publicKey` from the BillingExtensions dashboard.

4. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this `examples/mv3-vanilla` folder

## Files

- `manifest.json` - MV3 manifest with storage permission
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic using the SDK
- `background.js` - Service worker example

## Usage Notes

- **AutoSync** only activates in extension UI pages (popup, options pages) - not in the service worker
- The SDK automatically manages the `extensionUserId` in `chrome.storage.local`
- All SDK methods return typed errors (`BillingExtensionsError`)
