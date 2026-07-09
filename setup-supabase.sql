-- المستشار اليمني القانوني — All-in-One Setup
-- Copy ALL of this and paste in Supabase SQL Editor, then click Run

BEGIN;

-- 1. CREATE TABLES
CREATE TABLE IF NOT EXISTS public.admin_users (
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

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  query TEXT,
  law_title TEXT,
  law_number TEXT,
  law_year TEXT,
  article_number TEXT,
  article_text TEXT,
  section TEXT,
  source TEXT,
  workflow TEXT DEFAULT 'draft',
  status TEXT DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS public.site_analytics (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  page TEXT,
  user_agent TEXT,
  screen TEXT,
  device TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  user_name TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.advisor_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.uploaded_files (
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

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_analytics_type ON public.site_analytics(type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.site_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON public.knowledge_base(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_workflow ON public.knowledge_base(workflow);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log(user_name);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at);

-- 3. ENABLE RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- 4. DROP OLD POLICIES
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 5. CREATE POLICIES
CREATE POLICY "p_admin_sel" ON public.admin_users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "p_admin_ins" ON public.admin_users FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "p_admin_upd" ON public.admin_users FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "p_know_sel" ON public.knowledge_base FOR SELECT USING (true);
CREATE POLICY "p_know_ins" ON public.knowledge_base FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "p_know_upd" ON public.knowledge_base FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "p_know_del" ON public.knowledge_base FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "p_analytics_sel" ON public.site_analytics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "p_analytics_ins" ON public.site_analytics FOR INSERT WITH CHECK (true);

CREATE POLICY "p_audit_sel" ON public.audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "p_audit_ins" ON public.audit_log FOR INSERT WITH CHECK (true);

CREATE POLICY "p_settings_sel" ON public.advisor_settings FOR SELECT USING (true);
CREATE POLICY "p_settings_ins" ON public.advisor_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "p_settings_upd" ON public.advisor_settings FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "p_files_sel" ON public.uploaded_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "p_files_ins" ON public.uploaded_files FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 6. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;
GRANT SELECT ON public.admin_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;
GRANT SELECT ON public.knowledge_base TO anon;
GRANT SELECT, INSERT ON public.site_analytics TO authenticated;
GRANT INSERT ON public.site_analytics TO anon;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT INSERT ON public.audit_log TO anon;
GRANT SELECT, INSERT, UPDATE ON public.advisor_settings TO authenticated;
GRANT SELECT ON public.advisor_settings TO anon;
GRANT SELECT, INSERT ON public.uploaded_files TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 7. SEED DATA
INSERT INTO public.admin_users (user_id, username, name, role, permissions, active)
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

INSERT INTO public.advisor_settings (key, value) VALUES (
  'main',
  '{"advisorName":"المستشار اليمني القانوني","advisorPersonality":"مستشار قانوني يمني خبير","responseStyle":"detailed","legalConservatism":"high","detailLevel":"high","showConfidence":true,"showSources":true}'::jsonb
) ON CONFLICT (key) DO NOTHING;

COMMIT;
