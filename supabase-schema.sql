-- MyVMK Genie Database Schema
-- Run this in Supabase SQL Editor

-- Game Accounts (for storing MyVMK login credentials)
CREATE TABLE game_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Quick Phrases
CREATE TABLE phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slot INT CHECK (slot BETWEEN 1 AND 10),
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slot)
);

-- Screenshots
CREATE TABLE screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  filename TEXT,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- Room Audio Settings
CREATE TABLE room_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  volume DECIMAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, room_name)
);

-- Community Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  category TEXT DEFAULT 'general',
  location TEXT,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Event RSVPs
CREATE TABLE event_rsvps (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('going', 'maybe', 'not_going')) DEFAULT 'going',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- LFG (Looking for Game) Lobbies
CREATE TABLE lfg_lobbies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  title TEXT,
  max_players INT DEFAULT 4,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'full', 'in_game', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '2 hours')
);

-- LFG Participants
CREATE TABLE lfg_participants (
  lobby_id UUID REFERENCES lfg_lobbies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (lobby_id, user_id)
);

-- User Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE game_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_audio ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE lfg_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lfg_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- Game Accounts policies
CREATE POLICY "Users can view own game accounts" ON game_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own game accounts" ON game_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own game accounts" ON game_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own game accounts" ON game_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Phrases policies
CREATE POLICY "Users can view own phrases" ON phrases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own phrases" ON phrases
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own phrases" ON phrases
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own phrases" ON phrases
  FOR DELETE USING (auth.uid() = user_id);

-- Screenshots policies
CREATE POLICY "Users can view own screenshots" ON screenshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own screenshots" ON screenshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own screenshots" ON screenshots
  FOR DELETE USING (auth.uid() = user_id);

-- Room Audio policies
CREATE POLICY "Users can view own room audio" ON room_audio
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own room audio" ON room_audio
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own room audio" ON room_audio
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own room audio" ON room_audio
  FOR DELETE USING (auth.uid() = user_id);

-- Events policies (public read for approved, own for all)
CREATE POLICY "Anyone can view approved events" ON events
  FOR SELECT USING (is_approved = true);
CREATE POLICY "Users can view own events" ON events
  FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "Users can create events" ON events
  FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own events" ON events
  FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own events" ON events
  FOR DELETE USING (auth.uid() = creator_id);

-- Event RSVPs policies
CREATE POLICY "Anyone can view RSVPs for approved events" ON event_rsvps
  FOR SELECT USING (EXISTS (SELECT 1 FROM events WHERE events.id = event_id AND is_approved = true));
CREATE POLICY "Users can manage own RSVPs" ON event_rsvps
  FOR ALL USING (auth.uid() = user_id);

-- LFG Lobbies policies (public read for active lobbies)
CREATE POLICY "Anyone can view active lobbies" ON lfg_lobbies
  FOR SELECT USING (status IN ('waiting', 'full'));
CREATE POLICY "Users can create lobbies" ON lfg_lobbies
  FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update own lobbies" ON lfg_lobbies
  FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Hosts can delete own lobbies" ON lfg_lobbies
  FOR DELETE USING (auth.uid() = host_id);

-- LFG Participants policies
CREATE POLICY "Anyone can view participants" ON lfg_participants
  FOR SELECT USING (true);
CREATE POLICY "Users can join lobbies" ON lfg_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave lobbies" ON lfg_participants
  FOR DELETE USING (auth.uid() = user_id);

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'display_name');

  -- Create default phrases for new user
  INSERT INTO public.phrases (user_id, slot, content)
  VALUES
    (new.id, 1, 'Hello!'),
    (new.id, 2, 'Good game!'),
    (new.id, 3, 'Thanks for playing!'),
    (new.id, 4, 'See you later!'),
    (new.id, 5, ''),
    (new.id, 6, ''),
    (new.id, 7, ''),
    (new.id, 8, ''),
    (new.id, 9, ''),
    (new.id, 10, '');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Realtime for LFG tables (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE lfg_lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE lfg_participants;
