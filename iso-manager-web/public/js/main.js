/**
 * ISO Manager Main Application
 * Coordinates all components and handles the main application logic
 */

// Import the UI class
import { UI } from './ui.js';

// Simple ISO Grid class
function IsoGrid(containerId, downloadHandler, verifyHandler, deleteHandler) {
  this.container = document.querySelector(containerId);
  this.downloadHandler = downloadHandler;
  this.verifyHandler = verifyHandler;
  this.deleteHandler = deleteHandler;
  
  if (!this.container) {
    console.error(`Container ${containerId} not found`);
  }
  
  this.showLoading = function(message) {
    if (!this.container) return;
    
    // Hide the container while loading
    this.container.classList.add('hidden');
    
    // Show the loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.classList.remove('hidden');
      const loadingText = loadingIndicator.querySelector('p');
      if (loadingText) {
        loadingText.textContent = message;
      }
    } else {
      // Fallback if loading indicator doesn't exist
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
          <p class="text-lg text-gray-300">${message}</p>
        </div>
      `;
      this.container.classList.remove('hidden');
    }
  };
  
  this.showError = function(message) {
    if (!this.container) return;
    
    // Hide the loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }
    
    // Show the container with error message
    this.container.classList.remove('hidden');
    this.container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8">
        <div class="text-red-500 text-6xl mb-4">
          <i class="fas fa-exclamation-circle"></i>
        </div>
        <p class="text-lg text-red-400 mb-4">${message}</p>
        <button id="retry-button" class="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded">
          <i class="fas fa-sync-alt mr-2"></i> Retry
        </button>
      </div>
    `;
    
    var retryButton = document.getElementById('retry-button');
    if (retryButton) {
      retryButton.addEventListener('click', function() {
        window.app.loadIsoList(true);
      });
    }
  };
  
  this.loadIsos = function(isoList) {
    if (!this.container) return;
    
    if (!isoList || isoList.length === 0) {
      this.showError('No ISOs found');
      return;
    }
    
    // Clear container
    this.container.innerHTML = '';
    
    // Remove hidden class to make the grid visible
    this.container.classList.remove('hidden');
    
    // Hide loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }
    
    // Add ISO cards directly to the container
    isoList.forEach(function(iso) {
      var card = this.createIsoCard(iso);
      this.container.appendChild(card);
    }.bind(this));
    
    // Check for title scrolling after adding to DOM
    this.container.querySelectorAll('[data-check-scrolling]').forEach(function(card) {
      const titleElement = card.querySelector('.scrolling-title');
      const titleContainer = card.querySelector('.title-container');
      if (titleElement && titleContainer) {
        // Wait for the DOM to be fully rendered
        setTimeout(() => {
          // If the title is wider than its container, keep the animation
          if (titleElement.offsetWidth > titleContainer.offsetWidth) {
            titleElement.classList.add('needs-scrolling');
          } else {
            // Otherwise remove the animation class
            titleElement.classList.remove('scrolling-title');
          }
        }, 100);
      }
      card.removeAttribute('data-check-scrolling');
    });
  };
  
  this.createIsoCard = function(iso) {
    var card = document.createElement('div');
    card.className = 'iso-card bg-dark-800 rounded-lg overflow-hidden border border-dark-700 hover:border-primary-500';
    card.dataset.isoId = iso.name; // Store the name

    // Extract and store filename (assuming it's derivable from URL if not present)
    let filename = iso.filename; // Use filename property if it exists
    if (!filename && iso.url) {
      try {
        const urlParts = iso.url.split('/');
        filename = urlParts[urlParts.length - 1];
      } catch (e) {
        console.warn('Could not extract filename from URL:', iso.url);
        filename = ''; // Fallback
      }
    }
    card.dataset.isoFilename = filename || ''; // Store the filename

    // Format size
    var sizeFormatted = this.formatFileSize(iso.size);
    
    // Determine OS logo based on OS name
    var osLogo = '';
    var osName = iso.name.toLowerCase();
    var osCode = 'LIN'; // Default to Linux
    
    // Try to find the OS in our mapping
    if (window.app && window.app.state.osMapping) {
      // First try exact matches
      if (window.app.state.osMapping[osName]) {
        osCode = window.app.state.osMapping[osName];
      } else {
        // Try partial matches
        var bestMatch = null;
        var bestMatchLength = 0;
        
        Object.keys(window.app.state.osMapping).forEach(function(key) {
          // Check if the key is a substring of the ISO name or vice versa
          if (osName.includes(key) && key.length > bestMatchLength) {
            bestMatch = window.app.state.osMapping[key];
            bestMatchLength = key.length;
          }
        });
        
        if (bestMatch) {
          osCode = bestMatch;
        } else {
          // Fallback to common OS types if no match found
          if (osName.includes('ubuntu')) {
            osCode = 'UBT';
          } else if (osName.includes('debian')) {
            osCode = 'DEB';
          } else if (osName.includes('windows')) {
            osCode = 'WIN';
          } else if (osName.includes('mint')) {
            osCode = 'MIN';
          } else if (osName.includes('freebsd')) {
            osCode = 'BSD';
          } else if (osName.includes('proxmox')) {
            osCode = 'LIN';
          } else if (osName.includes('fedora')) {
            osCode = 'FED';
          } else if (osName.includes('centos')) {
            osCode = 'CES';
          } else if (osName.includes('arch')) {
            osCode = 'ARL';
          }
        }
      }
    }
    
    console.log(`ISO: ${iso.name}, OS Code: ${osCode}`);
    
    // Set the card class based on OS for the accent color
    if (osName.includes('ubuntu')) {
      card.classList.add('ubuntu');
    } else if (osName.includes('debian')) {
      card.classList.add('debian');
    } else if (osName.includes('windows')) {
      card.classList.add('windows');
    } else if (osName.includes('mint')) {
      card.classList.add('mint');
    } else if (osName.includes('fedora')) {
      card.classList.add('fedora');
    } else if (osName.includes('freebsd')) {
      card.classList.add('freebsd');
    }
    
    // Create OS logo HTML using Font Awesome icons as fallback
    var faIcon = 'linux';
    if (osName.includes('windows')) {
      faIcon = 'windows';
    } else if (osName.includes('apple') || osName.includes('mac')) {
      faIcon = 'apple';
    } else if (osName.includes('android')) {
      faIcon = 'android';
    }
    
    // Use the OS logo images from the 48x48 directory
    osLogo = `<div class="os-logo">
      <img src="/OS-Logos/48x48/${osCode}.png" alt="${iso.name} logo" 
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
      <i class="fas fa-${faIcon}" style="display:none;font-size:2rem;color:#6b7280;"></i>
    </div>`;
    
    // Create badge based on status
    var badgeHtml = '';
    var actionText = 'Click to Download';
    var actionClass = 'download';
    var actionHandler = this.downloadHandler;
    var buttonColorClass = 'bg-primary-600 hover:bg-primary-700';
    
    if (iso.inArchive) {
      if (iso.updateAvailable) {
        // Show update button instead of verify button
        actionText = 'Update Available';
        actionClass = 'update';
        actionHandler = this.downloadHandler; // Use download handler for updates
        buttonColorClass = 'bg-accent2-500 hover:bg-accent2-600'; // Pink button for updates
      } else {
        // Regular verify button for archived ISOs without updates
        actionText = 'In archive - click to verify';
        actionClass = 'verify';
        actionHandler = this.verifyHandler;
        buttonColorClass = 'bg-accent3-500 hover:bg-accent3-600'; // Green button for archived ISOs
      }
    }
    
    // Determine version display
    var versionDisplay = iso.version || 'Latest';
    
    // Capture the specific iso object for this card
    const specificIso = iso;

    // Card content
    card.innerHTML = `
      <div class="card-accent"></div>
      <div class="p-4 flex flex-col h-full overflow-hidden">
        <div class="flex items-start">
          ${osLogo}
          <div class="ml-3 flex-grow overflow-hidden">
            <div class="title-container">
              <h3 class="text-lg font-semibold text-white mb-1 scrolling-title">${iso.name}</h3>
            </div>
            <div class="flex justify-between items-center">
              <div class="text-sm text-gray-400 flex items-center">
                <i class="fas fa-tag mr-1"></i>
                <span>${versionDisplay}</span>
              </div>
              <div class="text-sm text-gray-400 flex items-center ml-auto mr-2">
                <i class="fas fa-hdd mr-1"></i>
                <span>${this.formatFileSize(iso.size || 0)}</span>
              </div>
              ${badgeHtml} <!-- Display badge next to version if it exists -->
            </div>
          </div>
        </div>
        <div class="flex-grow"></div> <!-- Spacer -->
        <!-- Bottom section -->
        <div class="mt-4 flex items-center"> 
          <button class="${actionClass}-button ${buttonColorClass} text-white font-bold py-2 px-4 rounded flex items-center justify-center flex-grow mr-2"> 
            <i class="fas fa-${actionClass === 'download' ? 'download' : actionClass === 'update' ? 'sync-alt' : 'check-circle'} mr-2"></i>
            <span>${actionText}</span>
          </button>
          <button class="delete-iso-button text-red-500 hover:text-red-400 transition-colors duration-200 hidden p-1 rounded" title="Delete Downloaded ISO">
            <i class="fas fa-trash-alt text-sm"></i>
          </button>
        </div>
      </div>
    `;
    
    // --- Button Visibility & Event Listeners ---
    const actionButton = card.querySelector(`.${actionClass}-button`); // Main button (Download/Verify)
    const deleteButton = card.querySelector('.delete-iso-button'); // Trashcan icon button

    // Set visibility for delete button based on download state
    if (actionClass === 'verify') {
        deleteButton.classList.remove('hidden'); // Show trashcan when Verify is shown
    } else {
       deleteButton.classList.add('hidden');
    }

    // Add listener to the delete button
    if (deleteButton) {
        // Prevent duplicate listeners if card is updated later
        if (!deleteButton.dataset.listenerAttached) { 
            deleteButton.addEventListener('click', function() {
                window.app.deleteIsoFile(card.dataset.isoFilename, card);
            });
            deleteButton.dataset.listenerAttached = 'true'; // Mark as attached
        }
    }

    actionButton.dataset.isoFilename = card.dataset.isoFilename || '';

    // --- Revised Event Listener ---
    actionButton.addEventListener('click', (event) => {
      event.preventDefault(); // Prevent default button action
      const button = event.currentTarget;

      // Use the 'specificIso' captured from the outer scope
      if (specificIso) {
        // Determine which handler to call based on the button's class
        // this.downloadHandler/verifyHandler refer to the correctly bound
        // methods stored on the IsoGrid instance.
        if (button.classList.contains('download-button')) {
          this.downloadHandler(specificIso);
        } else if (button.classList.contains('verify-button')) {
          this.verifyHandler(specificIso);
        } else if (button.classList.contains('update-button')) {
          // For updates, we need to delete the old version first, then download the new one
          const oldFilename = card.dataset.isoFilename;
          if (oldFilename) {
            // First delete the old version
            console.log(`Updating ISO: deleting old version ${oldFilename} before downloading new version`);
            
            // Create a toast notification
            if (window.app && window.app.ui) {
              window.app.ui.createToast({ 
                message: `Updating ${specificIso.name}: removing old version...`, 
                type: 'info', 
                autoClose: true, 
                autoCloseDelay: 3000 
              });
            }
            
            // Store the ISO name for tracking the update process
            const isoBeingUpdated = specificIso.name;
            
            // Delete the old file first
            fetch(`/api/iso-archive/${encodeURIComponent(oldFilename)}`, {
              method: 'DELETE',
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`Server error ${response.status}`);
              }
              return response.json();
            })
            .then(data => {
              console.log('Old version deleted successfully, downloading new version');
              
              // Store reference to the card and ISO for updating after download
              if (window.app) {
                // Save the update info in the app state
                window.app.updateInfo = {
                  isBeingUpdated: true,
                  isoObject: specificIso,
                  cardElement: card
                };
              }
              
              // Now download the new version
              this.downloadHandler(specificIso);
            })
            .catch(error => {
              console.error('Error deleting old version:', error);
              // If deletion fails, still try to download the new version
              this.downloadHandler(specificIso);
            });
          } else {
            // If we can't find the old filename, just download the new version
            this.downloadHandler(specificIso);
          }
        }
      } else {
        // This case is less likely now, but good to have a fallback
        console.error(`ISO object was unexpectedly undefined for button: ${button.dataset.isoId}`);
        alert(`Error: Could not find ISO data for action.`); // Simple fallback alert
      }
    });
    // --- End Revised Listener ---

    // Check if title needs scrolling animation
    const titleElement = card.querySelector('.scrolling-title');
    const titleContainer = card.querySelector('.title-container');
    if (titleElement && titleContainer) {
      // Add the card to the DOM first so we can measure it
      // We'll check after it's been added to the DOM
      card.dataset.checkScrolling = 'true';
    }

    return card;
  };
  
  this.formatFileSize = function(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) {
      return 'Unknown size';
    }
    
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var size = bytes;
    var unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };
  
  this.updateIsoCard = function(iso) {
    // Find the card by iso name
    const card = document.querySelector(`[data-iso-id="${CSS.escape(iso.name)}"]`);
    if (!card) {
      console.error(`Card not found for ISO: ${iso.name}`);
      return;
    }
    
    // Log the update operation
    console.log(`Updating card for ISO: ${iso.name}, inArchive: ${iso.inArchive}`);
    
    // Re-create the card with updated state
    const newCard = this.createIsoCard(iso);
    card.parentNode.replaceChild(newCard, card);
  };
}

