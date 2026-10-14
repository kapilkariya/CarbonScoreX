const { buildCandidates, reconcile } = require('../src/services/recommendationEngine');
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
const { createRecommendationService } = require('../src/services/recommendationService');

function memoryDb() {
  const rows = [];
  const events = [];
  let nextId = 1;
  return {
    rows,
    events,
    async query(sql, params) {
      if (sql.includes('SELECT * FROM company_recommendations')) return { rows: rows.filter((row) => row.company_id === params[0]) };
      if (sql.includes('UPDATE company_recommendations SET status') && !sql.includes('WITH prior')) {
        const row = rows.find((item) => item.id === params[0]);
        if (row) row.status = 'superseded';
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO company_recommendation_events')) {
        events.push(params);
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO company_recommendations')) {
        let row = rows.find((item) => item.company_id === params[0] && item.recommendation_key === params[1]);
        if (!row) {
          row = { id: nextId++, company_id: params[0], recommendation_key: params[1] };
          rows.push(row);
        }
        Object.assign(row, { title: params[2], rationale: params[3], action: params[4], priority: params[5], kpi: params[6], suggested_timeframe: params[7], evidence: JSON.parse(params[8]), evidence_fingerprint: params[9], status: params[10], generation_source: params[11] });
        return { rows: [row] };
      }
      if (sql.includes('SELECT id, recommendation_key AS key')) return { rows: rows.filter((row) => row.company_id === params[0] && ['active', 'accepted'].includes(row.status)).map((row) => ({ ...row, key: row.recommendation_key, source: row.generation_source })) };
      if (sql.includes('UPDATE company_recommendations SET status = $3')) {
        const row = rows.find((item) => item.company_id === params[0] && item.id === params[1]);
        const previous_status = row?.status;
        if (row) row.status = params[2];
        return { rows: row ? [{ ...row, previous_status, evidence_fingerprint: row.evidence_fingerprint, key: row.recommendation_key, source: row.generation_source }] : [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

const noAi = { getRecommendations: jest.fn(async (_data, candidates) => candidates.map(({ key, title, rationale, action }) => ({ key, title, rationale, action }))) };

test('different company activity inputs produce different recommendation candidates', () => {
  const lowRenewables = buildCandidates({ renewable_energy_pct: 10, waste_recycled_pct: 20, energy_consumption: 100 });
  const strongPerformance = buildCandidates({ renewable_energy_pct: 90, waste_recycled_pct: 85, energy_consumption: 100 });
  expect(lowRenewables.map((item) => item.key)).toContain('renewable_electricity');
  expect(lowRenewables.map((item) => item.key)).toContain('waste_circularity');
  expect(strongPerformance.map((item) => item.key)).not.toContain('renewable_electricity');
  expect(strongPerformance.map((item) => item.key)).not.toContain('waste_circularity');
});

test('repeated requests reconcile to existing identities without duplicate records', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, ai: noAi, logger: { warn: jest.fn() } });
  const data = { renewable_energy_pct: 20, waste_recycled_pct: 30, energy_consumption: 1200 };
  const first = await service.getRecommendations(7, data);
  const second = await service.getRecommendations(7, data);
  expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
  expect(db.rows).toHaveLength(first.length);
  expect(db.events.filter((event) => event[1] === 'suggested')).toHaveLength(first.length);
  expect(db.events.filter((event) => event[1] === 'evidence_updated')).toHaveLength(0);
  expect(noAi.getRecommendations).toHaveBeenCalledTimes(1);
});

test('changed evidence updates an existing action and reopens it when relevant', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, ai: noAi, logger: { warn: jest.fn() } });
  const first = await service.getRecommendations(8, { renewable_energy_pct: 10 });
  const renewable = first.find((item) => item.key === 'renewable_electricity');
  await service.updateStatus(8, renewable.id, 'dismissed');
  const changed = await service.getRecommendations(8, { renewable_energy_pct: 35 });
  const updated = changed.find((item) => item.key === 'renewable_electricity');
  expect(updated).toBeDefined();
  expect(updated.id).toBe(renewable.id);
  expect(updated.status).toBe('active');
  expect(db.rows.filter((item) => item.recommendation_key === 'renewable_electricity')).toHaveLength(1);
  expect(updated.evidence.renewable).toBe(35);
  expect(db.events.map((event) => event[1])).toContain('dismissed');
  expect(db.events.map((event) => event[1])).toContain('evidence_updated');
});

