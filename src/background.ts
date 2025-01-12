// Listen for a click on the extension's toolbar button.
chrome.action.onClicked.addListener(async (tab) => {
    if (tab && tab.url) {
      // Save the URL to chrome.storage.local
      chrome.storage.local.set({ savedUrl: tab.url }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving URL:', chrome.runtime.lastError);
        } else {
          console.log('URL saved to chrome.storage.local:', tab.url);
        }
      });
    } else {
      console.log('No active tab URL found.');
    }
  });