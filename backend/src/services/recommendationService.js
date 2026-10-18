const { query } = require('../config/database');
const { buildCandidates, reconcile } = require('./recommendationEngine');
const { createRecommendationModel } = require('./recommendationModel');

const CATEGORY_KEYS = {
  'Improve waste prevention and recovery': 'waste_circularity',
  'Investigate process water reduction': 'water_efficiency',
  'Reduce grid electricity dependence': 'renewable_electricity',
  'Target high-use equipment for efficiency': 'energy_efficiency'
};

function createRecommendationService({ db = { query }, model = createRecommendationModel(), logger = console } = {}) {
  async function getRecommendations(companyId, companyData, { forceRefresh = false } = {}) {
    const prediction = await model.predict(companyData);
    const allCandidates = buildCandidates(companyData);
    const selectedKeys = new Set(prediction.labels.map((label) => CATEGORY_KEYS[label]).filter(Boolean));
    const candidates = allCandidates
      // Scope completeness is deterministic and remains active regardless of
      // classifier output; only the four trained action categories are gated.
      .filter((item) => !Object.values(CATEGORY_KEYS).includes(item.key)
        || prediction.status !== 'predicted' || selectedKeys.has(item.key))
      .map((item) => {
        const label = prediction.labels.find((value) => CATEGORY_KEYS[value] === item.key);
        return label ? {
          ...item,
          evidence: {
            ...item.evidence,
            recommendation_model: { version: prediction.modelVersion, label }
          }
        } : item;
      });
    const existingResult = await db.query('SELECT * FROM company_recommendations WHERE company_id = $1', [companyId]);
    const existing = existingResult.rows;
    const { current, removed } = reconcile(existing, candidates);
    const changed = current.filter((item) => item.changed || (forceRefresh && ['active', 'accepted'].includes(item.status)));
    for (const old of removed) {
      await db.query("UPDATE company_recommendations SET status = 'superseded', updated_at = NOW() WHERE id = $1", [old.id]);
      await db.query("INSERT INTO company_recommendation_events (recommendation_id,event_type,previous_status,new_status,evidence_fingerprint) VALUES ($1,'superseded',$2,'superseded',$3)", [old.id, old.status, old.evidence_fingerprint]);
    }
    for (const item of current) {
      const title = item.title;
      const rationale = item.rationale;
      const action = item.action;
      const priority = item.priority;
      const kpi = item.kpi;
      const timeframe = item.timeframe;
      const generationSource = 'rules';
      const refreshExisting = forceRefresh && ['active', 'accepted'].includes(item.status);
      const saved = await db.query(
        `INSERT INTO company_recommendations
          (company_id, recommendation_key, title, rationale, action, priority, kpi, suggested_timeframe, evidence, evidence_fingerprint, status, generation_source, first_suggested_at, last_suggested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW(),NOW())
         ON CONFLICT (company_id, recommendation_key) DO UPDATE SET
          title = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.title ELSE company_recommendations.title END,
          rationale = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.rationale ELSE company_recommendations.rationale END,
          action = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.action ELSE company_recommendations.action END,
          priority = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.priority ELSE company_recommendations.priority END,
          kpi = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.kpi ELSE company_recommendations.kpi END,
          suggested_timeframe = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.suggested_timeframe ELSE company_recommendations.suggested_timeframe END,
          evidence = EXCLUDED.evidence, evidence_fingerprint = EXCLUDED.evidence_fingerprint,
          status = EXCLUDED.status, generation_source = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.status = 'superseded' OR company_recommendations.generation_source = 'ai' THEN EXCLUDED.generation_source ELSE company_recommendations.generation_source END,
          last_suggested_at = CASE WHEN $13 OR EXCLUDED.evidence_fingerprint <> company_recommendations.evidence_fingerprint OR company_recommendations.generation_source = 'ai' THEN NOW() ELSE company_recommendations.last_suggested_at END, updated_at = NOW()
         RETURNING id, recommendation_key, title, rationale, action, priority, kpi, suggested_timeframe, evidence, evidence_fingerprint, status, generation_source, first_suggested_at, last_suggested_at`,
        [companyId, item.key, title, rationale, action, priority, kpi, timeframe, JSON.stringify(item.evidence), item.evidenceFingerprint, item.status, generationSource, refreshExisting]
      );
      if (item.changed) {
        const old = existing.find((record) => record.recommendation_key === item.key);
        const eventType = !old ? 'suggested' : old.status === 'superseded' ? 'reappeared' : 'evidence_updated';
        const recommendationId = saved.rows[0]?.id || item.id;
        if (recommendationId) await db.query("INSERT INTO company_recommendation_events (recommendation_id,event_type,previous_status,new_status,evidence_fingerprint) VALUES ($1,$2,$3,$4,$5)", [recommendationId, eventType, old?.status || null, item.status, item.evidenceFingerprint]);
      }
    }
    const result = await db.query("SELECT id, recommendation_key AS key, title, rationale, action, priority, kpi, suggested_timeframe AS timeframe, evidence, status, CASE WHEN evidence ? 'recommendation_model' THEN 'classifier' ELSE generation_source END AS source, first_suggested_at, last_suggested_at FROM company_recommendations WHERE company_id = $1 AND status IN ('active','accepted') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id", [companyId]);
    return result.rows;
  }

  async function updateStatus(companyId, recommendationId, status) {
    const result = await db.query("WITH prior AS (SELECT status, evidence_fingerprint FROM company_recommendations WHERE company_id = $1 AND id = $2), updated AS (UPDATE company_recommendations SET status = $3, updated_at = NOW() WHERE company_id = $1 AND id = $2 RETURNING id, recommendation_key AS key, title, rationale, action, priority, kpi, suggested_timeframe AS timeframe, evidence, status, CASE WHEN evidence ? 'recommendation_model' THEN 'classifier' ELSE generation_source END AS source, evidence_fingerprint) SELECT updated.*, prior.status AS previous_status FROM updated CROSS JOIN prior", [companyId, recommendationId, status]);
    const recommendation = result.rows[0] || null;
    if (recommendation) await db.query("INSERT INTO company_recommendation_events (recommendation_id,event_type,previous_status,new_status,evidence_fingerprint) VALUES ($1,$2,$3,$4,$5)", [recommendationId, status, recommendation.previous_status || null, status, recommendation.evidence_fingerprint]);
    return recommendation;
  }
  return { getRecommendations, updateStatus };
}

module.exports = createRecommendationService();
module.exports.createRecommendationService = createRecommendationService;
