/**
 * ISO Downloader Module
 * 
 * Handles ISO downloading and verification
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

// Import utility functions
const {
  formatSize,
  formatTime,
  updateDownloadProgress,
  createReadlineInterface,
  askQuestion,
  parseUrl
} = require('./iso-utils');

// Import hash verification functions
const {
  findHashFile,
  verifyIsoHash
} = require('./iso-hash-verifier');

/**
 * Fetch data from URL with support for redirects
 * @param {string} url - URL to fetch data from
 * @param {number} maxRedirects - Maximum number of redirects to follow
 * @returns {Promise<string>} - Response data
 */
async function fetchData(url, maxRedirects = 5) {
  let redirectCount = 0;
  
  return new Promise((resolve, reject) => {
    const fetchUrl = (currentUrl) => {
      // Determine if HTTP or HTTPS based on URL
      const httpModule = /^https:/i.test(currentUrl) ? https : http;
      
      httpModule.get(currentUrl, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          redirectCount++;
          
          if (redirectCount > maxRedirects) {
            reject(new Error(`Too many redirects (${maxRedirects})`));
            return;
          }
          
          const redirectUrl = new URL(response.headers.location, currentUrl).href;
          console.log(`Redirecting to: ${redirectUrl}`);
          fetchUrl(redirectUrl);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP Error: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        reject(err);
      });
    };
    
    fetchUrl(url);
  });
}

/**
 * Download and verify a file
 * @param {string} url - URL to download
 * @param {string} outputPath - Path to save the file
 * @param {string} expectedHash - Expected hash value
 * @param {string} hashAlgorithm - Hash algorithm to use
 * @returns {Promise<Object>} - Download result
 */
async function downloadAndVerifyFile(url, outputPath, expectedHash, hashAlgorithm) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const httpModule = /^https:/i.test(url) ? https : http;
    const hash = expectedHash ? crypto.createHash(hashAlgorithm) : null;
    let downloadedBytes = 0;
    let totalBytes = 0;
    const startTime = Date.now();
    
    console.log(`Downloading from ${url}`);
    console.log(`Saving to ${outputPath}`);
    
    const request = httpModule.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        console.log(`Redirecting to ${response.headers.location}`);
        downloadAndVerifyFile(response.headers.location, outputPath, expectedHash, hashAlgorithm)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP Error: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      // Get total file size if available
      if (response.headers['content-length']) {
        totalBytes = parseInt(response.headers['content-length'], 10);
      }
      
      response.pipe(file);
      
      // Update progress as data is received
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (hash) hash.update(chunk);
        updateDownloadProgress(downloadedBytes, totalBytes, startTime);
      });
      
      file.on('finish', () => {
        file.close();
        updateDownloadProgress(downloadedBytes, totalBytes, startTime, true);
        
        // Get download stats
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const speed = downloadedBytes / duration;
        
        console.log(`\nDownload completed in ${formatTime(duration)}`);
        console.log(`Average speed: ${formatSize(speed)}/s`);
        
        // Verify hash if expected hash was provided
        if (hash && expectedHash) {
          const calculatedHash = hash.digest('hex');
          console.log(`\nVerifying ${hashAlgorithm} hash:\n  Expected: ${expectedHash}\n  Actual:   ${calculatedHash}`);
          
          if (calculatedHash.toLowerCase() === expectedHash.toLowerCase()) {
            console.log('Hash verification: SUCCESS ');
            resolve({
              success: true,
              path: outputPath,
              size: downloadedBytes,
              duration: duration,
              speed: speed,
              hash: calculatedHash
            });
          } else {
            console.log('Hash verification: FAILED ');
            resolve({
              success: false,
              path: outputPath,
              error: 'Hash verification failed',
              expected: expectedHash,
              actual: calculatedHash
            });
          }
        } else {
          // No hash verification
          resolve({
            success: true,
            path: outputPath,
            size: downloadedBytes,
            duration: duration,
            speed: speed
          });
        }
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up partial file
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up partial file
      reject(err);
    });
  });
}

/**
 * Let user select an ISO to download
 * @param {Array<Object>} isos - List of ISO objects
 * @returns {Promise<Object>} - Selected ISO object
 */
async function selectIso(isos) {
  if (!isos || isos.length === 0) {
    throw new Error('No ISOs available');
  }
  
  console.log('\nAvailable ISOs:');
  
  // Display ISO list with indices
  isos.forEach((iso, index) => {
    const size = iso.prettySize || formatSize(iso.size || 0);
    console.log(`${index + 1}. ${iso.name} (${iso.osType}, ${size})`);
  });
  
  // Create readline interface
  const rl = createReadlineInterface();
  
  let selection = -1;
  while (selection < 0 || selection >= isos.length) {
    const answer = await askQuestion(`\nSelect an ISO to download (1-${isos.length}): `, rl);
    selection = parseInt(answer, 10) - 1;
    
    if (isNaN(selection) || selection < 0 || selection >= isos.length) {
      console.log(`Please enter a number between 1 and ${isos.length}.`);
      selection = -1;
    }
  }
  
  rl.close();
  
  return isos[selection];
}

/**
 * Download an ISO file, handle selection, and verify its hash
 * @param {Array<Object>} isos - List of ISO objects
 * @param {Object} options - Download options
 * @returns {Promise<Object>} - Download result
 */
async function downloadIso(isos, options) {
  try {
    // Let user select an ISO to download
    const selectedIso = await selectIso(isos);
    console.log(`\nSelected: ${selectedIso.name}`);
    console.log(`URL: ${selectedIso.link}`);
    
    // Extract filename from URL
    const { filename } = parseUrl(selectedIso.link);
    if (!filename) {
      throw new Error('Could not determine filename from URL');
    }
    
    // Determine download directory
    const config = loadConfig();
    const downloadDir = options.downloadDir || path.join(process.cwd(), config.downloadDir || 'ISO-Archive');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
      console.log(`Created download directory: ${downloadDir}`);
    }
    
    const outputPath = path.join(downloadDir, filename);
    
    // Check if file already exists
    if (fs.existsSync(outputPath)) {
      const rl = createReadlineInterface();
      const answer = await askQuestion(`\nFile already exists: ${outputPath}\nOverwrite? (y/n): `, rl);
      rl.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log('Download cancelled.');
        return { success: false, cancelled: true };
      }
    }
    
    // Download and verify file
    const result = await downloadAndVerifyFile(
      selectedIso.link,
      outputPath,
      selectedIso.hash,
      selectedIso.hashAlgorithm
    );
    
    // Test mode - delete file after verification
    if (options.testMode && result.success) {
      console.log('\nTest mode enabled - deleting downloaded file');
      fs.unlinkSync(outputPath);
      console.log(`File deleted: ${outputPath}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error downloading ISO: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Define loadConfig function (needed for downloadIso)
function loadConfig() {
  const configFile = 'iso-manager.conf';
  
  if (fs.existsSync(configFile)) {
    try {
      const fileContent = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      return { downloadDir: 'ISO-Archive' };
    }
  }
  
  return { downloadDir: 'ISO-Archive' };
}

module.exports = {
  fetchData,
  downloadAndVerifyFile,
  selectIso,
  downloadIso
};