// Global OS list mapping
var osListMapping = null;

// Function to load OS list mapping
function loadOsListMapping() {
  if (osListMapping !== null) {
    return Promise.resolve(osListMapping);
  }
  
  return fetch('/OS-Logos/os-list.json')
    .then(response => response.json())
    .then(data => {
      osListMapping = {};
      // Create a mapping of lowercase name to code
      data.forEach(os => {
        osListMapping[os.name.toLowerCase()] = os.code;
        // Also map the slug for additional matching
        osListMapping[os.slug.toLowerCase()] = os.code;
      });
      return osListMapping;
    })
    .catch(error => {
      console.error('Error loading OS list mapping:', error);
      return {};
    });
}

// Simple class for handling ISO list
function IsoManagerApp() {
  // Initialize UI components
  this.ui = new UI();
  this.ui.init();
  
  // Create ISO grid
  this.isoGrid = new IsoGrid(
    '#isoGrid',
    this.handleDownloadRequest.bind(this),
    this.handleVerifyRequest.bind(this),
    this.deleteIsoFile.bind(this)
  );
  
  // Track application state
  this.state = {
    serverStatus: null,
    isoList: [],
    isoListUrl: null,
    activeDownloads: new Map(),
    osMapping: {},
    config: {},
    downloadedIsoFiles: [] // Holds filenames of ISOs present in the archive
  };
  
  // Load OS list mapping
  loadOsListMapping().then(mapping => {
    this.state.osMapping = mapping;
    console.log('OS mapping loaded:', Object.keys(mapping).length, 'entries');
  }).catch(error => {
    console.error('Failed to load OS mapping:', error);
  });
  
  // Fetch server configuration
  this.fetchServerStatus();
  
  // Fetch initially downloaded files
  this.fetchDownloadedIsos();
  
  // Initialize the application
  this.init();
}

