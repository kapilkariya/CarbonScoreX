const DISPLAY_KEYS = ['label', 'name', 'title', 'value', 'level', 'status'];

export function recommendationText(value, fallback = '', depth = 0) {
    if (depth > 2 || value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value.trim() || fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        const values = value.map((item) => recommendationText(item, '', depth + 1)).filter(Boolean);
        return values.length ? values.join(', ') : fallback;
    }
    if (typeof value === 'object') {
        for (const key of DISPLAY_KEYS) {
            if (value[key] !== undefined && value[key] !== value) {
                const text = recommendationText(value[key], '', depth + 1);
                if (text) return text;
            }
        }
    }
    return fallback;
}

export function normalizeRecommendation(recommendation, index = 0) {
    if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) return null;
    const id = recommendationText(recommendation.id, '') || recommendationText(recommendation.key, '') || `recommendation-${index}`;
    return {
        id,
        title: recommendationText(recommendation.title, 'Recommendation'),
        rationale: recommendationText(recommendation.rationale, 'No reason provided.'),
        action: recommendationText(recommendation.action, 'No action details provided.'),
        priority: recommendationText(recommendation.priority, 'Medium'),
        kpi: recommendationText(recommendation.kpi, ''),
        timeframe: recommendationText(recommendation.timeframe, '0-3 months'),
        source: recommendationText(recommendation.source, 'rules'),
        status: recommendationText(recommendation.status, 'unknown').toLowerCase()
    };
}
