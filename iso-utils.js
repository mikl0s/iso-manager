/**
 * ISO Manager Utilities Module
 * 
 * Contains utility functions for ISO Manager
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Format time in human-readable format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${remainingMinutes}m`;
  }
}

/**
 * Update download progress in the console
 * @param {number} downloaded - Bytes downloaded
 * @param {number} total - Total bytes
 * @param {number} startTime - Start time in milliseconds
 * @param {boolean} final - If this is the final update
 */
function updateDownloadProgress(downloaded, total, startTime, final = false) {
  const elapsed = (Date.now() - startTime) / 1000;
  const speed = downloaded / elapsed;
  const percentage = total ? Math.min(100, Math.floor((downloaded / total) * 100)) : 0;
  const eta = speed > 0 ? formatTime((total - downloaded) / speed) : 'Unknown';
  
  // Create progress bar
  const progressBarLength = 30;
  const filledLength = Math.floor(progressBarLength * (percentage / 100));
  const bar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
  
  // Format status line
  const status = `${formatSize(downloaded)}${total ? '/' + formatSize(total) : ''} | ${formatSize(speed)}/s | ${percentage}% ${bar} | ETA: ${eta}`;
  
  // Clear line and print progress
  process.stdout.write('\r\x1b[K' + status);
  
  if (final) {
    console.log(''); // End with a newline
  }
}

/**
 * Create readline interface for user input
 * @returns {readline.Interface} - Readline interface
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a question and get user input
 * @param {string} question - Question to ask
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<string>} - User input
 */
async function askQuestion(question, rl) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

/**
 * Escape regular expression special characters
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Estimate ISO file size based on name and type
 * @param {string} name - ISO name
 * @param {string} type - OS type
 * @returns {number} - Estimated size in bytes
 */
function estimateIsoSize(name, type) {
  // Default sizes based on distribution type
  const defaultSizes = {
    ubuntu: 2.5 * 1024 * 1024 * 1024, // 2.5GB
    debian: 3.5 * 1024 * 1024 * 1024, // 3.5GB
    fedora: 2.2 * 1024 * 1024 * 1024, // 2.2GB
    centos: 9 * 1024 * 1024 * 1024,   // 9GB
    arch: 700 * 1024 * 1024,          // 700MB
    alpine: 150 * 1024 * 1024,        // 150MB
    gentoo: 4 * 1024 * 1024 * 1024,   // 4GB
    opensuse: 4.7 * 1024 * 1024 * 1024, // 4.7GB
    manjaro: 2.5 * 1024 * 1024 * 1024,  // 2.5GB
    pop: 2.7 * 1024 * 1024 * 1024,      // 2.7GB
    mint: 2.2 * 1024 * 1024 * 1024,     // 2.2GB
    kali: 3.5 * 1024 * 1024 * 1024,     // 3.5GB
    default: 2 * 1024 * 1024 * 1024     // 2GB default
  };
  
  // Convert type to lowercase for comparison
  const lowerType = type.toLowerCase();
  
  // Get base size from default sizes
  let size = defaultSizes[lowerType] || defaultSizes.default;
  
  // Adjust size based on name patterns
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('dvd') || lowerName.includes('everything')) {
    size *= 1.5; // DVD or complete editions are typically larger
  } else if (lowerName.includes('minimal') || lowerName.includes('netinst') || lowerName.includes('net-install')) {
    size *= 0.3; // Minimal/netinst editions are smaller
  } else if (lowerName.includes('server')) {
    size *= 0.8; // Server editions are typically smaller than desktop editions
  } else if (lowerName.includes('live')) {
    size *= 0.9; // Live editions may be slightly smaller
  }
  
  return Math.round(size);
}

/**
 * Detect distribution type from ISO name
 * @param {string} name - ISO name
 * @returns {string} - Distribution type
 */
function detectDistroType(name) {
  const lowerName = name.toLowerCase();
  
  // Define patterns for different distributions
  const patterns = [
    { pattern: /(ubuntu|xubuntu|kubuntu|lubuntu)/, type: 'ubuntu' },
    { pattern: /debian/, type: 'debian' },
    { pattern: /fedora/, type: 'fedora' },
    { pattern: /centos|alma|rocky/, type: 'centos' },
    { pattern: /arch/, type: 'arch' },
    { pattern: /alpine/, type: 'alpine' },
    { pattern: /gentoo/, type: 'gentoo' },
    { pattern: /opensuse|tumbleweed|leap/, type: 'opensuse' },
    { pattern: /manjaro/, type: 'manjaro' },
    { pattern: /pop.?os/, type: 'pop' },
    { pattern: /mint/, type: 'mint' },
    { pattern: /kali/, type: 'kali' }
  ];
  
  // Check each pattern
  for (const { pattern, type } of patterns) {
    if (pattern.test(lowerName)) {
      return type;
    }
  }
  
  // Default to unknown if no match found
  return 'unknown';
}

/**
 * Parse URL to extract components
 * @param {string} url - URL to parse
 * @returns {Object} - URL components
 */
function parseUrl(url) {
  try {
    const urlObj = new URL(url);
    const filename = path.basename(urlObj.pathname);
    const directory = path.dirname(urlObj.pathname);
    const host = urlObj.hostname;
    
    return {
      protocol: urlObj.protocol,
      host,
      directory,
      filename,
      port: urlObj.port,
      url: urlObj.href
    };
  } catch (error) {
    console.error(`Invalid URL: ${url}`);
    return {};
  }
}

module.exports = {
  formatSize,
  formatTime,
  updateDownloadProgress,
  createReadlineInterface,
  askQuestion,
  escapeRegExp,
  estimateIsoSize,
  detectDistroType,
  parseUrl
};