IsoManagerApp.prototype.init = function() {
  try {
    // Show loading state
    this.isoGrid.showLoading('Initializing application...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load ISO list
    this.loadIsoList();
  } catch (error) {
    console.error('Error initializing application:', error);
    this.isoGrid.showError(`Failed to initialize application: ${error.message}`);
    this.ui.createToast({ message: `Initialization error: ${error.message}`, type: 'error', autoClose: false });
  }
};

IsoManagerApp.prototype.setupEventListeners = function() {
  // Settings button
  var settingsButton = document.getElementById('settingsBtn');
  if (settingsButton) {
    settingsButton.addEventListener('click', function() {
      this.showSettingsModal();
    }.bind(this));
  }

  // Search and Filter
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => this.filterIsoList());
  }

  // Refresh button
  var refreshButton = document.getElementById('refreshBtn');
  if (refreshButton) {
    refreshButton.addEventListener('click', function() {
      // Show a loading spinner on the button
      refreshButton.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
      refreshButton.disabled = true;
      
      // First refresh the links.json from GitHub
      fetch('/api/refresh-isos')
        .then(response => response.json())
        .then(data => {
          console.log('GitHub refresh result:', data);
          
          // Show a toast notification
          if (data.success) {
            this.ui.createToast({
              message: data.message,
              type: 'success',
              autoClose: true,
              autoCloseDelay: 3000
            });
          } else {
            this.ui.createToast({
              message: `Error refreshing from GitHub: ${data.error}`,
              type: 'error',
              autoClose: true,
              autoCloseDelay: 5000
            });
          }
          
          // Now load the ISO list with the refreshed data
          this.loadIsoList(true);
        })
        .catch(error => {
          console.error('Error refreshing from GitHub:', error);
          this.ui.createToast({
            message: `Error refreshing from GitHub: ${error.message}`,
            type: 'error',
            autoClose: true,
            autoCloseDelay: 5000
          });
          
          // Still try to refresh the ISO list
          this.loadIsoList(true);
        })
        .finally(() => {
          // Restore the button
          refreshButton.innerHTML = '<i class="fas fa-sync"></i>';
          refreshButton.disabled = false;
        });
    }.bind(this));
  }
  
  // URL input form
  var urlForm = document.getElementById('url-form');
  if (urlForm) {
    urlForm.addEventListener('submit', function(event) {
      event.preventDefault();
      var urlInput = document.getElementById('iso-list-url');
      if (urlInput && urlInput.value) {
        this.loadIsoList(true, urlInput.value);
      }
    }.bind(this));
  }

  // Settings Modal Buttons
  const closeBtn = document.getElementById('closeSettingsModalBtn');
  const cancelBtn = document.getElementById('cancelSettingsBtn');
  const saveBtn = document.getElementById('saveSettingsBtn');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.hideSettingsModal());
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => this.hideSettingsModal());
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', () => this.saveSettings());
  }
  
  // Clicking outside the modal content (on the backdrop) to close
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
      settingsModal.addEventListener('click', (event) => {
          // Check if the click is directly on the backdrop
          if (event.target === settingsModal) {
              this.hideSettingsModal();
          }
      });
  }
};

