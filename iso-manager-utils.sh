#!/usr/bin/env bash

# ISO Manager Utilities - Supporting functions for iso-manager.sh

# Terminal colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
MAGENTA="\033[0;35m"
CYAN="\033[0;36m"
RESET="\033[0m"
BOLD="\033[1m"

# Check for required tools
check_requirements() {
  local missing_tools=()
  
  for tool in curl jq sed awk grep head tail; do
    if ! command -v "$tool" &> /dev/null; then
      missing_tools+=("$tool")
    fi
  done
  
  if [ ${#missing_tools[@]} -gt 0 ]; then
    echo -e "${RED}Error: The following required tools are missing:${RESET}"
    for tool in "${missing_tools[@]}"; do
      echo "  - $tool"
    done
    echo "Please install these tools and try again."
    exit 1
  fi
}

# Load configuration from file
load_config() {
  if [ -f "$CONFIG_FILE" ]; then
    echo "Loaded configuration from $CONFIG_FILE"
    # Use jq to parse the JSON configuration file
    if command -v jq &> /dev/null; then
      if [ -n "$(jq -r '.defaultIsoListUrl' "$CONFIG_FILE" 2>/dev/null)" ]; then
        DEFAULT_ISO_LIST_URL=$(jq -r '.defaultIsoListUrl' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.outputFormat' "$CONFIG_FILE" 2>/dev/null)" ]; then
        OUTPUT_FORMAT=$(jq -r '.outputFormat' "$CONFIG_FILE")
        if [ "$OUTPUT_FORMAT" = "json" ]; then
          OUTPUT_JSON=true
        fi
      fi
      
      if [ -n "$(jq -r '.maxResults' "$CONFIG_FILE" 2>/dev/null)" ]; then
        MAX_RESULTS=$(jq -r '.maxResults' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.saveFile' "$CONFIG_FILE" 2>/dev/null)" ]; then
        SAVE_FILE=$(jq -r '.saveFile' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.gitRepo' "$CONFIG_FILE" 2>/dev/null)" ]; then
        GIT_REPO=$(jq -r '.gitRepo' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.gitBranch' "$CONFIG_FILE" 2>/dev/null)" ]; then
        GIT_BRANCH=$(jq -r '.gitBranch' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.hashAlgorithm' "$CONFIG_FILE" 2>/dev/null)" ]; then
        HASH_ALGORITHM=$(jq -r '.hashAlgorithm' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.hashMatch' "$CONFIG_FILE" 2>/dev/null)" ]; then
        HASH_MATCH=$(jq -r '.hashMatch' "$CONFIG_FILE")
      fi
      
      if [ -n "$(jq -r '.downloadDir' "$CONFIG_FILE" 2>/dev/null)" ]; then
        DEFAULT_DOWNLOAD_DIR=$(jq -r '.downloadDir' "$CONFIG_FILE")
        DOWNLOAD_DIR="$(pwd)/${DEFAULT_DOWNLOAD_DIR}"
      fi
    else
      echo -e "${YELLOW}Warning: jq not found, configuration file will be parsed using grep${RESET}"
      
      local iso_list_url=$(grep -oP '"defaultIsoListUrl"\s*:\s*"\K[^"]+' "$CONFIG_FILE" 2>/dev/null)
      if [ -n "$iso_list_url" ]; then
        DEFAULT_ISO_LIST_URL="$iso_list_url"
      fi
      
      local output_format=$(grep -oP '"outputFormat"\s*:\s*"\K[^"]+' "$CONFIG_FILE" 2>/dev/null)
      if [ -n "$output_format" ]; then
        OUTPUT_FORMAT="$output_format"
        if [ "$OUTPUT_FORMAT" = "json" ]; then
          OUTPUT_JSON=true
        fi
      fi
      
      # ... other configurations
    fi
  fi
}

# Fetch data from URL
fetch_data() {
  local url="$1"
  curl -s "$url"
}

# Format file size in human-readable format
format_size() {
  local size=$1
  local unit="B"
  
  if [ $size -ge 1073741824 ]; then
    size=$(echo "scale=2; $size / 1073741824" | bc)
    unit="GB"
  elif [ $size -ge 1048576 ]; then
    size=$(echo "scale=2; $size / 1048576" | bc)
    unit="MB"
  elif [ $size -ge 1024 ]; then
    size=$(echo "scale=2; $size / 1024" | bc)
    unit="KB"
  fi
  
  printf "%.2f %s" $size $unit
}

# Estimate ISO file size based on name and type
estimate_iso_size() {
  local name="$1"
  local type="$2"
  local size=0
  
  case $type in
    "ubuntu")
      if [[ "$name" == *server* ]]; then
        size=1000000000  # ~1GB for server
      else
        size=2500000000  # ~2.5GB for desktop
      fi
      ;;
    "debian")
      if [[ "$name" == *netinst* ]]; then
        size=400000000  # ~400MB for netinst
      else
        size=4000000000  # ~4GB for full DVD
      fi
      ;;
    "fedora")
      size=2000000000  # ~2GB
      ;;
    "arch")
      size=700000000  # ~700MB
      ;;
    "centos")
      size=9000000000  # ~9GB for DVD ISO
      ;;
    *)
      size=1500000000  # Default to ~1.5GB
      ;;
  esac
  
  echo $size
}

# Format time in human-readable format
format_time() {
  local seconds=$1
  local minutes=$((seconds / 60))
  local hours=$((minutes / 60))
  local days=$((hours / 24))
  
  if [ $days -gt 0 ]; then
    echo "${days}d ${hours % 24}h"
  elif [ $hours -gt 0 ]; then
    echo "${hours}h ${minutes % 60}m"
  elif [ $minutes -gt 0 ]; then
    echo "${minutes}m ${seconds % 60}s"
  else
    echo "${seconds}s"
  fi
}

# Calculate hash of a file
calculate_hash() {
  local file="$1"
  local algorithm="$2"
  local hash_result
  
  case $algorithm in
    "md5")
      hash_result=$(md5sum "$file" | awk '{print $1}')
      ;;
    "sha1")
      hash_result=$(sha1sum "$file" | awk '{print $1}')
      ;;
    "sha256")
      hash_result=$(sha256sum "$file" | awk '{print $1}')
      ;;
    "sha512")
      hash_result=$(sha512sum "$file" | awk '{print $1}')
      ;;
    *)
      echo -e "${RED}Error: Unsupported hash algorithm: $algorithm${RESET}" >&2
      return 1
      ;;
  esac
  
  if [ -n "$hash_result" ]; then
    echo "$hash_result"
    return 0
  else
    echo -e "${RED}Error: Failed to calculate $algorithm hash for $file${RESET}" >&2
    return 1
  fi
}

