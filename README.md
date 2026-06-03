# DapDesk - DAP Debugger GUI

A standalone DAP (Debug Adapter Protocol) client GUI application built with Electron, React, TypeScript, and Monaco Editor.

## Features

- **DAP Protocol Support**: Works with any DAP-compatible debug adapter (PHP, Python, Node.js, C/C++, etc.)
- **Monaco Editor**: VS Code's editor with syntax highlighting and breakpoint gutter support
- **Path Mapping**: Full support for remote debugging with path mappings
- **Call Stack View**: Navigate through the call stack during debugging
- **Variables Panel**: Inspect variables at different scopes with expandable children
- **Watch Panel**: Evaluate and monitor custom expressions while debugging
- **Dark/Light Theme**: Toggle between dark and light editor themes via settings
- **Debug Adapter Management**: Built-in manager to install/uninstall DAP adapters
- **Lazy File Loading**: File tree loads directories on-demand with recursive expansion
- **Workspace Integration**: Open workspace directly in your preferred external editor
- **Collapsible Layout**: Collapse the editor panel to focus on file explorer and debug tools
- **Keyboard Shortcuts**: Standard debug shortcuts (F5, F10, F11, Shift+F5, Shift+F11)

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
│   │   ├── Panels/       # Side panels (stack, variables, watch, breakpoints, settings, adapters)
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

4. **Click Debug** (or press **F5**) to start debugging

5. **Set breakpoints** by clicking in the gutter area

6. **Toggle Theme** between dark and light via the Settings panel

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **F5** | Start Debugging / Continue |
| **Shift + F5** | Stop Debugging |
| **F10** | Step Over |
| **F11** | Step Into |
| **Shift + F11** | Step Out |

## Panels

### Variables
Inspect local and global variables at the current stack frame. Expand arrays and objects to view their children.

### Watch
Add custom expressions (e.g., `$myVariable`, `$_SERVER['REQUEST_URI']`) to monitor their values as you step through code. Watches are re-evaluated automatically on every stop.

### Call Stack
Navigate between stack frames to inspect variables at different levels of execution.

### Breakpoints
View and manage all breakpoints set across the workspace.

### Adapters
Install, uninstall, and manage DAP adapters for different languages.

## External Editor Integration

Configure your preferred editor in the **Settings** panel:
- **VS Code** (default): `code`
- **Cursor**, **Zed**, **Sublime Text**, **Vim**, **Neovim**
- **Custom command** with argument templates (`{file}`, `{line}`)

Use **"Open Workspace in Editor"** to open the current workspace root directly.

## Collapsible Layout

Click the **→** arrow in the editor header to collapse the editor panel. This gives the file explorer and debug panels more room. When collapsed:
- The file explorer and sidebar share the available space
- You can still resize the split between them
- Click any file in the explorer to auto-expand the editor
- Use the **←** button on the far right to restore the editor

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
- **Spawn node ENOENT on Windows**: The app now uses `process.execPath` with `ELECTRON_RUN_AS_NODE` to reliably spawn adapters in packaged builds

## License

MIT
