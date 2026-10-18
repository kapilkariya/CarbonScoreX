jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/recommendationService', () => ({
  getRecommendations: jest.fn(),
  updateStatus: jest.fn()
}));

const { query } = require('../src/config/database');
const recommendationService = require('../src/services/recommendationService');
const assessmentReportGenerator = require('../src/utils/assessmentReportGenerator');
const controller = require('../src/controllers/companyController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
  };
}

function request() {
  return { method: 'GET', params: { id: '1' }, query: {}, user: { userType: 'company', companyId: 1 } };
}

beforeEach(() => jest.clearAllMocks());

test('company with no submissions receives the established 404 response without calling recommendation storage', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  const res = response();
  await controller.getRecommendations(request(), res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ error: 'No data found. Please submit environmental data first.' });
  expect(recommendationService.getRecommendations).not.toHaveBeenCalled();
});

test('successful request loads recent metrics and returns the existing API response shape', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ score: '71.2', score_category: 'Good', data: { energy_consumption: 4300, renewable_energy_pct: 25 } }] })
    .mockResolvedValueOnce({ rows: [{ data: { energy_consumption: 4800, production_volume: 70 }, submitted_at: '2025-01-01T00:00:00Z' }] });
  const recommendations = [{ id: 4, title: 'Review energy use', status: 'active', source: 'rules' }];
  recommendationService.getRecommendations.mockResolvedValueOnce(recommendations);
  const res = response();
  await controller.getRecommendations(request(), res);
  expect(recommendationService.getRecommendations).toHaveBeenCalledWith(1, expect.objectContaining({
    energy_consumption: 4300,
    history: [expect.objectContaining({ energy_consumption: 4800, production_volume: 70 })]
  }), { forceRefresh: false });
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, recommendations, basedOn: { score: 71.2, category: 'Good' } }));
});

test('generation request forces classifier evaluation using the latest company submission', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ score: '71.2', score_category: 'Good', data: { renewable_energy_pct: 35 } }] })
    .mockResolvedValueOnce({ rows: [{ data: { renewable_energy_pct: 35 }, submitted_at: '2026-01-01T00:00:00Z' }] });
  recommendationService.getRecommendations.mockResolvedValueOnce([{ id: 4, title: 'Review renewable supply', source: 'classifier' }]);
  const req = { ...request(), method: 'POST' };
  const res = response();
  await controller.getRecommendations(req, res);
  expect(recommendationService.getRecommendations).toHaveBeenCalledWith(1, expect.objectContaining({ renewable_energy_pct: 35 }), { forceRefresh: true });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refreshed: true, generation: expect.stringContaining('Classifier-selected categories') }));
});

test('Net Zero pathway endpoint returns scenario from company inventory history and blocks another company', async () => {
  const unauthorized = response();
  await controller.getNetZeroPathway({ ...request(), params: { id: '2' }, query: { targetYear: 2050, annualReductionPct: 4 } }, unauthorized);
  expect(unauthorized.status).toHaveBeenCalledWith(403);
  expect(query).not.toHaveBeenCalled();

  query.mockResolvedValueOnce({ rows: [
    { submitted_at: '2024-12-31', data: { scope1_tco2e: 10, electricity_consumption_kwh: 1000, electricity_grid_factor_kg_kwh: 0.5, scope3_total_tco2e: 5, reporting_period_end: '2024-12-31' } },
    { submitted_at: '2025-12-31', data: { scope1_tco2e: 12, electricity_consumption_kwh: 1000, electricity_grid_factor_kg_kwh: 0.5, scope3_total_tco2e: 6, reporting_period_end: '2025-12-31' } }
  ] });
  const res = response();
  await controller.getNetZeroPathway({ ...request(), query: { targetYear: '2050', annualReductionPct: '4' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pathway: expect.objectContaining({ available: true, baselineYear: 2025, baselineEmissions: 18.5, targetYear: 2050, estimatedTargetYear: 2050, historical: expect.arrayContaining([expect.objectContaining({ year: 2024, emissions: 15.5 })]) }) }));
});

test('PDF download uses current inventory, persisted recommendations, and selected deterministic pathway', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ company_id: 1, company_name: 'Example Works', industry: 'Manufacturing', data: {}, submitted_at: '2025-12-31' }] })
    .mockResolvedValueOnce({ rows: [{ submitted_at: '2025-12-31', data: { reporting_period_start: '2025-01-01', reporting_period_end: '2025-12-31', scope1_tco2e: 12, electricity_consumption_kwh: 1000, electricity_grid_factor_kg_kwh: 0.5, scope3_total_tco2e: 6 } }] });
  const recommendations = [{ id: 4, title: 'Review energy use', rationale: 'Measured energy is available.', action: 'Review major loads.', priority: 'High', kpi: 'Energy consumption', timeframe: '0-3 months', evidence: { energy: 4300 }, source: 'ai', status: 'active' }];
  recommendationService.getRecommendations.mockResolvedValueOnce(recommendations);
  const generate = jest.spyOn(assessmentReportGenerator, 'generate').mockImplementation(() => {});
  const res = response();
  await controller.downloadAssessmentReport({ ...request(), query: { targetYear: '2050', annualReductionPct: '4' } }, res);
  expect(recommendationService.getRecommendations).toHaveBeenCalledWith(1, expect.objectContaining({ history: expect.any(Array) }));
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(generate.mock.calls[0][1].aiPlan.recommendations).toBe(recommendations);
  expect(generate.mock.calls[0][1].aiPlan.analysisSource).toContain('Deterministic CarbonScoreX guidance');
  expect(generate.mock.calls[0][1].pathway).toMatchObject({ available: true, baselineYear: 2025, targetYear: 2050 });
  generate.mockRestore();
});

test('PDF endpoint reports missing inventory data without attempting PDF generation', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  const generate = jest.spyOn(assessmentReportGenerator, 'generate');
  const res = response();
  await controller.downloadAssessmentReport({ ...request(), query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ error: 'Submit environmental data before generating an assessment report' });
  expect(generate).not.toHaveBeenCalled();
  generate.mockRestore();
});

test('unexpected database failures are logged with diagnostics and not exposed to the client', async () => {
  const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
  query.mockRejectedValueOnce(Object.assign(new Error('relation company_recommendations does not exist'), { code: '42P01' }));
  const res = response();
  await controller.getRecommendations(request(), res);
  expect(res.status).toHaveBeenCalledWith(500);
  const body = res.json.mock.calls[0][0];
  expect(body.error).toBe('Failed to get recommendations');
  expect(body.details).toBeUndefined();
  expect(body.requestId).toBeTruthy();
  expect(logger.mock.calls[0][1]).toMatchObject({ companyId: 1, code: '42P01' });
  expect(logger.mock.calls[0][1].message).toContain('company_recommendations');
  logger.mockRestore();
});
