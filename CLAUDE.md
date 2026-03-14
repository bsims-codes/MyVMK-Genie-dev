# Claude Code Instructions

This file contains instructions for Claude Code when working on this project.

## Extension Packaging

When the user asks to "create a package", "build the extension", or similar:

1. **Increment the version number** in `apps/extension/public/manifest.json`
   - Use semantic versioning (e.g., 1.1.3 → 1.1.4 for minor changes)
   - Major version bumps for breaking changes or significant features

2. **Add a changelog entry** in `apps/extension/public/content.js`
   - Find the `CHANGELOG` array near line 3874
   - Add a new entry at the TOP of the array with:
     - `version`: matching the manifest version
     - `date`: current date in YYYY-MM-DD format
     - `changes`: array of bullet points describing what changed

3. **Update build.js if new assets were added**
   - If any new images/files were added to `public/`, add them to the `staticFiles` array in `apps/extension/scripts/build.js`
   - Also add them to `web_accessible_resources` in `manifest.json` if they need to be accessed from content scripts

4. **Run the package command**:
   ```bash
   cd apps/extension && npm run package
   ```

5. **Output location**: `dist/myvmk-genie-extension.zip`

## Project Structure

- `apps/extension/` - Chrome extension source code
  - `public/` - Extension source files
    - `content.js` - Main content script injected into MyVMK pages
    - `manifest.json` - Extension manifest with version
    - `background.js` - Service worker
  - `scripts/` - Build scripts
    - `build.js` - Builds dev or release versions
    - `package.js` - Creates production zip

## Common Tasks

### Adding new images/assets
1. Add file to `apps/extension/public/`
2. Add to `staticFiles` array in `scripts/build.js`
3. Add to `web_accessible_resources` in `manifest.json`
4. Reference in code using `chrome.runtime.getURL('filename.png')`

### Testing changes locally
```bash
cd apps/extension && npm run dev
```
Then load `dist/extension-dev` as unpacked extension in Chrome.
