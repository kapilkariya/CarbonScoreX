/**
 * Tests for billExtractionService
 * Tests unit normalization and form field mapping
 */
const { normalizeConsumption, mapToFormFields } = require('../src/services/billExtractionService');

describe('normalizeConsumption', () => {
  test('normalizes electricity units to kWh', () => {
    expect(normalizeConsumption(100, 'kWh', 'electricity').normalized).toBe(100);
    expect(normalizeConsumption(2.5, 'MWh', 'electricity').normalized).toBe(2500);
    expect(normalizeConsumption(1, 'GWh', 'electricity').normalized).toBe(1000000);
  });

  test('normalizes water units to Liters', () => {
    expect(normalizeConsumption(500, 'Liters', 'water').normalized).toBe(500);
    expect(normalizeConsumption(10, 'kL', 'water').normalized).toBe(10000);
    expect(normalizeConsumption(5, 'm3', 'water').normalized).toBe(5000);
    expect(normalizeConsumption(100, 'Gallons', 'water').normalized).toBeCloseTo(378.541, 2);
  });

  test('normalizes fuel units to Liters', () => {
    expect(normalizeConsumption(200, 'Liters', 'fuel').normalized).toBe(200);
    expect(normalizeConsumption(50, 'Gallons', 'fuel').normalized).toBeCloseTo(189.27, 1);
  });

  test('normalizes natural gas units to m3', () => {
    expect(normalizeConsumption(50, 'm3', 'gas').normalized).toBe(50);
    expect(normalizeConsumption(1000, 'cubic_feet', 'gas').normalized).toBeCloseTo(28.32, 1);
  });

  test('handles unknown units gracefully without throwing', () => {
    const result = normalizeConsumption(42, 'parsecs', 'electricity');
    expect(result.normalized).toBe(42);
    expect(result.conversionApplied).toBe(false);
  });
});

describe('mapToFormFields', () => {
  test('maps electricity and water consumption entries to form fields', () => {
    const extracted = {
      bill_type: 'combined',
      billing_period_start: '2026-01-01',
      billing_period_end: '2026-01-31',
      utility_provider: 'EcoPower & Water Utility',
      account_number: 'ACC-98765',
      consumption_entries: [
        {
          metric: 'electricity_kwh',
          consumption_value: 1450,
          consumption_unit: 'kWh',
          normalized_value: 1450,
          normalized_unit: 'kWh'
        },
        {
          metric: 'water_liters',
          consumption_value: 8500,
          consumption_unit: 'Liters',
          normalized_value: 8500,
          normalized_unit: 'Liters'
        }
      ],
      grid_emission_factor_kg_kwh: 0.45,
      grid_emission_factor_source: 'National Grid 2025'
    };

    const fields = mapToFormFields(extracted);

    expect(fields.reporting_period_start).toBe('2026-01-01');
    expect(fields.reporting_period_end).toBe('2026-01-31');
    expect(fields.energy_consumption).toBe(1450);
    expect(fields.electricity_consumption_kwh).toBe(1450);
    expect(fields.water_usage).toBe(8500);
    expect(fields.electricity_grid_factor_kg_kwh).toBe(0.45);
    expect(fields.electricity_factor_source).toBe('National Grid 2025');
    expect(fields.data_quality_notes).toContain('EcoPower & Water Utility');
    expect(fields.data_quality_notes).toContain('ACC-98765');
  });

  test('maps renewable percentage and direct GHG emissions when present', () => {
    const extracted = {
      bill_type: 'electricity',
      renewable_percentage: 75,
      ghg_emissions_tco2e: 1.25,
      scope: 'scope1',
      consumption_entries: [
        { metric: 'electricity_kwh', normalized_value: 3200 }
      ]
    };

    const fields = mapToFormFields(extracted);

    expect(fields.renewable_energy_pct).toBe(75);
    expect(fields.emissions_co2).toBe(1.25);
    expect(fields.scope1_tco2e).toBe(1.25);
    expect(fields.energy_consumption).toBe(3200);
  });

  test('handles empty or sparse extractions gracefully', () => {
    const fields = mapToFormFields({});
    expect(fields).toEqual({});
  });
});
