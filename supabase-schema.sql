-- المستشار اليمني القانوني — Supabase Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- 1. Users Table
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

-- 2. Knowledge Base Table
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

-- 3. Analytics Table
CREATE TABLE IF NOT EXISTS site_analytics (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  page TEXT,
  user_agent TEXT,
  screen TEXT,
  device TEXT,
  ip_address INET,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  user_name TEXT,
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Settings Table
CREATE TABLE IF NOT EXISTS advisor_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Uploaded Files Table
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_type ON site_analytics(type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON site_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON site_analytics((created_at::date));
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_base(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_workflow ON knowledge_base(workflow);
CREATE INDEX IF NOT EXISTS idx_knowledge_section ON knowledge_base(section);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_name);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Full-text search index on knowledge base
CREATE INDEX IF NOT EXISTS idx_knowledge_text_search ON knowledge_base 
  USING gin(to_tsvector('arabic', coalesce(article_text,'') || ' ' || coalesce(law_title,'')));

-- Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- Policies: Allow authenticated users to read, admins to write
CREATE POLICY "Allow authenticated read" ON admin_users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admin write" ON admin_users FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Allow authenticated read" ON knowledge_base FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert" ON knowledge_base FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow admin update" ON knowledge_base FOR UPDATE USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role IN ('admin','editor','reviewer'))
);

CREATE POLICY "Allow authenticated read" ON site_analytics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow public insert" ON site_analytics FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated read" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert" ON audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read" ON advisor_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow admin write" ON advisor_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Allow authenticated read" ON uploaded_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert" ON uploaded_files FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Insert default admin user (will be linked to auth user on first login)
-- The actual user_id will be set when the admin first signs in

-- Insert default settings
INSERT INTO advisor_settings (key, value) VALUES ('main', '{
  "advisorName": "المستشار اليمني القانوني",
  "advisorPersonality": "مستشار قانوني يمني خبير، يجيب بدقة ووضوح",
  "responseStyle": "detailed",
  "legalConservatism": "high",
  "detailLevel": "high",
  "priorityLaws": ["القانون المدني اليمني", "قانون الأحوال الشخصية", "قانون العقوبات", "قانون العمل"],
  "trustedSources": ["yemenilaw.com", "yemen-nic.info", "moj.gov.ye"],
  "showConfidence": true,
  "showSources": true
}'::jsonb) ON CONFLICT (key) DO NOTHING;
