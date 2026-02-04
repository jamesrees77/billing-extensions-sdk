export function startContentScript(opts?: {
  successParam?: string; // default: "be_success"
  messageType?: string; // default: "BILLINGEXTENSIONS_CHECKOUT_RETURNED"
}) {
  // Content scripts always have window/document
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;

  const successParam = opts?.successParam ?? "be_success";
  const messageType =
    opts?.messageType ?? "BILLINGEXTENSIONS_CHECKOUT_RETURNED";

  const url = new URL(location.href);

  const isSuccess =
    url.searchParams.get("status") === "success" ||
    url.searchParams.has(successParam) ||
    url.pathname.startsWith("/success");

  if (!isSuccess) return;

  chrome.runtime.sendMessage({ type: messageType }).catch(() => {});
}
