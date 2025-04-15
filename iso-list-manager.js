/**
 * ISO List Manager Module
 * 
 * Handles fetching, processing, and managing ISO lists
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Import utility functions
const {
  formatSize,
  escapeRegExp,
  estimateIsoSize,
  detectDistroType,
  parseUrl
} = require('./iso-utils');

// Import downloader functions
const { fetchData } = require('./iso-downloader');

/**
 * Fetch ISO list from URL
 * @param {string} url - URL to fetch ISO list from
 * @returns {Promise<Array<Object>>} - List of ISO objects
 */
async function fetchIsoList(url) {
  try {
    console.log(`Fetching ISO list from ${url}...`);
    
    // Fetch JSON data
    const data = await fetchData(url);
    let jsonData;
    
    try {
      jsonData = JSON.parse(data);
    } catch (error) {
      throw new Error(`Invalid JSON data: ${error.message}`);
    }
    
    // Extract ISO list from JSON structure
    let isos = [];
    
    // Handle different JSON structures
    if (Array.isArray(jsonData)) {
      isos = jsonData;
    } else if (jsonData.links && Array.isArray(jsonData.links)) {
      isos = jsonData.links;
    } else if (jsonData.isos && Array.isArray(jsonData.isos)) {
      isos = jsonData.isos;
    } else {
      // Try to extract from object
      isos = Object.values(jsonData).filter(item => typeof item === 'object');
    }
    
    if (isos.length === 0) {
      throw new Error('No ISOs found in the data');
    }
    
    // Process and normalize ISO objects
    const normalizedIsos = isos.map(iso => {
      // Create a normalized ISO object with consistent property names
      const normalizedIso = {};
      
      // Map common property names
      normalizedIso.name = iso.name || iso.title || iso.label || 'Unknown';
      normalizedIso.link = iso.link || iso.url || iso.download || '';
      normalizedIso.hash = iso.hash || iso.checksum || iso.sha256 || iso.md5 || '';
      normalizedIso.hashAlgorithm = iso.hashAlgorithm || 
                                   iso.checksumType || 
                                   (iso.sha256 ? 'sha256' : 
                                    iso.md5 ? 'md5' : 'sha256');
      
      // Detect OS type if not specified
      normalizedIso.osType = iso.osType || iso.distro || iso.type || 
                             detectDistroType(normalizedIso.name);
      
      // Process size information
      if (iso.size && typeof iso.size === 'number') {
        normalizedIso.size = iso.size;
      } else if (iso.size && typeof iso.size === 'string') {
        // Try to parse size string (remove non-numeric characters except decimal point)
        const sizeStr = iso.size.replace(/[^0-9.]/g, '');
        const sizeUnit = iso.size.replace(/[0-9.]/g, '').trim().toUpperCase();
        
        if (sizeStr) {
          let size = parseFloat(sizeStr);
          
          // Convert to bytes based on unit
          if (sizeUnit.includes('KB') || sizeUnit.includes('K')) {
            size *= 1024;
          } else if (sizeUnit.includes('MB') || sizeUnit.includes('M')) {
            size *= 1024 * 1024;
          } else if (sizeUnit.includes('GB') || sizeUnit.includes('G')) {
            size *= 1024 * 1024 * 1024;
          } else if (sizeUnit.includes('TB') || sizeUnit.includes('T')) {
            size *= 1024 * 1024 * 1024 * 1024;
          }
          
          normalizedIso.size = Math.round(size);
        }
      }
      
      // Estimate size if not available
      if (!normalizedIso.size || normalizedIso.size <= 0) {
        normalizedIso.size = estimateIsoSize(normalizedIso.name, normalizedIso.osType);
      }
      
      // Add pretty size string
      normalizedIso.prettySize = formatSize(normalizedIso.size);
      
      // Add ISO ID for reference
      normalizedIso.id = Buffer.from(normalizedIso.link).toString('base64').replace(/[+\/=]/g, '');
      
      return normalizedIso;
    });
    
    console.log(`Found ${normalizedIsos.length} ISOs`);
    return normalizedIsos;
  } catch (error) {
    console.error(`Error fetching ISO list: ${error.message}`);
    throw error;
  }
}

