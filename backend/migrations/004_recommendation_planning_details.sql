ALTER TABLE company_recommendations
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  ADD COLUMN IF NOT EXISTS kpi TEXT NOT NULL DEFAULT 'Track the relevant submitted metric against a documented baseline.',
  ADD COLUMN IF NOT EXISTS suggested_timeframe VARCHAR(20) NOT NULL DEFAULT '0-3 months' CHECK (suggested_timeframe IN ('0-3 months', '3-12 months', '12-24 months', 'Ongoing'));
