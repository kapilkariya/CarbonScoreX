/**
 * Language model service for local Ollama or optional Gemini providers.
 */
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');

const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

/**
 * Generate content using the configured language model.
 * @param {string} prompt - The prompt to send to Gemini
 * @returns {Promise<string>} - The generated text response
 */
function getProvider() {
    return (process.env.AI_PROVIDER || 'ollama').trim().toLowerCase();
}

async function generateContent(prompt, system = 'You are a careful industrial sustainability planning assistant.', responseSchema = null) {
    const provider = getProvider();
    if (provider === 'ollama') {
        const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
        const timeoutMs = Math.max(1000, Number(process.env.OLLAMA_TIMEOUT_MS) || 120000);
        const model = process.env.OLLAMA_MODEL || 'qwen3:4b';
        try {
            const response = await axios.post(`${baseUrl}/api/chat`, {
                model,
                messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
                stream: false,
                think: false,
                format: responseSchema || 'json',
                // The current rules engine can supply seven candidates. Leave
                // enough room for their complete schema-validated JSON while
                // still bounding model output and disabling Qwen3 reasoning.
                options: { temperature: 0.2, num_predict: 700 }
            }, { timeout: timeoutMs });
            if (response.data?.done_reason === 'length') {
                throw new Error('Ollama response was truncated at the output token limit');
            }
            const content = response.data?.message?.content;
            if (typeof content !== 'string' || !content.trim()) throw new Error('Ollama returned an empty response');
            // Ollama 0.40.4 honors the top-level `think: false` for Qwen3. Ignore
            // any thinking channel if a model/version still includes one; callers
            // consume only the bounded structured response in message.content.
            return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        } catch (error) {
            const detail = error.code === 'ECONNABORTED' ? `request timed out after ${timeoutMs}ms` : error.message;
            throw new Error(`Ollama (${model}) request failed at ${baseUrl}: ${detail}`);
        }
    }
    if (provider === 'gemini') {
        if (!genAI) throw new Error('GEMINI_API_KEY is not configured');
        const response = await genAI.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `${system}\n\n${prompt}`,
            config: { temperature: 0.3 }
        });
        return response.text || '';
    }
    throw new Error(`Unsupported AI_PROVIDER "${provider}". Use ollama or gemini.`);
}

function fallbackNetZeroPlan({ company, assessment }) {
    const data = assessment.data || {};
    const scopes = assessment.scopes || {};
    const priorities = [];
    if (scopes.scope1 === null) priorities.push('Inventory fuel, process and refrigerant sources to establish the direct emissions baseline.');
    if (scopes.scope2 === null) priorities.push('Collect electricity meter data and document a location-relevant grid emission factor.');
    if (scopes.scope3 === null) priorities.push('Screen purchased goods, logistics, waste and travel to identify material value-chain categories.');
    if (Number(data.renewable_energy_pct) < 100) priorities.push('Assess efficiency and credible renewable electricity procurement after validating the load profile.');
    if (Number(data.waste_recycled_pct) < 100) priorities.push('Separate major waste streams and prioritize prevention, reuse and recycling with measured tonnage.');
    while (priorities.length < 5) priorities.push('Assign an accountable owner, baseline metric and review cadence to each reduction initiative.');

    return {
        executiveSummary: scopes.complete
            ? `${company.company_name} has a quantified preliminary inventory across all three scopes. Start with the largest verified source and improve activity evidence before committing to a target.`
            : `${company.company_name} has an incomplete scope inventory. Close the missing scope data gaps first, then prioritize the largest measured emissions sources.` ,
        priorities: priorities.slice(0, 5),
        roadmap: [
            'Confirm facility boundary, reporting period, activity owners and source-document retention.',
            'Complete missing scope data and document emission-factor geography, year and source.',
            'Build a source-level reduction register with cost, owner, timing and expected impact.',
            'Implement no-regret efficiency, maintenance, waste-prevention and procurement actions.',
            'Recalculate annually, review progress with management and refine targets using measured results.'
        ],
            analysisSource: `Deterministic CarbonScoreX guidance (${getProvider()} unavailable)`
    };
}

