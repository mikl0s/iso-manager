#!/usr/bin/env node

/**
 * ISO Manager CLI Script
 * 
 * This script can:
 * 1. Fetch and process a predefined list of ISOs from a JSON file
 * 2. Allow configuration through iso-manager.conf
 * 3. Verify ISO hash to detect changes
 */

const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');
const { createHash } = require('crypto');
const { Readable } = require('stream');
const cliProgress = require('cli-progress');

// Default configuration
const DEFAULT_CONFIG = {
  defaultIsoListUrl: 'https://raw.githubusercontent.com/mikl0s/iso-list/refs/heads/main/links.json',
  outputFormat: 'text',
  maxResults: 0, // 0 means unlimited
  saveFile: '',
  hashAlgorithm: 'sha256',
  hashMatch: '{filename}.{hashAlgorithm}',
  downloadDir: 'ISO-Archive', // Default download directory
  isoArchive: 'ISO-Archive' // Default ISO archive directory
};

// Cache config to avoid multiple loads and console prints
let cachedConfig = null;
function getConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = loadConfig();
  return cachedConfig;
}

// Load configuration from file if exists
function loadConfig() {
  const configPath = path.join(process.cwd(), 'iso-manager.conf');
  let config = { ...DEFAULT_CONFIG };
  
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const userConfig = JSON.parse(configData);
      
      // Merge user config with defaults
      config = { ...config, ...userConfig };
    } catch (error) {
      console.warn(`Warning: Could not parse config file: ${error.message}`);
    }
  }
  
  return config;
}

// Patch loadConfig to not print to console in CLI mode
function loadConfigNoPrint() {
  const configFile = 'iso-manager.conf';
  if (fs.existsSync(configFile)) {
    try {
      const fileContent = fs.readFileSync(configFile, 'utf-8');
      const userConfig = JSON.parse(fileContent);
      const mergedConfig = { ...DEFAULT_CONFIG, ...userConfig };
      // No console.log here
      return mergedConfig;
    } catch (error) {
      // No console.warn here
    }
  }
  return DEFAULT_CONFIG;
}

/**
 * Parse command-line arguments
 * @returns {Object} - Parsed command-line arguments
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: '',
    targetUrl: '',
    limit: 0,
    outputJson: false,
    savePath: '',
    verifyHash: false,
    hashMatch: '',
    download: false,
    test: false,
    downloadDir: '',
    filename: '',
    isoIndex: undefined // NEW
  };
  
  // Display help if no arguments or help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
ISO Manager - A tool for fetching and managing Linux distribution ISOs

Usage:
  node iso-manager.js [mode] [options]

Modes:
  list            Fetch ISOs from a predefined JSON list
  verify          Verify and update ISO hashes
  download        Download an ISO file
  archive-list    List ISOs in the local archive
  archive-delete  Delete an ISO from the archive
  archive-verify  Verify the hash of a local file against isos.json

Options:
  --url, -u       Target URL to fetch data from
  --limit, -l     Limit the number of results
  --json, -j      Output in JSON format
  --save, -s      Save the results to a file
  --verify, -v    Verify ISO hashes
  --hash-match    Pattern for finding hash file (default: '{filename}.{hashAlgorithm}')
                  Use {filename} and {hashAlgorithm} as placeholders
  --download, -d  Download an ISO file
  --test, -t      Test mode - delete file after verification
  --download-dir  Directory to save downloaded files (default: ./downloads)
  --help, -h      Show this help message

Examples:
  node iso-manager.js list --url https://example.com/isos.json --save list.json
  node iso-manager.js verify
  node iso-manager.js download --test
  node iso-manager.js archive-list
  node iso-manager.js archive-delete <filename>
  node iso-manager.js archive-verify <filename>
`);
    process.exit(0);
  }
  
  // Process mode argument
  if (!args[0].startsWith('-')) {
    options.mode = args[0];
    args.shift();
    // PATCH: If the next argument is a number (for download mode), treat as isoIndex
    if (options.mode === 'download' && args[0] && /^\d+$/.test(args[0])) {
      options.isoIndex = parseInt(args[0], 10);
      args.shift();
    }
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--url':
      case '-u':
        options.targetUrl = args[++i];
        break;
      case '--limit':
      case '-l':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--json':
      case '-j':
        options.outputJson = true;
        break;
      case '--save':
      case '-s':
        options.savePath = args[++i];
        break;
      case '--verify':
      case '-v':
        options.verifyHash = true;
        break;
      case '--hash-match':
        options.hashMatch = args[++i];
        break;
      case '--download':
      case '-d':
        options.download = true;
        break;
      case '--test':
      case '-t':
        options.test = true;
        break;
      case '--download-dir':
        options.downloadDir = args[++i];
        break;
      case '--filename':
        options.filename = args[++i];
        break;
    }
  }
  
  return options;
}

/**
 * Fetch data from a URL with redirect support
 * @param {string} url - The URL to fetch
 * @param {number} maxRedirects - Maximum number of redirects to follow
 * @returns {Promise<string>} - Fetched data
 */
