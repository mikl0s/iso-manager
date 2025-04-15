#!/usr/bin/env node

/**
 * ISO Manager Core Module
 * 
 * Main entry point for ISO Manager CLI
 * This script can:
 * 1. Fetch and process a predefined list of ISOs from a JSON file
 * 2. Allow configuration through iso-manager.conf
 * 3. Auto commit and push changes to GitHub
 * 4. Verify ISO hash to detect changes
 * 5. Download ISOs with hash verification
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Import utility modules
const utils = require('./iso-utils');
const downloader = require('./iso-downloader');
const listManager = require('./iso-list-manager');

// Default configuration
const DEFAULT_CONFIG = {
  defaultIsoListUrl: 'https://raw.githubusercontent.com/mikl0s/iso-list/refs/heads/main/links.json',
  outputFormat: 'text',
  maxResults: 0, // 0 means unlimited
  saveFile: '',
  gitRepo: 'https://github.com/mikl0s/iso-list.git',
  gitBranch: 'main',
  hashAlgorithm: 'sha256',
  hashMatch: '{filename}.{hashAlgorithm}',
  downloadDir: 'ISO-Archive' // Default download directory
};

// Application state
let config = { ...DEFAULT_CONFIG };

/**
 * Load configuration from file if exists
 * @returns {Object} - Loaded configuration
 */
function loadConfig() {
  const configFile = 'iso-manager.conf';
  
  if (fs.existsSync(configFile)) {
    try {
      const fileContent = fs.readFileSync(configFile, 'utf-8');
      const userConfig = JSON.parse(fileContent);
      
      // Merge with default config
      const mergedConfig = { ...DEFAULT_CONFIG, ...userConfig };
      console.log(`Loaded configuration from ${configFile}`);
      return mergedConfig;
    } catch (error) {
      console.warn(`Warning: Failed to parse config file: ${error.message}`);
      console.warn('Using default configuration');
    }
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Parse command line arguments
 * @returns {Object} - Parsed options
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'list', // Default mode
    targetUrl: '',
    limit: 0,
    outputJson: false,
    savePath: '',
    useGit: false,
    verifyHash: false,
    hashAlgorithm: '',
    hashMatch: '',
    download: false,
    testMode: false,
    downloadDir: ''
  };
  
  // Handle mode (first argument if not a flag)
  if (args.length > 0 && !args[0].startsWith('-')) {
    options.mode = args[0];
    args.shift();
  }
  
  // Parse options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case '-u':
      case '--url':
        options.targetUrl = nextArg;
        i++;
        break;
      case '-l':
      case '--limit':
        options.limit = parseInt(nextArg, 10);
        i++;
        break;
      case '-j':
      case '--json':
        options.outputJson = true;
        break;
      case '-s':
      case '--save':
        options.savePath = nextArg;
        i++;
        break;
      case '-g':
      case '--git':
        options.useGit = true;
        break;
      case '-v':
      case '--verify':
        options.verifyHash = true;
        break;
      case '--hash-alg':
        options.hashAlgorithm = nextArg;
        i++;
        break;
      case '--hash-match':
        options.hashMatch = nextArg;
        i++;
        break;
      case '-d':
      case '--download':
        options.download = true;
        break;
      case '-t':
      case '--test':
        options.testMode = true;
        break;
      case '--download-dir':
        options.downloadDir = nextArg;
        i++;
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }
  
  return options;
}

/**
 * Show help information
 */
