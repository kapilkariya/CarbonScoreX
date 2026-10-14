CREATE TABLE IF NOT EXISTS company_recommendations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_key VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  rationale TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','accepted','dismissed','completed','superseded')),
  generation_source VARCHAR(20) NOT NULL CHECK (generation_source IN ('ai','rules')),
  first_suggested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_suggested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, recommendation_key)
);
CREATE INDEX IF NOT EXISTS idx_company_recommendations_current ON company_recommendations(company_id, status);

CREATE TABLE IF NOT EXISTS company_recommendation_events (
  id BIGSERIAL PRIMARY KEY,
  recommendation_id INTEGER NOT NULL REFERENCES company_recommendations(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('suggested','evidence_updated','reappeared','accepted','dismissed','completed','superseded')),
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  evidence_fingerprint CHAR(64) NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_recommendation_events_rec ON company_recommendation_events(recommendation_id, occurred_at DESC);
