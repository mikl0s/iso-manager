# Portable Distribution Plan for iso-manager

This document outlines a detailed plan to make the `iso-manager` CLI and webapp portable across Windows, Linux, and macOS, allowing users to run the tool without installing Node.js or any dependencies.

---

## Goals
- **No installation required:** Users can run the CLI/webapp without installing Node.js or npm.
- **Single launcher script:** A universal launcher (`im`) that works on all target platforms.
- **Consistent user experience:** Commands like `im download 2` should work identically on all systems.
- **Easy packaging and distribution:** Simple process for maintainers to build and distribute new releases.

---

## 1. Building Standalone Executables

### Tool Selection
- Use [`pkg`](https://github.com/vercel/pkg) to bundle the Node.js runtime and application code into platform-specific executables.
- Alternatives: [`nexe`](https://github.com/nexe/nexe) or [`enclosejs`](https://github.com/igorklopov/enclosejs) (not preferred due to pkg's maturity).

### Build Targets
- **Windows:** `iso-manager-win.exe`
- **macOS:** `iso-manager-mac`
- **Linux:** `iso-manager-linux`

### Build Steps
1. Ensure `package.json` and entry point (e.g., `iso-manager.js`) are correct.
2. Install `pkg` globally: `npm install -g pkg`
3. Build commands:
   ```bash
   pkg . --targets node18-win-x64 --output iso-manager-win.exe
   pkg . --targets node18-macos-x64 --output iso-manager-mac
   pkg . --targets node18-linux-x64 --output iso-manager-linux
   ```
4. (Optional) Add these as npm scripts for convenience.

---

## 2. Universal Launcher Script (`im`)

### Purpose
- Provide a single entry point for users, regardless of OS.
- Automatically detects the platform and runs the appropriate binary.

### Implementation
- Combine Windows batch and Unix shell logic in a single file (`im`).
- Example structure:

  ```bat
  :: Windows Batch Portion
  @echo off
  setlocal
  if "%OS%" == "Windows_NT" (
      "%~dp0iso-manager-win.exe" %*
      exit /b
  )
  exit
  ```
  ```sh
  #!/bin/sh
  OS="$(uname -s)"
  case "$OS" in
      Darwin)
          exec "$(dirname "$0")/iso-manager-mac" "$@"
          ;;
      Linux)
          exec "$(dirname "$0")/iso-manager-linux" "$@"
          ;;
      *)
          echo "Unsupported OS: $OS"
          exit 1
          ;;
  esac
  ```
- Save as `im` (no extension). Make it executable on Unix: `chmod +x im`.
- Place `im` and all executables in the same directory.

---

## 3. File Structure Example

```
/portable-iso-manager/
├── im
├── iso-manager-win.exe
├── iso-manager-mac
├── iso-manager-linux
└── README.md
```

---

## 4. Distribution
- Zip/tar the directory for release.
- Optionally provide platform-specific archives (e.g., `.zip` for Windows, `.tar.gz` for Unix).
- Include usage instructions in `README.md`.

---

## 5. Webapp Considerations
- If the webapp is Node-based, bundle as above.
- If static, include a lightweight HTTP server in the CLI or provide a separate script/binary.

---

## 6. Future Enhancements
- Auto-update mechanism for the portable package.
- GUI launcher for users less comfortable with the terminal.
- Integration with platform-specific features (e.g., context menu on Windows).

---

## 7. References
- [docs/portable-packages.md](./portable-packages.md)
- [docs/launcher.md](./launcher.md)

---

**Status:** _Planned, not yet implemented._

---

*This plan is subject to change as requirements evolve or new tools become available.*