/**
 * Output results of ISO list operation
 * @param {Array<Object>} data - ISO list data
 * @param {Object} options - Output options
 * @returns {Object} - Output result
 */
function outputResults(data, options) {
  const { format = 'json', limit = 0, saveFile = '', useGit = false, gitRepo = '', gitBranch = 'main' } = options;
  
  try {
    // Apply limit if specified
    const limitedData = limit > 0 ? data.slice(0, limit) : data;
    
    // Format output
    let output;
    
    if (format === 'json') {
      output = JSON.stringify({ links: limitedData }, null, 2);
    } else {
      // Text format
      output = limitedData.map(iso => {
        return `Name: ${iso.name}\nURL: ${iso.link}\nType: ${iso.osType}\nSize: ${iso.prettySize}\n` +
               (iso.hash ? `Hash (${iso.hashAlgorithm}): ${iso.hash}\n` : '');
      }).join('\n');
    }
    
    // Save to file if specified
    if (saveFile) {
      fs.writeFileSync(saveFile, output);
      console.log(`Results saved to ${saveFile}`);
      
      // Git operations if requested
      if (useGit) {
        const result = gitCommitAndPush(path.dirname(saveFile), {
          repo: gitRepo,
          branch: gitBranch,
          files: [path.basename(saveFile)],
          message: `Update ISO list - ${new Date().toISOString()}`
        });
        
        if (result.success) {
          console.log('Changes committed and pushed to git repository');
        } else {
          console.error(`Git operation failed: ${result.error}`);
        }
      }
      
      return { success: true, path: saveFile };
    } else {
      // Output to console
      console.log(output);
      return { success: true };
    }
  } catch (error) {
    console.error(`Error outputting results: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Commit changes to git repository and push
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Git options
 * @returns {Object} - Operation result
 */
async function gitCommitAndPush(repoPath, options = {}) {
  const { repo, branch = 'main', files = [], message = 'Update files' } = options;
  
  try {
    const currentDir = process.cwd();
    process.chdir(repoPath);
    
    // Ensure git repository exists
    if (repo) {
      await ensureGitRepo(repo, repoPath, branch);
    }
    
    // Stage files
    const addCommand = files.length > 0 
      ? `git add ${files.join(' ')}` 
      : 'git add .';
    
    execSync(addCommand, { stdio: 'pipe' });
    
    // Commit changes
    execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
    
    // Push to remote
    execSync(`git push origin ${branch}`, { stdio: 'pipe' });
    
    process.chdir(currentDir);
    return { success: true };
  } catch (error) {
    console.error(`Git operation error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure git repository is properly set up
 * @param {string} repoUrl - Git repository URL
 * @param {string} targetDir - Target directory
 * @param {string} branch - Git branch name
 * @returns {Promise<boolean>} - Success status
 */
async function ensureGitRepo(repoUrl, targetDir, branch = 'main') {
  try {
    // Check if .git directory exists
    if (!fs.existsSync(path.join(targetDir, '.git'))) {
      console.log('Initializing git repository...');
      execSync('git init', { cwd: targetDir, stdio: 'pipe' });
      execSync(`git checkout -b ${branch}`, { cwd: targetDir, stdio: 'pipe' });
    }
    
    // Check if remote origin exists
    try {
      execSync('git remote get-url origin', { cwd: targetDir, stdio: 'pipe' });
    } catch (e) {
      // Remote doesn't exist, add it
      execSync(`git remote add origin ${repoUrl}`, { cwd: targetDir, stdio: 'pipe' });
    }
    
    return true;
  } catch (error) {
    console.error(`Error ensuring git repo: ${error.message}`);
    return false;
  }
}

module.exports = {
  fetchIsoList,
  outputResults,
  gitCommitAndPush,
  ensureGitRepo
};