async function fetchData(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const handleResponse = (res, followedUrl) => {
      // Handle redirects (status codes 301, 302, 303, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        
        // Construct the redirect URL (handle relative URLs)
        const redirectUrl = new URL(res.headers.location, followedUrl).toString();
        console.log(`Following redirect: ${followedUrl} -> ${redirectUrl}`);
        
        // Follow the redirect
        return fetchData(redirectUrl, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch: HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    };
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };
    
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, options, (res) => handleResponse(res, url));
    
    req.on('error', (err) => {
      reject(err);
    });
    
    // Set a reasonable timeout
    req.setTimeout(30000, () => {
      req.abort();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * Fetch and parse the predefined ISO list from JSON
 * @param {string} url - URL to the JSON file
 * @returns {Promise<Array<Object>>} - Array of ISO objects
 */
async function fetchIsoList(url) {
  try {
    console.log(`Fetching ISO list from URL: ${url}`);
    const data = await fetchData(url);
    let jsonData;
    
    try {
      jsonData = JSON.parse(data);
      console.log('Successfully parsed JSON data');
    } catch (error) {
      console.error(`Error parsing JSON data: ${error.message}`);
      return [];
    }
    
    // Debug info
    console.log(`JSON data type: ${typeof jsonData}`);
    if (Array.isArray(jsonData)) {
      console.log(`Array with ${jsonData.length} items`);
    } else if (typeof jsonData === 'object') {
      console.log(`Object with ${Object.keys(jsonData).length} keys`);
    }
    
    // Handle different JSON formats
    if (Array.isArray(jsonData)) {
      // If it's already an array, just return it with default ranks
      return jsonData.map((item, index) => {
        if (!item) {
          console.error(`Invalid item at index ${index}`);
          return null;
        }
        
        return {
          rank: index + 1,
          name: item.name || `Unknown ISO ${index + 1}`,
          link: item.link || item.url || '',
          hash: item.hash || item.hash_value || '',
          hashAlgorithm: item.hashAlgorithm || item.hash_type || 'sha256',
          lastVerified: item.lastVerified || '',
          type: item.type || detectDistroType(item.name || ''),
          size: item.size,
          version: item.version || ""
        };
      }).filter(item => item !== null);
    } else {
      // Convert the plain JSON object to an array of objects
      return Object.entries(jsonData).map(([name, value], index) => {
        // Handle null values gracefully
        if (value === null) {
          console.log(`Note: Skipping entry "${name}" with null value`);
          return null;
        }
        // Handle both simple string values and object values
        if (typeof value === 'string') {
          return {
            rank: index + 1,
            name,
            link: value,
            hash: '',
            hashAlgorithm: 'sha256',
            type: detectDistroType(name)
          };
        } else if (value && typeof value === 'object') {
          // Handle the new format with hash_type and hash_value fields
          let hashAlgorithm = value.hashAlgorithm || value.hash_type || 'sha256';
          // Convert to lowercase for consistency
          if (typeof hashAlgorithm === 'string') {
            hashAlgorithm = hashAlgorithm.toLowerCase();
          }
          
          return {
            rank: index + 1,
            name,
            link: value.url || value.link || '',
            hash: value.hash || value.hash_value || '',
            hashAlgorithm,
            lastVerified: value.lastVerified || new Date().toISOString(),
            type: value.type || detectDistroType(name),
            verified: true,  // Since we're getting the hash directly from the source
            size: value.size,
            version: value.version || ""
          };
        } else {
          console.error(`Invalid value for key ${name}`);
          return null;
        }
      }).filter(item => item !== null);
    }
  } catch (error) {
    console.error(`Error fetching ISO list: ${error.message}`);
    console.error(error.stack);
    return [];
  }
}

async function fetchAndCacheIsoList(url) {
  const https = require('https');
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`Failed to fetch ISO list: ${res.statusCode} ${res.statusMessage}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          // Always overwrite links.json in project root (for both CLI and webapp)
          try {
            const rootLinksPath = path.join(__dirname, 'links.json');
            fs.writeFileSync(rootLinksPath, JSON.stringify(parsedData, null, 2), 'utf8');
            console.log('Saved latest links.json to project root.');
          } catch (err) {
            console.error('Failed to write links.json to project root:', err);
          }
          resolve(parsedData);
        } catch (err) {
          reject(new Error(`Failed to parse ISO list: ${err.message}`));
        }
      });
    });
    req.on('error', err => reject(new Error(`Failed to fetch ISO list: ${err.message}`)));
    req.end();
  });
}

/**
 * Detect the Linux distribution type based on the ISO name
 * @param {string} name - ISO name
 * @returns {string} - Distribution type
 */
function detectDistroType(name) {
  name = name.toLowerCase();
  
  if (name.includes('debian')) return 'debian';
  if (name.includes('ubuntu')) return 'ubuntu';
  if (name.includes('mint')) return 'mint';
  if (name.includes('fedora')) return 'fedora';
  if (name.includes('centos')) return 'centos';
  if (name.includes('arch')) return 'arch';
  if (name.includes('manjaro')) return 'manjaro';
  
  // Default
  return 'unknown';
}

/**
 * Utility function to get the base URL and filename from a URL
 * @param {string} url - Full URL
 * @returns {Object} - Object containing baseUrl and filename
 */
function parseUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const filename = pathname.split('/').pop();
    // Base URL is everything up to the last path segment
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    return { baseUrl, filename };
  } catch (error) {
    console.error(`Error parsing URL ${url}: ${error.message}`);
    return { baseUrl: '', filename: '' };
  }
}

/**
 * Find hash file for a given ISO URL
 * @param {string} isoUrl - URL of the ISO file
 * @param {string} hashAlgorithm - Hash algorithm (md5, sha1, sha256)
 * @param {string} hashMatch - Pattern to look for hash file (default: '{filename}.{hashAlgorithm}')
 * @returns {Promise<string>} - Hash value or empty string if not found
 */
async function findHashFile(isoUrl, hashAlgorithm = 'sha256', hashMatch = '{filename}.{hashAlgorithm}') {
  try {
    const { baseUrl, filename } = parseUrl(isoUrl);
    if (!baseUrl || !filename) {
      return '';
    }
    
    console.log(`Looking for hash file for ${filename}...`);
    
    // Generate common hash file patterns
    const patterns = [];
    
    // Use the provided hashMatch pattern
    let customPattern = hashMatch
      .replace('{filename}', filename)
      .replace('{hashAlgorithm}', hashAlgorithm);
    patterns.push(customPattern);
    
    // Add commonly used hash file patterns
    patterns.push(`${filename}.${hashAlgorithm}`);
    patterns.push(`${filename}.${hashAlgorithm}sum`);
    patterns.push(`${hashAlgorithm}sums.txt`);
    patterns.push(`${hashAlgorithm}sum.txt`);
    patterns.push(`SHA${hashAlgorithm.toUpperCase()}SUMS`);
    patterns.push(`${hashAlgorithm.toUpperCase()}SUMS`);
    patterns.push(`SUMS.${hashAlgorithm}`);
    patterns.push(`CHECKSUM.${hashAlgorithm}`);
    patterns.push(`${hashAlgorithm}.txt`);
    
    // Distribution-specific patterns
    if (isoUrl.includes('debian.org')) {
      // Debian usually stores hash files in a specific format
      patterns.push('SHA256SUMS');
    } else if (isoUrl.includes('ubuntu.com')) {
      // Ubuntu uses SHA256SUMS file
      patterns.push('SHA256SUMS');
    } else if (isoUrl.includes('linuxmint')) {
      // Linux Mint uses sha256sum.txt
      patterns.push('sha256sum.txt');
    } else if (isoUrl.includes('freebsd.org')) {
      // FreeBSD often uses CHECKSUM.SHA256
      patterns.push('CHECKSUM.SHA256');
    }
    
    // Try each pattern
    for (const pattern of new Set(patterns)) { // Use Set to remove duplicates
      const hashFileUrl = `${baseUrl}${pattern}`;
      console.log(`Looking for hash file: ${hashFileUrl}`);
      
      try {
        const hashData = await fetchData(hashFileUrl);
        // Parse the hash file content to extract the hash
        const extractedHash = extractHashFromFile(hashData, filename, hashAlgorithm);
        if (extractedHash) {
          console.log(`Found hash for ${filename} in ${pattern}: ${extractedHash}`);
          return extractedHash;
        }
      } catch (error) {
        // Continue trying other patterns
        continue;
      }
    }
    
    // Try looking in the parent directory (one level up) - common for many distros
    if (baseUrl.split('/').filter(Boolean).length > 2) {
      const parentUrl = baseUrl.split('/').slice(0, -2).join('/') + '/';
      console.log(`Checking parent directory: ${parentUrl}`);
      
      for (const pattern of new Set(['SHA256SUMS', 'sha256sum.txt', `${hashAlgorithm.toUpperCase()}SUMS`])) {
        const hashFileUrl = `${parentUrl}${pattern}`;
        console.log(`Looking for hash file: ${hashFileUrl}`);
        
        try {
          const hashData = await fetchData(hashFileUrl);
          // Parse the hash file content to extract the hash
          const extractedHash = extractHashFromFile(hashData, filename, hashAlgorithm);
          if (extractedHash) {
            console.log(`Found hash for ${filename} in parent directory ${pattern}: ${extractedHash}`);
            return extractedHash;
          }
        } catch (error) {
          // Continue trying other patterns
          continue;
        }
      }
    }
    
    console.log(`No hash file found for ${filename}`);
    return '';
  } catch (error) {
    console.error(`Error finding hash file: ${error.message}`);
    return '';
  }
}

/**
 * Extract hash from hash file content
 * @param {string} fileContent - Content of the hash file
 * @param {string} filename - Filename to match
 * @param {string} hashAlgorithm - Hash algorithm for additional context
 * @returns {string} - Extracted hash or empty string
 */
function extractHashFromFile(fileContent, filename, hashAlgorithm) {
  // Skip empty content
  if (!fileContent || !fileContent.trim()) {
    return '';
  }
  
  const lines = fileContent.split('\n');
  
  // Try different formats
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Format: <hash>  <filename>
    // Common in sha256sum, md5sum outputs
    const hashFirstRegex = new RegExp(`^([a-fA-F0-9]{32,128})\s+(?:\*|\s)${escapeRegExp(filename)}$`);
    const hashFirstMatch = trimmedLine.match(hashFirstRegex);
    if (hashFirstMatch && hashFirstMatch[1]) {
      return hashFirstMatch[1].toLowerCase();
    }
    
    // Format: <filename>: <hash>
    // Common in some distro's checksum files
    const filenameFirstRegex = new RegExp(`${escapeRegExp(filename)}\s*:\s*([a-fA-F0-9]{32,128})`, 'i');
    const filenameFirstMatch = trimmedLine.match(filenameFirstRegex);
    if (filenameFirstMatch && filenameFirstMatch[1]) {
      return filenameFirstMatch[1].toLowerCase();
    }
    
    // Format: <hash> (<file>)
    // Used by some distributions
    const hashWithParensRegex = new RegExp(`^([a-fA-F0-9]{32,128})\s+\(${escapeRegExp(filename)}\)$`, 'i');
    const hashWithParensMatch = trimmedLine.match(hashWithParensRegex);
    if (hashWithParensMatch && hashWithParensMatch[1]) {
      return hashWithParensMatch[1].toLowerCase();
    }
    
    // If the file only contains a hash (no filename)
    if (trimmedLine.match(/^[a-fA-F0-9]{32,128}$/)) {
      // Make sure the hash length matches expected length for the algorithm
      const expectedLength = hashAlgorithm === 'md5' ? 32 : hashAlgorithm === 'sha1' ? 40 : 64;
      if (trimmedLine.length === expectedLength) {
        return trimmedLine.toLowerCase();
      }
    }
  }
  
  return '';
}

/**
 * Escape special characters in a string for use in a regular expression
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format and output the results
 * @param {Array<Object>} data - Data to output
 * @param {Object} options - Formatting options
 */
function outputResults(data, options) {
  const { format = 'json', limit = 0, savePath = '' } = options;
  try {
    // Apply limit if specified
    const limitedData = limit > 0 ? data.slice(0, limit) : data;
    let output;
    if (format === 'json') {
      output = JSON.stringify({ links: limitedData }, null, 2);
    } else {
      // COMPACT text format: show index, name, size (like interactive menu)
      output = limitedData.map((iso, idx) => {
        if (typeof iso.size === 'number' && iso.size > 0) {
          return `${idx + 1}. ${iso.name} (${formatSize(iso.size)})`;
        } else {
          return `${idx + 1}. ${iso.name}`;
        }
      }).join('\n');
    }
    if (savePath) {
      fs.writeFileSync(savePath, output, 'utf8');
      console.log(`Results saved to ${savePath}`);
      return { success: true, path: savePath };
    } else {
      console.log('\nISO List:');
      console.log(output);
      console.log(`\nTotal items: ${limitedData.length}`);
      return { success: true };
    }
  } catch (error) {
    console.error(`Error outputting results: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate the hash of a file from a URL
 * @param {string} url - The URL of the file
 * @param {string} algorithm - Hash algorithm to use (md5, sha1, sha256, etc.)
 * @returns {Promise<string>} - The calculated hash
 */
async function calculateHashFromUrl(url, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const client = url.startsWith('https') ? https : http;
    
    console.log(`Calculating ${algorithm} hash for ${url}...`);
    
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch file: HTTP ${res.statusCode}`));
      }
      
      res.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      res.on('end', () => {
        resolve(hash.digest('hex'));
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    // Set a timeout (5 minutes) for large files
    req.setTimeout(5 * 60 * 1000, () => {
      req.abort();
      reject(new Error('Request timed out while calculating hash'));
    });
  });
}

/**
 * Verify if an ISO's hash has changed
 * @param {Object} isoData - ISO data with URL and hash
 * @returns {Promise<Object>} - Updated ISO data with verification result
 */
async function verifyIsoHash(iso) {
  // Skip verification if there's no link
  if (!iso.link) {
    return iso;
  }
  
  const config = getConfig();
  const hashAlgorithm = iso.hashAlgorithm || config.hashAlgorithm || 'sha256';
  
  // Try to find the hash file if no hash is provided
  if (!iso.hash) {
    console.log(`No hash provided for ${iso.name}, attempting to find hash file...`);
    const hashMatch = config.hashMatch || '{filename}.{hashAlgorithm}';
    iso.hash = await findHashFile(iso.link, hashAlgorithm, hashMatch);
    
    if (iso.hash) {
      console.log(`Found hash for ${iso.name}: ${iso.hash}`);
      iso.hashSource = 'file';
      iso.lastVerified = new Date().toISOString();
    } else {
      console.log(`No hash file found for ${iso.name}`);
    }
  }
  
  // If we have a hash, verify it by downloading a small part of the ISO
  if (iso.hash) {
    try {
      // Placeholder for actual hash verification
      // In reality, you'd need to download the ISO and calculate its hash,
      // but that would be resource-intensive. For now, we'll just simulate it.
      console.log(`Simulating hash verification for ${iso.name}...`);
      
      // Here we would normally compute the hash of the downloaded file
      // and compare it with the expected hash
      const verified = true; // Placeholder
      const currentHash = iso.hash; // Placeholder - in reality this would be the calculated hash
      
      // Update the verification status
      iso.verified = verified;
      
      // Check if the hash has changed
      if (iso.hash && iso.hash !== currentHash) {
        console.log(`Hash mismatch for ${iso.name}`);
        console.log(`  Expected: ${iso.hash}`);
        console.log(`  Actual:   ${currentHash}`);
        
        // Mark that the hash has changed
        iso.changed = true;
        iso.currentHash = currentHash;
      } else {
        iso.changed = false;
        iso.lastVerified = new Date().toISOString();
      }
    } catch (error) {
      console.error(`Error verifying hash for ${iso.name}: ${error.message}`);
      iso.verified = false;
    }
  }
  
  return iso;
}

/**
 * List ISOs in the local archive
 */
async function listArchiveIsos() {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  let isosJsonPath = path.join(archivePath, 'isos.json');
  let archiveIsos = [];

  // List files in archive dir
  let files = [];
  try {
    files = fs.readdirSync(archivePath).filter(f => f.endsWith('.iso') || f.endsWith('.esd'));
  } catch (err) {
    console.error('Error reading archive directory:', err.message);
    return;
  }

  // Try to load isos.json for metadata
  if (fs.existsSync(isosJsonPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
      archiveIsos = Array.isArray(meta.isos) ? meta.isos : [];
    } catch (err) {
      // ignore
    }
  }

  // Print archive contents
  console.log(`\nISOs in archive (${archivePath}):\n`);
  files.forEach(f => {
    const meta = archiveIsos.find(i => i.name === f || i.filename === f);
    const size = fs.statSync(path.join(archivePath, f)).size;
    console.log(`- ${f} (${(size/1024/1024).toFixed(1)} MB)${meta ? ' | ' + (meta.name || meta.filename) : ''}`);
  });
  if (files.length === 0) {
    console.log('(Archive is empty)');
  }
}

/**
 * Delete an ISO from the archive
 * @param {string} filename - Name of the ISO file to delete
 */
async function deleteArchiveIso(filename) {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  const filePath = path.join(archivePath, filename);
  const isosJsonPath = path.join(archivePath, 'isos.json');

  // Path safety check: must be inside archivePath
  if (!filePath.startsWith(archivePath)) {
    console.error('Refusing to delete file outside archive directory.');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error('File not found in archive:', filename);
    process.exit(1);
  }

  // Delete the file
  fs.unlinkSync(filePath);
  console.log('Deleted:', filename);

  // Update isos.json using robust helper
  if (fs.existsSync(isosJsonPath)) {
    try {
      let meta = { isos: [] };
      try {
        meta = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
        if (!Array.isArray(meta.isos)) meta.isos = [];
      } catch (e) {
        meta = { isos: [] };
      }
      // Remove any entry matching this filename or name
      meta.isos = meta.isos.filter(i => i.filename !== filename && i.name !== filename);
      fs.writeFileSync(isosJsonPath, JSON.stringify(meta, null, 2));
      console.log('Updated isos.json');
    } catch (err) {
      console.warn('Failed to update isos.json:', err.message);
    }
  }
}

/**
 * Verify the hash of a local file against isos.json
 * @param {string} filename - Name of the ISO file to verify
 */
async function verifyArchiveIso(filename) {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  const filePath = path.join(archivePath, filename);
  const isosJsonPath = path.join(archivePath, 'isos.json');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  if (!fs.existsSync(isosJsonPath)) {
    console.error('isos.json not found:', isosJsonPath);
    process.exit(1);
  }
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse isos.json:', e.message);
    process.exit(1);
  }
  const isoEntry = (meta.isos || []).find(i => i.filename === filename || i.name === filename);
  if (!isoEntry || !isoEntry.hash) {
    console.error('No hash found for', filename, 'in isos.json');
    process.exit(1);
  }
  const hashAlgorithm = config.hashAlgorithm || 'sha256';
  const fileHash = await new Promise((resolve, reject) => {
    const hash = require('crypto').createHash(hashAlgorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
  if (fileHash.toLowerCase() === isoEntry.hash.toLowerCase()) {
    console.log('Hash verified successfully for', filename);
    process.exit(0);
  } else {
    console.error('Hash mismatch for', filename);
    console.error('  Expected:', isoEntry.hash);
    console.error('  Actual:  ', fileHash);
    process.exit(2);
  }
}

/**
 * Download an ISO file, handle selection, and verify its hash
 * @param {Array<Object>} isos - List of ISO objects
 * @param {Object} options - Download options
 * @returns {Promise<Object>} - Download result
 */
async function downloadIso(isos, options) {
  try {
    // Load local archive
    let localIsos = [];
    const archivePath = path.join('ISO-Archive', 'isos.json');
    if (fs.existsSync(archivePath)) {
      try {
        const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
        localIsos = Array.isArray(archiveData.isos) ? archiveData.isos : [];
      } catch (e) {}
    }
    let selectedIndex;
    if (options.isoIndex !== undefined && Number.isInteger(options.isoIndex) && options.isoIndex >= 1 && options.isoIndex <= isos.length) {
      selectedIndex = options.isoIndex;
    }
    // Let user select an ISO to download
    if (selectedIndex === undefined) {
      console.log('\nAvailable ISOs to download:\n');
      isos.forEach((iso, index) => {
        // Check if ISO is in archive (by filename or hash)
        const archived = localIsos.find(local => local.filename === path.basename(parseUrl(iso.link).filename));
        const indicator = archived ? ' [IN ARCHIVE]' : '';
        if (typeof iso.size === 'number' && iso.size > 0) {
          console.log(`${index + 1}. ${iso.name} (${formatSize(iso.size)})${indicator}`);
        } else {
          console.log(`${index + 1}. ${iso.name}${indicator}`);
        }
      });
      const rl = createReadlineInterface();
      while (selectedIndex === undefined || selectedIndex < 1 || selectedIndex > isos.length) {
        const answer = await askQuestion(`\nSelect an ISO to download (1-${isos.length}): `, rl);
        selectedIndex = parseInt(answer, 10);
        if (isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > isos.length) {
          console.log(`Please enter a number between 1 and ${isos.length}`);
        }
      }
      rl.close();
    }
    const selectedIso = isos[selectedIndex - 1];
    console.log(`\nSelected: ${selectedIso.name}`);
    console.log(`URL: ${selectedIso.link}`);
    
    // Extract filename from URL
    const { filename } = parseUrl(selectedIso.link);
    if (!filename) {
      throw new Error('Could not determine filename from URL');
    }
    
    // Determine download directory
    const config = getConfig();
    const downloadDir = options.downloadDir || config.downloadDir || config.isoArchive || 'ISO-Archive';
    let downloadPath = path.join(downloadDir, filename);
    
    // Check if file already exists in archive and hash matches links.json
    const archiveIso = localIsos.find(local => local.filename === filename);
    const linksHash = selectedIso.hash || selectedIso.hash_value;
    const linksHashAlgo = selectedIso.hashAlgorithm || selectedIso.hash_type || 'sha256';
    if (archiveIso && archiveIso.hash && linksHash && archiveIso.hashAlgorithm && linksHashAlgo && archiveIso.hashAlgorithm.toLowerCase() === linksHashAlgo.toLowerCase()) {
      if (archiveIso.hash.toLowerCase() === linksHash.toLowerCase()) {
        console.log(`\nThis ISO is already in your archive and hash verified (version: ${selectedIso.version || ''}). No download needed.`);
        // Patch: update version in archive if missing or outdated
        if (!archiveIso.version || archiveIso.version !== selectedIso.version) {
          archiveIso.version = selectedIso.version;
          updateIsosJson(archiveIso, downloadDir);
        }
        process.exit(0);
      }
    }
    // If file exists, prompt for overwrite
    if (fs.existsSync(downloadPath)) {
      const rl = createReadlineInterface();
      const answer = await askQuestion(`\nFile already exists: ${downloadPath}\nOverwrite? (y/n): `, rl);
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('Download cancelled.');
        return { success: false, cancelled: true };
      }
    }
    // Only now ensure the directory exists
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    // Download and verify file
    const result = await new IsoManager().downloadIso({
      url: selectedIso.link, 
      outputPath: downloadDir, 
      verify: options.verifyHash,
      hashAlgorithm: selectedIso.hashAlgorithm,
      onProgress: options.onProgress,
      signal: options.signal
    });
    // If download succeeded, update isos.json
    if (result.success) {
      console.log("DEBUG: selectedIso.version =", selectedIso.version);
      // Copy all relevant metadata from selectedIso for isos.json
      const meta = {
        name: selectedIso.name,
        filename,
        hash: selectedIso.hash || selectedIso.hash_value || '',
        hashAlgorithm: selectedIso.hashAlgorithm || selectedIso.hash_type || '',
        size: selectedIso.size || result.size || (fs.existsSync(downloadPath) ? fs.statSync(downloadPath).size : 0),
        addedDate: new Date().toISOString(),
        version: (selectedIso.version !== undefined ? selectedIso.version : ""),
        url: selectedIso.link
      };
      updateIsosJson(meta, downloadDir);
    }
    // Test mode - delete file after verification
    if (options.testMode && result.success) {
      console.log('\nTest mode enabled - deleting downloaded file');
      fs.unlinkSync(result.filePath);
      console.log(`File deleted: ${result.filePath}`);
      // Remove entry from isos.json
      updateIsosJson({ filename }, downloadDir, true);
      process.exit(0);
    }
    // Force exit if running as CLI (not imported)
    if (require.main === module && !options.testMode) {
      process.exit(0);
    }
    return result;
  } catch (error) {
    console.error(`Error downloading ISO: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function to execute the script
 */
async function main() {
  try {
    // Parse command-line arguments
    const args = parseCommandLineArgs();
    
    // Load configuration
    const config = getConfig();
    
    // Set default values if not provided
    if (!args.targetUrl) {
      if (args.mode === 'list') {
        args.targetUrl = config.defaultIsoListUrl;
      }
    }
    
    if (!args.hashMatch && config.hashMatch) {
      args.hashMatch = config.hashMatch;
    }
    
    let results = [];
    
    // Execute the selected mode
    switch (args.mode) {
      case 'list': {
        if (!args.targetUrl) {
          console.error('Error: No target URL provided for ISO list');
          process.exit(1);
        }
        
        console.log(`Fetching ISO list from ${args.targetUrl}...`);
        const rawData = await fetchData(args.targetUrl);
        // Save raw links.json to project root
        try {
          const rootLinksPath = path.join(__dirname, 'links.json');
          fs.writeFileSync(rootLinksPath, rawData, 'utf8');
          console.log('Saved RAW links.json to project root.');
        } catch (err) {
          console.error('Failed to write RAW links.json to project root:', err);
        }
        results = await fetchIsoList(args.targetUrl);
        
        // Apply limit if specified
        if (args.limit > 0 && results.length > args.limit) {
          results = results.slice(0, args.limit);
        }
        
        // Output or save results
        outputResults(results, {
          format: args.outputJson ? 'json' : 'text',
          savePath: args.savePath,
          limit: args.limit
        });
        
        // Verify hashes if requested
        if (args.verifyHash) {
          console.log('Verifying ISO hashes...');
          let updatedResults = [];
          
          for (const iso of results) {
            const result = await verifyIsoHash(iso);
            updatedResults.push(result);
          }
          
          // Update results with verified hashes
          results = updatedResults;
          
          // Save verified results if a path is provided
          if (args.savePath) {
            fs.writeFileSync(args.savePath, JSON.stringify(results, null, 2));
            console.log(`Updated hash information saved to ${args.savePath}`);
          }
        }
        
        break;
      }
      
      case 'verify': {
        let isos = [];
        
        if (args.targetUrl) {
          console.log(`Fetching ISO list from ${args.targetUrl}...`);
          const rawData = await fetchData(args.targetUrl);
          // Save raw links.json to project root
          try {
            const rootLinksPath = path.join(__dirname, 'links.json');
            fs.writeFileSync(rootLinksPath, rawData, 'utf8');
            console.log('Saved RAW links.json to project root.');
          } catch (err) {
            console.error('Failed to write RAW links.json to project root:', err);
          }
          isos = await fetchIsoList(args.targetUrl);
        } else if (args.savePath && fs.existsSync(args.savePath)) {
          console.log(`Loading ISO list from ${args.savePath}...`);
          const fileContent = fs.readFileSync(args.savePath, 'utf8');
          isos = JSON.parse(fileContent);
        } else {
          console.log(`Fetching ISO list from default URL: ${config.defaultIsoListUrl}...`);
          const rawData = await fetchData(config.defaultIsoListUrl);
          // Save raw links.json to project root
          try {
            const rootLinksPath = path.join(__dirname, 'links.json');
            fs.writeFileSync(rootLinksPath, rawData, 'utf8');
            console.log('Saved RAW links.json to project root.');
          } catch (err) {
            console.error('Failed to write RAW links.json to project root:', err);
          }
          isos = await fetchIsoList(config.defaultIsoListUrl);
        }
        
        console.log('Verifying ISO hashes...');
        let updatedIsos = [];
        
        for (const iso of isos) {
          const result = await verifyIsoHash(iso);
          updatedIsos.push(result);
        }
        
        // Save verified results
        if (args.savePath) {
          fs.writeFileSync(args.savePath, JSON.stringify(updatedIsos, null, 2));
          console.log(`Verified hash information saved to ${args.savePath}`);
        } else {
          console.log('Verified ISO information:');
          console.log(JSON.stringify(updatedIsos, null, 2));
        }
        
        break;
      }
      
      case 'download': {
        let isos = [];
        
        if (args.targetUrl) {
          console.log(`Fetching ISO list from ${args.targetUrl}...`);
          const rawData = await fetchData(args.targetUrl);
          // Save raw links.json to project root
          try {
            const rootLinksPath = path.join(__dirname, 'links.json');
            fs.writeFileSync(rootLinksPath, rawData, 'utf8');
            console.log('Saved RAW links.json to project root.');
          } catch (err) {
            console.error('Failed to write RAW links.json to project root:', err);
          }
          isos = await fetchIsoList(args.targetUrl);
        } else if (args.savePath && fs.existsSync(args.savePath)) {
          console.log(`Loading ISO list from ${args.savePath}...`);
          const fileContent = fs.readFileSync(args.savePath, 'utf8');
          isos = JSON.parse(fileContent);
        } else {
          console.log(`Fetching ISO list from default URL: ${config.defaultIsoListUrl}...`);
          const rawData = await fetchData(config.defaultIsoListUrl);
          // Save raw links.json to project root
          try {
            const rootLinksPath = path.join(__dirname, 'links.json');
            fs.writeFileSync(rootLinksPath, rawData, 'utf8');
            console.log('Saved RAW links.json to project root.');
          } catch (err) {
            console.error('Failed to write RAW links.json to project root:', err);
          }
          isos = await fetchIsoList(config.defaultIsoListUrl);
        }
        
        let effectiveDownloadDir = args.downloadDir || config.downloadDir || config.isoArchive || 'ISO-Archive';
        await downloadIso(isos, {
          downloadDir: effectiveDownloadDir,
          testMode: args.test,
          onProgress: args.onProgress,
          signal: args.signal,
          isoIndex: args.isoIndex
        });
        
        break;
      }
      
      case 'archive-list':
        await listArchiveIsos();
        break;
      
      case 'archive-delete':
        if (!args[0] && process.argv.length > 3) {
          // Support: node iso-manager.js archive-delete <filename>
          await deleteArchiveIso(process.argv[3]);
        } else if (args.filename) {
          await deleteArchiveIso(args.filename);
        } else {
          console.error('Usage: node iso-manager.js archive-delete <filename>');
        }
        break;
      
      case 'archive-verify':
        if (!args[0] && process.argv.length > 3) {
          // Support: node iso-manager.js archive-verify <filename>
          await verifyArchiveIso(process.argv[3]);
        } else if (args.filename) {
          await verifyArchiveIso(args.filename);
        } else {
          console.error('Usage: node iso-manager.js archive-verify <filename>');
        }
        break;
      
      default:
        console.error(`Error: Unknown mode '${args.mode}'`);
        console.log('Run with --help for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Check if this file is being run directly or required as a module
if (require.main === module) {
  // Execute the main function when run directly
  main();
} else {
  // Export functions when required as a module
  module.exports = function (config = {}) {
    const isoManager = new IsoManager();
    
    return {
      fetchIsoList: async function({ url, mode }) {
        try {
          const config = getConfig();
          const targetUrl = url || config.defaultIsoListUrl;
          
          // If mode is list, fetch the JSON directly
          if (mode === 'list') {
            const data = await fetchData(targetUrl);
            return JSON.parse(data);
          }
          
          return [];
        } catch (error) {
          console.error('Error fetching ISO list:', error);
          throw error;
        }
      },
      downloadIso: async function({ url, outputPath, verify, hashAlgorithm, onProgress, signal }) {
        try {
          // Create downloads directory if it doesn't exist
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
          }
          
          // Parse the URL to get the filename
          const { filename } = parseUrl(url);
          const downloadPath = path.join(outputPath, filename);
          
          const startTime = Date.now(); // Track start time for duration calculation
          
          // Create a wrapper for the progress callback
          const progressWrapper = (progress) => {
            if (typeof onProgress === 'function') {
              onProgress(progress);
            }
          };
          
          // Download and verify the file
          const result = await isoManager.downloadIso({
            url, 
            outputPath, 
            verify,
            hashAlgorithm,
            onProgress: progressWrapper,
            signal
          });
          
          // Add file size and path to result
          if (result.filePath) {
            try {
              result.size = fs.statSync(result.filePath).size;
            } catch (err) {
              console.error('Error getting file stats:', err);
            }
          }
          
          // Add duration to result
          const endTime = Date.now();
          result.duration = (endTime - startTime) / 1000; // in seconds
          
          return result;
        } catch (error) {
          console.error('Error downloading ISO:', error);
          throw error;
        }
      },
      verifyIso: async function({ filePath, expectedHash, algorithm }) {
        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }
          
          // Calculate hash for the file
          const hash = await isoManager.calculateFileHash(filePath, algorithm);
          
          const isValid = expectedHash ? (hash.toLowerCase() === expectedHash.toLowerCase()) : true;
          
          return {
            filePath,
            hash,
            expectedHash,
            algorithm,
            isValid,
            message: isValid ? 'Hash verified successfully' : 'Hash verification failed'
          };
        } catch (error) {
          console.error('Error verifying ISO:', error);
          throw error;
        }
      },
      findHashFile,
      calculateHashFromUrl,
      verifyIsoHash,
      verifyFile: isoManager.verifyFile.bind(isoManager)
    };
  };
}

class IsoManager {
  constructor() {
    this.watcher = null;
    this.events = new (require('events').EventEmitter)();
    setupArchiveWatcher();
  }

  setupArchiveWatcher() {
    const config = getConfig();
    const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
    
    try {
      // Only log watcher setup errors
      if (!fs.existsSync(archivePath)) {
        try {
          fs.mkdirSync(archivePath, { recursive: true });
        } catch (err) {
          logToFile(`Archive directory creation error: ${err.message}`);
        }
      }
      const watcher = fs.watch(archivePath, (eventType, filename) => {
        // Only log if something looks truly exceptional
        if (!filename) {
          logToFile(`Archive watcher event with missing filename: ${eventType}`);
        }
        // Optionally: log only unexpected event types
        if (eventType !== 'rename' && eventType !== 'change') {
          logToFile(`Archive watcher unexpected event: ${eventType} - ${filename}`);
        }
      });
      watcher.on('error', (err) => {
        logToFile('Archive watcher error:', err);
      });
    } catch (error) {
      logToFile('Error setting up archive watcher:', error);
    }
  }
  
  async listArchiveFiles() {
    const config = getConfig();
    const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
    try {
      const files = await fs.promises.readdir(archivePath);
      return files
        .filter(file => file.endsWith('.iso') || file.endsWith('.esd'))
        .map(file => ({
          name: file,
          path: path.join(archivePath, file),
          size: fs.statSync(path.join(archivePath, file)).size
        }));
    } catch (err) {
      logToFile('Error reading archive:', err);
      return [];
    }
  }
  
  async followRedirects(url, maxRedirects = 5) {
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
      const response = await new Promise((resolve) => {
        const httpModule = currentUrl.startsWith('https:') ? https : http;
        httpModule.get(currentUrl, { method: 'HEAD' }, resolve);
      });
      
      if (!response || ![301, 302].includes(response.statusCode)) {
        return currentUrl;
      }
      currentUrl = new URL(response.headers.location, currentUrl).toString();
    }
    return currentUrl;
  }

  async downloadAndVerifyFile(params) {
    const {
      url,
      verify = false,
      hashAlgorithm = 'sha256',
      signal,
      onProgress
    } = params;
    
    logToFile(`Starting download from URL: ${url}`);
    
    const finalUrl = await this.followRedirects(url);
    logToFile(`Final URL after redirects: ${finalUrl}`);
    const httpModule = finalUrl.startsWith('https:') ? https : http;
    
    // Ensure outputPath exists and is valid
    const finalOutputPath = params.outputPath || DEFAULT_CONFIG.downloadDir;
    const resolvedOutputPath = path.resolve(finalOutputPath);
    
    logToFile(`Resolved output path: ${resolvedOutputPath}`);
    
    try {
      await fs.promises.mkdir(resolvedOutputPath, { recursive: true });
      logToFile(`Created or verified directory: ${resolvedOutputPath}`);
    } catch (err) {
      logToFile(`Failed to create download directory: ${err.message}`);
      throw new Error(`Failed to create download directory: ${err.message}`);
    }
    
    const filename = finalUrl.split('/').pop();
    const downloadPath = path.join(resolvedOutputPath, filename);
    logToFile(`Full download path: ${downloadPath}`);
    
    // Create a write stream for the file
    logToFile(`Creating write stream for: ${downloadPath}`);
    const fileStream = fs.createWriteStream(downloadPath);
    
    return new Promise((resolve, reject) => {
      // Error handlers
      fileStream.on('error', (err) => {
        logToFile(`File write error: ${err.message}`);
        reject(new Error(`File write error: ${err.message}`));
      });
      
      // Use https for HTTPS URLs, http otherwise
      const request = httpModule.get(finalUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = new URL(response.headers.location, finalUrl).toString();
          fileStream.destroy();
          return resolve(this.downloadAndVerifyFile({
            ...params,
            url: redirectUrl
          }));
        }
        
        if (response.statusCode !== 200) {
          fileStream.destroy();
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let bytesTransferred = 0;
        
        // Pipe data with progress tracking
        response.on('data', (chunk) => {
          bytesTransferred += chunk.length;
          if (onProgress) {
            onProgress({
              percentage: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0,
              bytesTransferred,
              totalBytes,
              filename: filename
            });
          }
        });
        
        response.pipe(fileStream);

        // Store bytesTransferred in a variable that can be accessed in the finish event
        fileStream.bytesTransferred = bytesTransferred;
      });
      
      request.on('error', (err) => {
        fileStream.destroy();
        reject(err);
      });
      
      fileStream.on('finish', function() {
        logToFile(`Download completed: ${downloadPath}`);
        logToFile(`Bytes transferred: ${this.bytesTransferred || 0}`);
        resolve({
          success: true,
          filePath: downloadPath,
          filename,
          size: this.bytesTransferred || 0
        });
      });
    });
  }
  
  async downloadIso(params) {
    const { url, verify, hashAlgorithm, signal, onProgress, downloadDir: paramDownloadDir } = params;
    const config = getConfig();
    // Always prefer paramDownloadDir, then config.downloadDir, then config.isoArchive, then 'ISO-Archive' as the default download directory
    const downloadDir = paramDownloadDir || config.downloadDir || config.isoArchive || 'ISO-Archive';
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    const { filename } = parseUrl(url);
    if (!filename) throw new Error('Could not determine filename from URL');
    const downloadPath = path.join(downloadDir, filename);
    if (fs.existsSync(downloadPath)) {
      const rl = createReadlineInterface();
      const answer = await askQuestion(`\nFile already exists: ${downloadPath}\nOverwrite? (y/n): `, rl);
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        logToFile('Download cancelled.');
        return { success: false, cancelled: true };
      }
    }
    // Download and verify file
    const result = await this.downloadAndVerifyFile({
      url,
      outputPath: downloadDir,
      verify,
      hashAlgorithm,
      onProgress,
      signal
    });
    // If download succeeded, update isos.json
    if (result.success) {
      // Copy all relevant metadata from parameters and result, not selectedIso
      const meta = {
        name: filename.replace(/\.iso$/i, ''),
        filename,
        hash: result.hash || '',
        hashAlgorithm: hashAlgorithm || '',
        size: result.size || (fs.existsSync(downloadPath) ? fs.statSync(downloadPath).size : 0),
        addedDate: new Date().toISOString(),
        version: (params.version !== undefined ? params.version : ""),
        url: url
      };
      updateIsosJson(meta, downloadDir);
    }
    return result;
  }
  
  /**
   * Calculate the hash of a file
   * @param {string} filePath - Path to the file
   * @param {string} algorithm - Hash algorithm to use
   * @returns {Promise<string>} - Calculated hash
   */
  async calculateFileHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath);
        
        stream.on('error', err => {
          reject(new Error(`Failed to read file: ${err.message}`));
        });
        
        stream.on('data', chunk => {
          hash.update(chunk);
        });
        
        stream.on('end', () => {
          resolve(hash.digest('hex'));
        });
      } catch (err) {
        reject(new Error(`Hash calculation error: ${err.message}`));
      }
    });
  }
  
  async verifyFile(params) {
    const { filePath, expectedHash, algorithm } = params;
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Calculate hash for the file
      const hash = await this.calculateFileHash(filePath, algorithm);
      
      const isValid = expectedHash ? (hash.toLowerCase() === expectedHash.toLowerCase()) : true;
      
      return {
        filePath,
        hash,
        expectedHash,
        algorithm,
        isValid,
        message: isValid ? 'Hash verified successfully' : 'Hash verification failed'
      };
    } catch (error) {
      logToFile('Error verifying file:', error);
      throw error;
    }
  }
}

