const crypto = require('crypto');

function number(data, key) {
  if (data[key] === null || data[key] === undefined || data[key] === '') return null;
  const value = Number(data[key]);
  return Number.isFinite(value) ? value : null;
}

function buildCandidates(data = {}) {
  const candidates = [];
  const push = (key, title, rationale, action, evidence, priority = 'Medium', kpi = 'Record the current baseline, then track the same metric each reporting period.', timeframe = '0-3 months') => candidates.push({ key, title, rationale, action, evidence, priority, kpi, timeframe });
  const scope1 = number(data, 'scope1_tco2e');
  const scope1Sources = ['scope1_stationary_combustion_tco2e', 'scope1_mobile_combustion_tco2e', 'scope1_process_tco2e', 'scope1_fugitive_tco2e'];
  const hasScope1Sources = scope1Sources.some((key) => number(data, key) !== null);
  if (scope1 === null && !hasScope1Sources) push('scope1_inventory', 'Establish a direct emissions baseline', 'Scope 1 emissions are not quantified in the latest submission.', 'Record stationary fuel, fleet, process and refrigerant activity with source documents.', { scope1, sources: scope1Sources.map((key) => number(data, key)) }, 'High', 'Scope 1 activity data completeness; establish a tCO2e baseline only after applying documented factors.');
  const electricity = number(data, 'electricity_consumption_kwh');
  const factor = number(data, 'electricity_grid_factor_kg_kwh');
  if (electricity !== null && factor === null) push('scope2_factor', 'Complete the purchased electricity calculation', 'Electricity use is recorded, but its emission factor is missing.', 'Add a region- and year-appropriate grid factor and document its source.', { electricity, factor }, 'High', 'Electricity factor source and coverage for the reporting period.');
  else if (electricity === null || factor === null) push('scope2_inventory', 'Quantify purchased electricity emissions', 'Scope 2 cannot be calculated from the current submission.', 'Collect electricity meter data and a documented grid factor for the reporting period.', { electricity, factor }, 'High', 'Electricity consumption (kWh), factor (kg CO2e/kWh), and factor reference.');
  const scope3 = number(data, 'scope3_total_tco2e');
  const scope3Keys = ['scope3_purchased_goods_tco2e', 'scope3_transport_tco2e', 'scope3_waste_tco2e', 'scope3_business_travel_tco2e', 'scope3_other_tco2e'];
  if (scope3 === null && !scope3Keys.some((key) => number(data, key) !== null)) push('scope3_screening', 'Screen material value-chain emissions', 'No Scope 3 total or category values are present.', 'Screen suppliers, freight, waste and business travel to identify material categories.', { scope3, categories: scope3Keys.map((key) => number(data, key)) }, 'High', 'Number of material Scope 3 categories screened and documented.');
  const renewable = number(data, 'renewable_energy_pct');
  if (renewable !== null && renewable < 50) push('renewable_electricity', 'Reduce grid electricity dependence', `Reported renewable electricity share is ${renewable}%.`, 'Assess efficiency and credible renewable supply options against the facility load profile.', { renewable }, 'Medium', 'Renewable electricity share (%); compare with this submitted baseline.');
  const recycling = number(data, 'waste_recycled_pct');
  if (recycling !== null && recycling < 60) push('waste_circularity', 'Improve waste prevention and recovery', `Reported recycling rate is ${recycling}%.`, 'Measure major waste streams and prioritize prevention, reuse and recovery with tracked tonnage.', { recycling }, 'Medium', 'Waste recycling rate (%) and stream-level tonnage.');
  const energy = number(data, 'energy_consumption');
  if (energy !== null && energy > 0) push('energy_efficiency', 'Target high-use equipment for efficiency', `Reported energy consumption is ${energy} kWh.`, 'Review major loads, operating schedules and maintenance opportunities; track savings against this baseline.', { energy, production: number(data, 'production_volume') }, 'High', number(data, 'production_volume') > 0 ? 'Energy consumption (kWh) and energy intensity (kWh per reported production unit).' : 'Energy consumption (kWh); production volume is not available for intensity.');
  const water = number(data, 'water_usage');
  if (water !== null && water > 0) push('water_efficiency', 'Investigate process water reduction', `Reported water use is ${water} litres.`, 'Meter major uses and evaluate leakage, reuse and process-efficiency opportunities.', { water, production: number(data, 'production_volume') }, 'Medium', number(data, 'production_volume') > 0 ? 'Water use (litres) and water intensity (litres per reported production unit).' : 'Water use (litres); production volume is not available for intensity.');
  return candidates;
}

function fingerprint(evidence) {
  return crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

function reconcile(existing, candidates) {
  const previous = new Map(existing.map((item) => [item.recommendation_key, item]));
  const next = candidates.map((candidate) => {
    const old = previous.get(candidate.key);
    const evidenceFingerprint = fingerprint(candidate.evidence);
    let status = old?.status || 'active';
    if (old && old.evidence_fingerprint !== evidenceFingerprint) status = 'active';
    else if (old?.status === 'superseded') status = 'active';
    return { ...candidate, evidenceFingerprint, status, id: old?.id, isNew: !old, changed: !old || old.evidence_fingerprint !== evidenceFingerprint || old.status === 'superseded' || old.generation_source === 'ai' };
  });
  return { current: next, removed: existing.filter((item) => !candidates.some((candidate) => candidate.key === item.recommendation_key) && item.status === 'active') };
}

module.exports = { buildCandidates, fingerprint, reconcile };
