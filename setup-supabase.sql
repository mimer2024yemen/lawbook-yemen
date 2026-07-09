-- المستشار اليمني القانوني — Complete Supabase Setup
-- Creates tables + indexes + RLS + policies + permissions + seed data
-- Run this ONCE in Supabase SQL Editor

-- ============================================
-- STEP 1: Create Tables
-- ============================================

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('admin','editor','reviewer','viewer')),
  permissions TEXT[] DEFAULT '{read}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  query TEXT,
  law_title TEXT,
  law_number TEXT,
  law_year TEXT,
  article_number TEXT,
  article_text TEXT,
  section TEXT,
  source TEXT,
  workflow TEXT DEFAULT 'draft' CHECK (workflow IN ('draft','review','approved','published','rejected')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','published','rejected')),
  confidence REAL DEFAULT 0,
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  rejection_reason TEXT,
  use_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_analytics (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  page TEXT,
  user_agent TEXT,
  screen TEXT,
  device TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  user_name TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advisor_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  storage_path TEXT,
  parsed_articles INTEGER DEFAULT 0,
  detected_section TEXT,
  confidence REAL DEFAULT 0,
  uploaded_by TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 2: Create Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_analytics_type ON site_analytics(type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON site_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_base(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_workflow ON knowledge_base(workflow);
CREATE INDEX IF NOT EXISTS idx_knowledge_section ON knowledge_base(section);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_name);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================
-- STEP 3: Enable RLS
-- ============================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Drop old policies (safe)
-- ============================================

DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.schemaname || '.' || r.tablename;
  END LOOP;
END $$;

-- ============================================
-- STEP 5: Create RLS Policies
-- ============================================

-- admin_users
CREATE POLICY "admin_users_select" ON admin_users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_users_insert" ON admin_users FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin_users_update" ON admin_users FOR UPDATE USING (auth.role() = 'authenticated');

-- knowledge_base
CREATE POLICY "knowledge_select" ON knowledge_base FOR SELECT USING (true);
CREATE POLICY "knowledge_insert" ON knowledge_base FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "knowledge_update" ON knowledge_base FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "knowledge_delete" ON knowledge_base FOR DELETE USING (auth.role() = 'authenticated');

-- site_analytics
CREATE POLICY "analytics_select" ON site_analytics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "analytics_insert" ON site_analytics FOR INSERT WITH CHECK (true);

-- audit_log
CREATE POLICY "audit_select" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "audit_insert" ON audit_log FOR INSERT WITH CHECK (true);

-- advisor_settings
CREATE POLICY "settings_select" ON advisor_settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON advisor_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "settings_update" ON advisor_settings FOR UPDATE USING (auth.role() = 'authenticated');

-- uploaded_files
CREATE POLICY "files_select" ON uploaded_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "files_insert" ON uploaded_files FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- STEP 6: Grant Permissions to PostgREST
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users TO authenticated;
GRANT SELECT ON admin_users TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_base TO authenticated;
GRANT SELECT ON knowledge_base TO anon;

GRANT SELECT, INSERT ON site_analytics TO authenticated;
GRANT INSERT ON site_analytics TO anon;

GRANT SELECT, INSERT ON audit_log TO authenticated;
GRANT INSERT ON audit_log TO anon;

GRANT SELECT, INSERT, UPDATE ON advisor_settings TO authenticated;
GRANT SELECT ON advisor_settings TO anon;

GRANT SELECT, INSERT ON uploaded_files TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- STEP 7: Seed Data
-- ============================================

-- Admin user profile (auth user already created)
INSERT INTO admin_users (user_id, username, name, role, permissions, active)
VALUES (
  '52eb0fd5-a478-4e3d-a995-2f29c14742c1',
  'admin',
  'المدير الرئيسي',
  'admin',
  ARRAY['read','write','delete','approve','settings','users','audit'],
  true
) ON CONFLICT (username) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Default settings
INSERT INTO advisor_settings (key, value) VALUES ('main', '{
  "advisorName": "المستشار اليمني القانوني",
  "advisorPersonality": "مستشار قانوني يمني خبير، يجيب بدقة ووضوح، يلتزم بالقانون اليمني النافذ",
  "responseStyle": "detailed",
  "legalConservatism": "high",
  "detailLevel": "high",
  "priorityLaws": ["القانون المدني اليمني", "قانون الأحوال الشخصية", "قانون العقوبات", "قانون العمل"],
  "trustedSources": ["yemenilaw.com", "yemen-nic.info", "moj.gov.ye", "cby.ye"],
  "showConfidence": true,
  "showSources": true
}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- ============================================
-- STEP 8: Refresh PostgREST Schema Cache
-- ============================================

NOTIFY pgrst, 'reload schema';
