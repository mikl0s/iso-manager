// ISO Manager Module - Handles integration with iso-manager.js

export class IsoManager {
    constructor() {
        // Store active downloads for progress tracking
        this.activeDownloads = {};
        this.apiBaseUrl = '/api';
        this.archiveContents = [];
        this.eventHandlers = {};
        this.init();
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

    async init() {
        try {
            // Fetch initial archive contents
            await this.fetchArchiveContents();
            
            // Set up polling for archive changes
            this.startArchivePolling();
            
            console.log('IsoManager initialized successfully');
        } catch (error) {
            console.error('Error initializing IsoManager:', error);
        }
    }
    
    startArchivePolling() {
        // Poll for archive changes every 10 seconds
        this.archivePollingInterval = setInterval(async () => {
            try {
                const oldContents = [...this.archiveContents];
                await this.fetchArchiveContents();
                
                // Check if archive contents have changed
                if (this.hasArchiveChanged(oldContents, this.archiveContents)) {
                    console.log('Archive contents changed, emitting event');
                    this.emit('archive-changed', this.archiveContents);
                }
            } catch (error) {
                console.error('Error polling archive contents:', error);
            }
        }, 10000); // 10 seconds
    }
    
    hasArchiveChanged(oldContents, newContents) {
        // Simple check: different number of files
        if (oldContents.length !== newContents.length) return true;
        
        // Check if any files have changed
        const oldFilenames = oldContents.map(file => file.name).sort();
        const newFilenames = newContents.map(file => file.name).sort();
        
        // Compare filenames
        for (let i = 0; i < oldFilenames.length; i++) {
            if (oldFilenames[i] !== newFilenames[i]) return true;
        }
        
        return false;
    }

    async fetchList(url) {
        try {
            console.log('Fetching ISO list from:', url);
            const response = await fetch('/api/isos?url=' + encodeURIComponent(url));
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned ${response.status}: ${response.statusText}. ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Received ISO list data:', data);
            
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                console.warn('Received empty or invalid ISO list data');
                return [];
            }
            
            const processed = this.processIsoList(data);
            console.log(`Processed ${processed.length} ISOs`);
            return processed;
        } catch (error) {
            console.error('Error fetching ISO list:', error);
            throw new Error('Failed to fetch ISO list: ' + error.message);
        }
    }

    async updateIsoListWithArchiveStatus(isoList) {
        try {
            if (!isoList || !Array.isArray(isoList) || isoList.length === 0) {
                console.warn('Empty or invalid ISO list provided to updateIsoListWithArchiveStatus');
                return isoList || [];
            }
            
            console.log(`Updating archive status for ${isoList.length} ISOs`);
            
            // Fetch archive contents
            const archiveFiles = await this.fetchArchiveContents();
            console.log(`Found ${archiveFiles.length} files in archive`);
            
            // Update each ISO with archive status
            return isoList.map(iso => {
                const inArchive = this.isIsoInArchive(iso, archiveFiles);
                const updateAvailable = inArchive ? this.isUpdateAvailable(iso, archiveFiles) : false;
                
                return {
                    ...iso,
                    inArchive,
                    updateAvailable
                };
            });
        } catch (error) {
            console.error('Error updating ISO list with archive status:', error);
            return isoList; // Return original list on error
        }
    }

    processIsoList(data) {
        // Process the raw data from the API into a more usable format
        if (!data) {
            return [];
        }
        
        // Convert from object format to array format
        const isoArray = Object.entries(data).map(([name, details]) => {
            // Extract filename from URL if possible
            const url = details.url || '';
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1] || '';
            
            // Use size directly from the server (which now uses HTTP HEAD requests)
            // The server should now provide actual sizes from Content-Length headers
            return {
                name: name,
                url: url,
                filename: filename,
                hash: details.hash_value || details.hash,
                hashType: details.hash_type || 'unknown',
                size: details.size || 0,
                source: details.source || 'Unknown'
            };
        });
        