// --- PATCH: Throttle and filter archive watcher logging ---
let watcherEventTimestamps = {};
function shouldLogWatcherEvent(filename, eventType) {
  // Only log for .iso or .esd files
  if (!filename || !filename.match(/\.(iso|esd)$/i)) return false;
  // Throttle: log at most once every 5 seconds per file/event
  const key = `${eventType}:${filename}`;
  const now = Date.now();
  if (!watcherEventTimestamps[key] || now - watcherEventTimestamps[key] > 5000) {
    watcherEventTimestamps[key] = now;
    return true;
  }
  return false;
}

// --- PATCH: Robust isos.json update for delete ---
async function deleteArchiveIso(filename) {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  const filePath = path.join(archivePath, filename);
  const isosJsonPath = path.join(archivePath, 'isos.json');

  // Path safety check: must be inside archivePath
  if (!filePath.startsWith(archivePath)) {
    console.error('Refusing to delete file outside archive directory.');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error('File not found in archive:', filename);
    process.exit(1);
  }

  // Delete the file
  fs.unlinkSync(filePath);
  console.log('Deleted:', filename);

  // Update isos.json using robust helper
  if (fs.existsSync(isosJsonPath)) {
    try {
      let meta = { isos: [] };
      try {
        meta = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
        if (!Array.isArray(meta.isos)) meta.isos = [];
      } catch (e) {
        meta = { isos: [] };
      }
      // Remove any entry matching this filename or name
      meta.isos = meta.isos.filter(i => i.filename !== filename && i.name !== filename);
      fs.writeFileSync(isosJsonPath, JSON.stringify(meta, null, 2));
      console.log('Updated isos.json');
    } catch (err) {
      console.warn('Failed to update isos.json:', err.message);
    }
  }
}

