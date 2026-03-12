# MyVMK Genie - Project Documentation

A modern companion app for [MyVMK.com](https://myvmk.com), inspired by the original [myVMKPal](https://github.com/anthonyjr2/myVMKPal) desktop application.

## Architecture Overview

This project has **two main components**:

### 1. Web Dashboard (`apps/web`)
- **Framework**: Next.js 16 + React 19
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Purpose**: Management interface for configuring settings, viewing data

### 2. Browser Extension (`apps/extension`)
- **Type**: Chrome Extension (Manifest V3)
- **Purpose**: Companion that injects into myvmk.com for real-time features

```
myvmkpal-new/
├── apps/
│   ├── web/                  # Next.js dashboard
│   │   └── src/
│   │       ├── app/          # Pages and routes
│   │       ├── lib/supabase/ # Supabase client setup
│   │       └── middleware.ts # Auth middleware
│   │
│   └── extension/            # Chrome extension
│       └── public/
│           ├── manifest.json # Extension config
│           ├── background.js # Service worker
│           ├── content.js    # Injected into myvmk.com
│           └── popup.html    # Extension popup UI
│
├── supabase-schema.sql       # Database schema
└── PROJECT.md                # This file
```

---

## Features

### Implemented in Web Dashboard

| Feature | Route | Description |
|---------|-------|-------------|
| Auth | `/login`, `/register` | Email/password authentication via Supabase |
| Dashboard | `/dashboard` | Main hub with feature grid |
| Quick Phrases | `/phrases` | Configure 10 hotkey-triggered messages |
| Game Accounts | `/accounts` | Store MyVMK credentials (encrypted) |
| Screenshots | `/photos` | Upload and view game screenshots |
| Room Audio | `/audio` | Set custom music per game room |
| Events Calendar | `/calendar` | Community events with RSVP |
| LFG | `/lfg` | Real-time lobby system for finding players |

### Implemented in Browser Extension

| Feature | Hotkey/Button | Description |
|---------|---------------|-------------|
| Quick Phrases | Alt+1 to Alt+0 | Auto-type saved phrases to game chat |
| Screenshot | 📸 button | Capture game and save to Downloads |
| Recording | 🎥 button | Record gameplay video (WebM) |
| Game Accounts | Panel | Store & quick-copy passwords |
| Room Audio | Panel | Play custom background music |
| Events | Panel | Link to events calendar |
| LFG | Panel | Link to Looking for Game |
| Floating Toolbar | 🎮 button | Expandable panel with all features |

---

## Database Schema

Run `supabase-schema.sql` in Supabase SQL Editor to create:

| Table | Purpose |
|-------|---------|
| `profiles` | Extended user data (display name, avatar) |
| `game_accounts` | MyVMK login credentials (encrypted) |
| `phrases` | 10 quick phrase slots per user |
| `screenshots` | Screenshot metadata (storage paths) |
| `room_audio` | Custom audio URL per room |
| `events` | Community calendar events |
| `event_rsvps` | Event attendance tracking |
| `lfg_lobbies` | Looking for Game lobbies |
| `lfg_participants` | Lobby membership |

**RLS (Row Level Security)** is enabled on all tables. Users can only access their own data (except public events/lobbies).

**Triggers**:
- `on_auth_user_created`: Auto-creates profile and default phrases on signup

**Realtime**: Enabled for `lfg_lobbies` and `lfg_participants` for live updates.

---

## Supabase Setup Checklist

- [x] Create Supabase project
- [x] Add environment variables to `.env.local`
- [ ] Run `supabase-schema.sql` in SQL Editor
- [ ] Create `screenshots` storage bucket
- [ ] Set storage bucket to public (or configure policies)
- [ ] Enable Realtime for LFG tables

---

## Extension Setup

1. Build the extension (or use `public/` directly for development)
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `apps/extension/public/`
5. The extension will auto-activate on myvmk.com

### Extension Commands (Hotkeys)
Configure in `chrome://extensions/shortcuts`:
- Alt+1 through Alt+0: Phrases
- Alt+S: Screenshot

---

## How Components Connect

```
┌─────────────────────────────────────────────────────────────┐
│                        User                                  │
└─────────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Web Dashboard     │         │  Browser Extension  │
│   (localhost:3000)  │         │   (on myvmk.com)    │
│                     │         │                     │
│  - Configure phrases│         │  - Trigger phrases  │
│  - View screenshots │         │  - Take screenshots │
│  - Manage accounts  │         │  - Room detection   │
│  - Events & LFG     │         │  - Play room audio  │
└─────────────────────┘         └─────────────────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼
            ┌─────────────────────────────┐
            │         Supabase            │
            │  - Auth (sessions)          │
            │  - Database (settings)      │
            │  - Storage (screenshots)    │
            │  - Realtime (LFG)           │
            └─────────────────────────────┘
```

---

## Original App Reference

The original [myVMKPal](https://github.com/anthonyjr2/myVMKPal) was a .NET desktop app with:
- `HotKeys.cs` - Keyboard shortcuts → We use Chrome's `commands` API
- `Screenshot.cs` - Screen capture → We use `chrome.tabs.captureVisibleTab`
- `RoomDetect.cs` - Room monitoring → We parse the page DOM
- `Phrases.cs` - Quick messages → Stored in Supabase, sent via content script
- `Photos.cs` - Photo management → Supabase Storage + database
- `Pirates.cs` - Pirates game stats → TODO
- `Accounts/Users.cs` - Multi-account → Supabase auth + game_accounts table

---

## TODO / Roadmap

### Phase 1 - Core Features (Current)
- [x] Web dashboard with all feature pages
- [x] Browser extension structure
- [ ] Test Supabase integration end-to-end
- [ ] Extension popup UI for login/status
- [ ] Refine chat injection for actual MyVMK page structure

### Phase 2 - Polish
- [ ] Extension icons (16px, 48px, 128px)
- [ ] Better error handling
- [ ] Offline support (cache phrases locally)
- [ ] Settings sync between dashboard and extension

### Phase 3 - Advanced Features
- [ ] Pirates game stat tracking
- [ ] Room visit history
- [ ] Friend list integration
- [ ] Trading log

---

## Development Commands

```bash
# Start web dashboard
cd apps/web
pnpm dev

# Load extension in Chrome
# chrome://extensions → Load unpacked → select apps/extension/public
```

---

## Environment Variables

Required in `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Extension uses the same Supabase credentials (hardcoded in `background.js` for now - should be configurable).
