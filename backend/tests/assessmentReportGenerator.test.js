const { PassThrough } = require('stream');
const { buildAssessment, buildNetZeroPathway, buildNetZeroPlan, generate } = require('../src/utils/assessmentReportGenerator');

const completeRow = (year, scope1, scope3) => ({
  submitted_at: `${year}-12-31T00:00:00Z`,
  data: {
    reporting_period_start: `${year}-01-01`, reporting_period_end: `${year}-12-31`,
    scope1_tco2e: scope1, electricity_consumption_kwh: 1000,
    electricity_grid_factor_kg_kwh: 0.5, scope3_total_tco2e: scope3,
    energy_consumption: 1400, renewable_energy_pct: 30, waste_recycled_pct: 45,
    water_usage: 1000, production_volume: 100
  }
});

test('builds a deterministic pathway from the latest complete inventory and includes history', () => {
  const assessment = buildAssessment({}, [completeRow(2024, 10, 5), completeRow(2025, 12, 6)]);
  const pathway = buildNetZeroPathway(assessment, 2050, 4);
  expect(pathway).toMatchObject({ available: true, baselineYear: 2025, baselineEmissions: 18.5, targetYear: 2050, targetEmissions: 0, estimatedTargetYear: 2050, annualReductionTco2e: 0.74 });
  expect(pathway.historical).toHaveLength(2);
  expect(pathway.trajectory[0]).toEqual({ year: 2025, emissions: 18.5 });
  expect(pathway.trajectory.at(-1)).toEqual({ year: 2050, emissions: 0 });
});

test('does not invent a baseline when scopes are incomplete or target assumptions are invalid', () => {
  const incomplete = buildAssessment({}, [{ submitted_at: '2025-12-31', data: { scope1_tco2e: 4 } }]);
  expect(buildNetZeroPathway(incomplete, 2050, 4)).toMatchObject({ available: false, reason: expect.stringContaining('complete Scope 1') });
  const complete = buildAssessment({}, [completeRow(2025, 12, 6)]);
  expect(buildNetZeroPathway(complete, 2020, 4)).toMatchObject({ available: false, reason: expect.stringContaining('target year') });
});

test('builds deterministic report planning from scope gaps and saved recommendations', () => {
  const assessment = buildAssessment({ company_name: 'Example Works' }, [{ submitted_at: '2025-12-31', data: { scope1_tco2e: 4 } }]);
  const plan = buildNetZeroPlan({ company: { company_name: 'Example Works' }, assessment, recommendations: [{
    title: 'Improve waste prevention and recovery', action: 'Measure major waste streams.', priority: 'Medium',
    timeframe: '0-3 months', kpi: 'Track recycling rate.', source: 'classifier'
  }] });
  expect(plan.executiveSummary).toContain('incomplete scope inventory');
  expect(plan.executiveSummary).toContain('missing scopes are excluded');
  expect(plan.roadmap).toContain('Collect purchased-electricity activity and a documented grid factor to calculate Scope 2.');
  expect(plan.recommendationSource).toContain('classifier selected recommendation categories');
  expect(plan.recommendations).toHaveLength(1);
});

test('generates a readable PDF with the selected scenario and latest validated recommendations', async () => {
  const assessment = buildAssessment({ company_name: 'Example Works' }, [completeRow(2025, 12, 6)]);
  const pathway = buildNetZeroPathway(assessment, 2050, 4);
  const response = new PassThrough();
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => { response.on('end', resolve); response.on('error', reject); });
  generate(response, {
    company: { company_name: 'Example Works', industry: 'Manufacturing' },
    assessment,
    pathway,
    aiPlan: {
      analysisSource: 'Deterministic test plan', executiveSummary: 'Inventory is complete for this test.',
      recommendationSource: 'Validated company recommendations',
      priorities: ['Inspect the largest energy loads.'], roadmap: ['0-6 months: assign an owner.']
    }
  });
  await complete;
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(3000);
});
