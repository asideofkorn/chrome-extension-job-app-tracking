document.addEventListener('DOMContentLoaded', async () => {
    const urlsList = document.getElementById('urls-list');
    const saveButton = document.getElementById('save-url');
    if (!urlsList || !saveButton) return;

    // Function to display URLs
    const displayUrls = async () => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: string[] = result.urls || [];

            if (urls.length === 0) {
                urlsList.innerHTML = '<p>No URLs saved yet.</p>';
                return;
            }

            // Create a list of URLs
            const list = document.createElement('ul');
            urls.forEach(url => {
                const li = document.createElement('li');
                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.target = '_blank'; // Open in new tab
                li.appendChild(link);
                list.appendChild(li);
            });

            urlsList.innerHTML = ''; // Clear previous content
            urlsList.appendChild(list);
        } catch (error) {
            console.error('Error loading URLs:', error);
            urlsList.innerHTML = '<p>Error loading URLs.</p>';
        }
    };

    // Save button click handler
    saveButton.addEventListener('click', async () => {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            // Get existing URLs
            const result = await chrome.storage.local.get("urls");
            const urls: string[] = result.urls || [];

            // Add URL if it's not already saved
            if (!urls.includes(tab.url)) {
                urls.push(tab.url);
                await chrome.storage.local.set({ urls });
                // Refresh the display
                await displayUrls();
            }
        } catch (error) {
            console.error('Error saving URL:', error);
        }
    });

    // Display initial URLs
    await displayUrls();
});