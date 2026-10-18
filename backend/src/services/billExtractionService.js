/**
 * Bill Extraction Service
 * Uses Google Gemini AI to extract consumption metrics from utility bills
 * (electricity, water, fuel, gas, waste) uploaded as PDF or image.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Unit conversion constants
const UNIT_CONVERSIONS = {
  // Electricity → kWh
  electricity: {
    kwh: 1,
    mwh: 1000,
    gwh: 1_000_000,
    wh: 0.001,
    kj: 0.000278,
    mj: 0.2778,
    gj: 277.778,
    btu: 0.000293,
    mmbtu: 293.071,
    therm: 29.3071,
  },
  // Water → Litres
  water: {
    liter: 1,
    litre: 1,
    l: 1,
    kl: 1000,
    kiloliter: 1000,
    kilolitre: 1000,
    m3: 1000,
    'm³': 1000,
    cubic_meter: 1000,
    gallon: 3.78541,
    gallons: 3.78541,
    us_gallon: 3.78541,
    imperial_gallon: 4.54609,
    ml: 0.001,
    milliliter: 0.001,
    cl: 0.01,
  },
  // Fuel → Litres (for scope1 fuels)
  fuel: {
    liter: 1,
    litre: 1,
    l: 1,
    gallon: 3.78541,
    gallons: 3.78541,
    us_gallon: 3.78541,
    imperial_gallon: 4.54609,
    kl: 1000,
    kiloliter: 1000,
    m3: 1000,
    cubic_meter: 1000,
    barrel: 158.987,
    bbl: 158.987,
  },
  // Gas → m³  (natural gas, LPG, etc.)
  gas: {
    m3: 1,
    'm³': 1,
    cubic_meter: 1,
    cubic_feet: 0.0283168,
    cf: 0.0283168,
    mcf: 28.3168,
    ccf: 2.83168,
    therm: 2.83168,
    gj: 26.853,   // approximate for natural gas
    mmbtu: 28.317, // approximate for natural gas
    kwh: 0.09,    // approximate for natural gas (≈11 kWh/m³)
  },
};

/**
 * Normalise raw consumption value to standard unit.
 * @param {number} value
 * @param {string} rawUnit - as returned by Gemini
 * @param {string} billType - 'electricity' | 'water' | 'fuel' | 'gas' | 'waste' | 'combined'
 * @returns {{ normalized: number, standardUnit: string }}
 */
function normalizeConsumption(value, rawUnit, billType) {
  const key = (rawUnit || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_³]/g, '');

  const map =
    billType === 'electricity' ? UNIT_CONVERSIONS.electricity
    : billType === 'water' ? UNIT_CONVERSIONS.water
    : billType === 'fuel' ? UNIT_CONVERSIONS.fuel
    : billType === 'gas' ? UNIT_CONVERSIONS.gas
    : null;

  const standardUnit =
    billType === 'electricity' ? 'kWh'
    : billType === 'water' ? 'Liters'
    : billType === 'fuel' ? 'Liters'
    : billType === 'gas' ? 'm³'
    : rawUnit;

  if (!map || !(key in map)) {
    // Unknown unit – return as-is with a warning flag
    return { normalized: value, standardUnit: rawUnit || 'unknown', conversionApplied: false };
  }

  return {
    normalized: parseFloat((value * map[key]).toFixed(4)),
    standardUnit,
    conversionApplied: map[key] !== 1,
  };
}

/**
 * Build the extraction prompt for Gemini.
 * @param {string} hint - optional user hint ('electricity' | 'water' | 'fuel' | 'gas' | 'waste' | '')
 */
function buildExtractionPrompt(hint = '') {
  return `You are a carbon-accounting data extraction assistant. Analyse the attached utility bill document.

Your task is to extract ALL relevant consumption metrics needed for a corporate carbon footprint inventory. Return ONLY valid JSON — no markdown fences, no commentary.

${hint ? `The user indicates this is a "${hint}" bill.` : ''}

Return exactly this JSON schema (use null for any field you cannot determine):
{
  "bill_type": "<electricity|water|fuel|gas|waste|combined|unknown>",
  "utility_provider": "<string|null>",
  "account_number": "<string|null>",
  "billing_period_start": "<YYYY-MM-DD|null>",
  "billing_period_end": "<YYYY-MM-DD|null>",
  "consumption_entries": [
    {
      "metric": "<electricity_kwh|water_liters|natural_gas_m3|lpg_liters|diesel_liters|petrol_liters|hfo_liters|waste_kg|other>",
      "consumption_value": <number|null>,
      "consumption_unit": "<string|null>",
      "normalized_value": <number|null>,
      "normalized_unit": "<kWh|Liters|m3|kg|null>",
      "tariff_or_rate": "<string|null>",
      "subtotal_cost": <number|null>,
      "currency": "<string|null>"
    }
  ],
  "total_cost": <number|null>,
  "currency": "<string|null>",
  "renewable_percentage": <number 0-100|null>,
  "grid_emission_factor_kg_kwh": <number|null>,
  "grid_emission_factor_source": "<string|null>",
  "ghg_emissions_tco2e": <number|null>,
  "scope": "<scope1|scope2|scope3|null>",
  "confidence": <0.0-1.0>,
  "extraction_notes": "<brief notes on assumptions or ambiguities|null>"
}

Rules:
- Extract every meter / fuel type listed on the bill.
- For "billing_period_start" and "billing_period_end" prefer ISO format YYYY-MM-DD; infer year if only month/day shown.
- Normalise values: electricity → kWh, water → Litres, gas → m³, liquid fuel → Litres, solid/waste → kg.
- If the bill lists both electricity and water, set bill_type="combined" and populate both entries in consumption_entries.
- Set confidence ≥ 0.8 only if the document clearly shows a meter reading, consumption figure, and billing period.
- Never invent numbers. Use null when uncertain.`;
}