/** Generate report-specific, data-grounded planning text; deterministic fallback if unavailable. */
async function getNetZeroPlan({ company, assessment, recommendations = [] }) {
    const fallback = fallbackNetZeroPlan({ company, assessment });
    if (getProvider() === 'gemini' && !genAI) return fallback;
    const { scopes, period, data } = assessment;
    const prompt = `Produce JSON only with keys executiveSummary (one concise paragraph), priorities (exactly 5 actionable strings), roadmap (exactly 5 sequenced strings). Ground every claim in the input. Do not invent emissions, reduction estimates, factors, targets, costs, verification, standards alignment, or legal compliance. The pathway is preliminary planning, not a commitment. For missing values, recommend data collection.\n\nCompany: ${company.company_name}; industry: ${company.industry || 'not stated'}; reporting period: ${period.start} to ${period.end}.\nScope 1 tCO2e: ${scopes.scope1 ?? 'missing'}; Scope 2 tCO2e: ${scopes.scope2 ?? 'missing'}; Scope 3 tCO2e: ${scopes.scope3 ?? 'missing'}; total tCO2e: ${scopes.total ?? 'incomplete'}.\nEnergy kWh: ${data.energy_consumption ?? 'missing'}; purchased electricity kWh: ${data.electricity_consumption_kwh ?? 'missing'}; renewable percentage: ${data.renewable_energy_pct ?? 'missing'}; emissions CO2 tons (scope unspecified): ${data.emissions_co2 ?? 'missing'}; recycling percentage: ${data.waste_recycled_pct ?? 'missing'}; water liters: ${data.water_usage ?? 'missing'}; production: ${data.production_volume ?? 'missing'}.\nReturn valid JSON only.`;
    try {
        const content = await generateContent(prompt);
        const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const roadmap = Array.isArray(parsed.roadmap) ? parsed.roadmap.filter((x) => typeof x === 'string').slice(0, 5) : [];
        return {
            executiveSummary: typeof parsed.executiveSummary === 'string' && parsed.executiveSummary.trim() ? parsed.executiveSummary : fallback.executiveSummary,
            priorities: recommendations.length ? recommendations.map((item) => `${item.title}: ${item.action}`).slice(0, 5) : fallback.priorities,
            roadmap: roadmap.length === 5 ? roadmap : fallback.roadmap,
            analysisSource: `${getProvider()} AI-assisted draft`
        };
    } catch (error) {
        console.warn('Net Zero plan AI unavailable; using deterministic guidance:', error.message);
        return fallback;
    }
}

/**
 * Enrich validated rule candidates with language-model details based on the company's current and historical data.
 */
async function getRecommendations(companyData, candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return [];
    const metrics = ['reporting_period_start', 'reporting_period_end', 'energy_consumption', 'electricity_consumption_kwh', 'renewable_energy_pct', 'emissions_co2', 'scope1_tco2e', 'scope2_tco2e', 'scope3_total_tco2e', 'waste_recycled_pct', 'water_usage', 'production_volume', 'employee_count'];
    const current = Object.fromEntries(metrics.map((key) => [key, companyData[key] ?? null]));
    const historyMetrics = metrics.filter((key) => !['reporting_period_start', 'reporting_period_end'].includes(key));
    const history = (Array.isArray(companyData.history) ? companyData.history : []).slice(0, 3).map((submission) => {
        const data = typeof submission.data === 'string' ? (() => { try { return JSON.parse(submission.data); } catch (_) { return {}; } })() : (submission.data || submission);
        return {
            submitted_at: submission.submitted_at || null,
            metrics: Object.fromEntries(historyMetrics.map((key) => [key, data[key] ?? null]))
        };
    });
    const validatedCandidates = candidates.map(({ key, title, rationale, action, evidence, priority, kpi, timeframe }) => ({
        key, title, rationale, action, evidence, priority, kpi, timeframe
    }));
    const prompt = `Return concise JSON only, matching the supplied schema. Enrich every candidate while preserving its key; do not add or remove candidates. Use current metrics and up to 3 recent submissions only when relevant. Never invent values, factors, emissions, environmental claims, savings or reduction targets. KPIs must measure a supplied metric or establish a baseline when missing; do not imply an achieved result. Priority: High, Medium or Low. Timeframe: 0-3 months, 3-12 months, 12-24 months or Ongoing.\nCurrent metrics: ${JSON.stringify(current)}\nRecent history: ${JSON.stringify(history)}\nCandidates: ${JSON.stringify(validatedCandidates)}`;
    const responseSchema = {
        type: 'object', additionalProperties: false, required: ['recommendations'],
        properties: { recommendations: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['key', 'title', 'reason', 'action', 'priority', 'kpi', 'timeframe'],
            properties: {
                key: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' },
                action: { type: 'string' }, priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
                kpi: { type: 'string' }, timeframe: { type: 'string', enum: ['0-3 months', '3-12 months', '12-24 months', 'Ongoing'] }
            }
        } } }
    };
    const content = await generateContent(prompt, 'You are an industrial GHG advisor. Do not think aloud. Return only concise JSON that follows the schema exactly and is grounded in the supplied evidence.', responseSchema);
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const expected = new Set(candidates.map((item) => item.key));
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.recommendations) ? parsed.recommendations : (parsed?.key && expected.size === 1) ? [parsed] : null;
    if (!Array.isArray(items)) throw new Error('AI response did not contain a recommendations array');
    const knownNumbers = new Set((`${JSON.stringify(current)} ${JSON.stringify(candidates)}`.match(/\b\d+(?:\.\d+)?\b/g) || []));
    const normalized = items.filter((item) => expected.has(item.key)
      && ['title', 'reason', 'action', 'priority', 'kpi', 'timeframe'].every((field) => typeof item[field] === 'string' && item[field].trim())
      && ['High', 'Medium', 'Low'].includes(item.priority)
      && ['0-3 months', '3-12 months', '12-24 months', 'Ongoing'].includes(item.timeframe)
      && ['title', 'reason', 'action', 'kpi'].every((field) => (item[field].match(/\b\d+(?:\.\d+)?\b/g) || []).every((value) => knownNumbers.has(value))));
    if (normalized.length !== expected.size || new Set(normalized.map((item) => item.key)).size !== expected.size) {
        throw new Error('AI response did not match the validated recommendation candidates');
    }
    return normalized.map(({ key, title, reason, action, priority, kpi, timeframe }) => ({ key, title, rationale: reason, action, priority, kpi, timeframe }));
}

module.exports = {
    generateContent,
    getRecommendations,
    getNetZeroPlan
};