# Download and verify a file with progress bar
download_and_verify_file() {
  local url="$1"
  local output_file="$2"
  local expected_hash="$3"
  local hash_algorithm="$4"
  local start_time=$(date +%s)
  
  # Create temporary file for download
  local temp_file="${output_file}.download"
  
  echo -e "\nDownloading: $url"
  echo -e "To: $output_file\n"
  
  # Start download with progress tracking
  curl -# -L -o "$temp_file" "$url"
  local download_result=$?
  
  if [ $download_result -ne 0 ]; then
    echo -e "\n${RED}Error: Download failed with exit code $download_result${RESET}"
    rm -f "$temp_file"
    return 1
  fi
  
  echo -e "\nDownload completed."
  
  # Calculate hash if verification is required
  if [ -n "$expected_hash" ] && [ -n "$hash_algorithm" ]; then
    echo "Verifying $hash_algorithm hash..."
    local actual_hash=$(calculate_hash "$temp_file" "$hash_algorithm")
    
    if [ "$actual_hash" = "$expected_hash" ]; then
      echo -e "${GREEN}Hash verification successful.${RESET}"
    else
      echo -e "${RED}Hash verification failed.${RESET}"
      echo "Expected: $expected_hash"
      echo "Actual:   $actual_hash"
      rm -f "$temp_file"
      return 1
    fi
  fi
  
  # Move temporary file to final location
  mv "$temp_file" "$output_file"
  
  # Print download statistics
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  local size=$(stat -c %s "$output_file")
  local speed=$(echo "scale=2; $size / $duration / 1024 / 1024" | bc)
  
  echo "Downloaded $(format_size $size) in $(format_time $duration) (${speed} MB/s)"
  return 0
}

# Git operations for managing ISO list
git_operations() {
  local save_path="$1"
  local git_repo="$2"
  local git_branch="$3"
  local temp_dir
  
  # Create a temporary directory
  temp_dir=$(mktemp -d)
  echo "Working in temporary directory: $temp_dir"
  
  # Ensure we clean up on exit
  trap 'rm -rf "$temp_dir"' EXIT
  
  # Clone the repository
  echo "Cloning repository: $git_repo"
  if ! git clone --branch "$git_branch" --single-branch --depth 1 "$git_repo" "$temp_dir" 2>/dev/null; then
    echo "Repository doesn't exist or branch not found. Creating new repository."
    
    mkdir -p "$temp_dir"
    cd "$temp_dir"
    git init
    git checkout -b "$git_branch"
    
    # Configure git user if not set
    if ! git config user.email &>/dev/null; then
      git config user.email "iso-manager@example.com"
      git config user.name "ISO Manager"
    fi
  else
    cd "$temp_dir"
  fi
  
  # Copy the updated ISO list to the repository
  cp "$save_path" "$temp_dir/links.json"
  
  # Commit and push changes
  git add links.json
  git commit -m "Update ISO list - $(date +'%Y-%m-%d %H:%M:%S')"
  
  echo "Pushing to remote repository..."
  if git push -u origin "$git_branch"; then
    echo -e "${GREEN}Successfully pushed changes to the repository.${RESET}"
  else
    echo -e "${YELLOW}Failed to push changes. You might need to set up git credentials.${RESET}"
    return 1
  fi
  
  return 0
}
