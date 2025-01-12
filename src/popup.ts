document.addEventListener('DOMContentLoaded', async () => {
    const urlsList = document.getElementById('urls-list');
    const saveButton = document.getElementById('save-url') as HTMLButtonElement;
    if (!urlsList || !saveButton) return;

    interface SavedURL {
        url: string;
        applied: boolean;
    }

    // Function to temporarily update button state
    const updateSaveButton = (saved: boolean) => {
        saveButton.textContent = saved ? 'URL Already Saved!' : 'Save Current URL';
        saveButton.className = saved ? 'already-saved' : '';
        
        if (saved) {
            setTimeout(() => {
                saveButton.textContent = 'Save Current URL';
                saveButton.className = '';
            }, 2000);
        }
    };

    // Function to toggle application status
    const toggleApplied = async (url: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => 
                item.url === url ? { ...item, applied: !item.applied } : item
            );
            await chrome.storage.local.set({ urls: updatedUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error toggling application status:', error);
        }
    };

    // Function to check if current URL is saved
    const checkCurrentUrl = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            
            updateSaveButton(urls.some(item => item.url === tab.url));
        } catch (error) {
            console.error('Error checking current URL:', error);
        }
    };

    // Function to delete a URL
    const deleteUrl = async (url: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const newUrls = urls.filter(item => item.url !== url);
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
            const urls: SavedURL[] = result.urls || [];

            if (urls.length === 0) {
                urlsList.innerHTML = '<p>No URLs saved yet.</p>';
                return;
            }

            // Create a list of URLs
            const list = document.createElement('ul');
            urls.forEach(item => {
                const li = document.createElement('li');
                
                // Create URL link
                const link = document.createElement('a');
                link.href = item.url;
                link.textContent = item.url;
                link.target = '_blank';
                
                // Create application status button
                const statusButton = document.createElement('button');
                statusButton.textContent = item.applied ? '✅' : '📝';
                statusButton.className = 'status-btn';
                statusButton.title = item.applied ? 'Applied' : 'Not Applied';
                statusButton.onclick = () => toggleApplied(item.url);

                // Create delete button
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '❌';
                deleteButton.className = 'delete-btn';
                deleteButton.onclick = () => deleteUrl(item.url);
                
                // Add elements to list item
                li.appendChild(link);
                li.appendChild(statusButton);
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
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];

            if (!urls.some(item => item.url === tab.url)) {
                // Save the new URL with default not-applied status
                urls.push({ url: tab.url, applied: false });
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