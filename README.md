# DapDesk - DAP Debugger GUI

A standalone DAP (Debug Adapter Protocol) client GUI application built with Electron, React, TypeScript, and Monaco Editor.

## Features

- **DAP Protocol Support**: Works with any DAP-compatible debug adapter (PHP, Python, Node.js, C/C++, etc.)
- **Monaco Editor**: VS Code's editor with syntax highlighting and breakpoint gutter support
- **Path Mapping**: Full support for remote debugging with path mappings
- **Call Stack View**: Navigate through the call stack during debugging
- **Variables Panel**: Inspect variables at different scopes
- **Dark/Light Theme**: Toggle between dark and light editor themes via settings
- **Debug Adapter Management**: Built-in manager to install/uninstall DAP adapters
- **Lazy File Loading**: File tree loads directories on-demand with recursive expansion
- **Workspace Integration**: Open workspace directly in your preferred external editor

## Project Structure

```
dap-gui/
├── electron/              # Electron main process
│   ├── main.ts           # Entry point
│   └── preload.ts        # Preload script for IPC
├── src/
│   ├── dap/              # DAP protocol implementation
│   │   ├── client.ts     # DAP client with protocol parser
│   │   ├── session.ts    # Debug session management
│   │   └── types.ts      # TypeScript type definitions
   │   ├── components/       # React components
   │   │   ├── Editor/       # Monaco Editor wrapper
   │   │   ├── FileExplorer/ # Workspace file tree with lazy loading
   │   │   ├── Panels/       # Side panels (stack, variables, breakpoints, settings, adapters)
   │   │   ├── Toolbar/      # Debug controls
   │   │   └── StatusBar/    # Status bar
   │   ├── styles/           # Theme CSS (dark/light) with CSS custom properties
   │   ├── stores/           # Zustand state stores
   │   └── utils/            # Helper utilities
└── ...
```

## Installation

```bash
# Install dependencies
npm install

# For PHP debugging, install the PHP debug adapter:
# Option 1: Download from GitHub releases
# https://github.com/xdebug/vscode-php-debug/releases

# Option 2: Clone and build
git clone https://github.com/xdebug/vscode-php-debug.git
cd vscode-php-debug
npm install
npm run build
# Copy out/ folder to your project
```

## Usage

1. **Create a launch.json** in your project's `.vscode/` folder:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Listen for XDebug",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/var/www/html": "${workspaceFolder}"
      }
    }
  ]
}
```

2. **Start the application**:
```bash
npm run dev
```

3. **Select a configuration** from the dropdown in the toolbar

4. **Click Debug** to start debugging

5. **Set breakpoints** by clicking in the gutter area
6. **Toggle Theme** between dark and light via the Settings panel

## External Editor Integration

Configure your preferred editor in the **Settings** panel:
- **VS Code** (default): `code`
- **Cursor**, **Zed**, **Sublime Text**, **Vim**, **Neovim**
- **Custom command** with argument templates (`{file}`, `{line}`)

Use **"Open Workspace in Editor"** to open the current workspace root directly.

## Theme & Appearance

The app supports dark and light themes via CSS custom properties mapped to Tailwind's semantic color tokens (`bg-panel`, `text-accent`, `border-danger`, etc.). Themes are persisted to `localStorage` and switch instantly across the UI and Monaco Editor.

## Debug Adapter Management

Install or uninstall DAP adapters from the **Adapters** panel. The manager tracks installed adapters, their paths, and supported languages. Currently supports:

- **PHP**: `vscode-php-debug`
- **Python**: `debugpy`
- **Node.js**: Built-in DAP support
- **C/C++**: `vscode-cpptools`

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Path Mapping

The application supports path mappings for remote debugging. Configure them in your `launch.json`:

```json
"pathMappings": {
  "/server/path": "${workspaceFolder}/local/path"
}
```

This converts server paths to local paths when displaying files and vice versa when setting breakpoints.

## Supported Debug Adapters

- **PHP**: Install `vscode-php-debug` adapter
- **Python**: Use `debugpy` 
- **Node.js**: Built-in DAP support
- **C/C++**: Use `vscode-cpptools`

## Troubleshooting

- **Adapter not found**: Make sure to install the appropriate debug adapter for your language
- **Breakpoints not hit**: Check path mappings configuration
- **Connection refused**: Ensure the debug server is running and listening on the correct port

## License

MIT