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
        relatedUrls?: string[];  // Array of related URLs
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
            const currentUrl = tab.url;

            // Check if URL exists as main URL or as a related URL in any entry
            const isUrlSaved = urls.some(item => 
                item.url === currentUrl || 
                (item.relatedUrls && item.relatedUrls.includes(currentUrl))
            );

            // Find the main URL if current URL is a related URL
            const mainUrl = urls.find(item => 
                item.relatedUrls && item.relatedUrls.includes(currentUrl)
            );

            updateSaveButton(isUrlSaved);

            // Highlight both the main URL and its related URLs
            const urlElements = document.querySelectorAll('li');
            urlElements.forEach(li => {
                const link = li.querySelector('a');
                if (link) {
                    const linkUrl = link.getAttribute('href');
                    if (linkUrl === currentUrl || // Current URL matches
                        (mainUrl && linkUrl === mainUrl.url) || // Main URL of a related URL
                        (mainUrl?.relatedUrls?.includes(linkUrl || ''))) { // Other related URLs
                        li.className = 'active-url';
                    }
                }
            });

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
            sortedUrls.forEach(item => {
                const li = document.createElement('li');
                
                // Highlight if:
                // 1. This is the current URL
                // 2. This URL has the current URL as a related URL
                // 3. The current URL is one of this URL's related URLs
                if (currentUrl && (
                    item.url === currentUrl || 
                    item.relatedUrls?.includes(currentUrl) ||
                    currentUrl === item.url
                )) {
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
                
                // Update the related URL button to show count if there are related URLs
                const relatedUrlButton = document.createElement('button');
                relatedUrlButton.textContent = '🔗';
                if (item.relatedUrls?.length) {
                    relatedUrlButton.textContent += ` (${item.relatedUrls.length})`;
                }
                relatedUrlButton.className = 'related-url-btn';
                relatedUrlButton.title = item.relatedUrls?.length 
                    ? `View ${item.relatedUrls.length} related URL${item.relatedUrls.length > 1 ? 's' : ''}`
                    : 'Add related URL';
                relatedUrlButton.onclick = () => showRelatedUrlEditor(item.url, item.relatedUrls);

                // Add buttons to list item
                li.appendChild(link);
                li.appendChild(statusButton);
                li.appendChild(noteButton);
                li.appendChild(relatedUrlButton);
                li.appendChild(deleteButton);

                // Remove the always-visible related URLs list
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
            const currentUrl = tab.url;  // Store URL in a const to ensure it's defined

            // Check if URL exists as main URL or as a related URL
            const isMainUrl = urls.some(item => item.url === currentUrl);
            const isRelatedUrl = urls.some(item => 
                item.relatedUrls && item.relatedUrls.includes(currentUrl)  // Now using currentUrl instead of tab.url
            );

            if (!isMainUrl && !isRelatedUrl) {
                let jobInfo = { title: null as string | null, company: null as string | null };
                if (currentUrl.includes('linkedin.com/jobs/')) {
                    console.log('LinkedIn job page detected, fetching info...');
                    jobInfo = await getJobInfo(tab);
                    console.log('Retrieved job info:', jobInfo);
                }

                urls.push({
                    url: currentUrl,  // Use currentUrl here too
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
                console.log('URL was already saved or exists as a related URL');
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

    // Add this function to show the related URL editor
    const showRelatedUrlEditor = (url: string, currentRelatedUrls: string[] = []) => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        
        const editor = document.createElement('div');
        editor.className = 'related-url-editor';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Paste related URL here...';
        
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'note-editor-buttons';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Add';
        saveButton.className = 'save-btn';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Close';
        cancelButton.className = 'cancel-btn';

        // Show existing related URLs
        const relatedUrlsList = document.createElement('div');
        relatedUrlsList.className = 'related-urls-list';
        if (currentRelatedUrls.length > 0) {
            currentRelatedUrls.forEach(relatedUrl => {
                const urlDiv = document.createElement('div');
                const urlText = document.createElement('span');
                urlText.textContent = relatedUrl;
                const removeBtn = document.createElement('span');
                removeBtn.textContent = '×';
                removeBtn.className = 'remove-related-url';
                removeBtn.onclick = async () => {
                    await removeRelatedUrl(url, relatedUrl);
                    urlDiv.remove();
                };
                urlDiv.appendChild(urlText);
                urlDiv.appendChild(removeBtn);
                relatedUrlsList.appendChild(urlDiv);
            });
        }
        
        saveButton.onclick = async () => {
            if (input.value.trim()) {
                await addRelatedUrl(url, input.value.trim());
                input.value = '';
                // Refresh the related URLs list
                await displayUrls();
            }
        };
        
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(editor);
        };
        
        editor.appendChild(input);
        editor.appendChild(relatedUrlsList);
        editor.appendChild(buttonsDiv);
        buttonsDiv.appendChild(cancelButton);
        buttonsDiv.appendChild(saveButton);
        
        document.body.appendChild(overlay);
        document.body.appendChild(editor);
        input.focus();
    };

    // Function to add a related URL
    const addRelatedUrl = async (originalUrl: string, relatedUrl: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => {
                if (item.url === originalUrl) {
                    const relatedUrls = item.relatedUrls || [];
                    if (!relatedUrls.includes(relatedUrl)) {
                        return {
                            ...item,
                            relatedUrls: [...relatedUrls, relatedUrl]
                        };
                    }
                }
                return item;
            });
            await chrome.storage.local.set({ urls: updatedUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error adding related URL:', error);
        }
    };

    // Function to remove a related URL
    const removeRelatedUrl = async (originalUrl: string, relatedUrl: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => {
                if (item.url === originalUrl && item.relatedUrls) {
                    return {
                        ...item,
                        relatedUrls: item.relatedUrls.filter(url => url !== relatedUrl)
                    };
                }
                return item;
            });
            await chrome.storage.local.set({ urls: updatedUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error removing related URL:', error);
        }
    };
});