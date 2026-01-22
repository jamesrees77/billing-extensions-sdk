(() => {
    const url = new URL(location.href);
  
    const isSuccess =
      url.searchParams.has("be_success") ||
      url.pathname.startsWith("/success");
  
    if (!isSuccess) return;
  
    chrome.runtime.sendMessage({
      type: "BILLINGEXTENSIONS_CHECKOUT_RETURNED",
    }).catch(() => {});
  })();
  