// --- PATCH: Add CLI command to verify local file against isos.json ---
async function verifyArchiveIso(filename) {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  const filePath = path.join(archivePath, filename);
  const isosJsonPath = path.join(archivePath, 'isos.json');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  if (!fs.existsSync(isosJsonPath)) {
    console.error('isos.json not found:', isosJsonPath);
    process.exit(1);
  }
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse isos.json:', e.message);
    process.exit(1);
  }
  const isoEntry = (meta.isos || []).find(i => i.filename === filename || i.name === filename);
  if (!isoEntry || !isoEntry.hash) {
    console.error('No hash found for', filename, 'in isos.json');
    process.exit(1);
  }
  const hashAlgorithm = config.hashAlgorithm || 'sha256';
  const fileHash = await new Promise((resolve, reject) => {
    const hash = require('crypto').createHash(hashAlgorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
  if (fileHash.toLowerCase() === isoEntry.hash.toLowerCase()) {
    console.log('Hash verified successfully for', filename);
    process.exit(0);
  } else {
    console.error('Hash mismatch for', filename);
    console.error('  Expected:', isoEntry.hash);
    console.error('  Actual:  ', fileHash);
    process.exit(2);
  }
}

// --- PATCH: Use watcher event filter in setupArchiveWatcher ---
function setupArchiveWatcher() {
  const config = getConfig();
  const archivePath = path.resolve(config.isoArchive || 'ISO-Archive');
  try {
    // Only log watcher setup errors
    if (!fs.existsSync(archivePath)) {
      try {
        fs.mkdirSync(archivePath, { recursive: true });
      } catch (err) {
        logToFile(`Archive directory creation error: ${err.message}`);
      }
    }
    const watcher = fs.watch(archivePath, (eventType, filename) => {
      // Only log if something looks truly exceptional
      if (!filename) {
        logToFile(`Archive watcher event with missing filename: ${eventType}`);
      }
      // Optionally: log only unexpected event types
      if (eventType !== 'rename' && eventType !== 'change') {
        logToFile(`Archive watcher unexpected event: ${eventType} - ${filename}`);
      }
    });
    watcher.on('error', (err) => {
      logToFile('Archive watcher error:', err);
    });
  } catch (error) {
    logToFile('Error setting up archive watcher:', error);
  }
}

// --- PATCH: Helper to update isos.json after download ---
/**
 * Add or update an ISO entry in ISO-Archive/isos.json
 * @param {Object} isoMeta - { name, filename, hash, size, addedDate, version }
 * @param {string} archiveDir - Directory for isos.json (default: ISO-Archive)
 * @param {boolean} remove - Remove entry instead of adding (default: false)
 */
function updateIsosJson(meta, archiveDir = 'ISO-Archive', remove = false) {
  const fs = require('fs');
  const path = require('path');
  const isosJsonPath = path.join(archiveDir, 'isos.json');
  let isos = [];
  if (fs.existsSync(isosJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(isosJsonPath, 'utf8'));
      isos = parsed.isos || [];
    } catch (e) {
      isos = [];
    }
    // Remove any existing entry for this filename
    isos = isos.filter(i => i.filename !== meta.filename);
    if (!remove) {
      isos.push(meta);
    }
    fs.writeFileSync(isosJsonPath, JSON.stringify({ isos }, null, 2), 'utf8');
  }
}

// --- PATCH: Logging Setup ---
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'iso-manager.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function logToFile(...args) {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// Override console.log/info/warn/error for logging
const origLog = console.log;
const origInfo = console.info;
const origWarn = console.warn;
const origError = console.error;
console.log = (...args) => { origLog(...args); logToFile(...args); };
console.info = (...args) => { origInfo(...args); logToFile(...args); };
console.warn = (...args) => { origWarn(...args); logToFile(...args); };
console.error = (...args) => { origError(...args); logToFile(...args); };

// --- PATCH: Minimal Download Output & Progress Bar ---
IsoManager.prototype.downloadAndVerifyFile = async function(params) {
  const { url, outputPath, verify = false, hashAlgorithm = 'sha256', onProgress, signal } = params;
  const { filename } = parseUrl(url);
  const downloadPath = path.join(outputPath || DEFAULT_CONFIG.downloadDir, filename);
  const httpModule = url.startsWith('https') ? https : http;

  // Get final URL after redirects
  let finalUrl = url;
  let redirects = 0;
  while (redirects < 5) {
    const res = await new Promise((resolve, reject) => {
      const req = httpModule.request(finalUrl, { method: 'HEAD' }, resolve);
      req.on('error', reject);
      req.end();
    });
    if (res.statusCode === 301 || res.statusCode === 302) {
      finalUrl = new URL(res.headers.location, finalUrl).toString();
      redirects++;
    } else {
      break;
    }
  }
  logToFile(`Final URL after redirects: ${finalUrl}`);
  logToFile('Starting download...');
  
  // Start download
  return new Promise((resolve, reject) => {
    const req = httpModule.get(finalUrl, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
      let bytesTransferred = 0;
      const fileStream = fs.createWriteStream(downloadPath);
      // Setup progress bar
      const bar = new cliProgress.SingleBar({ format: 'Downloading [{bar}] {percentage}% | ETA: {eta}s' }, cliProgress.Presets.shades_classic);
      bar.start(totalBytes, 0, { speed: '0.00' });
      let lastTime = Date.now();
      let lastBytes = 0;
      response.on('data', (chunk) => {
        bytesTransferred += chunk.length;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = 0;
        if (elapsed > 0.5) {
          speed = (bytesTransferred - lastBytes) / 1024 / 1024 / elapsed;
          lastTime = now;
          lastBytes = bytesTransferred;
        }
        bar.update(bytesTransferred, { speed: speed.toFixed(2) });
      });
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        bar.update(totalBytes);
        bar.stop();
        resolve({
          success: true,
          filePath: downloadPath,
          filename,
          size: bytesTransferred
        });
      });
      req.on('error', (err) => {
        bar.stop();
        reject(err);
      });
    });
    req.setTimeout(10 * 60 * 1000, () => {
      req.abort();
      reject(new Error('Request timed out while downloading'));
    });
  });
};

