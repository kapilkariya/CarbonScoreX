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
      if (sql.includes('INSERT INTO company_recommendation_events')) { events.push(params); return { rows: [] }; }
      if (sql.includes('INSERT INTO company_recommendations')) {
        let row = rows.find((item) => item.company_id === params[0] && item.recommendation_key === params[1]);
        if (!row) { row = { id: nextId++, company_id: params[0], recommendation_key: params[1] }; rows.push(row); }
        Object.assign(row, { title: params[2], rationale: params[3], action: params[4], priority: params[5], kpi: params[6], suggested_timeframe: params[7], evidence: JSON.parse(params[8]), evidence_fingerprint: params[9], status: params[10], generation_source: params[11] });
        return { rows: [row] };
      }
      if (sql.includes('SELECT id, recommendation_key AS key')) return { rows: rows.filter((row) => row.company_id === params[0] && ['active', 'accepted'].includes(row.status)).map((row) => ({ ...row, key: row.recommendation_key, source: row.evidence.recommendation_model ? 'classifier' : row.generation_source })) };
      if (sql.includes('UPDATE company_recommendations SET status = $3')) {
        const row = rows.find((item) => item.company_id === params[0] && item.id === params[1]);
        const previous_status = row?.status;
        if (row) row.status = params[2];
        return { rows: row ? [{ ...row, previous_status, key: row.recommendation_key, source: row.evidence.recommendation_model ? 'classifier' : row.generation_source }] : [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

const selectedModel = (labels = ['Reduce grid electricity dependence']) => ({
  predict: jest.fn(async () => ({ status: 'predicted', labels, modelVersion: 'carbonscorex_recommendation_model' }))
});

test('rule candidates use actual submitted metrics and do not treat null as zero', () => {
  const lowRenewables = buildCandidates({ renewable_energy_pct: 10, waste_recycled_pct: 20, energy_consumption: 100 });
  const strongPerformance = buildCandidates({ renewable_energy_pct: 90, waste_recycled_pct: 85, energy_consumption: 100 });
  expect(lowRenewables.map((item) => item.key)).toContain('renewable_electricity');
  expect(strongPerformance.map((item) => item.key)).not.toContain('renewable_electricity');
  expect(buildCandidates({ scope1_tco2e: null }).map((item) => item.key)).toContain('scope1_inventory');
});

test('classifier selects supported categories while deterministic scope gaps remain', async () => {
  const db = memoryDb();
  const model = selectedModel(['Reduce grid electricity dependence']);
  const service = createRecommendationService({ db, model, logger: { warn: jest.fn() } });
  const recommendations = await service.getRecommendations(7, {
    renewable_energy_pct: 20, waste_recycled_pct: 30, energy_consumption: 1200,
    water_usage: 200, emissions_co2: 400
  });
  const keys = recommendations.map((item) => item.key);
  expect(keys).toEqual(expect.arrayContaining(['scope1_inventory', 'scope2_inventory', 'scope3_screening', 'renewable_electricity']));
  expect(keys).not.toContain('waste_circularity');
  expect(recommendations.find((item) => item.key === 'renewable_electricity')).toMatchObject({ source: 'classifier', evidence: { recommendation_model: { label: 'Reduce grid electricity dependence' } } });
  expect(model.predict).toHaveBeenCalledWith(expect.objectContaining({ renewable_energy_pct: 20 }));
});

test('repeated requests preserve identity and company-scoped recommendation records', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, model: selectedModel(), logger: { warn: jest.fn() } });
  const data = { renewable_energy_pct: 20, waste_recycled_pct: 30, energy_consumption: 1200 };
  const first = await service.getRecommendations(7, data);
  const second = await service.getRecommendations(7, data);
  const otherCompany = await service.getRecommendations(8, data);
  expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
  expect(otherCompany.every((item) => item.id > Math.max(...first.map((row) => row.id)))).toBe(true);
  expect(db.rows.filter((row) => row.company_id === 7)).toHaveLength(first.length);
  expect(db.rows.filter((row) => row.company_id === 8)).toHaveLength(otherCompany.length);
  expect(db.events.filter((event) => event[1] === 'suggested')).toHaveLength(first.length + otherCompany.length);
});

