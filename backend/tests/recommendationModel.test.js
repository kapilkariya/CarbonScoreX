const { FEATURE_INPUTS, mapAssessmentFeatures, createRecommendationModel } = require('../src/services/recommendationModel');

test('declares all 20 trained feature names', () => {
  expect(Object.keys(FEATURE_INPUTS)).toHaveLength(20);
});

test('maps stored assessment keys to the exact classifier features and leaves missing values absent', () => {
  const mapped = mapAssessmentFeatures({
    energy_consumption: 1250,
    electricity_consumption_kwh: 500,
    electricity_grid_factor_kg_kwh: 0.42,
    scope1_stationary_combustion_tco2e: 3,
    scope3_total_tco2e: 8,
    emissions_co2: null
  });
  expect(mapped).toEqual({
    energy_consumption_kwh: 1250,
    scope1_stationary_fuel_combustion_tco2e: 3,
    purchased_electricity_kwh: 500,
    electricity_grid_factor_kgco2e_per_kwh: 0.42,
    scope3_reported_total_tco2e: 8
  });
  expect(Object.keys(mapped)).toHaveLength(5);
});

test('calls the Compose service hostname endpoint with a bounded timeout', async () => {
  const post = jest.fn().mockResolvedValue({ data: {
    status: 'predicted', model_version: 'carbonscorex_recommendation_model',
    recommendations: ['Reduce grid electricity dependence', 'unknown label']
  } });
  const model = createRecommendationModel({ client: { post }, logger: { warn: jest.fn() } });
  const result = await model.predict({ electricity_consumption_kwh: 2500 });
  expect(post).toHaveBeenCalledWith('http://localhost:8000/recommendations/predict', { purchased_electricity_kwh: 2500 }, { timeout: 8000 });
  expect(result).toEqual({ status: 'predicted', labels: ['Reduce grid electricity dependence'], modelVersion: 'carbonscorex_recommendation_model' });
});

test('unavailable classifier fails open to deterministic recommendation rules', async () => {
  const logger = { warn: jest.fn() };
  const model = createRecommendationModel({ client: { post: jest.fn().mockRejectedValue(new Error('timeout')) }, logger });
  await expect(model.predict({})).resolves.toMatchObject({ status: 'fallback', labels: [], error: 'timeout' });
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('using deterministic rules'), 'timeout');
});
