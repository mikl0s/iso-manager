#!/usr/bin/env node

/**
 * ISO Manager Web Interface
 * Main server file that initializes and starts the Express server
 */

// Import required modules
const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const chokidar = require('chokidar');

// Helper to resolve isoArchive path to project root
function resolveArchivePath(archivePath) {
  if (!archivePath) return path.join(__dirname, '..', 'ISO-Archive');
  // If path is already absolute, return as is
  if (path.isAbsolute(archivePath)) return archivePath;
  // Otherwise, resolve relative to project root (one level above iso-manager-web)
  return path.join(__dirname, '..', archivePath);
}

// Load configuration from iso-manager.conf
function loadConfiguration() {
  try {
    const configPath = path.join(__dirname, '..', 'iso-manager.conf');
    console.log(`Loading configuration from ${configPath}`);
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      // Always resolve isoArchive to project root
      config.isoArchive = resolveArchivePath(config.isoArchive);
      return config;
    } else {
      console.warn('Configuration file not found, using defaults');
      return {
        defaultIsoListUrl: 'https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json',
        isoArchive: path.join(__dirname, '..', 'ISO-Archive')
      };
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
    return {
      defaultIsoListUrl: 'https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json',
      isoArchive: path.join(__dirname, '..', 'ISO-Archive')
    };
  }
}

// Load the configuration
const config = loadConfiguration();

// Path to the isos.json file in the archive directory
let isosJsonPath = '';

// Initialize the isos.json path once config is loaded
if (config && config.isoArchive) {
  isosJsonPath = path.join(config.isoArchive, 'isos.json');
}

// Import the iso-manager.js script
const isoManagerFactory = require('../iso-manager.js');
const isoManager = isoManagerFactory();

// Global objects to track downloads and their state
const downloads = {};
let nextDownloadId = 1;

// Global variables for ISO list caching
let isoListCache = null;
let isoListCacheTime = null;
const ISO_CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Set up logging
const logPath = path.join(__dirname, '..', 'logs', 'server.log');
const logDir = path.dirname(logPath);

// Create logger object
const logger = {
  log(message) {
    console.log(message);
    // Log to file if needed
  },
  error(message) {
    console.error(message);
    // Log to file if needed
  },
  warn(message) {
    console.warn(message);
    // Log to file if needed
  },
  info(message) {
    console.info(message);
    // Log to file if needed
  }
};

// Make sure the log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  console.error(`Failed to create log directory: ${error.message}`);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to check and update the ISO list
async function checkAndUpdateIsoList(url) {
  // Check if we have a cached version that's still valid
  if (isoListCache && isoListCacheTime && (Date.now() - isoListCacheTime < ISO_CACHE_DURATION)) {
    logger.log('Using cached ISO list');
    return isoListCache;
  }

  // Fetch the ISO list from the URL
  return new Promise((resolve, reject) => {
    logger.log(`Fetching ISO list from ${url}`);
    
    // Parse the URL
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const request = client.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`Failed to fetch ISO list: ${response.statusCode} ${response.statusMessage}`));
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          // Parse the JSON data
          const parsedData = JSON.parse(data);
          
          // Validate the data format
          if (!parsedData || typeof parsedData !== 'object' || Object.keys(parsedData).length === 0) {
            return reject(new Error('Received empty or invalid ISO list data'));
          }
          
          // Cache the data
          isoListCache = parsedData;
          isoListCacheTime = Date.now();
          
          // Return the data
          resolve(parsedData);
        } catch (error) {
          reject(new Error(`Failed to parse ISO list data: ${error.message}`));
        }
      });
    });
    
    request.on('error', (error) => {
      reject(new Error(`Failed to fetch ISO list: ${error.message}`));
    });
    
    request.end();
  });
}

