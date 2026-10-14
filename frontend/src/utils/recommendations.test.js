import { normalizeRecommendation } from './recommendations';

test('normalizes recommendation objects into safe display fields', () => {
    const recommendation = normalizeRecommendation({
        id: 12,
        key: 'energy_efficiency',
        title: 'Review energy use',
        rationale: 'Energy use is recorded.',
        action: 'Inspect major loads.',
        priority: { level: 'High' },
        kpi: ['Energy kWh', 'Energy intensity'],
        timeframe: { label: '0-3 months' },
        evidence: { energy: 4300 },
        status: { status: 'active' },
        source: 'ai'
    });

    expect(recommendation).toEqual({
        id: '12',
        title: 'Review energy use',
        rationale: 'Energy use is recorded.',
        action: 'Inspect major loads.',
        priority: 'High',
        kpi: 'Energy kWh, Energy intensity',
        timeframe: '0-3 months',
        source: 'ai',
        status: 'active'
    });
});

test('provides readable defaults for missing fields and rejects non-object entries', () => {
    expect(normalizeRecommendation({ id: {}, title: {}, status: [], priority: null })).toMatchObject({
        id: 'recommendation-0',
        title: 'Recommendation',
        rationale: 'No reason provided.',
        action: 'No action details provided.',
        priority: 'Medium',
        kpi: '',
        timeframe: '0-3 months',
        status: 'unknown'
    });
    expect(normalizeRecommendation('not an object')).toBeNull();
});
