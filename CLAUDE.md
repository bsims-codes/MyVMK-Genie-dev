# Claude Code Instructions

This file contains instructions for Claude Code when working on this project.

## Extension Packaging

When the user asks to "create a package", "build the extension", or similar:

1. **Increment the version number** in `apps/extension/public/manifest.json`
   - Use semantic versioning (e.g., 1.1.3 → 1.1.4 for minor changes)
   - Major version bumps for breaking changes or significant features

2. **Update BOTH changelog locations** (keep them in sync!):
   - `apps/extension/CHANGELOG.md` - User-facing changelog file
   - `apps/extension/public/content.js` - In-app CHANGELOG array (search for `const CHANGELOG = [`)
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

## Version Management

**IMPORTANT:** The version is displayed in the Settings menu and is read dynamically from `manifest.json` using `chrome.runtime.getManifest().version`.

When releasing a new version, update these locations:
| Location | What to Update |
|----------|----------------|
| `manifest.json` | `"version": "X.Y.Z"` |
| `CHANGELOG.md` | Add new section at top |
| `content.js` CHANGELOG array | Add new entry at top of array |

The Settings menu version will automatically match `manifest.json`. The in-app changelog (accessible from Settings) reads from the CHANGELOG array in content.js.

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

## Build System

### DEV_MODE Flag
The `DEV_MODE` constant at the top of `content.js` controls which features are included:

| Build | DEV_MODE | Features |
|-------|----------|----------|
| Dev (`npm run dev`) | `true` | All features including testing effects (shake, flip, explode), internal features (Find Game, Room Audio, Queue) |
| Release (`npm run build`) | `false` | Production features only - testing/internal features excluded |

**How it works:**
- Source code has `const DEV_MODE = true`
- Build script replaces with `const DEV_MODE = false` for release builds
- Code wrapped in `if (DEV_MODE) { ... }` is excluded from production

**Adding new dev-only features:**
```javascript
if (DEV_MODE) {
  // This code only runs in dev builds
  grid.appendChild(createOverlayToggle('🧪', 'Test Feature', ...))
}
```

### Release Build Features
- **DEV_MODE disabled** - Testing/internal features excluded
- **Console logs stripped** - `drop: ['console']` in esbuild removes all console.log/warn/error
- **Minification** - Code is minified for smaller bundle size

### Build Commands
| Command | Output | Description |
|---------|--------|-------------|
| `npm run dev` | `dist/extension-dev` | DEV_MODE=true, unminified, logs included |
| `npm run build` | `dist/extension-release` | DEV_MODE=false, minified, logs stripped |
| `npm run package` | `dist/myvmk-genie-extension.zip` | Release zip for Chrome Web Store |

## Pre-Release Checklist

Before creating a release package:

1. [ ] Update version in `manifest.json`
2. [ ] Update `CHANGELOG.md` with release notes
3. [ ] Test all features in dev build (`npm run dev`)
4. [ ] Verify no sensitive data in code (API keys, etc.)
5. [ ] Run release build (`npm run build`)
6. [ ] Verify output shows "DEV_MODE=false" for content.js
7. [ ] Test release build - confirm dev features (shake, flip, etc.) are NOT visible
8. [ ] Run `npm run package` to create zip

## Performance Considerations

### Running Intervals
| Interval | Frequency | Purpose |
|----------|-----------|---------|
| `fetchGenieEvents` | 5 minutes | Fetch events from server |
| `checkGenieEvents` | 30 seconds | Check if event should start/stop |
| `updateAudioDisplay` | 2 seconds | Update audio panel text |

### Overlay Effects
- Rain, snow, fireworks, spotlights use `requestAnimationFrame` - only run when enabled
- Effects are properly cleaned up with `cancelAnimationFrame` when stopped

### Tesseract.js (OCR)
- Bundled but lazy-loaded - only initializes when OCR is needed
- Canvas2D warnings about `getImageData` come from Tesseract, not our overlays

## Permissions

### Current Host Permissions (2.0.1+)
```json
"host_permissions": [
  "https://www.myvmk.com/*",
  "https://myvmk.com/*"
]
```

### Why We Don't Use `<all_urls>`
- Triggers longer Chrome Web Store review
- Screenshot button required it, but Alt+S shortcut works with just `activeTab`
- Record button uses `getDisplayMedia` which only needs `tabCapture` permission

## Version History Notes

### 2.0.1 Changes
- **DEV_MODE build system** - Single flag controls dev vs production features
- Removed `<all_urls>`, narrowed to MyVMK domains only
- Screenshot button → Alt+S helper text
- Console logs stripped from release builds
- Event check interval: 10s → 30s
- Audio display update: 500ms → 2s
- Butterflies flip to face movement direction
- Testing effects (shake, flip, explode) - DEV_MODE only

### 2.0.0 - Official Public Release
- First public Chrome Web Store release
- Happily Ever After choreographed show
- Genie Events system with admin panel
- All core features: phrases, screenshots, overlays, ambient effects
