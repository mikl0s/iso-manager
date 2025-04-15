# Cross-Platform Launcher Script: `im`

This script auto-detects the OS and launches the correct binary for your `iso-manager` tool.

## Filestructure
```
/your-usb-root/
├── im
├── iso-manager-win.exe
├── iso-manager-mac
└── iso-manager-linux
```

## Script: `im`
Save this as `im` (no file extension):

```bat
:: Windows Batch Portion
@echo off
setlocal

:: Check if running on Windows
if "%OS%" == "Windows_NT" (
    "%~dp0iso-manager-win.exe" %*
    exit /b
)

:: Fallback to shell for Unix-based systems
exit
```

```sh
#!/bin/sh
# Unix Shell Portion

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

## Setup
Make the script executable on Unix-based systems:

```bash
chmod +x im
```

## Usage
From terminal:
```bash
./im
```

Or double-click `im` on Windows.