// Helper function to process ISO details
function processIsoDetails(name, details) {
  if (!details || !details.url) {
    logger.warn(`Skipping ISO '${name}' with missing URL`);
    return null;
  }
  
  // Create a processed details object
  return {
    name,
    url: details.url,
    size: details.size || 0,
    description: details.description || '',
    version: details.version || '',
    hash: details.hash || '',
    hashAlgorithm: details.hashAlgorithm || 'sha256',
    releaseDate: details.releaseDate || '',
    category: details.category || 'Other',
    tags: details.tags || [],
    inArchive: false,  // Will be updated later
    updateAvailable: false  // Will be updated later
  };
}

// Helper function to mark ISOs as archived
function markArchivedIsos(isoList) {
  try {
    // Get the archive path from configuration
    const archivePath = config.isoArchive;
    
    // Check if directory exists
    if (!fs.existsSync(archivePath)) {
      logger.warn(`Archive directory does not exist: ${archivePath}`);
      return isoList;
    }
    
    // Read directory contents
    const files = fs.readdirSync(archivePath);
    
    // Read the isos.json file for more accurate metadata
    const isosData = readIsosJson().isos;
    
    // Process each ISO in the list
    const markedIsos = {};
    
    for (const [name, details] of Object.entries(isoList)) {
      // Copy the details object to avoid modifying the original
      const detailsCopy = { ...details };
      
      // Extract the ISO filename from the URL
      const isoFilename = path.basename(new URL(detailsCopy.url).pathname);
      
      // Normalize the filename for comparison (remove version numbers for base comparison)
      const normalizedName = normalizeIsoName(name);
      
      // Check if any file in the archive matches this ISO (using normalized comparison)
      let matchedFile = null;
      let exactMatch = false;
      let matchedIsoData = null;
      
      // First check if we have this ISO in our isos.json file by name
      const isoDataByName = getIsoDataByName(name);
      if (isoDataByName && files.includes(isoDataByName.filename)) {
        // We have exact metadata for this ISO
        matchedFile = isoDataByName.filename;
        matchedIsoData = isoDataByName;
        exactMatch = true;
      }
      // If no match in isos.json by name, try exact filename match
      else if (files.includes(isoFilename)) {
        matchedFile = isoFilename;
        // Check if we have metadata for this filename
        matchedIsoData = getIsoDataFromJson(isoFilename);
        exactMatch = true;
      } else {
        // If no exact match, try to find a related file by normalizing names
        for (const file of files) {
          // Skip non-ISO files
          if (!file.endsWith('.iso') && !file.endsWith('.img')) continue;
          
          // Check if the normalized names match
          const normalizedFile = normalizeIsoName(file);
          if (normalizedFile === normalizedName || 
              file.includes(normalizedName) || 
              normalizedName.includes(normalizedFile)) {
            matchedFile = file;
            // Check if we have metadata for this filename
            matchedIsoData = getIsoDataFromJson(file);
            break;
          }
        }
      }
      
      // If we found a match, check if it's the same version or needs an update
      let updateAvailable = false;
      let inArchive = false;
      
      if (matchedFile) {
        inArchive = true;
        const archivedFilePath = path.join(archivePath, matchedFile);
        const stats = fs.statSync(archivedFilePath);
        
        // First check using our isos.json metadata if available
        if (matchedIsoData) {
          // We have metadata for this ISO, use it for accurate version comparison
          const archivedVersion = matchedIsoData.version;
          const newVersion = detailsCopy.version || extractVersionFromFilename(isoFilename);
          
          // Compare versions if both are available
          if (archivedVersion && newVersion && archivedVersion !== newVersion) {
            // Check if the new version is higher than the archived version
            if (compareVersions(newVersion, archivedVersion) > 0) {
              updateAvailable = true;
              logger.log(`Update available for ${name}: ${archivedVersion} -> ${newVersion} (using isos.json metadata)`);
            }
          }
          
          // If versions are the same but sizes differ significantly, consider it an update
          else if (detailsCopy.size && matchedIsoData.size && 
                   Math.abs(detailsCopy.size - matchedIsoData.size) > 1024 * 1024) { // 1MB difference threshold
            updateAvailable = true;
            logger.log(`Update available for ${name}: size difference detected (${matchedIsoData.size} -> ${detailsCopy.size})`);
          }
        } 
        // Fallback to basic checks if no metadata is available
        else {
          // Check if the size is different (simple update check)
          if (detailsCopy.size && stats.size !== detailsCopy.size) {
            updateAvailable = true;
          }
          
          // Check version if available
          if (detailsCopy.version && !exactMatch) {
            // Extract version from filename
            const archivedVersion = extractVersionFromFilename(matchedFile);
            const newVersion = detailsCopy.version || extractVersionFromFilename(isoFilename);
            
            // Compare versions if both are available
            if (archivedVersion && newVersion && archivedVersion !== newVersion) {
              // Check if the new version is higher than the archived version
              if (compareVersions(newVersion, archivedVersion) > 0) {
                updateAvailable = true;
                logger.log(`Update available for ${name}: ${archivedVersion} -> ${newVersion} (using filename extraction)`);
              }
            }
          }
        }
      }
      
      // Update the details
      detailsCopy.inArchive = inArchive;
      detailsCopy.updateAvailable = updateAvailable;
      detailsCopy.filename = matchedFile || isoFilename; // Store the actual filename
      
      // Add to the marked list
      markedIsos[name] = detailsCopy;
    }
    
    return markedIsos;
  } catch (error) {
    logger.error(`Error marking archived ISOs: ${error.message}`);
    return isoList; // Return original list on error
  }
}