IsoManagerApp.prototype.fetchServerStatus = function() {
  var self = this;
  
  // Fetch server status and configuration
  console.log('Fetching server configuration...');
  fetch('/api/config')
    .then(function(response) {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(function(data) {
      console.log('Server configuration:', data);
      self.state.config = data;
      // Update state that might depend on config, like isoListUrl
      if (data.isoListUrl && !self.state.isoListUrl) {
        self.state.isoListUrl = data.isoListUrl;
        console.log('Setting initial ISO list URL from config:', self.state.isoListUrl);
      }
    })
    .catch(function(error) {
      console.error('Error fetching server config:', error);
      self.ui.createToast({ message: `Failed to load server configuration: ${error.message}`, type: 'error' });
    });
};

IsoManagerApp.prototype.loadIsoList = function(forceRefresh, url) {
  var self = this;
  try {
    // Show loading state
    this.isoGrid.showLoading('Loading ISO list...');
    
    // Determine URL to use
    var isoListUrl = url || 
      this.state.isoListUrl || 
      (this.state.config && this.state.config.isoListUrl) || // Use fetched config value
      'https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json'; // Default fallback URL
    
    // Ensure state reflects the URL being used
    if (isoListUrl !== this.state.isoListUrl) {
       this.state.isoListUrl = isoListUrl;
    }

    console.log(`Loading ISO list from ${isoListUrl}`);
    
    // Fetch ISO list
    fetch(`/api/isos?url=${encodeURIComponent(isoListUrl)}`)
      .then(function(response) {
        if (!response.ok) {
          const errorText = response.text();
          throw new Error(`Server returned ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return response.json();
      })
      .then(function(isoData) {
        console.log('Received ISO data:', isoData);
        
        // Convert the ISO object to an array for the grid
        var isoList = [];
        
        if (isoData && typeof isoData === 'object') {
          isoList = Object.entries(isoData).map(function([name, details]) {
            return {
              ...details,
              name: name
            };
          });
          console.log(`Processed ${isoList.length} ISOs`);
        } else {
          console.warn('Received invalid ISO data format');
          self.isoGrid.showError('Invalid ISO data format received from server');
          return;
        }
        
        // Update state
        self.state.isoList = isoList;
        
        // Update ISO grid
        self.isoGrid.loadIsos(isoList);
        
        // Show success toast that auto-disappears
        self.ui.createToast({
          message: `Loaded ${isoList.length} ISOs`,
          type: 'success',
          autoClose: true,
          autoCloseDelay: 3000
        });
      })
      .catch(function(error) {
        console.error('Error loading ISO list:', error);
        self.isoGrid.showError(`Failed to load ISO list: ${error.message}`);
        self.ui.createToast({ message: `Error loading ISO list: ${error.message}`, type: 'error', autoClose: false });
      });
  } catch (error) {
    console.error('Error in loadIsoList:', error);
    this.isoGrid.showError(`Error: ${error.message}`);
    this.ui.createToast({ message: `Error: ${error.message}`, type: 'error', autoClose: false });
  }
};

IsoManagerApp.prototype.handleDownloadRequest = function(iso) {
  var self = this;
  try {
    console.log('Download requested for:', iso);
    
    // Show a simple toast notification that download has started
    this.ui.createToast({
      message: `Download started for ${iso.name}`,
      type: 'info',
      autoClose: true,
      autoCloseDelay: 3000
    });
    
    // Find the ISO card in the DOM
    // --- Use CSS.escape() for the selector ---
    const isoCard = document.querySelector(`[data-iso-id="${CSS.escape(iso.name)}"]`);
    if (isoCard) {
      // Create download overlay using the UI class method
      const overlayElements = this.ui.createDownloadOverlay(isoCard, iso);
      
      // Call the API to start download
      fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: iso.url
        })
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(function(downloadInfo) {
        // Store download information
        self.state.activeDownloads.set(downloadInfo.downloadId, { 
          iso, 
          overlayElements,
          startTime: new Date(),
          progress: 0,
          isoCard
        });
        
        // Set up progress polling
        self.pollDownloadProgress(downloadInfo.downloadId);
      })
      .catch(function(error) {
        console.error('Error handling download request:', error);
        
        // Remove the overlay
        if (overlayElements) {
          self.ui.removeDownloadOverlay(overlayElements);
        }
        
        // Show error toast
        self.ui.createToast({ message: `Download error: ${error.message}`, type: 'error', autoClose: false });
      });
    } else {
      console.error('ISO card not found in DOM for:', iso.name);
      this.ui.createToast({ message: `Could not find ISO card for ${iso.name}`, type: 'error', autoClose: false });
    }
  } catch (error) {
    console.error('Error handling download request:', error);
    this.ui.createToast({ message: `Download error: ${error.message}`, type: 'error', autoClose: false });
  }
};

IsoManagerApp.prototype.pollDownloadProgress = function(downloadId) {
  var self = this;
  var downloadData = this.state.activeDownloads.get(downloadId);
  
  if (!downloadData) {
    console.warn(`No download data found for ID: ${downloadId}`);
    return;
  }
  
  // Poll the progress endpoint
  fetch(`/api/download/${downloadId}`)
    .then(function(response) {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(function(progressData) {
      console.log('Progress data received:', progressData);
      
      // Defensive coding - ensure progressData is an object
      if (!progressData || typeof progressData !== 'object') {
        console.warn('Invalid progress data received:', progressData);
        progressData = {}; // Use empty object as fallback
      }
      
      // Update download data - use the correct property name from the server response
      // Ensure progress is a number
      const progressValue = typeof progressData.progress === 'number' ? progressData.progress : 
                           (parseFloat(progressData.progress) || 0);
      downloadData.progress = progressValue;
      
      // If progress is 0 but status is 'downloading', set a minimum progress
      const status = progressData.status || '';
      if (status === 'downloading' && downloadData.progress === 0) {
        downloadData.progress = 1; // Set a minimum progress to show activity
      }
      
      // Calculate time remaining and speed if progress > 0
      var timeElapsed = (new Date() - downloadData.startTime) / 1000; // in seconds
      var speed = '';
      var timeRemaining = '';
      
      if (downloadData.progress > 0 && timeElapsed > 0) {
        // Ensure iso and size exist and size is a number
        if (downloadData.iso && typeof downloadData.iso.size === 'number' && downloadData.iso.size > 0) {
          // Calculate download speed
          var totalSize = downloadData.iso.size;
          var downloadedSize = totalSize * (downloadData.progress / 100);
          var speedBps = downloadedSize / timeElapsed;
          
          // Ensure UI and formatFileSize exist
          if (self.ui && typeof self.ui.formatFileSize === 'function') {
            speed = self.ui.formatFileSize(speedBps) + '/s';
          }
          
          // Calculate time remaining
          var remainingSize = totalSize - downloadedSize;
          var remainingSeconds = remainingSize / speedBps;
          
          if (remainingSeconds > 60) {
            var minutes = Math.floor(remainingSeconds / 60);
            var seconds = Math.floor(remainingSeconds % 60);
            timeRemaining = `${minutes}m ${seconds}s remaining`;
          } else {
            timeRemaining = `${Math.floor(remainingSeconds)}s remaining`;
          }
        } else {
          console.warn('Cannot calculate speed: Invalid ISO size', 
                      downloadData.iso ? downloadData.iso.size : 'ISO not available');
        }
      }
      
      // Update the progress display on the ISO card
      if (downloadData.overlayElements && downloadData.isoCard) {
        console.log('Updating progress display to:', downloadData.progress + '%');
        
        // Try the direct card update approach first
        const directUpdateSuccess = self.updateCardProgress(
          downloadData.iso.name,
          downloadData.progress,
          timeRemaining || 'Calculating...'
        );
        
        // If direct update fails, try the existing approaches
        if (!directUpdateSuccess) {
          // Get direct references to the text elements by their class names within the card
          const progressTextElement = downloadData.isoCard.querySelector('.download-progress-text');
          const etaTextElement = downloadData.isoCard.querySelector('.download-eta');
          
          if (progressTextElement && etaTextElement) {
            // Update progress text directly
            progressTextElement.textContent = `${Math.floor(downloadData.progress)}%`;
            
            // Update ETA text directly
            etaTextElement.textContent = timeRemaining || 'Calculating...';
            
            console.log('Direct update completed for progress text:', progressTextElement.textContent);
          } else {
            console.error('Progress text elements not found in card');
            
            // Fallback to the UI method
            self.ui.updateDownloadOverlay(downloadData.overlayElements, downloadData.progress, timeRemaining || 'Calculating...');
          }
        }
      }
      
      // If download is complete, update the UI
      if (progressData.status === 'completed') {
        // Create a success message
        var successMessage = `Download of ${downloadData.iso.name} completed successfully!`;
        console.log('Download completed:', successMessage);
        
        // Show success toast
        self.ui.createToast({
          message: successMessage,
          type: 'success',
          autoClose: true,
          autoCloseDelay: 5000
        });
        
        // Remove from active downloads
        self.state.activeDownloads.delete(downloadId);
        
        // Remove the overlay
        if (downloadData.overlayElements) {
          self.ui.removeDownloadOverlay(downloadData.overlayElements);
        }
        
        // --- Refresh the card to update its state (Download → Verify) ---
        if (downloadData.isoCard && downloadData.iso) {
          console.log('Refreshing card after download completion:', downloadData.iso.name);
          
          // Update the ISO object to indicate it's now downloaded
          downloadData.iso.inArchive = true;
          
          // Check if this was an update operation
          if (self.updateInfo && self.updateInfo.isBeingUpdated && 
              self.updateInfo.isoObject && self.updateInfo.isoObject.name === downloadData.iso.name) {
            
            console.log('This was an update operation, refreshing card to show new status');
            
            // Get the card element
            const cardElement = self.updateInfo.cardElement || downloadData.isoCard;
            
            // Get the new filename from the result
            const newFilename = progressData.result && progressData.result.filePath ? 
                               progressData.result.filePath.split('/').pop() : null;
            
            if (newFilename) {
              console.log(`Updating card with new filename: ${newFilename}`);
              // Update the card's dataset with the new filename
              cardElement.dataset.isoFilename = newFilename;
              // Also update the ISO object
              downloadData.iso.filename = newFilename;
            }
            
            // DIRECT DOM MANIPULATION - this is more reliable than updateIsoCard
            // Find the update button and change it to verify button
            const actionButton = cardElement.querySelector('.update-button');
            if (actionButton) {
              console.log('Found update button to change to verify button');
              
              // Change button appearance
              actionButton.classList.remove('update-button', 'bg-accent2-500', 'hover:bg-accent2-600');
              actionButton.classList.add('verify-button', 'bg-accent3-500', 'hover:bg-accent3-600');
              
              // Update icon and text
              const icon = actionButton.querySelector('i');
              const text = actionButton.querySelector('span');
              if (icon) icon.className = 'fas fa-check-circle mr-1.5';
              if (text) text.textContent = 'Verify';
              
              // Update the button's event listener to call verifyHandler instead of updateHandler
              actionButton.replaceWith(actionButton.cloneNode(true));
              const newButton = cardElement.querySelector('.verify-button');
              if (newButton) {
                newButton.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  self.isoGrid.verifyHandler(downloadData.iso);
                });
              }
              
              // Make sure delete button is visible and has the correct filename
              const deleteButton = cardElement.querySelector('.delete-iso-button');
              if (deleteButton) {
                deleteButton.classList.remove('hidden');
                // Update delete button event listener with new filename
                deleteButton.replaceWith(deleteButton.cloneNode(true));
                const newDeleteButton = cardElement.querySelector('.delete-iso-button');
                if (newDeleteButton && newFilename) {
                  newDeleteButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.isoGrid.deleteHandler(newFilename, cardElement);
                  });
                }
              }
            } else {
              console.warn('Could not find update button to change');
            }
            
            // Clear the update info
            self.updateInfo = null;
          } else {
            // Regular download completion - use the standard method
            self.isoGrid.updateIsoCard(downloadData.iso);
          }
        }
      } else if (progressData.status === 'error') {
        // Create an error message
        var errorMessage = `Download of ${downloadData.iso.name} failed: ${progressData.error || 'Unknown error'}`;
        console.log('Download error:', errorMessage);
        
        // Show error toast
        self.ui.createToast({
          message: errorMessage,
          type: 'error',
          autoClose: false
        });
        
        // Remove from active downloads
        self.state.activeDownloads.delete(downloadId);
        
        // Remove the overlay
        if (downloadData.overlayElements) {
          self.ui.removeDownloadOverlay(downloadData.overlayElements);
        }
      } else {
        // --- IMPORTANT: Continue polling for any status that's not 'completed' or 'error' ---
        console.log(`Continuing to poll download progress for ${downloadId}, current status: ${progressData.status}, progress: ${downloadData.progress}%`);
        setTimeout(function() {
          self.pollDownloadProgress(downloadId);
        }, 1000); // Poll every second
      }
    })
    .catch(function(error) {
      // Log the full error details to help diagnose the issue
      console.error('Error polling download progress:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // --- IMPORTANT: Continue polling despite errors ---
      console.log(`Continuing to poll download progress after error for ${downloadId}`);
      setTimeout(function() {
        self.pollDownloadProgress(downloadId);
      }, 2000); // Poll every 2 seconds after an error
    });
};

IsoManagerApp.prototype.updateCardProgress = function(isoName, progress, etaText) {
  try {
    // Find the card by iso name
    const card = document.querySelector(`[data-iso-id="${CSS.escape(isoName)}"]`);
    if (!card) {
      console.error(`Card not found for ISO: ${isoName}`);
      return false;
    }
    
    // Find the progress text and eta elements directly
    const progressText = card.querySelector('.download-progress-text');
    const etaTextElement = card.querySelector('.download-eta');
    
    if (!progressText || !etaTextElement) {
      console.error(`Progress elements not found in card for ISO: ${isoName}`);
      return false;
    }
    
    // Update the text content directly
    progressText.textContent = `${Math.floor(progress)}%`;
    etaTextElement.textContent = etaText || 'Calculating...';
    
    console.log(`Direct card update: ${isoName} - ${Math.floor(progress)}% - ${etaText}`);
    return true;
  } catch (error) {
    console.error('Error updating card progress:', error);
    return false;
  }
};

IsoManagerApp.prototype.handleVerifyRequest = function(iso) {
  var self = this;
  console.log('handleVerifyRequest called with ISO:', iso); 
  let verificationModal = null; 

  try {
    console.log('Verification requested for:', iso);

    // Check if the ISO has a path property
    if (!iso.path) {
      const archivePath = self.state.config.isoArchive || '../ISO-Archive';
      const isoFilename = new URL(iso.url).pathname.split('/').pop();
      iso.path = `${archivePath}/${isoFilename}`;
      console.log('Constructed ISO path:', iso.path);
    }

    // --- Use UI.js to create the modal --- 
    verificationModal = self.ui.createVerificationModal(iso);
    if (!verificationModal || !verificationModal.steps || !verificationModal.modal) {
      console.error('Failed to create verification modal or modal structure is invalid.');
      self.ui.createToast({ message: 'Failed to create verification modal.', type: 'error', autoClose: false });
      return;
    }
    verificationModal.show(); 
    verificationModal.steps.hashStep.updateStatus('pending'); 

    // Call the API to verify ISO
    fetch('/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: iso.path,
        algorithm: iso.hashAlgorithm || 'sha256',
        expectedHash: iso.hash || ''
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => { 
          let errorMessage = `Server error ${response.status}: ${text || response.statusText}`; 
          try {
            const errorJson = JSON.parse(text);
            errorMessage = errorJson.error || errorMessage;
          } catch (e) { /* Ignore */ }
          // Add error details to the error object
          const error = new Error(errorMessage);
          error.details = text; // Store raw response text
          throw error;
        });
      }
      return response.json();
    })
    .then(result => {
      console.log('Verification result:', result);

      // --- Update modal steps based on API result --- 
      verificationModal.steps.hashStep.updateStatus('success');
      const algorithm = result.algorithm ? result.algorithm.toUpperCase() : 'SHA256';
      const hashDisplay = result.hash || 'N/A';
      verificationModal.steps.hashStep.updateDetails(`Calculated ${algorithm}: ${hashDisplay}`);

      if (result.isValid) {
        verificationModal.steps.compareStep.updateStatus('success');
        verificationModal.steps.compareStep.updateDetails('Hash values match. The ISO is authentic.');
      } else {
        verificationModal.steps.compareStep.updateStatus('error');
        const expectedHash = result.expectedHash || 'Not provided';
        verificationModal.steps.compareStep.updateDetails(
          `Hashes do not match!\nExpected: ${expectedHash}\nActual:   ${hashDisplay}`
        );
      }
      // --- End modal update --- 
    })
    .catch(error => {
      console.error('Error during verification API call:', error);
      
      // --- Update modal steps to show error --- 
      if (verificationModal && verificationModal.steps) { 
        // Determine which step failed based on error or assume hash/compare failed
        verificationModal.steps.hashStep.updateStatus('error');
        verificationModal.steps.hashStep.updateDetails('Failed during hash calculation or comparison.');
        verificationModal.steps.compareStep.updateStatus('error');
        verificationModal.steps.compareStep.updateDetails(`Error: ${error.message}`);
      }
      // --- End modal error update --- 
    }); // End of fetch promise chain
  } catch (error) {
    console.error('Error setting up verification request:', error);
    // Show toast for errors *before* modal creation or fetch call
    self.ui.createToast({ message: `Setup error: ${error.message}`, type: 'error', autoClose: false });
  }
};

IsoManagerApp.prototype.showSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  const urlInput = document.getElementById('settingsIsoListUrlInput');
  const downloadPathInput = document.getElementById('settingsDefaultDownloadPathInput');
  // Add other inputs like hash algo, auto verify when implemented

  if (modal && urlInput && downloadPathInput) {
    // Populate with current state/config
    urlInput.value = this.state.isoListUrl || '';
    downloadPathInput.value = this.state.config?.defaultDownloadPath || '';
    // Populate other fields...

    modal.classList.remove('hidden');
  } else {
    console.error('Settings modal elements not found!');
    this.ui.createToast({ message: 'Could not open settings.', type: 'error' });
  }
};

IsoManagerApp.prototype.hideSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

IsoManagerApp.prototype.saveSettings = function() {
  const newUrl = document.getElementById('settingsIsoListUrlInput').value.trim();
  const newDownloadPath = document.getElementById('settingsDefaultDownloadPathInput').value.trim();
  // Get other settings values here when implemented

  const settingsPayload = {
      // Only include settings that are meant to be saved
      ...(newUrl && { isoListUrl: newUrl }),
      ...(newDownloadPath && { defaultDownloadPath: newDownloadPath }),
      // Add other settings to payload when implemented
      // defaultHashAlgorithm: ..., 
      // autoVerify: ... 
  };

  // Check if there's anything to save
  if (Object.keys(settingsPayload).length === 0) {
     this.ui.createToast({ message: 'No settings changed.', type: 'info', autoClose: true, autoCloseDelay: 2000 });
     this.hideSettingsModal();
     return;
  }
  
  console.log('Attempting to save settings:', settingsPayload);

  // Send updated settings to the backend
  fetch('/api/config', {
      method: 'POST', // Or PUT, depending on backend implementation
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify(settingsPayload),
  })
  .then(response => {
      if (!response.ok) {
          // Try to get error message from backend response body
          return response.text().then(text => { 
              throw new Error(`Server error ${response.status}: ${text || response.statusText}`); 
          });
      }
      return response.json(); // Assuming backend returns updated config or success message
  })
  .then(updatedConfig => {
      console.log('Settings saved successfully:', updatedConfig);
      this.ui.createToast({ message: 'Settings saved successfully!', type: 'success', autoClose: true, autoCloseDelay: 3000 });
      
      // Update local state with potentially confirmed/updated values from backend
      this.state.config = { ...this.state.config, ...updatedConfig }; 
      if (updatedConfig.isoListUrl) {
          this.state.isoListUrl = updatedConfig.isoListUrl;
          // Reload ISO list only if the URL actually changed and was saved
          if (newUrl && newUrl !== this.state.isoListUrl) {
              console.log('Reloading ISO list due to URL change.');
              this.loadIsoList(true, newUrl);
          } else {
              console.log('ISO List URL confirmed, no reload needed.');
          }
      }
      this.hideSettingsModal();
  })
  .catch(error => {
      console.error('Error saving settings:', error);
      this.ui.createToast({ message: `Failed to save settings: ${error.message}`, type: 'error', autoClose: false });
      // Optionally, don't hide the modal on error
  });

};

IsoManagerApp.prototype.filterIsoList = function() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const isoGridContainer = document.getElementById('isoGrid');
  const isoCards = isoGridContainer.querySelectorAll('.iso-card');
  let visibleCount = 0;

  isoCards.forEach(card => {
    const isoName = card.dataset.isoId.toLowerCase(); // Assuming isoId stores the name
    const isoFilename = card.dataset.isoFilename.toLowerCase(); // Get filename
    // Add more fields to search if needed, e.g., iso.filename if stored
    const isMatch = isoName.includes(searchTerm) || isoFilename.includes(searchTerm);

    if (isMatch) {
      card.style.display = ''; // Show card
      visibleCount++;
    } else {
      card.style.display = 'none'; // Hide card
    }
  });

  // Handle empty state (Optional: Show/hide an empty state message)
  const emptyState = document.getElementById('emptyState');
  if (emptyState) {
    if (visibleCount === 0 && this.state.isoList.length > 0) {
      emptyState.classList.remove('hidden');
      // Optionally update empty state text for search context
      const emptyText = emptyState.querySelector('h3');
      if (emptyText) emptyText.textContent = 'No ISOs Match Your Search';
      const emptyPara = emptyState.querySelector('p');
      if (emptyPara) emptyPara.textContent = 'Try adjusting your search term.';
    } else {
      emptyState.classList.add('hidden');
    }
  }
};

IsoManagerApp.prototype.fetchDownloadedIsos = function() {
  console.log("Fetching list of downloaded ISOs...");
  fetch('/api/iso-archive')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(filenames => {
      console.log("Downloaded ISOs found:", filenames);
      this.state.downloadedIsoFiles = filenames;
      // Re-render or update cards if necessary after fetching
      // This might be complex depending on how rendering is handled.
      // For now, we assume cards are created *after* this fetch completes or
      // that createIsoCard will be called again when needed.
      // If cards are already rendered, we might need to iterate them:
       this.updateExistingCardDeleteButtons(); 
    })
    .catch(error => {
      console.error('Error fetching downloaded ISO list:', error);
      this.ui.createToast({ message: 'Failed to get list of downloaded ISOs.', type: 'error' });
      this.state.downloadedIsoFiles = []; // Ensure it's empty on error
    });
};

IsoManagerApp.prototype.updateExistingCardDeleteButtons = function() {
    const isoGridContainer = document.getElementById('isoGrid');
    if (!isoGridContainer) return;
    const cards = isoGridContainer.querySelectorAll('.iso-card');
    cards.forEach(card => {
        const deleteButton = card.querySelector('.delete-iso-button');
        const filename = card.dataset.isoFilename;
        if (deleteButton && filename) {
            if (this.state.downloadedIsoFiles.includes(filename)) {
                deleteButton.classList.remove('hidden');
                // Ensure listener is attached (might need removal first if re-attaching)
                 // Check if listener already exists to prevent duplicates
                if (!deleteButton.dataset.listenerAttached) {
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (filename) {
                            this.deleteIsoFile(filename, card);
                        }
                    });
                    deleteButton.dataset.listenerAttached = 'true'; // Mark as attached
                }
            } else {
                deleteButton.classList.add('hidden');
                 // Optionally remove listener if hiding?
                 // For simplicity, we might leave it, but ideally, it would be removed.
            }
        }
    });
};

IsoManagerApp.prototype.deleteIsoFile = function(filename, cardElement) {
  if (!filename) {
    console.error("Delete attempt failed: filename is missing.");
    return;
  }
  console.log(`Attempting to delete ISO file: ${filename}`);
  this.ui.createToast({ message: `Deleting ${filename}...`, type: 'info', autoClose: true, autoCloseDelay: 3000 });

  fetch(`/api/iso-archive/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  })
  .then(response => {
    // No need to close toasts manually, they will auto-close
    
    if (!response.ok) {
      return response.json().then(errData => {
        throw new Error(errData.error || `Server error ${response.status}`);
      }).catch(() => {
        throw new Error(`Server error ${response.status}`); // Fallback if no JSON error body
      });
    }
    return response.json();
  })
  .then(data => {
    console.log('Delete successful, server response:', data);
    this.ui.createToast({ message: `'${filename}' deleted successfully.`, type: 'success', autoClose: true, autoCloseDelay: 3000 });

    // Update state
    this.state.downloadedIsoFiles = this.state.downloadedIsoFiles.filter(f => f !== filename);

    // Update UI for the specific card
    if (cardElement) {
      const isoId = cardElement.dataset.isoId;
      if (isoId) {
        // Find the ISO object
        const isoObject = this.state.isoList.find(item => item.name === isoId);
        if (isoObject) {
          // Update the ISO object to indicate it's no longer in the archive
          isoObject.inArchive = false;
          
          // Force a refresh of the card
          console.log('Forcing card refresh after delete for:', isoId);
          
          // Option 1: Use the updateIsoCard method
          this.isoGrid.updateIsoCard(isoObject);
          
          // Option 2: Direct DOM manipulation as fallback
          const downloadButton = cardElement.querySelector('.verify-button');
          if (downloadButton) {
            // Change button appearance
            downloadButton.classList.remove('verify-button', 'bg-accent3-500', 'hover:bg-accent3-600');
            downloadButton.classList.add('download-button', 'bg-primary-600', 'hover:bg-primary-700');
            
            // Update icon and text
            const icon = downloadButton.querySelector('i');
            const text = downloadButton.querySelector('span');
            if (icon) icon.className = 'fas fa-download mr-1.5';
            if (text) text.textContent = 'Download';
            
            // Hide delete button
            const deleteBtn = cardElement.querySelector('.delete-iso-button');
            if (deleteBtn) deleteBtn.classList.add('hidden');
          }
        } else {
          console.warn("Could not find ISO object to refresh card after delete for:", isoId);
        }
      }
    }
  })
  .catch(error => {
    console.error('Error deleting ISO file:', error);
    this.ui.createToast({ message: `Error deleting file: ${error.message}`, type: 'error', autoClose: true, autoCloseDelay: 5000 });
  });
};

IsoManagerApp.prototype.replaceButtonListener = function(button, newHandler, isoObject) {
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    newButton.addEventListener('click', (e) => {
        e.stopPropagation();
        newHandler.call(this, isoObject);
    });
};

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.app = new IsoManagerApp();
});