test('changed evidence updates a dismissed action and lifecycle events remain scoped', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, model: selectedModel(), logger: { warn: jest.fn() } });
  const first = await service.getRecommendations(9, { renewable_energy_pct: 10 });
  const renewable = first.find((item) => item.key === 'renewable_electricity');
  await service.updateStatus(9, renewable.id, 'dismissed');
  const changed = await service.getRecommendations(9, { renewable_energy_pct: 35 });
  const updated = changed.find((item) => item.key === 'renewable_electricity');
  expect(updated).toMatchObject({ id: renewable.id, status: 'active', evidence: { renewable: 35 } });
  expect(db.events.map((event) => event[1])).toEqual(expect.arrayContaining(['dismissed', 'evidence_updated']));
});

test('classifier failure preserves deterministic rules instead of blocking recommendations', async () => {
  const db = memoryDb();
  const logger = { warn: jest.fn() };
  const model = { predict: jest.fn().mockResolvedValue({ status: 'fallback', labels: [], modelVersion: null }) };
  const service = createRecommendationService({ db, model, logger });
  const recommendations = await service.getRecommendations(11, { renewable_energy_pct: 12, waste_recycled_pct: 20 });
  expect(recommendations.map((item) => item.key)).toEqual(expect.arrayContaining(['renewable_electricity', 'waste_circularity']));
  expect(recommendations.every((item) => item.source === 'rules')).toBe(true);
});

test('legacy language-model recommendation text is refreshed from backend rules', async () => {
  const db = memoryDb();
  const service = createRecommendationService({ db, model: selectedModel(), logger: { warn: jest.fn() } });
  const first = await service.getRecommendations(12, { renewable_energy_pct: 10 });
  const oldRecommendation = db.rows.find((row) => row.company_id === 12 && row.recommendation_key === 'renewable_electricity');
  oldRecommendation.title = 'Legacy generated title';
  oldRecommendation.rationale = 'Legacy language model text';
  oldRecommendation.generation_source = 'ai';
  const current = await service.getRecommendations(12, { renewable_energy_pct: 10 });
  const refreshed = current.find((item) => item.key === 'renewable_electricity');
  expect(refreshed.title).toBe('Reduce grid electricity dependence');
  expect(refreshed.rationale).toContain('Reported renewable electricity share is 10%');
  expect(refreshed.source).toBe('classifier');
  expect(first.find((item) => item.key === 'renewable_electricity').id).toBe(refreshed.id);
});

test('forced refresh re-evaluates classifier selection without duplicating records', async () => {
  const db = memoryDb();
  const model = selectedModel();
  const service = createRecommendationService({ db, model, logger: { warn: jest.fn() } });
  const first = await service.getRecommendations(17, { renewable_energy_pct: 10 });
  const latest = await service.getRecommendations(17, { renewable_energy_pct: 10 }, { forceRefresh: true });
  expect(model.predict).toHaveBeenCalledTimes(2);
  expect(latest.map((item) => item.id)).toEqual(first.map((item) => item.id));
  expect(db.rows).toHaveLength(first.length);
});

test('reconciliation supersedes irrelevant actions and permits them to reappear', () => {
  const existing = [{ id: 1, recommendation_key: 'renewable_electricity', status: 'active', evidence_fingerprint: 'old' }];
  expect(reconcile(existing, []).removed).toHaveLength(1);
  const reappeared = reconcile([{ ...existing[0], status: 'superseded' }], buildCandidates({ renewable_energy_pct: 10 }));
  expect(reappeared.current.find((item) => item.key === 'renewable_electricity').status).toBe('active');
});
