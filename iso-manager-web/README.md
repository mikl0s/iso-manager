# AnyBoot ISO Manager Web Interface

A modern web interface for managing, downloading, and verifying ISO images using the AnyBoot ISO Manager.

## Features

- Browse and search a catalog of Linux distribution ISO images
- Download ISO files with progress tracking
- Verify ISO integrity by comparing hashes
- Clean, modern dark-mode UI with responsive design
- Integration with the iso-manager.js script

## Installation

1. Make sure you have Node.js installed (version 14 or higher)
2. Navigate to the project directory
3. Install dependencies

```bash
npm install
```

## Usage

### Starting the Web Interface

Start the server with:

```bash
npm start
```

Then open your browser and navigate to http://localhost:3000

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

## Integration with iso-manager.js

This web interface seamlessly integrates with the existing iso-manager.js script to provide a graphical interface for:

- Fetching lists of ISO images from configured sources
- Downloading ISO files with progress tracking
- Verifying the integrity of downloaded ISO files

## OS Logo Integration

The interface uses [Devicon](https://devicon.dev/) for OS logos, providing visual identification of different Linux distributions.

## License

MIT
