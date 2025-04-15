# Creating Portable Node.js Executables (No Node.js Required)

This guide outlines how to bundle your Node.js app into standalone executables that run on **Windows**, **Linux**, and **macOS** — with **no need for Node.js** to be installed on the target system.

---

## Tool Used
- [pkg](https://github.com/vercel/pkg) — packages Node.js projects into executables.

## Installation
Install `pkg` globally via npm:

```bash
npm install -g pkg
```

---

## Project Preparation
1. Ensure your app has a `package.json` file.
2. Confirm your entry point (e.g., `index.js`) is correct.

---

## Example Build Commands

```bash
# Windows (64-bit)
pkg . --targets node18-win-x64 --output iso-manager-win.exe

# macOS (Intel)
pkg . --targets node18-macos-x64 --output iso-manager-mac

# Linux (64-bit)
pkg . --targets node18-linux-x64 --output iso-manager-linux
```

You can also add these to your `package.json` scripts:

```json
"scripts": {
  "build:win": "pkg . --targets node18-win-x64 --output iso-manager-win.exe",
  "build:mac": "pkg . --targets node18-macos-x64 --output iso-manager-mac",
  "build:linux": "pkg . --targets node18-linux-x64 --output iso-manager-linux"
}
```

Then run:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

---

## Output Files
The resulting binaries are completely standalone. No Node.js runtime is required to run them.

Place the output files alongside your cross-platform launcher script (`im`):

```
/your-usb-root/
├── im
├── iso-manager-win.exe
├── iso-manager-mac
└── iso-manager-linux
```

Now your Node.js app is **fully portable** and can run on **any supported OS** directly from a USB stick or local folder.

---