        return isoArray.map(iso => {
            // Determine OS type/distro from name or filename
            const osType = this.determineOsType(iso.name, iso.filename);
            
            return {
                ...iso,
                osType,
                osLogo: this.getOsLogo(osType),
                prettySize: this.formatFileSize(iso.size),
                date: this.estimateReleaseDate(iso.name, iso.filename),
                id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
            };
        });
    }

    // Fetch the size of a file using HTTP HEAD request via the server
    async getFileSize(url) {
        try {
            const response = await fetch(`/api/filesize?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            return data.size;
        } catch (error) {
            console.error('Error fetching file size:', error);
            return null;
        }
    }

    // Estimate release date based on ISO name or filename
    estimateReleaseDate(name, filename) {
        const fullText = `${name} ${filename}`.toLowerCase();
        
        // Look for year patterns like "20.04", "2023", etc.
        const yearPatterns = [
            { regex: /\b20\d{2}\b/, extract: (match) => match }, // Direct years like 2023
            { regex: /\b(\d{2})\.(\d{2})\b/, extract: (match) => `20${match[1]}-${match[2]}` }, // Format like 22.04
            { regex: /\brelease-(\d{4})\b/, extract: (match) => match[1] } // Format like release-2022
        ];
        
        for (const pattern of yearPatterns) {
            const match = fullText.match(pattern.regex);
            if (match) {
                // Try to create a nice formatted date
                try {
                    const dateStr = pattern.extract(match);
                    // Only add month/day if we have them, otherwise just use year
                    if (dateStr.includes('-')) {
                        const [year, month] = dateStr.split('-');
                        return new Date(`${year}-${month}-01`).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
                    } else {
                        return new Date(`${dateStr}-01-01`).toLocaleDateString(undefined, { year: 'numeric' });
                    }
                } catch (e) {
                    // If date parsing fails, just return the raw match
                    return match[0];
                }
            }
        }
        
        // Default to current year if no date found
        return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
    }

    determineOsType(name, filename) {
        // Default to 'other' if we can't determine
        if (!name && !filename) return 'other';
        
        // Combine name and filename for better detection
        const fullText = `${name} ${filename}`.toLowerCase();
        
        // Check for common distributions
        if (fullText.includes('ubuntu')) return 'ubuntu';
        if (fullText.includes('debian')) return 'debian';
        if (fullText.includes('fedora')) return 'fedora';
        if (fullText.includes('arch')) return 'arch';
        if (fullText.includes('opensuse') || fullText.includes('open suse')) return 'opensuse';
        if (fullText.includes('centos')) return 'centos';
        if (fullText.includes('mint')) return 'mint';
        if (fullText.includes('manjaro')) return 'manjaro';
        if (fullText.includes('elementaryos') || fullText.includes('elementary os')) return 'elementary';
        if (fullText.includes('kali')) return 'kali';
        if (fullText.includes('zorin')) return 'zorin';
        if (fullText.includes('pop!_os') || fullText.includes('pop os')) return 'pop';
        if (fullText.includes('windows')) return 'windows';
        if (fullText.includes('freebsd')) return 'freebsd';
        
        // Default to generic Linux if no specific match
        return 'linux';
    }

    getOsLogo(osType) {
        // Map OS types to devicon classes
        // See: https://devicon.dev/
        switch (osType) {
            case 'ubuntu':
                return 'devicon-ubuntu-plain';
            case 'debian':
                return 'devicon-debian-plain';
            case 'fedora':
                return 'devicon-fedora-plain';
            case 'arch':
                return 'devicon-linux-plain'; // Devicon doesn't have a specific Arch icon
            case 'opensuse':
                return 'devicon-opensuse-plain';
            case 'centos':
                return 'devicon-centos-plain';
            case 'windows':
                return 'devicon-windows8-original';
            case 'freebsd':
                return 'devicon-freebsd-plain';
            default:
                return 'devicon-linux-plain';
        }
    }

    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return 'Unknown';
        
        bytes = Number(bytes);
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        
        return `${bytes.toFixed(2)} ${units[i]}`;
    }

    // Helper method to extract filename from URL
    getFilenameFromUrl(url) {
        const urlParts = url.split('/');
        return urlParts[urlParts.length - 1] || '';
    }

    // Fetch the contents of the ISO archive
    async fetchArchive() {
        try {
            console.log('Fetching archive contents...');
            const response = await fetch('/api/archive');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch archive: ${response.status} ${response.statusText}`);
            }
            
            const archiveFiles = await response.json();
            console.log(`Fetched ${archiveFiles.length} files from archive`);
            return archiveFiles;
        } catch (error) {
            console.error('Error fetching archive:', error);
            return [];
        }
    }
    
    // Check if an ISO is in the archive
    isIsoInArchive(iso, archiveFiles) {
        if (!archiveFiles || !Array.isArray(archiveFiles) || archiveFiles.length === 0) {
            return false;
        }
        
        // Extract filename from URL
        const isoFilename = this.getFilenameFromUrl(iso.url);
        
        // Check if the ISO exists in the archive
        return archiveFiles.some(file => file.name === isoFilename);
    }
    
    // Check if an update is available for an ISO
    isUpdateAvailable(iso, archiveFiles) {
        if (!archiveFiles || !Array.isArray(archiveFiles) || archiveFiles.length === 0) {
            return false;
        }
        
        // Extract filename from URL
        const isoFilename = this.getFilenameFromUrl(iso.url);
        
        // Find the ISO in the archive
        const archivedIso = archiveFiles.find(file => file.name === isoFilename);
        
        if (!archivedIso) {
            return false;
        }
        
        // If we have a hash for both, compare them
        if (iso.hash && archivedIso.hash) {
            return iso.hash !== archivedIso.hash;
        }
        
        // If we have a size for both, compare them
        if (iso.size && archivedIso.size) {
            return iso.size !== archivedIso.size;
        }
        
        // If we don't have enough info to compare, assume no update is available
        return false;
    }
    
    async downloadIso(params, progressCallback) {
        try {
            // Create a download ID
            const downloadId = Date.now().toString();
            
            // Start the download via API
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: params.url,
                    outputPath: params.outputPath,
                    verify: params.verify,
                    hashAlgorithm: params.hashAlgorithm
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            if (!result.downloadId) {
                throw new Error('Server did not return a download ID');
            }
            
            // Store the download info
            this.activeDownloads[result.downloadId] = {
                url: params.url,
                outputPath: params.outputPath,
                verify: params.verify,
                hashAlgorithm: params.hashAlgorithm,
                status: 'starting',
                progress: 0,
                startTime: Date.now(),
                downloadId: result.downloadId // Store the ID for pause/cancel reference
            };
            
            // Set up progress polling
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`/api/download/${result.downloadId}`);
                    if (!statusResponse.ok) {
                        throw new Error(`Server returned ${statusResponse.status}`);
                    }
                    
                    const status = await statusResponse.json();
                    
                    // Update our local tracking
                    this.activeDownloads[result.downloadId] = {
                        ...this.activeDownloads[result.downloadId], // Preserve existing properties like startTime
                        ...status,
                        downloadId: result.downloadId // Ensure we keep the ID
                    };
                    
                    // Calculate progress metrics
                    const download = this.activeDownloads[result.downloadId];
                    const progressMetrics = this.calculateProgress(download);
                    
                    // Call the progress callback
                    if (typeof progressCallback === 'function') {
                        progressCallback({
                            ...status,
                            downloadId: result.downloadId,
                            speed: progressMetrics.speed || 0,
                            percentage: progressMetrics.percentage || 0,
                            eta: progressMetrics.eta || 0
                        });
                    }
                    
                    // Check if we're done
                    if (status.status === 'completed' || status.status === 'failed' || 
                        status.status === 'cancelled' || status.status === 'paused') {
                        clearInterval(pollInterval);
                        
                        if (status.status === 'completed') {
                            if (typeof progressCallback === 'function') {
                                // Send a final update with 100% completion
                                progressCallback({
                                    status: 'completed',
                                    progress: 100,
                                    bytesTransferred: status.totalBytes || 0,
                                    totalBytes: status.totalBytes || 0,
                                    speed: 0,
                                    result: status.result,
                                    downloadId: result.downloadId
                                });
                            }

                            // Now we can resolve the promise with the result
                            delete this.activeDownloads[result.downloadId];
                            return {
                                ...status.result,
                                downloadId: result.downloadId
                            };
                        } else if (status.status === 'cancelled') {
                            throw new Error('Download was cancelled');
                        } else if (status.status === 'paused') {
                            throw new Error('Download was paused');
                        } else {
                            throw new Error(status.error || 'Download failed');
                        }
                    }
                } catch (error) {
                    console.error('Error polling download status:', error);
                    clearInterval(pollInterval);
                    throw error;
                }
            }, 1000);
            
            // Return the current download info with the download ID
            return {
                downloadId: result.downloadId,
                url: params.url
            };
        } catch (error) {
            console.error('Error starting download:', error);
            throw new Error('Failed to download ISO: ' + error.message);
        }
    }

    async verifyIso(isoName) {
        try {
            console.log(`Verifying ISO: ${isoName}`);
            // Find the ISO in the archive
            const archiveFiles = await this.fetchArchiveContents();
            const archivedIso = archiveFiles.find(file => file.name === isoName);
            
            if (!archivedIso) {
                throw new Error(`ISO ${isoName} not found in archive`);
            }
            
            console.log(`Found ISO in archive: ${archivedIso.path}`);
            
            // Call the verify API
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: archivedIso.path,
                    algorithm: 'sha256'
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Verification failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Verification result:', result);
            return result;
        } catch (error) {
            console.error('Error verifying ISO:', error);
            throw error;
        }
    }

    // Helper method to handle file browsing (might need browser file API or Node.js integration)
    async browseForFile() {
        return new Promise((resolve) => {
            // Create a hidden file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.iso';
            
            // When a file is selected, resolve with its path
            input.onchange = (event) => {
                const file = event.target.files[0];
                if (file) {
                    resolve(file.path || file.name);
                } else {
                    resolve(null);
                }
            };
            
            // Trigger the file dialog
            input.click();
        });
    }

    // Calculate download speed and ETA
    calculateProgress(download) {
        if (!download || download.status !== 'downloading') {
            return {
                percentage: 0,
                speed: 0,
                eta: 0
            };
        }
        
        // Ensure we have all required properties
        if (!download.bytesTransferred || !download.totalBytes || !download.startTime) {
            return {
                percentage: 0,
                speed: 0,
                eta: 0
            };
        }
        
        const now = Date.now();
        const elapsedTime = (now - download.startTime) / 1000; // in seconds
        
        if (elapsedTime <= 0) return { percentage: 0, speed: 0, eta: 0 };
        
        // Calculate progress percentage
        const percentage = (download.bytesTransferred / download.totalBytes) * 100;
        
        // Calculate speed in bytes per second
        const speed = download.bytesTransferred / elapsedTime;
        
        // Calculate ETA in seconds
        const bytesRemaining = download.totalBytes - download.bytesTransferred;
        const eta = speed > 0 ? bytesRemaining / speed : 0;
        
        return {
            percentage,
            speed,
            eta
        };
    }

    async fetchArchiveContents() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/archive`);
            if (!response.ok) {
                throw new Error(`Failed to fetch archive contents: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            this.archiveContents = data;
            return data;
        } catch (error) {
            console.error('Error fetching archive contents:', error);
            return [];
        }
    }
}
