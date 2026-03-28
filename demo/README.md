# GlideChart Developer Demo

A self-contained HTML page for visually verifying the GlideChart rendering engine.

## How to Run

1. **Build the library** (from project root):

   ```bash
   pnpm build
   ```

   Or use watch mode for continuous rebuilds while developing:

   ```bash
   pnpm dev
   ```

2. **Serve the project root** using any static HTTP server:

   ```bash
   # Option A: npx serve
   npx serve .

   # Option B: Python
   python -m http.server 8080

   # Option C: VS Code Live Server extension
   # Right-click demo/index.html -> "Open with Live Server"
   ```

3. **Open in browser**:

   ```
   http://localhost:3000/demo/index.html
   ```

   (Adjust port based on your server.)

## Important Notes

- **Must be served over HTTP** — opening `demo/index.html` directly via `file://` will not work because browsers block ES module imports over the file protocol.
- **This is a dev tool** — it is not published to npm or shipped to consumers. The `files` field in `package.json` only includes `dist/`.
- **No build step needed for the demo itself** — it imports directly from the pre-built ESM output at `../dist/index.js`.

## What It Demonstrates

- Static chart rendering with smooth monotone cubic curves and gradient fills
- Real-time streaming simulation via `addData()`
- Dark/light theme switching via `setConfig()`
- Multi-series rendering (price + volume)
- Data lifecycle: `clearData()`, `setData()`, `destroy()`, recreate
- Responsive resizing
