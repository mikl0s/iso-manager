/**
 * ISO Hash Verification Module
 * 
 * Handles hash verification of ISO files
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

// Import utility functions
const { parseUrl } = require('./iso-utils');
const { fetchData } = require('./iso-downloader');

/**
 * Extract hash from a hash file
 * @param {string} fileContent - Content of the hash file
 * @param {string} filename - ISO filename to match
 * @param {string} hashAlgorithm - Hash algorithm to match
 * @returns {string|null} - Hash value or null if not found
 */
function extractHashFromFile(fileContent, filename, hashAlgorithm) {
  // Different hash file formats
  
  // Format 1: <hash> <filename> (standard *sum output)
  const hashLine = fileContent.split('\n').find(line => {
    return line.toLowerCase().includes(filename.toLowerCase()) && 
           !line.startsWith('#') && !line.startsWith('//') && line.trim() !== '';
  });
  
  if (hashLine) {
    // Try to extract hash from the line
    // Standard hash formats are typically <hash><space or two spaces><filename>
    const match = hashLine.match(/^([0-9a-fA-F]+)[\s*]+([^\s].*)$/);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    
    // Alternative format: filename hash
    const altMatch = hashLine.match(/^([^\s].*)[\s*]+([0-9a-fA-F]+)$/);
    if (altMatch && altMatch[2]) {
      return altMatch[2].toLowerCase();
    }
  }
  
  // Format 2: JSON file with hash data
  try {
    const jsonData = JSON.parse(fileContent);
    
    // Check for common JSON structures
    if (jsonData.hashes && jsonData.hashes[filename]) {
      return jsonData.hashes[filename][hashAlgorithm] || jsonData.hashes[filename];
    }
    
    if (jsonData[filename]) {
      return jsonData[filename][hashAlgorithm] || jsonData[filename];
    }
    
    if (jsonData[hashAlgorithm]) {
      return jsonData[hashAlgorithm][filename] || jsonData[hashAlgorithm];
    }
  } catch (e) {
    // Not a JSON file, continue with other formats
  }
  
  // Format 3: Specific hash files like sha256sum.txt with just the hash
  if (fileContent.trim().match(/^[0-9a-fA-F]+$/)) {
    return fileContent.trim().toLowerCase();
  }
  
  return null;
}

/**
 * Find and fetch hash file for an ISO
 * @param {string} isoUrl - URL of the ISO file
 * @param {string} hashAlgorithm - Hash algorithm (e.g., sha256)
 * @param {string} hashMatch - Pattern for hash file name
 * @returns {Promise<string|null>} - Hash value or null if not found
 */
async function findHashFile(isoUrl, hashAlgorithm = 'sha256', hashMatch = '{filename}.{hashAlgorithm}') {
  try {
    const { directory, filename, url } = parseUrl(isoUrl);
    
    if (!filename) {
      throw new Error('Could not determine filename from URL');
    }
    
    // Replace placeholders in hash match pattern
    const hashFilePattern = hashMatch
      .replace('{filename}', filename)
      .replace('{hashAlgorithm}', hashAlgorithm);
    
    // Try common hash file locations and naming patterns
    const potentialHashUrls = [
      // Pattern from hashMatch
      `${directory}/${hashFilePattern}`,
      // Standard hash files
      `${directory}/${filename}.${hashAlgorithm}`,
      `${directory}/${hashAlgorithm}sum.txt`,
      `${directory}/${hashAlgorithm}sums.txt`,
      `${directory}/hashes.${hashAlgorithm}`,
      `${directory}/hashes.txt`,
      `${directory}/HASHES`,
      `${directory}/CHECKSUM`,
      `${directory}/SHA256SUMS`,
      `${directory}/MD5SUMS`,
      // Within parent directory
      `${path.dirname(directory)}/${hashAlgorithm}sum.txt`,
      `${path.dirname(directory)}/hashes.txt`
    ];
    
    // Try each potential hash URL
    for (const hashUrl of potentialHashUrls) {
      try {
        console.log(`Checking for hash file at: ${hashUrl}`);
        const hashContent = await fetchData(hashUrl);
        
        if (hashContent) {
          const hash = extractHashFromFile(hashContent, filename, hashAlgorithm);
          if (hash) {
            console.log(`Found hash in ${hashUrl}: ${hash}`);
            return hash;
          }
        }
      } catch (error) {
        // Ignore errors and try next URL
        continue;
      }
    }
    
    console.log('Could not find hash file. Hash verification will be skipped.');
    return null;
  } catch (error) {
    console.error(`Error finding hash file: ${error.message}`);
    return null;
  }
}

/**
 * Calculate hash of a file from URL
 * @param {string} url - URL of the file
 * @param {string} algorithm - Hash algorithm to use
 * @returns {Promise<string>} - Calculated hash
 */
async function calculateHashFromUrl(url, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const httpModule = /^https:/i.test(url) ? https : http;
    
    httpModule.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP Error: ${response.statusCode}`));
        return;
      }
      
      response.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      response.on('end', () => {
        resolve(hash.digest('hex'));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Verify an ISO's hash
 * @param {Object} iso - ISO object with url and hash properties
 * @returns {Promise<Object>} - Verification result
 */
async function verifyIsoHash(iso) {
  try {
    console.log(`Verifying hash for ${iso.name}...`);
    
    // Get hash from ISO object or try to find it
    let expectedHash = iso.hash;
    const hashAlgorithm = iso.hashAlgorithm || 'sha256';
    
    if (!expectedHash) {
      console.log('No hash provided, attempting to find hash file...');
      expectedHash = await findHashFile(iso.link, hashAlgorithm);
      
      if (!expectedHash) {
        return {
          success: false,
          message: 'No hash available for verification',
          iso
        };
      }
    }
    
    console.log(`Expected hash (${hashAlgorithm}): ${expectedHash}`);
    console.log('Calculating actual hash (this may take some time)...');
    
    const actualHash = await calculateHashFromUrl(iso.link, hashAlgorithm);
    console.log(`Actual hash (${hashAlgorithm}): ${actualHash}`);
    
    const match = expectedHash.toLowerCase() === actualHash.toLowerCase();
    
    return {
      success: match,
      message: match ? 'Hash verification successful' : 'Hash verification failed',
      iso,
      expectedHash,
      actualHash,
      hashAlgorithm
    };
  } catch (error) {
    console.error(`Hash verification error: ${error.message}`);
    return {
      success: false,
      message: `Error during verification: ${error.message}`,
      iso
    };
  }
}

module.exports = {
  extractHashFromFile,
  findHashFile,
  calculateHashFromUrl,
  verifyIsoHash
};
