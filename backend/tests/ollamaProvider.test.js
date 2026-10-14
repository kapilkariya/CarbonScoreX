jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const aiService = require('../src/services/geminiService');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434/';
  process.env.OLLAMA_MODEL = 'qwen3:4b';
  process.env.OLLAMA_TIMEOUT_MS = '120000';
});

afterAll(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_TIMEOUT_MS;
});

test('Ollama chat receives configured Qwen model and returns its response content', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { content: '{"ok":true}' } } });
  await expect(aiService.generateContent('Return JSON.', 'Be precise.')).resolves.toBe('{"ok":true}');
  expect(axios.post).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
    model: 'qwen3:4b', stream: false, think: false, format: 'json',
    options: { temperature: 0.2, num_predict: 700 },
    messages: [{ role: 'system', content: 'Be precise.' }, { role: 'user', content: 'Return JSON.' }]
  }), { timeout: 120000 });
});

test('Qwen thinking channel is not used and token-limit truncation is rejected', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { thinking: 'internal reasoning', content: '{"ok":true}' }, done_reason: 'stop' } });
  await expect(aiService.generateContent('Return JSON.')).resolves.toBe('{"ok":true}');
  axios.post.mockResolvedValueOnce({ data: { message: { content: '{"ok":' }, done_reason: 'length' } });
  await expect(aiService.generateContent('Return JSON.')).rejects.toThrow('truncated at the output token limit');
});

test('Ollama failures include the host/model in the surfaced error', async () => {
  axios.post.mockRejectedValueOnce(Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' }));
  await expect(aiService.generateContent('prompt')).rejects.toThrow('Ollama (qwen3:4b) request failed at http://localhost:11434: connect refused');
});

test('recommendation prompt includes actual metrics and recent historical submissions', async () => {
  const result = [{ key: 'energy_efficiency', title: 'Reduce avoidable load', reason: 'Energy use is recorded.', action: 'Review large loads.', priority: 'High', kpi: 'Energy kWh', timeframe: '0-3 months' }];
  axios.post.mockResolvedValueOnce({ data: { message: { content: JSON.stringify(result) } } });
  const candidates = [{ key: 'energy_efficiency', title: 'Efficiency', rationale: 'Energy is present.', action: 'Review loads.', evidence: { energy: 4300 } }];
  const recommendations = await aiService.getRecommendations({ energy_consumption: 4300, renewable_energy_pct: 25, history: [{ energy_consumption: 4800, submitted_at: '2025-01-01' }] }, candidates);
  expect(recommendations[0]).toMatchObject({ priority: 'High', kpi: 'Energy kWh', timeframe: '0-3 months' });
  const body = axios.post.mock.calls[0][1];
  expect(body.messages[1].content).toContain('"energy_consumption":4300');
  expect(body.messages[1].content).toContain('"energy_consumption":4800');
  expect(body.options).toEqual({ temperature: 0.2, num_predict: 700 });
  expect(body.format.properties.recommendations.items.required).toContain('timeframe');
});

test('recommendation prompt bounds history to three relevant metric snapshots', async () => {
  const output = { recommendations: [{ key: 'energy_efficiency', title: 'Review energy use', reason: 'Current energy use is recorded.', action: 'Review major loads.', priority: 'High', kpi: 'Energy consumption (kWh)', timeframe: '0-3 months' }] };
  axios.post.mockResolvedValueOnce({ data: { message: { content: JSON.stringify(output) } } });
  const history = Array.from({ length: 8 }, (_, index) => ({ submitted_at: `2025-0${index + 1}-01`, energy_consumption: 4300 - index, irrelevant_private_field: 'x'.repeat(1000) }));
  await aiService.getRecommendations({ energy_consumption: 4300, history }, [{ key: 'energy_efficiency', action: 'Review loads.', evidence: { energy: 4300 } }]);
  const prompt = axios.post.mock.calls[0][1].messages[1].content;
  expect(prompt.match(/"submitted_at"/g)).toHaveLength(3);
  expect(prompt).not.toContain('irrelevant_private_field');
  expect(prompt).toContain('"energy_consumption":4299');
});

test('malformed model JSON is rejected for the existing rule fallback', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { content: '{"recommendations":[' }, done_reason: 'stop' } });
  await expect(aiService.getRecommendations({ energy_consumption: 4300 }, [{ key: 'energy_efficiency' }])).rejects.toThrow(SyntaxError);
});

test('Net Zero planning also uses the configured Ollama model', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { content: JSON.stringify({ executiveSummary: 'Close the missing inventory data first.', priorities: [], roadmap: ['Assign owners.', 'Collect fuel data.', 'Document electricity factors.', 'Screen suppliers.', 'Review progress.'] }) } } });
  const plan = await aiService.getNetZeroPlan({
    company: { company_name: 'Example Works', industry: 'Manufacturing' },
    assessment: { scopes: { scope1: null, scope2: null, scope3: null, total: null, complete: false }, period: { start: '2025-01-01', end: '2025-12-31' }, data: { energy_consumption: 4300, renewable_energy_pct: 25, emissions_co2: 12, waste_recycled_pct: 40, water_usage: 700, production_volume: 80 } },
    recommendations: [{ title: 'Measure fuel use', action: 'Record fuel purchases.', priority: 'High', kpi: 'Fuel activity records', timeframe: '0-3 months' }]
  });
  expect(plan.analysisSource).toBe('ollama AI-assisted draft');
  expect(plan.priorities).toEqual(['Measure fuel use: Record fuel purchases.']);
  expect(axios.post.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  expect(axios.post.mock.calls[0][1].messages[1].content).toContain('Scope 1 tCO2e: missing');
});

test('recommendation output introducing an unsupported numeric claim is rejected', async () => {
  axios.post.mockResolvedValueOnce({ data: { message: { content: JSON.stringify({ recommendations: [{
    key: 'energy_efficiency', title: 'Review energy use', reason: 'Consumption is 430 kWh.', action: 'Review equipment.',
    priority: 'High', kpi: 'Energy consumption (kWh)', timeframe: '0-3 months'
  }] }) } } });
  const candidates = [{ key: 'energy_efficiency', rationale: 'Submitted energy consumption is 4300 kWh.', evidence: { energy: 4300 } }];
  await expect(aiService.getRecommendations({ energy_consumption: 4300 }, candidates)).rejects.toThrow('AI response did not match the validated recommendation candidates');
});