// Helper function to normalize ISO names for comparison
function normalizeIsoName(name) {
  // Convert to lowercase
  let normalized = name.toLowerCase();
  
  // Remove file extensions
  normalized = normalized.replace(/\.(iso|img|esd)$/i, '');
  
  // Remove version numbers and common patterns
  normalized = normalized.replace(/[-_]?\d+(\.\d+)+[-_]?/g, '');
  normalized = normalized.replace(/[-_]?(amd64|x86_64|i386|x86|arm64)[-_]?/g, '');
  normalized = normalized.replace(/[-_]?(live|desktop|server|netinst|dvd|cd)[-_]?/g, '');
  
  // Remove special characters and extra spaces
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

// Helper function to extract version from filename
function extractVersionFromFilename(filename) {
  // Common version patterns like: 12.04, 22.04.3, 11.2, etc.
  const versionMatch = filename.match(/[\d]+(\.[\d]+)+/);
  return versionMatch ? versionMatch[0] : null;
}

// Helper function to compare version strings
function compareVersions(v1, v2) {
  // Split versions by dots
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);
  
  // Compare each part
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    // Use 0 if the part doesn't exist
    const part1 = i < v1Parts.length ? v1Parts[i] : 0;
    const part2 = i < v2Parts.length ? v2Parts[i] : 0;
    
    // Compare parts
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  // Versions are equal
  return 0;
}

