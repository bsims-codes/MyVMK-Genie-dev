# MyVMK Genie Changelog

## 2.0.6

### Features
- Test Events: Create events that only you can see and trigger (for testing)
  - Add "Test Event" checkbox in admin panel when creating events
  - Enable "Test Mode" in extension Settings to see/trigger test events
  - Test events are hidden from public calendar and other users

### Improvements
- Custom ticker icon support via admin panel

## 2.0.5

### Improvements
- Removed unnecessary `scripting` permission to reduce "all websites" warning
- Removed room entry notification popup

## 2.0.4

### Features
- Custom ticker icon support - set a custom image URL in admin panel to replace the default Genie lamp

### Improvements
- Ticker separator changed from dash to bullet for visual consistency

## 2.0.3

### Changes
- Removed erroneous testing feature

## 2.0.2

### Improvements
- Ticker now shows all event types (Host, Genie, Community) in one continuous scroll
- Events stay visible in dropdown until they end (not just until they start)
- Live events show "LIVE" badge in events list
- Slowed down ticker scroll speed for better readability
- Version display now reads dynamically from manifest
- Added public event calendar page
- Fireworks fade faster during high-intensity moments to reduce screen coverage
- Late joiners now sync to events in progress (audio and effects start at correct time)

### Bug Fixes
- Fixed Genie events not appearing in ticker scroller
- Fixed effects re-enabling after manually disabling during an event
- Fixed "event in progress" notification showing on every room change

## 2.0.1

### Permissions & Security
- Tightened permissions for faster Chrome Web Store review
- Removed broad host permissions, narrowed to MyVMK domains only
- Screenshot shortcut now Alt+S only (displayed as helper text in UI)

### Performance Optimizations
- Console logs stripped from release builds (cleaner console, less overhead)
- Event check interval reduced from 10s to 30s
- Audio display update reduced from 500ms to 2s

### Bug Fixes
- Butterflies now flip to face their movement direction

## 2.0.0 - Official Public Release
This is the first official public release of MyVMK Genie!

### Features
- **Quick Phrases**: Send common phrases instantly with Alt+key shortcuts
- **Screenshots**: Capture game screenshots with Alt+S, including region select
- **Visual Overlays**: Rain, snow, fireworks, stars, night mode, money rain, emoji rain
- **Ambient Effects**: Tinkerbell in Fantasyland Courtyard, butterflies in Snow White Forest
- **Genie Events**: Community events with synchronized effects, audio, and visual overlays
- **Happily Ever After Show**: Choreographed fireworks and spotlight show synced to audio
- **YouTube Player**: Play background music with draggable, resizable player
- **Commands Reference**: Quick access to all MyVMK chat commands

### Genie Events System
- Remote event scheduling via admin panel
- Support for all overlay effects (fireworks, rain, snow, butterflies, Tinkerbell)
- YouTube audio synchronization
- Pre-event notifications 1 minute before start
- Events trigger automatically when joining rooms mid-event

### Visual Effects
- Choreographed spotlight system with synced left/right groups
- Smooth spotlight fading (dim/bright transitions)
- Fireworks with adjustable intensity
- Multiple butterfly flight patterns in Snow White Forest

## 1.2.0
- Pre-event notification now stays on screen for 8 seconds
- All 3 butterflies now permanent in Snow White Forest (no more fading/respawning)
- Each butterfly has unique flight pattern (gentle floater, drifter, explorer)
- Butterflies reduced to smaller size (18px)
- One butterfly flipped to face left for variety
- Double Credits events now show special gold icon

## 1.1.9
- Added "Event starting shortly" notification 1 minute before scheduled events
- Butterfly effect now displays at 75% size for better visual balance
- Improved butterfly movement with smoother animation and color alternation

## 1.1.8
- Added Genie Events system with remote scheduling via JSONBin
- Added butterfly ambient effect for Snow White Forest
- Events now trigger when joining a room mid-event
- YouTube player starts minimized during events
- Added all overlay effects (fireworks, rain, snow, money, emoji, night) to event scheduling
- Added refresh button in Settings to manually sync events

## 1.1.7
- Updated YouTube player functionality
- Improved room audio mappings

## 1.1.6
- Narrowed host permissions to MyVMK domains only
- Marked Find Game, Room Audio, and Current Room as internal-only features

## 1.1.5
- Initial public release
- Quick phrases with Alt+key shortcuts
- Screenshot capture with Alt+S
- Room overlays (rain, snow, fireworks, etc.)
- Tinkerbell ambient effect for Fantasyland