/**
 * Call Gemini vision API to extract bill data.
 *
 * @param {Buffer} fileBuffer - raw file bytes
 * @param {string} mimeType   - e.g. 'image/jpeg', 'application/pdf'
 * @param {string} [hint]     - optional bill-type hint from the user
 * @returns {Promise<object>} - structured extraction result
 */
async function extractBillData(fileBuffer, mimeType, hint = '') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Use gemini-2.5-flash for vision tasks (supports multimodal PDF & images)
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const base64Data = fileBuffer.toString('base64');

  const prompt = buildExtractionPrompt(hint);

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
  ]);

  const rawText = result.response.text().trim();

  // Strip optional markdown fences if Gemini adds them despite instructions
  const jsonText = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini returned non-JSON response. Raw: ${rawText.slice(0, 300)}`);
  }

  // Post-process: normalise each consumption entry
  if (Array.isArray(parsed.consumption_entries)) {
    parsed.consumption_entries = parsed.consumption_entries.map((entry) => {
      if (entry.consumption_value == null) return entry;

      // Determine category for normalisation
      let category = 'unknown';
      if (entry.metric === 'electricity_kwh') category = 'electricity';
      else if (entry.metric === 'water_liters') category = 'water';
      else if (['natural_gas_m3'].includes(entry.metric)) category = 'gas';
      else if (['diesel_liters', 'petrol_liters', 'hfo_liters', 'lpg_liters'].includes(entry.metric)) category = 'fuel';

      if (category !== 'unknown' && entry.consumption_unit) {
        const { normalized, standardUnit, conversionApplied } = normalizeConsumption(
          entry.consumption_value,
          entry.consumption_unit,
          category
        );
        entry.normalized_value = normalized;
        entry.normalized_unit = standardUnit;
        if (conversionApplied !== undefined) entry._conversion_applied = conversionApplied;
      }

      return entry;
    });
  }

  return parsed;
}

/**
 * Map extracted data to the CompanyDashboard form fields.
 * Returns a partial formData object with only the fields that have values.
 *
 * @param {object} extracted - result from extractBillData
 * @returns {object} formFieldsToAutoFill
 */
function mapToFormFields(extracted) {
  const fields = {};

  // Billing period
  if (extracted.billing_period_start) fields.reporting_period_start = extracted.billing_period_start;
  if (extracted.billing_period_end) fields.reporting_period_end = extracted.billing_period_end;

  for (const entry of extracted.consumption_entries || []) {
    const val = entry.normalized_value ?? entry.consumption_value;
    if (val == null) continue;

    switch (entry.metric) {
      case 'electricity_kwh':
        fields.energy_consumption = val;
        fields.electricity_consumption_kwh = val;
        break;
      case 'water_liters':
        fields.water_usage = val;
        break;
      case 'natural_gas_m3':
        // Natural gas → primarily scope 1; store in data_quality_notes hint
        fields._natural_gas_m3 = val;
        break;
      case 'diesel_liters':
        fields._diesel_liters = val;
        break;
      case 'petrol_liters':
        fields._petrol_liters = val;
        break;
      case 'lpg_liters':
        fields._lpg_liters = val;
        break;
      case 'waste_kg':
        fields._waste_kg = val;
        break;
      default:
        break;
    }
  }

  // Renewable energy percentage (e.g. green power tariff)
  if (extracted.renewable_percentage != null) {
    fields.renewable_energy_pct = extracted.renewable_percentage;
  }

  // Total GHG emissions if directly stated on the document (in tCO2e)
  if (extracted.ghg_emissions_tco2e != null) {
    fields.emissions_co2 = extracted.ghg_emissions_tco2e;
    if (extracted.scope === 'scope1') {
      fields.scope1_tco2e = extracted.ghg_emissions_tco2e;
    } else if (extracted.scope === 'scope3') {
      fields.scope3_total_tco2e = extracted.ghg_emissions_tco2e;
    }
  }

  // Grid emission factor (if reported on the electricity bill)
  if (extracted.grid_emission_factor_kg_kwh != null) {
    fields.electricity_grid_factor_kg_kwh = extracted.grid_emission_factor_kg_kwh;
  }
  if (extracted.grid_emission_factor_source) {
    fields.electricity_factor_source = extracted.grid_emission_factor_source;
  }

  // Build automatic reference note for official document audit trail
  const docMeta = [];
  if (extracted.utility_provider) docMeta.push(`Provider: ${extracted.utility_provider}`);
  if (extracted.account_number) docMeta.push(`Account/Doc: ${extracted.account_number}`);
  if (extracted.billing_period_start && extracted.billing_period_end) {
    docMeta.push(`Period: ${extracted.billing_period_start} to ${extracted.billing_period_end}`);
  }
  if (docMeta.length > 0) {
    fields.data_quality_notes = `Extracted from official document (${docMeta.join(', ')}).`;
  }

  return fields;
}

module.exports = { extractBillData, mapToFormFields, normalizeConsumption };
