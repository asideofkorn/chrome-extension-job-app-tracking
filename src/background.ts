// Listen for a click on the extension's toolbar button.
chrome.action.onClicked.addListener(async (tab) => {
    console.log("Tab clicked:", tab);
    if (!tab?.url) {
        console.log("No active tab URL found.");
        return;
    }

    try {
        // Get existing URLs using Promise-based approach
        const result = await chrome.storage.local.get("urls");
        const urls: string[] = result.urls || [];
        console.log("Existing URLs:", urls);

        if (!urls.includes(tab.url)) {
            urls.push(tab.url);
            // Save updated URLs
            await chrome.storage.local.set({ urls });
            console.log("URL saved to chrome.storage.local:", tab.url);
        } else {
            console.log("URL is already saved:", tab.url);
        }
    } catch (error) {
        console.error("Error managing URLs:", error);
    }
});