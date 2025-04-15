# ISO Manager

<img src="https://via.placeholder.com/800x450?text=ISO+Manager+Screenshot" alt="ISO Manager Screenshot">

<div align="center">
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-blue" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</div>

## Overview

ISO Manager is a standalone tool for browsing, downloading, and managing OS installation images (ISOs) with a modern web interface and CLI utilities. Originally developed for the Anyboot project, it is now a general-purpose ISO management solution.

## Key Features

- **Modern UI**: Dark slate background with vibrant accent colors and gradient elements
- **ISO Discovery**: Browse and search through various operating system ISOs
- **Version Control**: View available versions with update notifications
- **Download Management**: Easy downloading with progress tracking
- **Hash Verification**: Verify downloaded ISO integrity
- **Archive Integration**: Track previously downloaded ISOs
- **Responsive Design**: Works across desktop and mobile devices
- **CLI Tools**: Included for advanced and automated workflows

## Installation

```bash
# Clone the repository
git clone git@github.com:mikl0s/iso-manager.git
cd iso-manager

# Install dependencies
npm install

# Start the web interface
./run-web.sh
```

The web interface will be available at http://localhost:5001

## Configuration

Config options are available in `iso-manager.conf`:

```json
{
  "defaultIsoListUrl": "https://raw.githubusercontent.com/mikl0s/iso-list/main/links.json",
  "isoArchive": "ISO-Archive"
}
```

## Credits

- Operating system icons from [operating-system-logos](https://github.com/ngeenx/operating-system-logos)

## License

MIT License

Copyright (c) 2024 Dataløs / Mikkel Georgsen
