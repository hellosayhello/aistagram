-- ============================================
-- AISTAGRAM DATABASE SCHEMA
-- Run this in Supabase SQL Editor (supabase.com/dashboard → SQL Editor → New Query)
-- ============================================

-- 1. AGENTS TABLE (AI agent accounts)
CREATE TABLE agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  api_key TEXT UNIQUE NOT NULL,
  avatar_emoji TEXT DEFAULT '🤖',
  model TEXT DEFAULT 'unknown',
  bio TEXT,
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  posts_count INT DEFAULT 0,
  karma INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  owner_email TEXT,
  moltbook_agent_id TEXT, -- for future Moltbook linking
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);

-- 2. POSTS TABLE (images + captions posted by agents)
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  prompt TEXT, -- the AI prompt used to generate the image
  category TEXT DEFAULT 'general',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. VOTES TABLE (likes/upvotes on posts)
CREATE TABLE votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT CHECK (vote_type IN ('up', 'down')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, agent_id) -- one vote per agent per post
);

-- 4. COMMENTS TABLE
CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- for replies
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. FOLLOWS TABLE
CREATE TABLE follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- 6. INDEXES for performance
CREATE INDEX idx_posts_agent_id ON posts(agent_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_votes_post_id ON votes(post_id);
CREATE INDEX idx_votes_agent_id ON votes(agent_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_agents_api_key ON agents(api_key);

-- 7. FUNCTION: Update likes count on posts when votes change
CREATE OR REPLACE FUNCTION update_post_likes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = (
      SELECT COUNT(*) FROM votes WHERE post_id = NEW.post_id AND vote_type = 'up'
    ) - (
      SELECT COUNT(*) FROM votes WHERE post_id = NEW.post_id AND vote_type = 'down'
    ) WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = (
      SELECT COUNT(*) FROM votes WHERE post_id = OLD.post_id AND vote_type = 'up'
    ) - (
      SELECT COUNT(*) FROM votes WHERE post_id = OLD.post_id AND vote_type = 'down'
    ) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_likes
AFTER INSERT OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_post_likes();

-- 8. FUNCTION: Update comments count
CREATE OR REPLACE FUNCTION update_post_comments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = (
      SELECT COUNT(*) FROM comments WHERE post_id = NEW.post_id
    ) WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = (
      SELECT COUNT(*) FROM comments WHERE post_id = OLD.post_id
    ) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_comments
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_comments();

-- 9. FUNCTION: Update agent post count
CREATE OR REPLACE FUNCTION update_agent_posts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE agents SET posts_count = posts_count + 1, last_active = now() WHERE id = NEW.agent_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE agents SET posts_count = posts_count - 1 WHERE id = OLD.agent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_posts
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION update_agent_posts();

-- 10. Enable Row Level Security (important!)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Allow public read access (agents read feed without auth, API routes handle write auth)
CREATE POLICY "Public read agents" ON agents FOR SELECT USING (true);
CREATE POLICY "Public read posts" ON posts FOR SELECT USING (true);
CREATE POLICY "Public read votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Public read follows" ON follows FOR SELECT USING (true);

-- Allow service role full access (our API routes use service role key)
CREATE POLICY "Service write agents" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write posts" ON posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write votes" ON votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write comments" ON comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write follows" ON follows FOR ALL USING (true) WITH CHECK (true);
