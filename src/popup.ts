document.addEventListener('DOMContentLoaded', async () => {
    const urlsList = document.getElementById('urls-list');
    const saveButton = document.getElementById('save-url') as HTMLButtonElement;
    if (!urlsList || !saveButton) return;

    // Function to temporarily update button state
    const updateSaveButton = (saved: boolean) => {
        saveButton.textContent = saved ? 'URL Already Saved!' : 'Save Current URL';
        saveButton.className = saved ? 'already-saved' : '';
        
        // Reset button after 2 seconds if it shows "already saved"
        if (saved) {
            setTimeout(() => {
                saveButton.textContent = 'Save Current URL';
                saveButton.className = '';
            }, 2000);
        }
    };

    // Function to check if current URL is saved
    const checkCurrentUrl = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            const result = await chrome.storage.local.get("urls");
            const urls: string[] = result.urls || [];
            
            updateSaveButton(urls.includes(tab.url));
        } catch (error) {
            console.error('Error checking current URL:', error);
        }
    };

    // Function to delete a URL
    const deleteUrl = async (urlToDelete: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: string[] = result.urls || [];
            const newUrls = urls.filter(url => url !== urlToDelete);
            await chrome.storage.local.set({ urls: newUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error deleting URL:', error);
        }
    };

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
                
                // Create URL link
                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.target = '_blank';
                
                // Create delete button
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '×';
                deleteButton.className = 'delete-btn';
                deleteButton.onclick = () => deleteUrl(url);
                
                // Add elements to list item
                li.appendChild(link);
                li.appendChild(deleteButton);
                list.appendChild(li);
            });

            urlsList.innerHTML = ''; // Clear previous content
            urlsList.appendChild(list);
        } catch (error) {
            console.error('Error loading URLs:', error);
            urlsList.innerHTML = '<p>Error loading URLs.</p>';
        }
    };

    // Modified save button click handler
    saveButton.addEventListener('click', async () => {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            // Get existing URLs
            const result = await chrome.storage.local.get("urls");
            const urls: string[] = result.urls || [];

            if (!urls.includes(tab.url)) {
                // Save the new URL
                urls.push(tab.url);
                await chrome.storage.local.set({ urls });
                await displayUrls();
                updateSaveButton(true);
            } else {
                updateSaveButton(true);
            }
        } catch (error) {
            console.error('Error saving URL:', error);
        }
    });

    // Check current URL when popup opens
    await checkCurrentUrl();
    // Display initial URLs
    await displayUrls();
});