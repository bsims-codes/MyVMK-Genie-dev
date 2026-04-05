# MyVMK Genie Changelog

## 2.1.16

### Features
- **Club Neon Guest Room**: Added room mapping for `vmk_big_room` → Club Neon Guest Room (ID 324), now detectable via Kingdom Sync and available in event scheduler

## 2.1.15

### Bug Fixes
- **Africa Room Loading**: Fixed an issue where entering Africa as your first room after launching the game could cause the room to never finish loading. The Africa background music now waits for the game to fully load before starting.

### Performance
- **Room Change Optimization**: Room effect checks are now debounced to avoid redundant processing when multiple detection paths fire simultaneously
- **Show Performance**: Reduced choreography timer frequency for Happily Ever After and Hannah Montana shows (less CPU usage during shows)
- **Background Intervals**: Ambient effect safety-net check reduced from every 5s to 15s; audio display updates now skip when panel is closed

## 2.1.14

### Features
- **Hannah Montana Main Show**: Updated choreography with smoother transitions
  - Star assets now hover and glow with pulsing pink/purple effect
  - Genie icon pulses during Hannah events
  - Smoother helicopter re-entry animation with new plane asset
  - Speaker and projector float freely above the stage
  - Butterflies wander slowly around the screen
  - Updated finale sequence with staggered prop fly-offs
  - Reduced fireworks intensity for cleaner visuals

### Bug Fixes
- **Mute Button**: Now properly mutes game audio and Hannah Main Show audio
- **Room Detection**: Africa audio and Kingdom Sync effects now activate on first visit when room matches saved state
- **Sci-Fi Lanterns**: Fixed broken lantern images after file reorganization
- **Spotlights**: Now properly track game canvas position
- **Film Strips**: Now properly track game canvas position and resize

## 2.1.13

### Features
- **Mute All Audio Button**: One-click mute/unmute for all audio (game + Genie audio)
  - New speaker icon button in panel header
  - Mutes game audio, YouTube player, Africa audio, and event audio
  - State persists across sessions

### Improvements
- **Smarter Night Mode**: Night overlay now disables automatically during minigames
  - Detects game lobbies (Pirates, Castle Fireworks, Jungle Cruise, Haunted Mansion)
  - Night mode stays off until you return to a regular room

## 2.1.12

### Features
- **Sci-Fi Dine-In Lanterns**: Glowing lanterns rise in the Sci-Fi Dine-In room (Kingdom Sync)
  - Lanterns have a warm yellow/orange flickering glow effect
  - Activates automatically when entering the room with Kingdom Sync enabled

## 2.1.11

### Features
- **Africa Room Audio**: Automatically plays Toto's "Africa" when entering Africa rooms (Kingdom Sync)
  - Audio plays seamlessly in the background without any visible player
  - Stops automatically when leaving Africa or disabling Kingdom Sync

## 2.1.10

### Fixes
- Fixed late-join handling for Hannah Montana show - effects now properly sync when joining mid-show
- Reduced event check interval for more responsive event detection

## 2.1.9

### Fixes
- Fixed Hannah Montana Main Show not triggering from scheduled events

## 2.1.8

### Features
- **Hannah Montana Main Show**: Full choreographed event with synchronized audio, GIF sequences, and visual effects
- Hannah theme now unlocks during the show for attendees to keep permanently

### Improvements
- Removed beta testing restrictions from Hannah Montana show
- Optimized show ending with fly-off animations for all assets

## 2.1.7

### Features
- Hannah Montana event updates

## 2.1.5

### Fixes
- **Timezone Display**: Event times now display in user's local timezone instead of always showing Eastern Time

## 2.1.4

### Performance
- Removed ~200 lines of unused code (commented queue monitoring system)
- Fixed ticker interval memory leak
- Added canvas factory helper for more efficient overlay creation
- Optimized room ID lookups with Set data structure

## 2.1.3

### Features
- **Kingdom Sync**: Enhanced ambient experience with room-specific effects
  - Fireflies in Frontierland areas (Dock, Hub, Steamboat)
  - Fireflies + fog in Adventureland (Pirate Treehouse, Explorer's Tent)
  - Subtle night overlay during evening hours (8PM-6AM Eastern)
- **Castle Gardens Overlay**: Castle image overlay in Castle Gardens room - fireworks appear behind the castle
- **Map Detection**: Overlays automatically hide when opening the in-game map and restore when entering a room
- **Hannah Montana Theme**: New unlockable theme - attend the Hannah Montana party to unlock!

### Improvements
- Enhanced fireworks with multiple explosion types (starburst, willow, peony, ring, crackle)
- Fireworks now have better color gradients and trailing effects
- Fireworks in Castle Gardens launch from behind the castle overlay
- Matterhorn snow now fades in/out smoothly instead of appearing/disappearing abruptly
- Night overlay now appears over the castle overlay for proper layering
- Kingdom Sync toggle redesigned as clickable banner image
- Theme selector icons now display full images without cropping
- Smaller, more subtle fireflies

### Bug Fixes
- Fixed admin panel timezone parsing for event scheduling (now correctly handles Eastern Time with DST)
- Fixed room-specific effects persisting when navigating away

## 2.1.2

### Features
- **Room Collectibles**: Hidden clickable items in rooms that unlock themes when found!
- Admin panel: New "Collectibles" tab to configure room-based theme unlocks
- Audio player now supports WatchParty.me room URLs (opens in popup window)
- Audio player now supports direct MP3/audio file URLs with visual player controls
- Visual audio player includes play/pause, seek bar, volume control, and loop toggle

### Bug Fixes
- Fixed Matterhorn snow not auto-disabling when leaving the room
- Fixed room detection not triggering ambient effects (snow, etc.) properly
- Fixed potential idle crashes by pausing effects when tab is hidden

### Improvements
- Redesigned theme selector with visual icons instead of toggle switches
- Collectibles now float within game canvas (not entire window) with gentle Tinkerbell-style movement
- Added backup room detection via fetch/XHR interception for more reliable detection
- Added room detection for JSON config files (fixes rooms like Fantasyland in the Sky)
- Room detection now works for both audio files and JSON config patterns

## 2.1.1

### Features
- **Theme Unlocks**: Attend Genie Events to unlock exclusive themes!
- Added Dark Theme (Jafar) - unlockable by collecting hidden item
- Admin panel: New "Theme Unlock" dropdown when creating events

### Bug Fixes
- Fixed Prize Tracker minimize button not collapsing panel properly
- Fixed Prize Tracker restore showing cut-off content after minimizing

## 2.1.0

### Features
- Firefox extension now available
- Added Pirate Treasure Room audio detection (Room Audio panel now recognizes PTR)
- Prize Tracker panel with embedded compact view
- Bidirectional sync between extension Prize Tracker and main website

### Improvements
- Save button in Prize Tracker panel header for manual sync
- Sync button on main Prize Tracker site when extension is installed
- Sync instructions displayed in both embed and main site views

## 2.0.8

### Features
- Snow overlay auto-enables when entering Matterhorn (user can disable, preference respected)
- Bee banner notifications for all event types (Genie, Community, Host) at 1 hour and 1 minute before start

### Bug Fixes
- Fixed ICS events (like Double Credits) disappearing when they start instead of when they end
- Fixed room-specific effects (Tinkerbell, butterflies, Beadie ghost) sometimes following user to other rooms

### Changes
- Increased max event duration to 24 hours in admin panel

## 2.0.7

### Changes
- Added minimize button to panel header
- Added close button (X) to screenshot popup
- Screenshot shortcut changed from Alt+S to Ctrl+Shift+S (avoids VMK magnifier conflict)

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
