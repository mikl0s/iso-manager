// Utils Module - Helper functions for the application

export class Utils {
    // Get filename from a URL
    getFilenameFromUrl(url) {
        if (!url) return '';
        const urlParts = url.split('/');
        return urlParts[urlParts.length - 1] || '';
    }

    // Format bytes to human-readable format
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

    // Format date to a readable format
    formatDate(date) {
        if (!date) return 'Unknown';
        
        try {
            const d = new Date(date);
            return d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Invalid date';
        }
    }

    // Calculate time remaining from speed and size
    calculateEta(bytesTransferred, totalBytes, speedBytesPerSecond) {
        if (!bytesTransferred || !totalBytes || !speedBytesPerSecond || speedBytesPerSecond === 0) {
            return '--:--';
        }
        
        const bytesRemaining = totalBytes - bytesTransferred;
        const secondsRemaining = Math.floor(bytesRemaining / speedBytesPerSecond);
        
        if (secondsRemaining < 0) return '00:00';
        
        // Format as mm:ss or hh:mm:ss
        if (secondsRemaining < 3600) {
            const minutes = Math.floor(secondsRemaining / 60);
            const seconds = secondsRemaining % 60;
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            const hours = Math.floor(secondsRemaining / 3600);
            const minutes = Math.floor((secondsRemaining % 3600) / 60);
            const seconds = secondsRemaining % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // Format transfer speed
    formatSpeed(bytesPerSecond) {
        return this.formatFileSize(bytesPerSecond) + '/s';
    }
    
    // Generate a random ID
    generateId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
    
    // Validate a URL
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Simple hash function for strings
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
    
    // Debounce function to limit frequency of function calls
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const later = () => {
                timeout = null;
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Throttle function to limit frequency of function calls (different from debounce)
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Deep clone an object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    // Store data in localStorage with error handling
    storeData(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error storing data:', error);
            return false;
        }
    }
    
    // Retrieve data from localStorage with error handling
    retrieveData(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error retrieving data:', error);
            return null;
        }
    }
}
