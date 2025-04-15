// UI Module - Handles all UI interactions and rendering

export class UI {
    constructor() {
        // Set initialized flag to track state
        this.initialized = false;
        
        // Create a flag to track if toast container is ready
        this.toastContainerReady = false;
        
        // Initialize event handlers
        this.eventHandlers = {};
        
        // Initialize UI in a separate step to allow for better error handling
        // Don't call this.init() automatically - it will be called by the App class
    }

    // Event emitter methods
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }

    emit(event, ...args) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event].forEach(handler => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });
    }

    init() {
        try {
            console.log('Initializing UI...');
            
            // Create toast container first to ensure it's available for notifications
            this.initToastContainer();
            
            // Create references to UI elements
            this.initComponents();
            
            // Set up event listeners
            this.initEventListeners();
            
            // Add modern styling to elements
            this.applyModernStyling();
            
            console.log('UI initialized successfully');
            this.initialized = true;
            
            // Show a welcome toast that auto-disappears after 3 seconds
            this.createToast({
                type: 'info',
                title: 'Welcome',
                message: 'ISO Manager initialized successfully',
                autoClose: true,
                autoCloseDelay: 3000
            });
        } catch (error) {
            console.error('Error initializing UI:', error);
            // Attempt to show error without depending on toast system
            if (document.body) {
                const errorMessage = document.createElement('div');
                errorMessage.className = 'error-message p-4 bg-red-600 text-white rounded shadow-lg fixed top-4 right-4 z-50';
                errorMessage.innerHTML = `<strong>UI Error:</strong> ${error.message || 'Unknown UI initialization error'}`;
                document.body.appendChild(errorMessage);
            }
        }
    }

    initComponents() {
        console.log('Initializing UI components...');
        // Get references to DOM elements
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.isoGrid = document.getElementById('isoGrid') || document.createElement('div');
        this.emptyState = document.getElementById('emptyState') || document.createElement('div');
        this.searchInput = document.getElementById('searchInput');
        this.filterSelect = document.getElementById('filterSelect');
        this.downloadProgress = document.getElementById('downloadProgress');
        this.progressBar = document.getElementById('downloadProgressBar');
        this.verificationResults = document.getElementById('verificationResults');
        this.modalBackdrop = document.getElementById('modalBackdrop');
        
        // Check if elements exist
        if (!this.isoGrid.id) {
            console.error('ISO Grid not found in DOM, creating fallback');
            this.isoGrid.id = 'isoGrid';
            this.isoGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8';
            document.querySelector('.tab-content[data-tab="browse"]').appendChild(this.isoGrid);
        }
        
        if (!this.emptyState.id) {
            console.error('Empty state not found in DOM, creating fallback');
            this.emptyState.id = 'emptyState';
            this.emptyState.className = 'text-center py-16';
            this.emptyState.innerHTML = `
                <i class="fas fa-exclamation-circle text-4xl text-gray-600 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-300">No ISOs Found</h3>
                <p class="text-gray-500 mt-2">Try changing your filter criteria or check back later.</p>
            `;
            document.querySelector('.tab-content[data-tab="browse"]').appendChild(this.emptyState);
        }
        
        console.log('UI components initialized');
    }

    initEventListeners() {
        // Add event listeners for search and filter
        this.initSearch();
        this.initToasts();
        this.initTabs();
    }

    initTabs() {
        const tabs = document.querySelectorAll('[data-tab-button]');
        const tabContents = document.querySelectorAll('[data-tab-content]');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tabButton;
                
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('active', 'border-primary-500', 'text-primary-400'));
                tabContents.forEach(c => c.classList.add('hidden'));
                
                // Add active class to clicked tab
                tab.classList.add('active', 'border-primary-500', 'text-primary-400');
                
                // Show corresponding content
                document.querySelector(`[data-tab-content="${targetTab}"]`)
                  ?.classList.remove('hidden');
            });
        });
    }

    initToastContainer() {
        try {
            console.log('Initializing toast container...');
            // Create toast container if it doesn't exist
            this.toastContainer = document.getElementById('toast-container') || document.getElementById('toastContainer');
            
            if (!this.toastContainer) {
                console.log('Creating new toast container in DOM');
                this.toastContainer = document.createElement('div');
                this.toastContainer.id = 'toast-container';
                // Position at the bottom of the page instead of the top
                this.toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse space-y-reverse space-y-2';
                document.body.appendChild(this.toastContainer);
                console.log('Toast container created and added to DOM');
            } else {
                console.log('Using existing toast container from DOM');
                // Ensure existing container is positioned at the bottom
                this.toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col-reverse space-y-reverse space-y-2';
            }
            this.toastContainerReady = true;
        } catch (error) {
            console.error('Error initializing toast container:', error);
        }
    }

    initToasts() {
        // No need to create toast container here, it's already handled in initToastContainer
    }
    
    /**
     * Create a toast notification
     * @param {Object} options - Toast options
     * @param {string} options.id - Unique ID for this toast (optional)
     * @param {string} options.type - Toast type: 'info', 'success', 'warning', 'error'
     * @param {string} options.title - Toast title
     * @param {string} options.message - Toast message
     * @param {number} options.progress - Progress percentage (0-100) (optional)
     * @param {boolean} options.autoClose - Whether to auto-close the toast (default: true)
     * @param {number} options.autoCloseDelay - Delay before auto-closing (default: 5000ms)
     * @returns {HTMLElement} The toast element
     */
    createToast(options = {}) {
        try {
            // Check if toast container exists
            if (!this.toastContainer) {
                console.error('Toast container not found!');
                this.initToastContainer(); // Try to create it again
                
                if (!this.toastContainer) {
                    throw new Error('Failed to create toast container');
                }
            }
            
            // Create a unique ID if not provided
            const id = options.id || `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            
            // Create toast element with modern styling
            const toast = document.createElement('div');
            toast.id = id;
            toast.className = 'toast flex bg-dark-800 border-l-4 rounded-md shadow-lg overflow-hidden transition-all duration-300 transform translate-x-0';
            toast.style.maxWidth = '400px';
            
            // Set border color based on type
            switch (options.type) {
                case 'success':
                    toast.classList.add('border-accent3-400'); // Green
                    break;
                case 'error':
                    toast.classList.add('border-accent2-400'); // Pink/Red
                    break;
                case 'warning':
                    toast.classList.add('border-yellow-500');
                    break;
                case 'info':
                default:
                    toast.classList.add('border-primary-400'); // Blue
                    break;
            }
            
            // Create toast content
            const content = document.createElement('div');
            content.className = 'flex-grow p-4';
            
            // Add title if provided
            if (options.title) {
                const title = document.createElement('h4');
                title.className = 'font-semibold text-white mb-1';
                title.textContent = options.title;
                content.appendChild(title);
            }
            
            // Add message if provided
            if (options.message) {
                const message = document.createElement('p');
                message.className = 'text-sm text-gray-300 whitespace-pre-line';
                message.textContent = options.message;
                content.appendChild(message);
            }
            
            // Add progress bar if provided
            if (typeof options.progress === 'number') {
                const progressContainer = document.createElement('div');
                progressContainer.className = 'mt-2 w-full h-1 bg-dark-900 rounded-full overflow-hidden';
                
                const progressBar = document.createElement('div');
                progressBar.className = 'h-full bg-gradient-to-r from-primary-500 to-accent1-400';
                progressBar.style.width = `${Math.min(Math.max(options.progress, 0), 100)}%`;
                progressBar.style.transition = 'width 0.3s ease';
                
                progressContainer.appendChild(progressBar);
                content.appendChild(progressContainer);
            }
            
            toast.appendChild(content);
            
            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'p-2 text-gray-400 hover:text-white self-start';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.addEventListener('click', () => this.closeToast(toast));
            toast.appendChild(closeBtn);
            
            // Add to container
            this.toastContainer.appendChild(toast);
            
            // Auto-close if enabled
            if (options.autoClose !== false) {
                const delay = options.autoCloseDelay || 5000;
                setTimeout(() => {
                    if (document.getElementById(id)) {
                        this.closeToast(toast);
                    }
                }, delay);
            }
            
            return toast;
        } catch (error) {
            console.error('Error creating toast:', error);
            return null;
        }
    }
    
    /**
     * Update an existing toast notification
     * @param {string} id - Toast ID to update
     * @param {Object} options - Updated toast options
     * @returns {HTMLElement|null} The updated toast element or null if not found
     */
    updateToast(id, options = {}) {
        const toast = document.getElementById(id);
        if (!toast) return null;
        
        // Update toast type/styling if specified
        if (options.type) {
            // Remove existing type classes
            toast.classList.remove(
                'bg-gradient-to-r',
                'from-green-500', 'to-green-600',
                'from-red-500', 'to-red-600',
                'from-yellow-500', 'to-yellow-600',
                'from-blue-500', 'to-blue-600'
            );
            
            // Update icon
            const iconEl = toast.querySelector('i');
            if (iconEl) {
                iconEl.classList.remove(
                    'fa-check-circle',
                    'fa-exclamation-circle',
                    'fa-exclamation-triangle',
                    'fa-info-circle'
                );
            }
            
            // Set new type styling
            let bgGradientFrom, bgGradientTo, iconClass;
            switch (options.type) {
                case 'success':
                    bgGradientFrom = 'from-green-500';
                    bgGradientTo = 'to-green-600';
                    iconClass = 'fa-check-circle';
                    break;
                case 'error':
                    bgGradientFrom = 'from-red-500';
                    bgGradientTo = 'to-red-600';
                    iconClass = 'fa-exclamation-circle';
                    break;
                case 'warning':
                    bgGradientFrom = 'from-yellow-500';
                    bgGradientTo = 'to-yellow-600';
                    iconClass = 'fa-exclamation-triangle';
                    break;
                case 'info':
                default:
                    bgGradientFrom = 'from-blue-500';
                    bgGradientTo = 'to-blue-600';
                    iconClass = 'fa-info-circle';
            }
            
            // Add classes individually to avoid issues with spaces in classList.add()
            toast.classList.add('bg-gradient-to-r');
            toast.classList.add(bgGradientFrom);
            toast.classList.add(bgGradientTo);
            
            if (iconEl) {
                iconEl.classList.add(iconClass);
            }
        }
        
        // Update title if specified
        if (options.title) {
            const titleEl = toast.querySelector('.font-semibold');
            if (titleEl) {
                titleEl.textContent = options.title;
            }
        }
        
        // Update message if specified
        if (options.message) {
            const messageEl = toast.querySelector('.message-container');
            if (messageEl) {
                messageEl.textContent = options.message;
            }
        }
        
        // Update progress if specified
        if (options.progress !== undefined) {
            const progressBar = toast.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${options.progress}%`;
            }
        }
        
        // Clear any existing auto-close timeout
        if (toast._closeTimeout) {
            clearTimeout(toast._closeTimeout);
            toast._closeTimeout = null;
        }
        
        // Update auto-close if specified
        if (options.autoClose !== undefined) {
            if (options.autoClose) {
                const delay = options.autoCloseDelay || 5000;
                console.log(`Setting auto-close timeout for toast ${id} with delay ${delay}ms`);
                toast._closeTimeout = setTimeout(() => {
                    console.log(`Auto-closing toast ${id}`);
                    this.closeToast(toast);
                }, delay);
            }
        }
        
        return toast;
    }
    
    /**
     * Close a toast notification
     * @param {HTMLElement} toast - The toast element to close
     */
    closeToast(toast) {
        toast.classList.add('opacity-0', 'translate-y-2');
        toast.classList.remove('opacity-100', 'translate-y-0');
        
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    initButtons(app) {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => app.fetchIsoList());
        }
        
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // Switch to settings tab
                document.querySelector('.tab-btn[data-tab="settings"]').click();
            });
        }
        
        // Download tab button - ensure ISO selection carries over
        const downloadTabBtn = document.querySelector('.tab-btn[data-tab="download"]');
        if (downloadTabBtn) {
            downloadTabBtn.addEventListener('click', () => {
                // If there's a selected ISO on the list page, select it in the download page
                const selectedIsoOnList = localStorage.getItem('selectedIsoUrl');
                if (selectedIsoOnList) {
                    const isoSelect = document.getElementById('isoSelectDownload');
                    const directUrlInput = document.getElementById('directUrlInput');
                    
                    // Try to find the matching option in the dropdown
                    if (isoSelect) {
                        for (let i = 0; i < isoSelect.options.length; i++) {
                            if (isoSelect.options[i].value === selectedIsoOnList) {
                                isoSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                    
                    // Also populate the direct URL input
                    if (directUrlInput) {
                        directUrlInput.value = selectedIsoOnList;
                    }
                }
            });
        }
        
        // Initialize the dropdown listener for URL population
        this.initIsoDropdownListener();
        
        // ISO selection dropdown change handler
        const isoSelect = document.getElementById('isoSelectDownload');
        if (isoSelect) {
            isoSelect.addEventListener('change', () => {
                const selectedValue = isoSelect.value;
                const directUrl = document.getElementById('directUrlInput');
                
                if (selectedValue && directUrl) {
                    console.log('ISO Selected:', selectedValue);
                    console.log('Available ISOs:', app.isoList);
                    
                    // Find the selected ISO in the list
                    const selectedIso = app.isoList.find(iso => iso.id === selectedValue);
                    console.log('Found ISO:', selectedIso);
                    
                    if (selectedIso && selectedIso.url) {
                        // Prefill the direct URL input with the selected ISO's URL
                        directUrl.value = selectedIso.url;
                        console.log('Prefilled URL:', selectedIso.url);
                        
                        // Also update any related fields if needed
                        const hashField = document.getElementById('expectedHashInput');
                        if (hashField && selectedIso.hash) {
                            hashField.value = selectedIso.hash;
                        }
                        
                        const hashAlgoField = document.getElementById('hashAlgorithmSelect');
                        if (hashAlgoField && selectedIso.hashType) {
                            hashAlgoField.value = selectedIso.hashType || 'sha256';
                        }
                    }
                }
            });
        }
        
        // Download button
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const isoSelect = document.getElementById('isoSelectDownload');
                const directUrl = document.getElementById('directUrlInput');
                
                // Get URL from either select or direct input
                let url = '';
                let filename = '';
                
                if (isoSelect.value) {
                    // Find the selected ISO in the list
                    const selectedIso = app.isoList.find(iso => iso.id === isoSelect.value);
                    if (selectedIso) {
                        url = selectedIso.url;
                        filename = selectedIso.filename || '';
                    }
                } else if (directUrl.value.trim()) {
                    url = directUrl.value.trim();
                    // Extract filename from URL if possible
                    const urlParts = url.split('/');
                    filename = urlParts[urlParts.length - 1] || '';
                }
                
                if (!url) {
                    app.ui.showError('Please select an ISO or enter a direct URL.');
                    return;
                }
                
                // Start the download
                app.downloadIso(url, filename);
            });
        }
        
        // Verification button
        const verifyBtn = document.getElementById('verifyBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', () => {
                const filePath = document.getElementById('verifyFilePathInput').value;
                const expectedHash = document.getElementById('expectedHashInput').value;
                const algorithm = document.getElementById('hashAlgorithmSelect').value;
                
                app.verifyIso(filePath, expectedHash, algorithm);
            });
        }
        
        // Settings save button
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => app.saveConfig());
        }
        
        // Settings reset button
        const resetSettingsBtn = document.getElementById('resetSettingsBtn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => app.resetConfig());
        }
        
        // Browse buttons
        const browseBtn = document.getElementById('browseBtn');
        if (browseBtn) {
            browseBtn.addEventListener('click', async () => {
                const dir = await app.isoManager.browseForDirectory();
                if (dir) {
                    document.getElementById('downloadPathInput').value = dir;
                }
            });
        }
        
        const browseBtnVerify = document.getElementById('browseBtnVerify');
        if (browseBtnVerify) {
            browseBtnVerify.addEventListener('click', async () => {
                const file = await app.isoManager.browseForFile();
                if (file) {
                    document.getElementById('verifyFilePathInput').value = file;
                }
            });
        }
        
        // New verification button
        const newVerificationBtn = document.getElementById('newVerificationBtn');
        if (newVerificationBtn) {
            newVerificationBtn.addEventListener('click', () => {
                this.hideVerificationResults();
                document.getElementById('verifyFilePathInput').value = '';
                document.getElementById('expectedHashInput').value = '';
            });
        }

        // Listen for dashboard download requests
        document.addEventListener('iso-download-requested', (event) => {
            if (event.detail && event.detail.isoId) {
                const isoId = event.detail.isoId;
                
                // Select the ISO in the dropdown
                const select = document.getElementById('isoSelectDownload');
                if (select) {
                    select.value = isoId;
                    
                    // Manually trigger the change event to update direct URL
                    const changeEvent = new Event('change');
                    select.dispatchEvent(changeEvent);
                }
            }
        });
    }

    initSearch() {
        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.filterIsoList());
        }
        
        // Filter select
        if (this.filterSelect) {
            this.filterSelect.addEventListener('change', () => this.filterIsoList());
        }
    }

    filterIsoList() {
        const searchTerm = this.searchInput.value.toLowerCase();
        const filterType = this.filterSelect.value;
        
        // Get all ISO cards
        const isoCards = this.isoGrid.querySelectorAll('.iso-card');
        let visibleCount = 0;
        
        isoCards.forEach(card => {
            const cardName = card.getAttribute('data-name').toLowerCase();
            const cardDesc = card.getAttribute('data-description').toLowerCase();
            const cardType = card.getAttribute('data-type');
            
            // Check if card matches both search and filter criteria
            const matchesSearch = cardName.includes(searchTerm) || cardDesc.includes(searchTerm);
            const matchesFilter = filterType === 'all' || cardType === filterType;
            
            if (matchesSearch && matchesFilter) {
                card.classList.remove('hidden');
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        });
        
        // Show/hide empty state based on results
        if (visibleCount === 0 && isoCards.length > 0) {
            this.emptyState.classList.remove('hidden');
        } else {
            this.emptyState.classList.add('hidden');
        }
    }

    renderIsoList(isoList) {
        console.log(`Rendering ISO list with ${isoList?.length || 0} items`);
        
        // Ensure components are initialized
        if (!this.isoGrid || !this.emptyState) {
            console.error('ISO grid or empty state not initialized, re-initializing components...');
            this.initComponents();
        }
        
        // Handle empty list
        if (!isoList || isoList.length === 0) {
            console.warn('Empty ISO list, showing empty state');
            this.showEmptyState();
            return;
        }
        
        // Hide empty state and clear previous content
        if (this.emptyState) this.emptyState.classList.add('hidden');
        if (this.isoGrid) {
            this.isoGrid.innerHTML = '';
            this.isoGrid.classList.remove('hidden');
            
            // Create a card for each ISO and append to container
            isoList.forEach(iso => {
                try {
                    console.log(`Creating card for ISO: ${iso.name}`);
                    const card = this.renderIsoCard(iso);
                    this.isoGrid.appendChild(card);
                } catch (error) {
                    console.error(`Error creating card for ${iso.name}:`, error);
                }
            });
            
            console.log(`Rendered ${isoList.length} ISO cards`);
        } else {
            console.error('ISO grid element not found');
        }
    }
    
    renderIsoCard(iso) {
        const card = document.createElement('div');
        card.className = 'iso-card';
        card.dataset.iso = iso.name;
        
        // Create the card header
        const header = document.createElement('div');
        header.className = 'card-header';
        
        // Create the title
        const title = document.createElement('h3');
        title.textContent = iso.name;
        header.appendChild(title);
        
        // Create badges container
        const badges = document.createElement('div');
        badges.className = 'badges';
        
        // Add distro badge
        if (iso.distro) {
            const distroBadge = document.createElement('span');
            distroBadge.className = `badge badge-${iso.distro.toLowerCase()}`;
            distroBadge.textContent = iso.distro;
            badges.appendChild(distroBadge);
        }
        
        // Add size badge if available
        if (iso.size) {
            const sizeBadge = document.createElement('span');
            sizeBadge.className = 'badge badge-info';
            sizeBadge.textContent = this.formatSize(iso.size);
            badges.appendChild(sizeBadge);
        }
        
        // Add archive status badge if in archive
        if (iso.inArchive) {
            const archiveBadge = document.createElement('span');
            
            if (iso.updateAvailable) {
                archiveBadge.className = 'badge badge-warning';
                archiveBadge.textContent = 'Update Available';
            } else {
                archiveBadge.className = 'badge badge-success';
                archiveBadge.textContent = 'In Archive';
            }
            
            badges.appendChild(archiveBadge);
        }
        
        header.appendChild(badges);
        card.appendChild(header);
        
        // Create the card body
        const body = document.createElement('div');
        body.className = 'card-body';
        
        // Add description if available
        if (iso.description) {
            const description = document.createElement('p');
            description.className = 'description';
            description.textContent = iso.description;
            body.appendChild(description);
        }
        
        // Add download button
        const actionButton = document.createElement('button');
        
        if (iso.inArchive && !iso.updateAvailable) {
            // If ISO is in archive, show verify button
            actionButton.className = 'btn btn-secondary';
            actionButton.textContent = 'Click to Verify';
            actionButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Verification requested for ISO: ${iso.name}`);
                this.emit('verify-iso', iso.name);
            });
        } else {
            // Otherwise show download button
            actionButton.className = 'btn btn-primary';
            actionButton.textContent = 'Click to Download';
            actionButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Download requested for ISO: ${iso.name}`);
                this.emit('download-iso', iso);
            });
        }
        
        body.appendChild(actionButton);
        card.appendChild(body);
        
        return card;
    }

    triggerIsoDownload(isoId) {
        // This will be connected to the app in initButtons
        const event = new CustomEvent('iso-download-requested', { detail: { isoId } });
        document.dispatchEvent(event);
        
        // Switch to download tab
        document.querySelector('.tab-btn[data-tab="download"]').click();
        
        // Select the ISO in the dropdown
        const select = document.getElementById('isoSelectDownload');
        if (select) {
            select.value = isoId;
            
            // Manually trigger the change event to update direct URL
            const changeEvent = new Event('change');
            select.dispatchEvent(changeEvent);
        }
    }

    showIsoDetails(isoId) {
        // Create and show a modal with detailed ISO information
        // This will be implemented to display more details about the selected ISO
        console.log('Show details for ISO:', isoId);
    }

    populateIsoSelect(selectId, isoList) {
        console.log('Populating ISO select with:', isoList);
        const select = document.getElementById(selectId || 'isoSelectDownload');
        if (!select) return;
        
        // Clear existing options except the empty default
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add options for each ISO
        for (const iso of isoList) {
            const option = document.createElement('option');
            option.value = iso.url; // Store URL directly as value
            option.textContent = `${iso.name} ${iso.version ? `(${iso.version})` : ''}`;
            option.setAttribute('data-has-update', iso.hasUpdate ? 'true' : 'false');
            option.setAttribute('data-in-archive', iso.inArchive ? 'true' : 'false');
            select.appendChild(option);
        }
    }

    showLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.remove('hidden');
        }
        
        if (this.isoGrid) {
            this.isoGrid.classList.add('hidden');
        }
        
        if (this.emptyState) {
            this.emptyState.classList.add('hidden');
        }
    }

    hideLoading() {
        console.log('Hiding loading indicator');
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.add('hidden');
        }
    }

    showEmptyState() {
        if (this.emptyState) {
            this.emptyState.classList.remove('hidden');
        }
        
        if (this.isoGrid) {
            this.isoGrid.classList.add('hidden');
        }
    }

    showIsoGrid() {
        if (this.isoGrid) {
            this.isoGrid.classList.remove('hidden');
        }
    }

    // Download Progress Methods
    showDownloadProgress(initialProgress = 0) {
        const progressContainer = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('downloadProgressBar');
        
        if (progressContainer && progressBar) {
            progressContainer.classList.remove('hidden');
            progressBar.style.width = initialProgress + '%';
        }
    }
    
    updateDownloadProgress(progress) {
        if (!progress) return;
        
        const progressBar = document.getElementById('downloadProgressBar');
        const sizeDisplay = document.getElementById('downloadSize');
        const speedDisplay = document.getElementById('downloadSpeed');
        const etaDisplay = document.getElementById('downloadEta');
        const filenameDisplay = document.getElementById('downloadFilename');
        
        if (!progressBar || !sizeDisplay || !speedDisplay || !etaDisplay) return;
        
        // Update progress bar
        const percentage = isNaN(progress.percentage) ? 0 : progress.percentage;
        progressBar.style.width = percentage + '%';
        
        // Format transferred and total size
        const bytesTransferred = isNaN(progress.bytesTransferred) ? 0 : progress.bytesTransferred;
        const totalBytes = isNaN(progress.totalBytes) ? 0 : progress.totalBytes;
        
        const transferred = this.formatSize(bytesTransferred);
        const total = this.formatSize(totalBytes);
        sizeDisplay.textContent = `${transferred} / ${total}`;
        
        // Format speed
        const speedValue = isNaN(progress.speed) ? 0 : progress.speed;
        const speed = this.formatSize(speedValue) + '/s';
        speedDisplay.textContent = speed;
        
        // Update ETA
        const etaValue = isNaN(progress.eta) ? 0 : progress.eta;
        etaDisplay.textContent = this.formatRemainingTime(etaValue);
        
        // Update filename if available
        if (progress.filename && filenameDisplay) {
            filenameDisplay.textContent = progress.filename;
        }
        
        // Debug logging
        console.log(`Progress update: ${percentage.toFixed(2)}% - ${transferred}/${total} - ${speed}`);
    }
    
    getDownloadPath() {
        const downloadPathInput = document.getElementById('downloadPathInput');
        if (downloadPathInput && downloadPathInput.value) {
            return downloadPathInput.value.trim();
        }
        return null;
    }

    formatSize(bytes) {
        if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024));
        
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }
    
    formatRemainingTime(seconds) {
        if (!seconds || seconds === Infinity || isNaN(seconds)) {
            return '--:--';
        }
        
        // Format seconds into mm:ss or hh:mm:ss
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        // Format as mm:ss or hh:mm:ss depending on length
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    hideDownloadProgress() {
        const progressContainer = document.getElementById('downloadProgress');
        if (progressContainer) {
            progressContainer.classList.add('hidden');
        }
    }

    // Download History Methods
    updateDownloadHistory(history) {
        const historyContainer = document.getElementById('downloadHistoryContainer');
        if (!historyContainer) return;

        // Clear existing history
        historyContainer.innerHTML = '';

        if (!history || history.length === 0) {
            historyContainer.innerHTML = `
                <div class="p-4 text-center text-gray-400">
                    <p>No download history available</p>
                </div>
            `;
            return;
        }

        // Sort history by date (newest first)
        const sortedHistory = [...history].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Create history items
        sortedHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'bg-slate-800 rounded-lg p-4 mb-3 border-l-4 ' + 
                (item.status === 'Success' ? 'border-green-500' : 'border-red-500');

            const date = new Date(item.date).toLocaleString();
            
            historyItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-white font-medium">${item.filename}</h4>
                        <p class="text-gray-400 text-sm">${date}</p>
                    </div>
                    <span class="px-2 py-1 text-xs rounded-full ${item.status === 'Success' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}">
                        ${item.status}
                    </span>
                </div>
                <div class="mt-2 text-sm">
                    <p class="text-gray-300">Size: ${item.size || 'N/A'}</p>
                    ${item.error ? `<p class="text-red-400 mt-1">Error: ${item.error}</p>` : ''}
                </div>
            `;

            historyContainer.appendChild(historyItem);
        });
    }

    // Verification Results Methods
    showVerificationResults(result) {
        if (!this.verificationResults) return;
        
        // Create result content
        const isMatch = result.match || false;
        const hashType = result.algorithm || 'SHA256';
        const actualHash = result.hash || 'Unknown';
        const expectedHash = result.expectedHash || 'Unknown';
        
        const statusClass = isMatch ? 'text-green-500' : 'text-red-500';
        const statusIcon = isMatch ? 'fas fa-check-circle' : 'fas fa-times-circle';
        const statusText = isMatch ? 'Hash Verified Successfully' : 'Hash Verification Failed';
        
        this.verificationResults.innerHTML = `
            <div class="p-4 mb-4 ${isMatch ? 'bg-green-900/20' : 'bg-red-900/20'} border ${isMatch ? 'border-green-800' : 'border-red-800'} rounded-lg">
                <div class="flex items-center mb-3">
                    <i class="${statusIcon} ${statusClass} text-2xl mr-2"></i>
                    <h3 class="text-xl font-semibold ${statusClass}">${statusText}</h3>
                </div>
                <div class="text-gray-300 mb-2">File: <span class="text-gray-400">${result.filename || 'Unknown'}</span></div>
                <div class="text-gray-300 mb-2">Algorithm: <span class="text-gray-400">${hashType.toUpperCase()}</span></div>
                <div class="text-gray-300 mb-2">Expected Hash: <span class="text-gray-400 break-all">${expectedHash}</span></div>
                <div class="text-gray-300 mb-2">Actual Hash: <span class="${isMatch ? 'text-green-400' : 'text-red-400'} break-all">${actualHash}</span></div>
            </div>
            <button id="newVerificationBtn" class="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md transition-all duration-200 flex items-center justify-center w-full">
                <i class="fas fa-redo mr-2"></i> Verify Another File
            </button>
        `;
        
        // Show the results container
        this.verificationResults.classList.remove('hidden');
        
        // Hide the verification form
        const verificationForm = document.getElementById('verificationForm');
        if (verificationForm) {
            verificationForm.classList.add('hidden');
        }
        
        // Add event listener to the new verification button
        const newVerificationBtn = document.getElementById('newVerificationBtn');
        if (newVerificationBtn) {
            newVerificationBtn.addEventListener('click', () => {
                this.hideVerificationResults();
            });
        }
    }
    
    hideVerificationResults() {
        if (!this.verificationResults) return;
        
        // Hide results
        this.verificationResults.classList.add('hidden');
        
        // Show form
        const verificationForm = document.getElementById('verificationForm');
        if (verificationForm) {
            verificationForm.classList.remove('hidden');
        }
    }

    // Settings Form Methods
    populateSettingsForm(config) {
        // Fill in settings form with values from config
        const elements = {
            'defaultIsoListUrl': config.defaultIsoListUrl || '',
            'downloadDir': config.downloadDir || './downloads',
            'hashAlgorithm': config.hashAlgorithm || 'sha256',
            'autoVerifyHashes': config.autoVerifyHashes || false
        };
        
        // Set each element value
        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        }
    }
    
    getSettingsFormValues() {
        // Get values from settings form
        return {
            defaultIsoListUrl: document.getElementById('defaultIsoListUrl')?.value || '',
            downloadDir: document.getElementById('downloadDir')?.value || './downloads',
            hashAlgorithm: document.getElementById('hashAlgorithm')?.value || 'sha256',
            autoVerifyHashes: document.getElementById('autoVerifyHashes')?.checked || false
        };
    }

    // Handle iso-dropdown change event to populate the URL field
    initIsoDropdownListener() {
        const isoSelect = document.getElementById('isoSelectDownload');
        const directUrlInput = document.getElementById('directUrlInput');
        
        if (isoSelect && directUrlInput) {
            isoSelect.addEventListener('change', (e) => {
                const selectedValue = e.target.value;
                if (!selectedValue) return;
                
                // Update the direct URL input with the selected value
                directUrlInput.value = selectedValue;
                
                console.log('ISO dropdown changed to:', selectedValue);
                console.log('Direct URL field updated');
            });
        }
    }

    getOsTypeClass(osType) {
        // Return appropriate gradient class based on OS type
        switch(osType?.toLowerCase()) {
            case 'linux':
                return 'bg-gradient-to-r from-accent1-400 to-accent2-400'; // purple to pink
            case 'windows':
                return 'bg-gradient-to-r from-primary-500 to-accent1-400'; // blue to purple
            case 'macos':
                return 'bg-gradient-to-r from-accent2-400 to-accent3-400'; // pink to green
            case 'bsd':
                return 'bg-gradient-to-r from-accent3-400 to-primary-500'; // green to blue
            default:
                return 'bg-gradient-to-r from-gray-500 to-gray-700'; // gray gradient for unknown
        }
    }

    getOsIconClass(osType) {
        // Return appropriate icon class based on OS type
        switch(osType?.toLowerCase()) {
            case 'debian':
                return 'devicon-debian-plain colored';
            case 'ubuntu':
                return 'devicon-ubuntu-plain colored';
            case 'mint':
                return 'devicon-linux-plain colored';
            case 'fedora':
                return 'devicon-fedora-plain colored';
            case 'windows':
                return 'devicon-windows8-original colored';
            case 'freebsd':
                return 'fas fa-server';
            case 'opensuse':
                return 'devicon-opensuse-plain colored';
            case 'arch':
                return 'devicon-archlinux-plain colored';
            default:
                return 'fas fa-compact-disc';
        }
    }

    // Get OS logo path based on OS type
    getOsLogoPath(osType) {
        // Map osType to appropriate 3-letter code
        let osCode;
        switch(osType?.toLowerCase()) {
            case 'debian':
                osCode = 'DEB'; // Debian
                break;
            case 'ubuntu':
                osCode = 'UBT'; // Ubuntu
                break;
            case 'mint':
                osCode = 'MIN'; // Linux Mint
                break;
            case 'fedora':
                osCode = 'FED'; // Fedora
                break;
            case 'windows':
                osCode = 'WIN'; // Windows
                break;
            case 'freebsd':
                osCode = 'BSD'; // FreeBSD
                break;
            case 'opensuse':
                osCode = 'SUS'; // openSUSE
                break;
            case 'arch':
                osCode = 'ARL'; // Arch Linux
                break;
            case 'centos':
                osCode = 'CES'; // CentOS
                break;
            case 'proxmox':
                osCode = 'POS'; // Proxmox
                break;
            case 'kali':
                osCode = 'KAL'; // Kali Linux
                break;
            default:
                osCode = 'LIN'; // Generic Linux
        }
        
        // Return path to 64x64 icon
        return `/OS-Logos/64x64/${osCode}.png`;
    }

    /**
     * Create a verification modal for ISO verification
     * @param {Object} iso - ISO object being verified
     * @returns {Object} - Modal elements and methods
     */
    createVerificationModal(iso) {
        try {
            // Create modal backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 hidden';
            backdrop.id = `verification-modal-backdrop-${iso.name.replace(/\s+/g, '-')}`;

            // Create modal container
            const modal = document.createElement('div');
            modal.className = 'relative bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all duration-300 ease-out scale-95 opacity-0'; // Added 'relative' for positioning the X button
            modal.innerHTML = `
                <button class="absolute top-3 right-3 text-slate-400 hover:text-slate-100 text-2xl leading-none close-x-btn" aria-label="Close">&times;</button>
                <h3 class="text-xl font-semibold text-slate-100 mb-4 verification-modal-title">Verifying ${iso.name}</h3>
                
                <!-- Step Indicators -->
                <div class="flex items-center justify-between mb-6 space-x-4">
                    <div class="flex items-center verification-step" data-step="hash">
                    <div class="step-icon w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-500 flex items-center justify-center text-slate-300 mr-2 transition-colors duration-300">1</div>
                    <span class="step-label text-sm text-slate-400 transition-colors duration-300">Calculate Hash</span>
                    </div>
                    <div class="flex-1 h-px bg-slate-600"></div> <!-- Connector -->
                    <div class="flex items-center verification-step" data-step="compare">
                    <div class="step-icon w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-500 flex items-center justify-center text-slate-300 mr-2 transition-colors duration-300">2</div>
                    <span class="step-label text-sm text-slate-400 transition-colors duration-300">Compare</span>
                    </div>
                </div>

                <!-- Step Details Container (Flex, equal height) -->
                <div class="mb-4 flex flex-col"> 
                    <div class="verification-step-details hash-details p-3 bg-slate-700 rounded flex-grow hidden"> 
                        <!-- Spinner -->
                        <div class="hash-spinner flex items-center justify-center hidden">
                            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-300 mr-2"></div>
                            <span class="text-sm text-slate-300">Calculating local file hash...</span>
                        </div>
                        <!-- Result Text -->
                        <p class="hash-result-text text-sm text-slate-300 hidden"></p>
                    </div>
                    <div class="verification-step-details compare-details p-3 bg-slate-700 rounded flex-grow mt-2 hidden"> 
                        <p class="text-sm text-slate-300">Comparing hash values...</p>
                    </div>
                </div>

                <!-- REMOVED Close button from here -->
            `;

            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            // Define hideModal function earlier
            const hideModal = () => {
                if (!backdrop) return;
                // Start fade-out animation
                modal.classList.remove('scale-100', 'opacity-100');
                modal.classList.add('scale-95', 'opacity-0');
                backdrop.classList.add('opacity-0');

                // Remove after animation completes
                setTimeout(() => {
                    if (backdrop && backdrop.parentNode) {
                        backdrop.parentNode.removeChild(backdrop);
                    }
                }, 300); // Match duration-300
            };

            // Step elements references
            const steps = {
                hashStep: {
                    element: backdrop.querySelector('.verification-step[data-step="hash"]'),
                    icon: backdrop.querySelector('.verification-step[data-step="hash"] .step-icon'),
                    label: backdrop.querySelector('.verification-step[data-step="hash"] .step-label'),
                    detailsElement: backdrop.querySelector('.hash-details'), 
                    spinnerElement: backdrop.querySelector('.hash-spinner'), 
                    resultTextElement: backdrop.querySelector('.hash-result-text'), 
                    updateStatus: function(status) { /* pending, success, error */
                        this.icon.classList.remove('bg-slate-600', 'bg-green-500', 'bg-red-500', 'border-slate-500', 'border-green-700', 'border-red-700');
                        this.label.classList.remove('text-slate-400', 'text-green-300', 'text-red-300');
                        this.spinnerElement.classList.add('hidden'); 
                        this.resultTextElement.classList.add('hidden'); 
                        this.detailsElement.classList.remove('hidden'); 

                        if (status === 'success') {
                            this.icon.classList.add('bg-green-500', 'border-green-700');
                            this.label.classList.add('text-green-300');
                            this.icon.textContent = '\u2714'; 
                            this.resultTextElement.classList.remove('hidden'); 
                        } else if (status === 'error') {
                            this.icon.classList.add('bg-red-500', 'border-red-700');
                            this.label.classList.add('text-red-300');
                            this.icon.textContent = '\u2718'; 
                            this.resultTextElement.classList.remove('hidden'); 
                        } else { // pending
                            this.icon.classList.add('bg-slate-600', 'border-slate-500');
                            this.label.classList.add('text-slate-400');
                            this.icon.textContent = '1';
                            this.spinnerElement.classList.remove('hidden'); 
                        }
                    },
                    updateDetails: function(text) {
                        this.resultTextElement.textContent = text;
                        this.resultTextElement.classList.remove('hidden'); 
                        this.spinnerElement.classList.add('hidden'); 
                        this.detailsElement.classList.remove('hidden'); 
                    }
                },
                compareStep: {
                    element: backdrop.querySelector('.verification-step[data-step="compare"]'),
                    icon: backdrop.querySelector('.verification-step[data-step="compare"] .step-icon'),
                    label: backdrop.querySelector('.verification-step[data-step="compare"] .step-label'),
                    detailsElement: backdrop.querySelector('.compare-details'), 
                    updateStatus: function(status) {
                        this.icon.classList.remove('bg-slate-600', 'bg-green-500', 'bg-red-500', 'border-slate-500', 'border-green-700', 'border-red-700');
                        this.label.classList.remove('text-slate-400', 'text-green-300', 'text-red-300');
                        this.detailsElement.classList.remove('hidden'); 

                        if (status === 'success') {
                            this.icon.classList.add('bg-green-500', 'border-green-700');
                            this.label.classList.add('text-green-300');
                            this.icon.textContent = '\u2714'; 
                        } else if (status === 'error') {
                            this.icon.classList.add('bg-red-500', 'border-red-700');
                            this.label.classList.add('text-red-300');
                            this.icon.textContent = '\u2718'; 
                        } else {
                            this.icon.classList.add('bg-slate-600', 'border-slate-500');
                            this.label.classList.add('text-slate-400');
                            this.icon.textContent = '2';
                        }
                    },
                    updateDetails: function(text) {
                        this.detailsElement.querySelector('p').textContent = text; 
                        this.detailsElement.classList.remove('hidden'); 
                    }
                }
            };

            // Add event listeners after defining hideModal
            // Close button functionality (X button)
            const closeXButton = modal.querySelector('.close-x-btn');
            if (closeXButton) { 
                closeXButton.addEventListener('click', hideModal);
            } else {
                console.warn('Verification modal X close button not found.');
            }

            // Close modal when clicking backdrop
            if (backdrop) { 
                backdrop.addEventListener('click', (event) => {
                    if (event.target === backdrop) { 
                        hideModal();
                    }
                });
            } else {
                console.warn('Verification modal backdrop not found for click listener.');
            }

            const modalObject = {
                modal: modal,
                backdrop: backdrop,
                steps: steps,
                hide: hideModal, 
                show: () => {     
                    backdrop.classList.remove('hidden');
                    // Trigger the transition classes removal slightly after display to ensure animation works
                    requestAnimationFrame(() => {
                        modal.classList.remove('scale-95', 'opacity-0');
                    });
                }
            };

            return modalObject;
        } catch (error) {
            console.error('Error creating verification modal:', error);
            return null;
        }
    }

    /**
     * Create a download progress overlay on an ISO card
     * @param {HTMLElement} isoCard - The ISO card element to add the overlay to
     * @param {Object} iso - The ISO object
     * @returns {Object} - Object containing the overlay and its components
     */
    createDownloadOverlay(isoCard, iso) {
        if (!isoCard) {
            console.error('Cannot create download overlay: ISO card not provided');
            return null;
        }

        // Create overlay element
        const overlay = document.createElement('div');
        overlay.className = 'iso-card-download-overlay';
        overlay.innerHTML = `
            <svg class="download-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" stroke="#0ea5e9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 3"/>
                <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="#0ea5e9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="download-progress-text">0%</div>
            <div class="download-eta">Preparing download...</div>
        `;

        // Add overlay to card
        isoCard.appendChild(overlay);

        // Return references to overlay elements
        const elementsToReturn = {
            overlay,
            progressText: overlay.querySelector('.download-progress-text'),
            etaText: overlay.querySelector('.download-eta')
        };
        console.log('DEBUG: Returning overlay elements:', elementsToReturn);
        return elementsToReturn;
    }

    /**
     * Update the download progress overlay
     * @param {Object} overlayElements - Object containing overlay elements
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} eta - Estimated time remaining
     */
    updateDownloadOverlay(overlayElements, progress, eta) {
        // Simple check for required elements
        if (!overlayElements || !overlayElements.progressText || !overlayElements.etaText) {
            console.error('Cannot update download overlay: Invalid overlay elements');
            return;
        }

        // Update progress text - keep it simple
        overlayElements.progressText.textContent = `${Math.floor(progress)}%`;

        // Update ETA text - keep it simple
        overlayElements.etaText.textContent = eta || 'Calculating...';
    }

    /**
     * Remove the download overlay from an ISO card
     * @param {Object} overlayElements - Object containing overlay elements
     */
    removeDownloadOverlay(overlayElements) {
        if (!overlayElements || !overlayElements.overlay) {
            console.error('Cannot remove download overlay: Invalid overlay elements');
            return;
        }

        if (overlayElements.overlay.parentNode) {
            overlayElements.overlay.parentNode.removeChild(overlayElements.overlay);
        }
    }

    // Apply modern styling to UI elements
    applyModernStyling() {
        // Apply modern card styling
        const cards = document.querySelectorAll('.iso-card');
        cards.forEach(card => {
            card.classList.add('bg-slate-800', 'border', 'border-slate-700', 'hover:border-primary-400', 'transition-all', 'duration-300', 'shadow-lg', 'rounded-lg', 'overflow-hidden');
        });
        
        // Style buttons
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(button => {
            if (button.classList.contains('btn-primary')) {
                button.classList.add('bg-primary-600', 'hover:bg-primary-700', 'text-white', 'transition-all', 'duration-200');
            } else if (button.classList.contains('btn-secondary')) {
                button.classList.add('bg-slate-700', 'hover:bg-slate-600', 'text-white', 'transition-all', 'duration-200');
            }
        });
        
        // Style badges
        const badges = document.querySelectorAll('.badge');
        badges.forEach(badge => {
            badge.classList.add('text-xs', 'font-medium', 'py-1', 'px-2.5', 'rounded-full');
            
            if (badge.classList.contains('badge-success')) {
                badge.classList.add('bg-accent3-400', 'text-white');
            } else if (badge.classList.contains('badge-warning')) {
                badge.classList.add('bg-yellow-500', 'text-white');
            } else if (badge.classList.contains('badge-info')) {
                badge.classList.add('bg-primary-400', 'text-white');
            }
        });
    }

    /**
     * Show a success message
     * @param {string} message - Message to show
     */
    showSuccess(message) {
        this.createToast({
            type: 'success',
            title: 'Success',
            message: message
        });
    }
    
    /**
     * Show an error message
     * @param {string} message - Error message to show
     */
    showError(message) {
        this.createToast({
            type: 'error',
            title: 'Error',
            message: message,
            autoClose: false // Errors should stay visible
        });
    }
}
