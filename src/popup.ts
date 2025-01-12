document.addEventListener('DOMContentLoaded', async () => {
    const urlsList = document.getElementById('urls-list');
    const saveButton = document.getElementById('save-url') as HTMLButtonElement;
    if (!urlsList || !saveButton) return;

    interface SavedURL {
        url: string;
        applied: boolean;
        title?: string;
        company?: string;
        notes?: string;
    }

    interface ScriptResult {
        result: string | null;
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

    // Function to get job info from the current page
    const getJobInfo = async (tab: chrome.tabs.Tab): Promise<{ title: string | null; company: string | null }> => {
        if (!tab.id) return { title: null, company: null };
        
        try {
            const [results] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Try different selectors for job title
                    const titleSelectors = [
                        '.job-details-jobs-unified-top-card__job-title h1',
                        '.jobs-unified-top-card__job-title',
                        'h1.top-card-layout__title',
                        '.jobs-details-top-card__job-title'
                    ];

                    let title = null;
                    for (const selector of titleSelectors) {
                        const titleElement = document.querySelector(selector);
                        if (titleElement) {
                            title = titleElement.textContent?.trim() || null;
                            break;
                        }
                    }

                    // Get company name from the page
                    let company = null;
                    const companyElement = document.querySelector('.job-details-jobs-unified-top-card__company-name');
                    if (companyElement) {
                        // Get all text nodes, filter out empty ones and comments
                        const textNodes = Array.from(companyElement.childNodes)
                            .filter(node => 
                                node.nodeType === Node.TEXT_NODE && 
                                node.textContent && 
                                node.textContent.trim()
                            );
                        
                        if (textNodes.length > 0 && textNodes[0].textContent) {
                            company = textNodes[0].textContent.trim();
                        } else {
                            // Fallback to anchor text if no direct text nodes
                            const anchor = companyElement.querySelector('a');
                            company = anchor?.textContent?.trim() || null;
                        }
                    }

                    console.log('Found job info:', { title, company });
                    return { title, company };
                }
            }) as { result: { title: string | null; company: string | null } }[];
            
            console.log('Script execution result:', results.result);
            return {
                title: results.result.title || null,
                company: results.result.company || null
            };
        } catch (error) {
            console.error('Error getting job info:', error);
            return { title: null, company: null };
        }
    };

    // Function to display URLs
    const displayUrls = async () => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];

            // Sort by application status (not applied first)
            const sortedUrls = [...urls].sort((a, b) => {
                if (a.applied === b.applied) return 0;
                return a.applied ? 1 : -1;
            });

            // Get current tab URL to compare
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = currentTab?.url;

            if (sortedUrls.length === 0) {
                urlsList.innerHTML = '<p>No URLs saved yet.</p>';
                return;
            }

            const list = document.createElement('ul');
            // Remove the reverse() and just iterate through sortedUrls
            sortedUrls.forEach(item => {
                const li = document.createElement('li');
                
                // Add active-url class if this is the current URL
                if (currentUrl === item.url) {
                    li.className = 'active-url';
                }
                
                // Create URL link with company and title
                const link = document.createElement('a');
                link.href = item.url;
                if (item.company && item.title) {
                    link.textContent = `${item.company} - ${item.title}`;
                } else {
                    link.textContent = item.title || item.url;
                }
                link.target = '_blank';
                
                // Create application status button
                const statusButton = document.createElement('button');
                statusButton.textContent = item.applied ? '✅' : '📝';
                statusButton.className = 'status-btn';
                statusButton.title = item.applied ? 'Applied' : 'Not Applied';
                statusButton.onclick = () => toggleApplied(item.url);

                // Add note button before delete button
                const noteButton = document.createElement('button');
                noteButton.textContent = item.notes ? '✍🏾' : '✍🏻';  // Dark skin tone if note exists, light if not
                noteButton.className = `note-btn${item.notes ? ' has-note' : ''}`;
                noteButton.title = item.notes || 'Add note';
                noteButton.onclick = () => showNoteEditor(item.url, item.notes);
                
                // Create delete button
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '❌';
                deleteButton.className = 'delete-btn';
                deleteButton.onclick = () => deleteUrl(item.url);
                
                // Add elements to list item
                li.appendChild(link);
                li.appendChild(statusButton);
                li.appendChild(noteButton);  // Add note button
                li.appendChild(deleteButton);
                list.appendChild(li);
            });

            urlsList.innerHTML = '';
            urlsList.appendChild(list);

            // If the current URL is in the list, scroll to it
            if (currentUrl) {
                const activeElement = list.querySelector('.active-url');
                if (activeElement) {
                    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        } catch (error) {
            console.error('Error loading URLs:', error);
            urlsList.innerHTML = '<p>Error loading URLs.</p>';
        }
    };

    // Modified save button click handler
    saveButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) {
                console.log('No active tab URL found');
                return;
            }

            console.log('Current tab URL:', tab.url);
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];

            if (!urls.some(item => item.url === tab.url)) {
                let jobInfo = { title: null as string | null, company: null as string | null };
                if (tab.url.includes('linkedin.com/jobs/')) {
                    console.log('LinkedIn job page detected, fetching info...');
                    jobInfo = await getJobInfo(tab);
                    console.log('Retrieved job info:', jobInfo);
                }

                urls.push({
                    url: tab.url,
                    applied: false,
                    title: jobInfo.title || undefined,
                    company: jobInfo.company || undefined
                });

                await chrome.storage.local.set({ urls });
                await displayUrls();
                updateSaveButton(true);
                console.log('URL saved successfully');
            } else {
                updateSaveButton(true);
                console.log('URL was already saved');
            }
        } catch (error) {
            console.error('Error saving URL:', error);
        }
    });

    // Check current URL when popup opens
    await checkCurrentUrl();
    // Display initial URLs
    await displayUrls();

    // Add these functions after your existing functions
    const showNoteEditor = (url: string, currentNote: string = '') => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        
        // Create editor
        const editor = document.createElement('div');
        editor.className = 'note-editor';
        
        const textarea = document.createElement('textarea');
        textarea.value = currentNote;
        textarea.placeholder = 'Enter your note here...';
        
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'note-editor-buttons';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.className = 'save-btn';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'cancel-btn';
        
        // Add event listeners
        saveButton.onclick = async () => {
            await saveNote(url, textarea.value);
            document.body.removeChild(overlay);
            document.body.removeChild(editor);
        };
        
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(editor);
        };
        
        // Assemble the editor
        buttonsDiv.appendChild(cancelButton);
        buttonsDiv.appendChild(saveButton);
        editor.appendChild(textarea);
        editor.appendChild(buttonsDiv);
        
        document.body.appendChild(overlay);
        document.body.appendChild(editor);
        textarea.focus();
    };

    const saveNote = async (url: string, note: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => 
                item.url === url ? { 
                    ...item, 
                    notes: note.trim() === '' ? undefined : note  // Remove notes property if empty
                } : item
            );
            await chrome.storage.local.set({ urls: updatedUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error saving note:', error);
        }
    };
});