test('Ollama connection failures are logged and return valid rule-derived recommendations', async () => {
  const db = memoryDb();
  const logger = { warn: jest.fn() };
  const service = createRecommendationService({ db, ai: { getRecommendations: jest.fn().mockRejectedValue(new Error('Ollama (qwen3:4b) request failed at http://host.docker.internal:11434: ECONNREFUSED')) }, logger });
  const recommendations = await service.getRecommendations(9, { renewable_energy_pct: 12 });
  expect(recommendations.length).toBeGreaterThan(0);
  expect(recommendations.every((item) => item.source === 'rules')).toBe(true);
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Recommendation AI unavailable'), expect.stringContaining('ECONNREFUSED'));
});

test('invalid AI output does not replace validated rule candidates', async () => {
  const db = memoryDb();
  const logger = { warn: jest.fn() };
  const service = createRecommendationService({ db, ai: { getRecommendations: jest.fn().mockRejectedValue(new Error('AI response did not match the validated recommendation candidates')) }, logger });
  const recommendations = await service.getRecommendations(11, { renewable_energy_pct: 12 });
  expect(recommendations.some((item) => item.key === 'renewable_electricity' && item.source === 'rules')).toBe(true);
  expect(logger.warn).toHaveBeenCalled();
});

test('forced generation refreshes existing active records without inserting duplicates', async () => {
  const db = memoryDb();
  const initial = createRecommendationService({ db, ai: noAi, logger: { warn: jest.fn() } });
  const first = await initial.getRecommendations(17, { renewable_energy_pct: 10 });
  const ai = { getRecommendations: jest.fn(async (_data, candidates) => candidates.map((item) => ({
    key: item.key, title: `Refreshed ${item.title}`, rationale: 'Rechecked against current submitted activity.',
    action: item.action, priority: item.priority, kpi: item.kpi, timeframe: item.timeframe
  }))) };
  const refresh = createRecommendationService({ db, ai, logger: { warn: jest.fn() } });
  const latest = await refresh.getRecommendations(17, { renewable_energy_pct: 10 }, { forceRefresh: true });
  expect(ai.getRecommendations).toHaveBeenCalledTimes(1);
  expect(latest).toHaveLength(first.length);
  expect(db.rows).toHaveLength(first.length);
  expect(latest[0].title).toMatch(/^Refreshed /);
  expect(latest.every((item) => item.source === 'ai')).toBe(true);
});

test('accepted and completed actions are persisted as lifecycle events', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, ai: noAi, logger: { warn: jest.fn() } });
  const [recommendation] = await service.getRecommendations(10, { renewable_energy_pct: 10 });
  await service.updateStatus(10, recommendation.id, 'accepted');
  await service.updateStatus(10, recommendation.id, 'completed');
  expect(db.events.map((event) => event[1])).toEqual(expect.arrayContaining(['accepted', 'completed']));
});

test('reconciliation supersedes irrelevant actions and permits them to reappear', () => {
  const existing = [{ id: 1, recommendation_key: 'renewable_electricity', status: 'active', evidence_fingerprint: 'old' }];
  const absent = reconcile(existing, []);
  expect(absent.removed).toHaveLength(1);
  const reappeared = reconcile([{ ...existing[0], status: 'superseded' }], buildCandidates({ renewable_energy_pct: 10 }));
  expect(reappeared.current.find((item) => item.key === 'renewable_electricity').status).toBe('active');
});