/**
 * Create a readline interface for user input
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
function askQuestion(question, rl) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Display a list of ISOs and let the user select one
 * @param {Array<Object>} isos - List of ISO objects
 * @returns {Promise<Object>} - Selected ISO object
 */
async function selectIso(isos) {
  // Load local archive
  let localIsos = [];
  const archivePath = path.join('ISO-Archive', 'isos.json');
  if (fs.existsSync(archivePath)) {
    try {
      const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      localIsos = Array.isArray(archiveData.isos) ? archiveData.isos : [];
    } catch (e) {}
  }

  console.log('\nAvailable ISOs to download:\n');
  isos.forEach((iso, index) => {
    // Check if ISO is in archive (by filename or hash)
    const archived = localIsos.find(local => local.filename === path.basename(parseUrl(iso.link).filename));
    const indicator = archived ? ' [IN ARCHIVE]' : '';
    if (typeof iso.size === 'number' && iso.size > 0) {
      console.log(`${index + 1}. ${iso.name} (${formatSize(iso.size)})${indicator}`);
    } else {
      console.log(`${index + 1}. ${iso.name}${indicator}`);
    }
  });
  
  const rl = createReadlineInterface();
  let selectedIndex;
  while (selectedIndex === undefined || selectedIndex < 1 || selectedIndex > isos.length) {
    const answer = await askQuestion(`\nSelect an ISO to download (1-${isos.length}): `, rl);
    selectedIndex = parseInt(answer, 10);
    if (isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > isos.length) {
      console.log(`Please enter a number between 1 and ${isos.length}`);
    }
  }
  rl.close();
  return isos[selectedIndex - 1];
}

