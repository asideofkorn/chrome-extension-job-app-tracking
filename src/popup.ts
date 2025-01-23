let activeTab = 'current';

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
        relatedUrls?: string[];
        archived?: string;
        savedAt?: string;      // Timestamp when URL was saved
        appliedAt?: string;    // Timestamp when marked as applied
        archivedAt?: string;   // Timestamp when archived
    }

    interface ScriptResult {
        result: string | null;
    }

    // Function to temporarily update button state
    const updateSaveButton = (saved: boolean) => {
        saveButton.textContent = saved ? 'Job Post Already Saved!' : 'Save Current Job Post';
        saveButton.className = saved ? 'already-saved' : '';
        
        if (saved) {
            setTimeout(() => {
                saveButton.textContent = 'Save Current Job Post';
                saveButton.className = '';
            }, 2000);
        }
    };

    // Function to toggle application status
    const toggleApplied = async (url: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => {
                if (item.url === url) {
                    const newAppliedState = !item.applied;
                    return {
                        ...item,
                        applied: newAppliedState,
                        appliedAt: newAppliedState ? getCurrentDateTime() : undefined
                    };
                }
                return item;
            });
            await chrome.storage.local.set({ urls: updatedUrls });
            await displayUrls();
        } catch (error) {
            console.error('Error toggling application status:', error);
        }
    };

    // Add this helper function to strip URL parameters
    const stripUrlParameters = (url: string): string => {
        try {
            const urlObj = new URL(url);
            return `${urlObj.origin}${urlObj.pathname}`;
        } catch (error) {
            console.error('Error parsing URL:', error);
            return url;  // Return original URL if parsing fails
        }
    };

    // Function to check if current URL is saved
    const checkCurrentUrl = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;

            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const currentUrlStripped = stripUrlParameters(tab.url);

            // Find the matching URL (either main or related)
            const matchingUrl = urls.find(item => 
                stripUrlParameters(item.url) === currentUrlStripped || 
                (item.relatedUrls && item.relatedUrls.some(relatedUrl => 
                    stripUrlParameters(relatedUrl) === currentUrlStripped
                ))
            );

            // If URL is found, switch to the appropriate tab
            if (matchingUrl) {
                // Determine which tab the URL belongs to
                const targetTab = matchingUrl.archived ? 'archived' : 'current';
                
                // Switch to the appropriate tab if we're not already on it
                if (activeTab !== targetTab) {
                    const tabButtons = document.querySelectorAll('.tab-button');
                    tabButtons.forEach(button => {
                        if ((button as HTMLElement).dataset.tab === targetTab) {
                            (button as HTMLButtonElement).click();
                        }
                    });
                }

                // Update save button to show it's already saved
                updateSaveButton(true);

                // Wait a brief moment for the tab switch and display to update
                setTimeout(() => {
                    const urlElements = document.querySelectorAll('li');
                    urlElements.forEach(li => {
                        const link = li.querySelector('a');
                        if (link) {
                            const linkUrl = link.getAttribute('href');
                            if (linkUrl && (
                                stripUrlParameters(linkUrl) === currentUrlStripped || 
                                (matchingUrl && stripUrlParameters(matchingUrl.url) === stripUrlParameters(linkUrl)) ||
                                (matchingUrl?.relatedUrls?.some(relatedUrl => 
                                    stripUrlParameters(relatedUrl) === stripUrlParameters(linkUrl)
                                ))
                            )) {
                                li.className = 'active-url';
                                li.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    });
                }, 100);  // Small delay to ensure display has updated
            }

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

            // Filter URLs based on active tab
            const filteredUrls = urls.filter(url => 
                activeTab === 'archived' ? url.archived : !url.archived
            );

            // Sort by application status (not applied first)
            const sortedUrls = [...filteredUrls].sort((a, b) => {
                if (a.applied === b.applied) return 0;
                return a.applied ? 1 : -1;
            });

            // Get current tab URL to compare
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = currentTab?.url;

            if (sortedUrls.length === 0) {
                urlsList.innerHTML = `<p>No ${activeTab} URLs.</p>`;
                return;
            }

            const list = document.createElement('ul');
            sortedUrls.forEach(item => {
                const li = document.createElement('li');
                
                // Dim archived items, but ensure highlight is visible
                if (item.archived) {
                    li.style.opacity = '0.5';
                }

                // Highlight if current URL matches
                if (currentUrl && (
                    item.url === currentUrl || 
                    item.relatedUrls?.includes(currentUrl) ||
                    currentUrl === item.url
                )) {
                    li.className = 'active-url';
                    li.style.opacity = '1';  // Override opacity when highlighted
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
                statusButton.title = item.applied 
                    ? `Applied${item.appliedAt ? ` on ${item.appliedAt}` : ''}`
                    : 'Not Applied';
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

                // Add archive button before delete button
                const archiveButton = document.createElement('button');
                archiveButton.textContent = '🗄️';
                archiveButton.className = `archive-btn${item.archived ? ' archived' : ''}`;
                archiveButton.style.border = 'none';  // Remove border
                archiveButton.style.background = 'none';  // Remove background
                archiveButton.style.padding = '0 3px';  // Match padding with other buttons
                archiveButton.style.cursor = 'pointer';

                if (item.archived) {
                    archiveButton.title = `Archived: ${item.archived}${item.archivedAt ? ` on ${item.archivedAt}` : ''} (Click to unarchive)`;
                    archiveButton.style.opacity = '1';
                } else {
                    archiveButton.title = 'Archive';
                    archiveButton.style.opacity = '0.7';
                }
                archiveButton.onclick = () => showArchiveEditor(item.url, item.archived);

                // Add buttons to list item
                li.appendChild(link);
                li.appendChild(statusButton);
                li.appendChild(noteButton);
                li.appendChild(archiveButton);
                li.appendChild(relatedUrlButton);
                li.appendChild(deleteButton);

                // Remove the always-visible related URLs list
                list.appendChild(li);

                // Add saved timestamp to URL tooltip
                if (item.savedAt) {
                    link.title = `Saved on ${item.savedAt}`;
                }
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

    // Helper function to get current datetime string with timezone
    const getCurrentDateTime = () => {
        return new Date().toLocaleString('en-US', { 
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dateStyle: 'medium',
            timeStyle: 'medium'
        });
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
            const currentUrlStripped = stripUrlParameters(tab.url);

            const isMainUrl = urls.some(item => 
                stripUrlParameters(item.url) === currentUrlStripped
            );
            const isRelatedUrl = urls.some(item => 
                item.relatedUrls && item.relatedUrls.some(relatedUrl => 
                    stripUrlParameters(relatedUrl) === currentUrlStripped
                )
            );

            if (!isMainUrl && !isRelatedUrl) {
                let jobInfo = { title: null as string | null, company: null as string | null };
                if (currentUrlStripped.includes('linkedin.com/jobs/')) {
                    console.log('LinkedIn job page detected, fetching info...');
                    jobInfo = await getJobInfo(tab);
                    console.log('Retrieved job info:', jobInfo);
                }

                urls.push({
                    url: currentUrlStripped,
                    applied: false,
                    title: jobInfo.title || undefined,
                    company: jobInfo.company || undefined,
                    savedAt: getCurrentDateTime()
                });

                await chrome.storage.local.set({ urls });
                updateSaveButton(true);
                console.log('URL saved successfully');

                // Switch to Current tab if not already there
                if (activeTab !== 'current') {
                    const tabButtons = document.querySelectorAll('.tab-button');
                    tabButtons.forEach(button => {
                        if ((button as HTMLElement).dataset.tab === 'current') {
                            (button as HTMLButtonElement).click();
                        }
                    });
                } else {
                    // If already on Current tab, just refresh display
                    await displayUrls();
                }

                // Wait a brief moment for the display to update, then scroll to the new item
                setTimeout(() => {
                    const urlElements = document.querySelectorAll('li');
                    urlElements.forEach(li => {
                        const link = li.querySelector('a');
                        if (link && stripUrlParameters(link.getAttribute('href') || '') === currentUrlStripped) {
                            li.className = 'active-url';
                            li.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    });
                }, 100);
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
                // Close the editor and overlay
                document.body.removeChild(overlay);
                document.body.removeChild(editor);
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
            const relatedUrlStripped = stripUrlParameters(relatedUrl);

            const updatedUrls = urls.map(item => {
                if (item.url === originalUrl) {
                    const relatedUrls = item.relatedUrls || [];
                    if (!relatedUrls.some(url => stripUrlParameters(url) === relatedUrlStripped)) {
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

    // Function to show the archive editor
    const showArchiveEditor = (url: string, currentReason: string = '') => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        
        const editor = document.createElement('div');
        editor.className = 'archive-editor';
        
        const select = document.createElement('select');
        const reasons = [
            'JP - Missed Application Window',
            'JP - Skip - Overqualified',
            'JP - Skip - Underqualified',
            'JP - Other',
            'Applied - No Response',
            'Applied - Email - Not Good Fit',
            'Applied - Email - Role Filled',
            'Applied - Position Closed',
            'Applied - Rejected after first interview',
            'Applied - Rejected after later interview',
            'Other'
        ];
        reasons.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            if (reason === currentReason) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'note-editor-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'cancel-btn';

        // Create different buttons based on archive state
        if (currentReason) {
            // Show current reason as text
            const currentStatusDiv = document.createElement('div');
            currentStatusDiv.style.marginBottom = '10px';
            currentStatusDiv.textContent = `Current Status: ${currentReason}`;
            editor.appendChild(currentStatusDiv);

            // Add unarchive button
            const unarchiveButton = document.createElement('button');
            unarchiveButton.textContent = 'Unarchive';
            unarchiveButton.className = 'save-btn';
            unarchiveButton.onclick = async () => {
                await archiveUrl(url, '');  // Empty string to unarchive
                document.body.removeChild(overlay);
                document.body.removeChild(editor);
            };
            
            // Add update button
            const updateButton = document.createElement('button');
            updateButton.textContent = 'Update Reason';
            updateButton.className = 'save-btn';
            updateButton.onclick = async () => {
                await archiveUrl(url, select.value);
                document.body.removeChild(overlay);
                document.body.removeChild(editor);
            };

            buttonsDiv.appendChild(cancelButton);
            buttonsDiv.appendChild(unarchiveButton);
            buttonsDiv.appendChild(updateButton);
        } else {
            // Standard archive button for unarchived items
            const archiveButton = document.createElement('button');
            archiveButton.textContent = 'Archive';
            archiveButton.className = 'save-btn';
            archiveButton.onclick = async () => {
                await archiveUrl(url, select.value);
                document.body.removeChild(overlay);
                document.body.removeChild(editor);
            };

            buttonsDiv.appendChild(cancelButton);
            buttonsDiv.appendChild(archiveButton);
        }
        
        cancelButton.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(editor);
        };
        
        editor.appendChild(select);
        editor.appendChild(buttonsDiv);
        
        document.body.appendChild(overlay);
        document.body.appendChild(editor);
        select.focus();
    };

    // Function to archive a URL
    const archiveUrl = async (url: string, reason: string) => {
        try {
            const result = await chrome.storage.local.get("urls");
            const urls: SavedURL[] = result.urls || [];
            const updatedUrls = urls.map(item => 
                item.url === url ? { 
                    ...item, 
                    archived: reason,
                    archivedAt: reason ? getCurrentDateTime() : undefined
                } : item
            );
            await chrome.storage.local.set({ urls: updatedUrls });
            
            // Switch to appropriate tab
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(button => {
                if ((button as HTMLElement).dataset.tab === (reason ? 'archived' : 'current')) {
                    (button as HTMLButtonElement).click();  // Cast to HTMLButtonElement to access click()
                }
            });

            await displayUrls();  // Refresh the display after archiving
        } catch (error) {
            console.error('Error archiving URL:', error);
        }
    };

    // Add tab switching logic
    const setupTabs = () => {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Update active tab
                activeTab = (button as HTMLElement).dataset.tab || 'current';
                
                // Update button styles
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Refresh display
                displayUrls();
            });
        });
    };

    // Add setupTabs call after your existing initialization code
    setupTabs();
    await checkCurrentUrl();
    await displayUrls();
});