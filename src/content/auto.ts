import { startContentScript } from "./startContentScript.js";

function isLikelyContentScript(): boolean {
  // not extension pages
  if (typeof location === "undefined") return false;
  if (
    location.protocol === "chrome-extension:" ||
    location.protocol === "moz-extension:"
  )
    return false;

  // if chrome.runtime exists, we are likely in extension context (content script)
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

// Auto-run when the file is injected as a content script
if (isLikelyContentScript()) {
  startContentScript();
}