// API endpoint to list all files in the ISO archive directory
app.get('/api/archive', async (req, res) => {
  try {
    // Get the archive path from configuration
    const archivePath = config.isoArchive;
    logger.log(`Listing files in archive: ${archivePath}`);
    
    // Check if directory exists
    if (!fs.existsSync(archivePath)) {
      logger.warn(`Archive directory does not exist: ${archivePath}`);
      return res.json([]);
    }
    
    // Read directory contents
    const files = fs.readdirSync(archivePath);
    
    // Process each file to get details
    const fileDetails = files.map(filename => {
      const filePath = path.join(archivePath, filename);
      const stats = fs.statSync(filePath);
      
      return {
        name: filename,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime
      };
    });
    
    res.json(fileDetails);
  } catch (error) {
    logger.error(`Error listing archive contents: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Function to read and parse iso-manager.conf (JSON format)
function readJsonConfig(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(fileContent);
    return config;
  } catch (error) {
    console.error(`Error reading or parsing JSON config file ${filePath}:`, error);
    // Return empty object or handle error as needed
    return {}; 
  }
}

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
  const configPath = path.join(__dirname, '../iso-manager.conf');
  try {
    const config = readJsonConfig(configPath);
    
    // Send only the relevant config values needed by the frontend
    const frontendConfig = {
      isoListUrl: config.defaultIsoListUrl, 
      defaultDownloadPath: config.isoArchive // Use the 'isoArchive' key from the JSON config
      // Add other needed config keys here
    };

    console.log("Sending config to frontend:", frontendConfig);
    res.json(frontendConfig);
  } catch (error) {
    console.error("Error processing GET /api/config:", error);
    res.status(500).json({ error: 'Failed to retrieve configuration.' });
  }
});

// API endpoint to update configuration
app.post('/api/config', (req, res) => {
  const configPath = path.join(__dirname, '../iso-manager.conf');
  const newSettings = req.body;
  console.log("Received settings to save:", newSettings);

  try {
    // Read the current config
    let currentConfig = readJsonConfig(configPath);
    if (!currentConfig) {
      throw new Error('Could not read current configuration.');
    }

    // Update the config with new values (if provided)
    if (newSettings.hasOwnProperty('isoListUrl')) {
      currentConfig.defaultIsoListUrl = newSettings.isoListUrl;
    }
    if (newSettings.hasOwnProperty('defaultDownloadPath')) {
      currentConfig.isoArchive = newSettings.defaultDownloadPath;
    }
    // Add updates for other settings here if needed

    // Write the updated config back to the file (pretty-printed JSON)
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    console.log("Configuration saved successfully to:", configPath);

    // Send back the updated relevant config (optional, but good practice)
    const updatedFrontendConfig = {
      isoListUrl: currentConfig.defaultIsoListUrl, 
      defaultDownloadPath: currentConfig.isoArchive 
    };
    res.json(updatedFrontendConfig);
  } catch (error) {
    console.error("Error saving configuration:", error);
    res.status(500).json({ error: `Failed to save configuration: ${error.message}` });
  }
});

// API endpoint to get ISO list
app.get('/api/isos', async (req, res) => {
  try {
    const url = req.query.url || 'https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json';
    logger.log(`Fetching ISO list from ${url}`);
    
    // Use the caching function to get the data
    let result;
    try {
      result = await checkAndUpdateIsoList(url);
      logger.log('Successfully fetched ISO list data:', Object.keys(result).length, 'ISOs found');
    } catch (error) {
      logger.error('Error fetching ISO list data:', error.message);
      return res.status(500).json({ error: `Failed to fetch ISO list: ${error.message}` });
    }
    
    // Process result and add file sizes if missing
    if (result && typeof result === 'object') {
      const processed = {};
      
      // Process each ISO in the list
      for (const [name, details] of Object.entries(result)) {
        // Skip entries without URL
        if (!details.url) {
          logger.warn(`Skipping ISO '${name}' missing URL`);
          continue;
        }
        
        // Copy the details object to avoid modifying the original
        const detailsCopy = { ...details };
        
        // Process ISO details
        const processedDetails = processIsoDetails(name, detailsCopy);
        if (processedDetails) {
          processed[name] = processedDetails;
        }
      }
      
      logger.log(`Processed ${Object.keys(processed).length} ISOs`);
      
      // Mark ISOs as archived if they exist in the download directory
      const markedIsos = markArchivedIsos(processed);
      
      // Log the final result
      logger.log(`Returning ${Object.keys(markedIsos).length} ISOs to client`);
      
      res.json(markedIsos);
    } else {
      logger.error('Invalid ISO list data format:', result);
      throw new Error('Invalid ISO list data format');
    }
  } catch (error) {
    logger.error('Error processing ISO list:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to verify an ISO file
app.post('/api/verify', async (req, res) => {
  try {
    const { path: filePath, algorithm = 'sha256', expectedHash = '' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }
    
    // Call the iso-manager to verify the file
    const result = await isoManager.verifyFile({
      filePath,
      algorithm,
      expectedHash
    });
    res.json(result);
  } catch (error) {
    logger.error(`Error verifying file: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to download an ISO
app.post('/api/download', async (req, res) => {
  try {
    const { url, outputPath, verify, hashAlgorithm } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    // Generate a unique download ID
    const downloadId = nextDownloadId++;
    
    // Create a download object to track progress
    downloads[downloadId] = {
      url,
      outputPath,
      verify,
      hashAlgorithm,
      progress: 0,
      status: 'initializing',
      startTime: Date.now(),
      error: null
    };
    
    // Return the download ID immediately
    res.json({ downloadId });
    
    // Start the download in the background
    try {
      // Use the configured ISO archive path if no outputPath is provided
      const configuredOutputPath = config.isoArchive;
      
      // Call the iso-manager to download the file
      const downloadPromise = isoManager.downloadIso({
        url,
        outputPath: outputPath || configuredOutputPath,
        verify,
        hashAlgorithm,
        onProgress: (progressData) => {
          // Update progress
          if (downloads[downloadId]) {
            downloads[downloadId].progress = progressData.percentage || 0;
            downloads[downloadId].status = 'downloading';
          }
        }
      });
      
      // Handle completion
      downloadPromise
        .then(result => {
          if (downloads[downloadId]) {
            downloads[downloadId].status = 'completed';
            downloads[downloadId].progress = 100;
            downloads[downloadId].result = result;
            
            // Add the downloaded ISO to the isos.json file
            try {
              const filename = path.basename(result.filePath);
              const fileStats = fs.statSync(result.filePath);
              
              // Extract ISO name from URL or use filename as fallback
              const urlObj = new URL(url);
              const urlPathname = urlObj.pathname;
              const urlFilename = path.basename(urlPathname);
              
              // Try to get a meaningful name from the URL or filename
              let isoName = urlFilename;
              // Remove file extension and common suffixes
              isoName = isoName.replace(/\.(iso|img)$/i, '');
              isoName = isoName.replace(/(-netinst|-dvd|-live|-bootonly|-minimal|-desktop)$/i, '');
              
              // Extract version if present in filename
              const version = extractVersionFromFilename(filename);
              
              // Add to isos.json with hash and size
              addIsoToJson(
                { name: isoName, version: version },
                filename,
                result.hash,
                fileStats.size
              );
              
              console.log(`Added ${filename} to isos.json tracking file`);
            } catch (error) {
              console.error(`Error adding ISO to isos.json: ${error.message}`);
            }
          }
        })
        .catch(error => {
          // Handle immediate errors
          if (downloads[downloadId]) {
            downloads[downloadId].status = 'error';
            downloads[downloadId].error = error.message;
          }
        });
    } catch (error) {
      // Handle immediate errors
      if (downloads[downloadId]) {
        downloads[downloadId].status = 'error';
        downloads[downloadId].error = error.message;
      }
    }
  } catch (error) {
    logger.error(`Error starting download: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get download status
app.get('/api/download/:id', (req, res) => {
  const downloadId = parseInt(req.params.id, 10);
  
  if (isNaN(downloadId) || !downloads[downloadId]) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  const download = downloads[downloadId];
  
  // Calculate speed and ETA if download is in progress
  let speed = 0;
  let eta = 0;
  
  if (download.status === 'downloading' && download.progress > 0) {
    const elapsedTime = Date.now() - download.startTime;
    const remainingProgress = 100 - download.progress;
    
    // Calculate speed in percent per millisecond
    speed = download.progress / elapsedTime;
    
    // Calculate ETA in milliseconds
    eta = remainingProgress / speed;
  }
  
  res.json({
    ...download,
    speed,
    eta
  });
});

// API endpoint to get server status
app.get('/api/status', (req, res) => {
  try {
    const status = {
      version: '1.0.0',
      defaultIsoListUrl: config.defaultIsoListUrl,
      archivePath: config.isoArchive,
      uptime: process.uptime(),
      nodeVersion: process.version
    };
    
    res.json(status);
  } catch (error) {
    logger.error(`Error getting server status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to force refresh the ISO list from GitHub
app.get('/api/refresh-isos', async (req, res) => {
  try {
    // Clear the cache to force a fresh fetch
    isoListCache = null;
    isoListCacheTime = null;
    
    logger.log('Forcing refresh of ISO list from GitHub');
    
    // Use the URL from config or default to GitHub URL
    const url = config.defaultIsoListUrl || 'https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json';
    
    // Fetch fresh data
    const result = await checkAndUpdateIsoList(url);
    
    logger.log('Successfully refreshed ISO list from GitHub:', Object.keys(result).length, 'ISOs found');
    
    // Return success
    res.json({ 
      success: true, 
      message: `Successfully refreshed ISO list: ${Object.keys(result).length} ISOs found`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error refreshing ISO list from GitHub:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to refresh ISO list: ${error.message}` 
    });
  }
});

// Ensure ISO archive directory exists
if (!fs.existsSync(config.isoArchive)) {
  try {
    console.log(`Creating ISO archive directory: ${config.isoArchive}`);
    fs.mkdirSync(config.isoArchive, { recursive: true });
  } catch (error) {
    console.error(`Failed to create ISO archive directory: ${error.message}`);
  }
}

// Set up file watcher for ISO archive
const watcher = chokidar.watch(config.isoArchive, {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: true,
  ignored: /(^|[\/\\])\../  // Ignore dotfiles
});

watcher
  .on('add', path => console.log(`File added to archive: ${path}`))
  .on('change', path => console.log(`File changed in archive: ${path}`))
  .on('unlink', path => console.log(`File removed from archive: ${path}`))
  .on('error', error => console.error(`Watcher error: ${error}`));

// API endpoint to list downloaded ISOs
app.get('/api/iso-archive', (req, res) => {
  const configPath = path.join(__dirname, '../iso-manager.conf');
  try {
    const config = readJsonConfig(configPath);
    const archivePath = config.isoArchive; // Get archive path from config
    if (!archivePath || !fs.existsSync(archivePath)) {
      console.warn(`ISO Archive path not found or doesn't exist: ${archivePath}`);
      return res.json([]); // Return empty array if path is invalid
    }

    fs.readdir(archivePath, (err, files) => {
      if (err) {
        console.error(`Error reading archive directory ${archivePath}:`, err);
        return res.status(500).json({ error: 'Failed to read ISO archive directory.' });
      }
      // Filter out potential subdirectories or non-ISO files if needed (optional)
      const isoFiles = files.filter(file => !fs.statSync(path.join(archivePath, file)).isDirectory()); 
      res.json(isoFiles);
    });
  } catch (error) {
    console.error("Error processing GET /api/iso-archive:", error);
    res.status(500).json({ error: 'Failed to list ISO archive files.' });
  }
});

// API endpoint to delete a downloaded ISO
app.delete('/api/iso-archive/:filename', (req, res) => {
  const configPath = path.join(__dirname, '../iso-manager.conf');
  const filenameToDelete = req.params.filename;

  if (!filenameToDelete) {
    return res.status(400).json({ error: 'Filename is required.' });
  }

  try {
    const config = readJsonConfig(configPath);
    const archivePath = config.isoArchive; 

    if (!archivePath) {
      throw new Error('ISO Archive path is not configured.');
    }

    const resolvedArchivePath = resolveArchivePath(archivePath);
    const fullPathToDelete = path.join(resolvedArchivePath, path.basename(filenameToDelete));

    // **Security Check:** Ensure the path to delete is within the archive directory
    if (!fullPathToDelete.startsWith(resolvedArchivePath + path.sep)) {
      console.error(`Attempted deletion outside archive directory: ${fullPathToDelete}`);
      return res.status(403).json({ error: 'Deletion outside designated directory is forbidden.' });
    }

    if (!fs.existsSync(fullPathToDelete)) {
      return res.status(404).json({ error: `File not found: ${filenameToDelete}` });
    }

    fs.unlink(fullPathToDelete, (err) => {
      if (err) {
        console.error(`Error deleting file ${fullPathToDelete}:`, err);
        return res.status(500).json({ error: `Failed to delete file: ${err.message}` });
      }
      
      // Remove the ISO from the isos.json file
      try {
        removeIsoFromJson(filenameToDelete);
        console.log(`Removed ${filenameToDelete} from isos.json tracking file`);
      } catch (error) {
        console.error(`Error removing ISO from isos.json: ${error.message}`);
        // Continue with the response even if there's an error with isos.json
      }
      
      console.log(`Successfully deleted: ${fullPathToDelete}`);
      res.status(200).json({ message: `File '${filenameToDelete}' deleted successfully.` });
    });
  } catch (error) {
    console.error("Error processing DELETE /api/iso-archive:", error);
    res.status(500).json({ error: `Failed to delete file: ${error.message}` });
  }
});

// API endpoint to get the isos.json data
app.get('/api/isos-metadata', (req, res) => {
  try {
    const data = readIsosJson();
    res.json(data);
  } catch (error) {
    console.error(`Error reading isos.json: ${error.message}`);
    res.status(500).json({ error: 'Failed to read ISO metadata.' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to read the isos.json file
function readIsosJson() {
  try {
    if (!fs.existsSync(isosJsonPath)) {
      // If the file doesn't exist, return an empty object
      return { isos: [] };
    }
    
    const data = fs.readFileSync(isosJsonPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading isos.json: ${error.message}`);
    return { isos: [] }; // Return empty object on error
  }
}

// Function to write to the isos.json file
function writeIsosJson(data) {
  try {
    // Ensure the directory exists
    if (!fs.existsSync(config.isoArchive)) {
      fs.mkdirSync(config.isoArchive, { recursive: true });
    }
    
    fs.writeFileSync(isosJsonPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing to isos.json: ${error.message}`);
    return false;
  }
}

// Function to add an ISO to the isos.json file
function addIsoToJson(iso, filename, hash, size) {
  const data = readIsosJson();
  
  // Normalize the ISO name for comparison
  const normalizedName = normalizeIsoName(iso.name);
  
  // Check if the ISO already exists in the file by filename
  let existingIndex = data.isos.findIndex(item => item.filename === filename);
  
  // If not found by filename, check by normalized name to handle updates
  if (existingIndex === -1) {
    existingIndex = data.isos.findIndex(item => normalizeIsoName(item.name) === normalizedName);
  }
  
  const isoData = {
    name: iso.name,
    filename: filename,
    version: iso.version || extractVersionFromFilename(filename),
    hash: hash || '',
    size: size || 0,
    addedDate: new Date().toISOString()
  };
  
  if (existingIndex !== -1) {
    // Update existing entry
    data.isos[existingIndex] = isoData;
    console.log(`Updated existing ISO in isos.json: ${iso.name} (${filename})`);
  } else {
    // Add new entry
    data.isos.push(isoData);
    console.log(`Added new ISO to isos.json: ${iso.name} (${filename})`);
  }
  
  return writeIsosJson(data);
}

// Function to remove an ISO from the isos.json file
function removeIsoFromJson(filename) {
  const data = readIsosJson();
  
  // Filter out the ISO with the given filename
  data.isos = data.isos.filter(iso => iso.filename !== filename);
  
  return writeIsosJson(data);
}

// Function to get ISO data from isos.json by filename
function getIsoDataFromJson(filename) {
  const data = readIsosJson();
  return data.isos.find(iso => iso.filename === filename);
}

// Function to get ISO data from isos.json by normalized name
function getIsoDataByName(name) {
  const normalizedName = normalizeIsoName(name);
  const data = readIsosJson();
  
  return data.isos.find(iso => {
    const isoNormalizedName = normalizeIsoName(iso.name);
    return isoNormalizedName === normalizedName;
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`ISO Manager Web Interface running on port ${PORT}`);
  console.log(`ISO Archive path: ${config.isoArchive}`);
  console.log(`Default ISO List URL: ${config.defaultIsoListUrl}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  watcher.close().then(() => {
    console.log('File watcher closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error(`Uncaught exception: ${error.message}`);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});