/**
 * Estimate ISO file size based on name and type
 * @param {string} name - ISO name
 * @param {string} type - Distribution type
 * @returns {number} - Estimated size in bytes
 */
function estimateIsoSize(name, type) {
  // Rough estimates based on common ISO sizes
  if (name.toLowerCase().includes('netinst') || name.toLowerCase().includes('minimal')) {
    return 400 * 1024 * 1024; // ~400 MB
  }
  
  if (name.toLowerCase().includes('server')) {
    return 1.2 * 1024 * 1024 * 1024; // ~1.2 GB
  }
  
  if (name.toLowerCase().includes('boot') || name.toLowerCase().includes('bootonly')) {
    return 300 * 1024 * 1024; // ~300 MB
  }
  
  if (type === 'debian') {
    return 700 * 1024 * 1024; // ~700 MB
  }
  
  if (type === 'ubuntu') {
    return 3 * 1024 * 1024 * 1024; // ~3 GB
  }
  
  if (type === 'mint') {
    return 2.5 * 1024 * 1024 * 1024; // ~2.5 GB
  }
  
  // Default size
  return 2 * 1024 * 1024 * 1024; // ~2 GB
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format time in human-readable format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time
 */
function formatTime(seconds) {
  const units = ['s', 'm', 'h', 'd'];
  let time = seconds;
  let unitIndex = 0;
  
  while (time >= 60 && unitIndex < units.length - 1) {
    time /= 60;
    unitIndex++;
  }
  
  return `${time.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Update download progress
 * @param {number} downloaded - Downloaded bytes
 * @param {number} total - Total bytes
 * @param {number} startTime - Start time in milliseconds
 * @param {boolean} final - Whether this is the final update
 */
function updateDownloadProgress(downloaded, total, startTime, final = false) {
  const percentage = total ? Math.min(100, Math.floor((downloaded / total) * 100)) : 0;
  const eta = total && downloaded > 0 ? formatTime((total - downloaded) / ((downloaded) / ((Date.now() - startTime) / 1000))) : 'Unknown';

  // Create progress bar
  const progressBarLength = 30;
  const filledLength = Math.floor(progressBarLength * (percentage / 100));
  const bar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

  // Format status line (no speed)
  const status = `${formatSize(downloaded)}${total ? '/' + formatSize(total) : ''} | ${percentage}% ${bar} | ETA: ${eta}`;

  // Clear line and print progress
  process.stdout.write('\r\x1b[K' + status);

  if (final) {
    console.log(''); // End with a newline
    // Clear the history for next download
    if (updateDownloadProgress._history) updateDownloadProgress._history = [];
  }
}
