const axios = require('axios');

// Map stored assessment fields to the artifact's exact 20 numeric feature names.
// Undefined/empty values stay absent so the Python median imputer receives NaN;
// the legacy emissions_co2 field is mapped only to the generic trained feature.
const FEATURE_INPUTS = {
  renewable_energy_usage_pct: ['renewable_energy_pct'],
  waste_recycling_rate_pct: ['waste_recycled_pct'],
  energy_consumption_kwh: ['energy_consumption'],
  co2_emissions_tons: ['emissions_co2'],
  water_usage_liters: ['water_usage'],
  employee_count: ['employee_count'],
  production_volume: ['production_volume'],
  scope1_direct_emissions_tco2e: ['scope1_tco2e'],
  scope1_stationary_fuel_combustion_tco2e: ['scope1_stationary_combustion_tco2e', 'scope1_stationary_fuel_combustion_tco2e'],
  scope1_mobile_combustion_tco2e: ['scope1_mobile_combustion_tco2e'],
  scope1_process_emissions_tco2e: ['scope1_process_tco2e', 'scope1_process_emissions_tco2e'],
  scope1_fugitive_refrigerant_emissions_tco2e: ['scope1_fugitive_tco2e', 'scope1_fugitive_refrigerant_emissions_tco2e'],
  purchased_electricity_kwh: ['electricity_consumption_kwh', 'purchased_electricity_kwh'],
  electricity_grid_factor_kgco2e_per_kwh: ['electricity_grid_factor_kg_kwh', 'electricity_grid_factor_kgco2e_per_kwh'],
  scope3_reported_total_tco2e: ['scope3_total_tco2e', 'scope3_reported_total_tco2e'],
  scope3_purchased_goods_services_tco2e: ['scope3_purchased_goods_tco2e', 'scope3_purchased_goods_services_tco2e'],
  scope3_upstream_transportation_tco2e: ['scope3_transport_tco2e', 'scope3_upstream_transportation_tco2e'],
  scope3_waste_generated_operations_tco2e: ['scope3_waste_tco2e', 'scope3_waste_generated_operations_tco2e'],
  scope3_business_travel_tco2e: ['scope3_business_travel_tco2e'],
  scope3_other_value_chain_sources_tco2e: ['scope3_other_tco2e', 'scope3_other_value_chain_sources_tco2e']
};

const VALID_LABELS = new Set([
  'Improve waste prevention and recovery',
  'Investigate process water reduction',
  'Reduce grid electricity dependence',
  'Target high-use equipment for efficiency'
]);

function mapAssessmentFeatures(data = {}) {
  const payload = {};
  for (const [feature, aliases] of Object.entries(FEATURE_INPUTS)) {
    const key = aliases.find((alias) => data[alias] !== undefined && data[alias] !== null && data[alias] !== '');
    if (!key) continue;
    const value = Number(data[key]);
    if (Number.isFinite(value)) payload[feature] = value;
  }
  return payload;
}

function createRecommendationModel({ client = axios, logger = console } = {}) {
  async function predict(data) {
    const baseUrl = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
    const timeout = Math.max(1000, Number(process.env.ML_RECOMMENDATION_TIMEOUT_MS) || 8000);
    try {
      const response = await client.post(`${baseUrl}/recommendations/predict`, mapAssessmentFeatures(data), { timeout });
      const result = response.data || {};
      const labels = Array.isArray(result.recommendations)
        ? result.recommendations.filter((label) => VALID_LABELS.has(label))
        : [];
      if (result.status !== 'predicted') {
        throw new Error(result.message || 'Recommendation model returned a fallback response');
      }
      return { status: 'predicted', labels, modelVersion: result.model_version || null };
    } catch (error) {
      logger.warn('Recommendation classifier unavailable; using deterministic rules:', error.message);
      return { status: 'fallback', labels: [], modelVersion: null, error: error.message };
    }
  }
  return { predict };
}

module.exports = { FEATURE_INPUTS, mapAssessmentFeatures, createRecommendationModel };
