-- Laws and Articles tables for Supabase
-- Run this AFTER the main setup SQL

DO $$
DECLARE r RECORD;
BEGIN
  -- Laws table
  CREATE TABLE IF NOT EXISTS public.laws (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    section TEXT NOT NULL,
    section_label TEXT,
    law_number TEXT,
    law_year TEXT,
    source_url TEXT,
    article_count INTEGER DEFAULT 0,
    content_preview TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Law articles table
  CREATE TABLE IF NOT EXISTS public.law_articles (
    id BIGSERIAL PRIMARY KEY,
    law_slug TEXT NOT NULL,
    article_number TEXT NOT NULL,
    article_text TEXT NOT NULL,
    section TEXT,
    normalized_text TEXT,
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Contracts table
  CREATE TABLE IF NOT EXISTS public.contracts (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    content_preview TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Posts table
  CREATE TABLE IF NOT EXISTS public.posts (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content_preview TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_laws_section ON public.laws(section);
  CREATE INDEX IF NOT EXISTS idx_laws_slug ON public.laws(slug);
  CREATE INDEX IF NOT EXISTS idx_articles_law ON public.law_articles(law_slug);
  CREATE INDEX IF NOT EXISTS idx_articles_number ON public.law_articles(article_number);
  CREATE INDEX IF NOT EXISTS idx_articles_section ON public.law_articles(section);
  CREATE INDEX IF NOT EXISTS idx_articles_text_search ON public.law_articles USING gin(search_vector);
  CREATE INDEX IF NOT EXISTS idx_contracts_category ON public.contracts(category);
  CREATE INDEX IF NOT EXISTS idx_contracts_slug ON public.contracts(slug);

  -- RLS
  ALTER TABLE public.laws ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.law_articles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

  -- Policies
  CREATE POLICY "laws_select" ON public.laws FOR SELECT USING (true);
  CREATE POLICY "laws_ins" ON public.laws FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  CREATE POLICY "laws_upd" ON public.laws FOR UPDATE USING (auth.role() = 'authenticated');
  CREATE POLICY "laws_del" ON public.laws FOR DELETE USING (auth.role() = 'authenticated');

  CREATE POLICY "articles_select" ON public.law_articles FOR SELECT USING (true);
  CREATE POLICY "articles_ins" ON public.law_articles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  CREATE POLICY "articles_upd" ON public.law_articles FOR UPDATE USING (auth.role() = 'authenticated');
  CREATE POLICY "articles_del" ON public.law_articles FOR DELETE USING (auth.role() = 'authenticated');

  CREATE POLICY "contracts_select" ON public.contracts FOR SELECT USING (true);
  CREATE POLICY "contracts_ins" ON public.contracts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

  CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);
  CREATE POLICY "posts_ins" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

  -- Permissions
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.laws TO authenticated;
  GRANT SELECT ON public.laws TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.law_articles TO authenticated;
  GRANT SELECT ON public.law_articles TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
  GRANT SELECT ON public.contracts TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
  GRANT SELECT ON public.posts TO anon;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

  RAISE NOTICE 'Laws tables created successfully!';
END $$;