function showHelp() {
  console.log('ISO Manager - A tool for fetching, verifying, and downloading ISO images');
  console.log('');
  console.log('Usage: node iso-manager-core.js [mode] [options]');
  console.log('');
  console.log('Modes:');
  console.log('  list            List available ISOs');
  console.log('  verify          Verify ISO hashes');
  console.log('  download        Download an ISO file');
  console.log('');
  console.log('Options:');
  console.log('  -u, --url URL      URL to fetch ISO list from');
  console.log('  -l, --limit N      Limit output to N results');
  console.log('  -j, --json         Output in JSON format');
  console.log('  -s, --save FILE    Save output to FILE');
  console.log('  -g, --git          Auto-commit and push changes to Git');
  console.log('  -v, --verify       Verify ISO hashes');
  console.log('  --hash-alg ALGO    Hash algorithm (md5, sha1, sha256, sha512)');
  console.log('  --hash-match PAT   Pattern for hash files');
  console.log('  -d, --download     Download an ISO file');
  console.log('  -t, --test         Test mode - delete file after verification');
  console.log('  --download-dir DIR Directory to save downloaded files');
  console.log('  -h, --help         Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node iso-manager-core.js list --url https://example.com/isos.json --limit 5');
  console.log('  node iso-manager-core.js verify --hash-alg sha256');
  console.log('  node iso-manager-core.js download --download-dir ./isos');
}

/**
 * Main function
 */
async function main() {
  try {
    // Load configuration
    config = loadConfig();
    
    // Parse command line arguments
    const options = parseCommandLineArgs();
    
    // Set default URL if not specified
    if (!options.targetUrl) {
      options.targetUrl = config.defaultIsoListUrl;
    }
    
    // Set default output format
    if (options.outputJson) {
      config.outputFormat = 'json';
    }
    
    // Handle different modes
    switch (options.mode) {
      case 'list':
        await handleListMode(options);
        break;
      case 'verify':
        await handleVerifyMode(options);
        break;
      case 'download':
        await handleDownloadMode(options);
        break;
      default:
        console.error(`Unknown mode: ${options.mode}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle list mode
 * @param {Object} options - Command line options
 */
async function handleListMode(options) {
  console.log(`Fetching ISO list from ${options.targetUrl}...`);
  
  try {
    // Fetch ISO list
    const isoList = await listManager.fetchIsoList(options.targetUrl);
    
    // Output results
    listManager.outputResults(isoList, {
      format: config.outputFormat,
      limit: options.limit || config.maxResults,
      saveFile: options.savePath || config.saveFile,
      useGit: options.useGit,
      gitRepo: config.gitRepo,
      gitBranch: config.gitBranch
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle verify mode
 * @param {Object} options - Command line options
 */
async function handleVerifyMode(options) {
  console.log(`Verifying ISOs from ${options.targetUrl}...`);
  
  try {
    // Fetch ISO list
    const isoList = await listManager.fetchIsoList(options.targetUrl);
    
    // Verify each ISO
    const results = [];
    for (const iso of isoList) {
      console.log(`\nVerifying: ${iso.name}...`);
      const result = await downloader.verifyIsoHash(iso);
      results.push(result);
      
      // Display result
      if (result.success) {
        console.log(`\n✓ Hash verification successful for ${iso.name}`);
      } else {
        console.log(`\n✗ Hash verification failed for ${iso.name}: ${result.message}`);
      }
    }
    
    // Summarize results
    const successful = results.filter(r => r.success).length;
    console.log(`\nVerification complete: ${successful}/${results.length} ISOs verified successfully`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle download mode
 * @param {Object} options - Command line options
 */
async function handleDownloadMode(options) {
  console.log(`Fetching ISO list from ${options.targetUrl}...`);
  
  try {
    // Fetch ISO list
    const isoList = await listManager.fetchIsoList(options.targetUrl);
    
    // Set download directory
    const downloadDir = options.downloadDir || path.join(process.cwd(), config.downloadDir);
    
    // Download ISO
    const result = await downloader.downloadIso(isoList, {
      downloadDir,
      testMode: options.testMode
    });
    
    if (result.success) {
      console.log('\nDownload completed successfully.');
    } else if (result.cancelled) {
      console.log('\nDownload cancelled by user.');
    } else {
      console.error(`\nDownload failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});

module.exports = {
  loadConfig,
  parseCommandLineArgs,
  main
};
