const PDFDocument = require('pdfkit');

const COLORS = {
  ink: '#17324D', muted: '#60758A', green: '#14805E', pale: '#EAF5F0',
  blue: '#2563A6', paleBlue: '#EEF4FA', amber: '#B7791F', line: '#D8E1E8',
  red: '#B54747', white: '#FFFFFF', light: '#F5F8FA'
};

const asObject = (value) => {
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {}; } catch (_) { return {}; }
  }
  return value && typeof value === 'object' ? value : {};
};

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const valueAsNumber = Number(value);
  return Number.isFinite(valueAsNumber) && valueAsNumber >= 0 ? valueAsNumber : null;
};

function readScopes(data) {
  const energy = numberOrNull(data.energy_consumption);
  const electricity = numberOrNull(data.electricity_consumption_kwh);
  const factor = numberOrNull(data.electricity_grid_factor_kg_kwh);
  const scope1Keys = [
    'scope1_stationary_combustion_tco2e', 'scope1_mobile_combustion_tco2e',
    'scope1_process_tco2e', 'scope1_fugitive_tco2e'
  ];
  const scope1Categories = scope1Keys.map((key) => ({ key, value: numberOrNull(data[key]) }));
  const enteredScope1Categories = scope1Categories.filter((item) => item.value !== null);
  const scope1CategoryTotal = enteredScope1Categories.length
    ? enteredScope1Categories.reduce((sum, item) => sum + item.value, 0)
    : null;
  const scope1 = numberOrNull(data.scope1_tco2e) ?? scope1CategoryTotal;
  const scope2 = electricity !== null && factor !== null ? electricity * factor / 1000 : null;
  const categoryKeys = [
    'scope3_purchased_goods_tco2e', 'scope3_transport_tco2e', 'scope3_waste_tco2e',
    'scope3_business_travel_tco2e', 'scope3_other_tco2e'
  ];
  const categories = categoryKeys.map((key) => ({ key, value: numberOrNull(data[key]) }));
  const enteredCategories = categories.filter((item) => item.value !== null);
  const categoryTotal = enteredCategories.length
    ? enteredCategories.reduce((sum, item) => sum + item.value, 0)
    : null;
  const scope3 = numberOrNull(data.scope3_total_tco2e) ?? categoryTotal;
  const known = [scope1, scope2, scope3].filter((value) => value !== null);
  const complete = known.length === 3;
  return {
    scope1, scope2, scope3, knownSubtotal: known.reduce((sum, value) => sum + value, 0),
    complete, knownCount: known.length, total: complete ? known.reduce((sum, value) => sum + value, 0) : null,
    energy, electricity, factor, categories, enteredCategories, enteredScope1Categories, scope1CategoryTotal,
    legacyReported: numberOrNull(data.emissions_co2)
  };
}

function periodFor(data, submittedAt) {
  const start = data.reporting_period_start || null;
  const end = data.reporting_period_end || null;
  if (start && end) return { start: String(start).slice(0, 10), end: String(end).slice(0, 10), stated: true };
  const date = new Date(submittedAt || Date.now());
  const fallback = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = fallback.toISOString().slice(0, 10);
  return { start: day, end: day, stated: false };
}

function buildAssessment(company, historyRows) {
  const rows = historyRows || [];
  const latest = rows.length ? rows[rows.length - 1] : company;
  const data = asObject(latest.data);
  const scopes = readScopes(data);
  const period = periodFor(data, latest.submitted_at || company.submitted_at);
  const history = rows.map((row) => {
    const rowData = asObject(row.data);
    const rowScopes = readScopes(rowData);
    return {
      period: periodFor(rowData, row.submitted_at),
      total: rowScopes.total,
      knownSubtotal: rowScopes.knownSubtotal,
      complete: rowScopes.complete,
      energy: rowScopes.energy,
      water: numberOrNull(rowData.water_usage),
      recycling: numberOrNull(rowData.waste_recycled_pct),
      production: numberOrNull(rowData.production_volume),
      score: numberOrNull(rowData.carbon_score)
    };
  });
  const completeness = Math.round(scopes.knownCount / 3 * 100);
  return {
    data, scopes, period, history, completeness,
    generatedAt: new Date(),
    limitations: [
      !period.stated && 'The submission did not include a reporting period; its submission date is shown instead.',
      scopes.scope1 === null && 'Scope 1 emissions were not provided and are excluded from the calculated inventory total.',
      scopes.scope2 === null && 'Scope 2 could not be calculated because electricity consumption or a company-supplied grid factor is missing.',
      scopes.scope3 === null && 'Scope 3 emissions were not provided and are excluded from the calculated inventory total.',
      scopes.legacyReported !== null && 'The legacy CO2 emissions field has no stated scope boundary and is displayed separately to avoid double counting.',
      'The current submission form does not separately capture the publication year or geography of an electricity emission factor; confirm those details against the supplied reference.',
      !data.electricity_factor_source && scopes.scope2 !== null && 'No source was supplied for the electricity emission factor; the factor is unverified.',
      data.data_quality_notes && `Company data-quality note: ${String(data.data_quality_notes)}`
    ].filter(Boolean)
  };
}

/** Build a transparent linear-reduction scenario; this is not a forecast or commitment. */
function buildNetZeroPathway(assessment, targetYear, annualReductionPct) {
  const eligibleBaselines = (assessment.history || []).filter((item) => item.complete);
  const selectedBaseline = eligibleBaselines[eligibleBaselines.length - 1] || (assessment.scopes.complete
    ? { total: assessment.scopes.total, period: assessment.period }
    : null);
  const baselinePeriod = selectedBaseline?.period || assessment.period;
  const baselineYear = Number(String(baselinePeriod.end || baselinePeriod.start || '').slice(0, 4));
  const target = Number(targetYear);
  const annualRate = Number(annualReductionPct);
  const baseline = selectedBaseline?.total ?? null;
  if (!Number.isInteger(baselineYear) || baselineYear < 1900 || baseline === null) {
    return { available: false, reason: 'A complete Scope 1, Scope 2 and Scope 3 baseline is required.' };
  }
  if (!Number.isInteger(target) || target <= baselineYear || target > 2100) {
    return { available: false, reason: `Choose a target year after the ${baselineYear} baseline and no later than 2100.` };
  }
  if (!Number.isFinite(annualRate) || annualRate <= 0 || annualRate > 100) {
    return { available: false, reason: 'Enter an annual reduction rate greater than 0% and no more than 100% of baseline emissions.' };
  }
  const yearsToZero = baseline === 0 ? 0 : Math.ceil(100 / annualRate - 1e-10);
  const estimatedTargetYear = baselineYear + yearsToZero;
  const trajectory = [];
  for (let year = baselineYear; year <= target; year += 1) {
    trajectory.push({ year, emissions: Math.max(0, baseline * (1 - annualRate / 100 * (year - baselineYear))) });
  }
  const historical = assessment.history.filter((item) => item.complete).map((item) => ({
    year: Number(String(item.period.end || item.period.start).slice(0, 4)), emissions: item.total
  })).filter((item) => Number.isInteger(item.year));
  return {
    available: true,
    baselineYear,
    baselinePeriod,
    baselineEmissions: baseline,
    currentEmissions: assessment.scopes.complete ? assessment.scopes.total : null,
    targetYear: target,
    annualReductionPct: annualRate,
    annualReductionTco2e: baseline * annualRate / 100,
    targetEmissions: trajectory[trajectory.length - 1].emissions,
    estimatedTargetYear,
    reductionAtTargetPct: baseline === 0 ? 100 : (baseline - trajectory[trajectory.length - 1].emissions) / baseline * 100,
    trajectory,
    historical,
    method: 'Linear absolute reduction at the selected annual percentage of baseline emissions; offsets are excluded. Scenario values are deterministic arithmetic and are not a forecast or approved target.'
  };
}

/** Deterministic report planning text grounded in the saved assessment and actions. */
function buildNetZeroPlan({ company = {}, assessment, recommendations = [] }) {
  const scopes = assessment.scopes;
  const gaps = [];
  if (scopes.scope1 === null) gaps.push('Establish the Scope 1 baseline from documented direct-emission sources.');
  if (scopes.scope2 === null) gaps.push('Collect purchased-electricity activity and a documented grid factor to calculate Scope 2.');
  if (scopes.scope3 === null) gaps.push('Screen material value-chain categories and quantify Scope 3.');
  const executiveSummary = scopes.complete
    ? `${company.company_name || 'The company'} has a complete preliminary scope inventory of ${scopes.total.toFixed(2)} tCO2e based on submitted values. The inventory and any pathway are planning inputs, not independently verified results.`
    : `${company.company_name || 'The company'} has an incomplete scope inventory. ${scopes.knownCount} of 3 scopes are quantified; missing scopes are excluded rather than treated as zero. Complete the data gaps before setting a quantified pathway.`;
  const priorities = recommendations.slice(0, 5).map((item) => `${item.priority || 'Medium'} priority — ${item.title}: ${item.action}`);
  if (!priorities.length) priorities.push(...gaps);
  if (!priorities.length) priorities.push('Review submitted activity data and retain source records for each reporting period.');
  const roadmap = [
    ...gaps,
    ...recommendations.slice(0, Math.max(0, 5 - gaps.length)).map((item) => `${item.timeframe || 'Ongoing'}: ${item.title}. Measure: ${item.kpi || 'Track the submitted metric against its documented baseline.'}`),
    'Review the inventory, factor references, action owners and measured progress at the next reporting period.'
  ].slice(0, 5);
  if (!roadmap.length) roadmap.push('Review the inventory, factor references, action owners and measured progress at the next reporting period.');
  return {
    executiveSummary,
    priorities,
    roadmap,
    analysisSource: 'Deterministic CarbonScoreX guidance based on submitted assessment data',
    recommendationSource: recommendations.some((item) => item.source === 'classifier')
      ? 'The classifier selected recommendation categories; detailed actions and evidence use backend rules and submitted data.'
      : 'Recommendations use deterministic backend rules and submitted data.',
    recommendations
  };
}

const safeFileName = (value) => String(value || 'company').normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'company';

function generate(response, { company, assessment, aiPlan, pathway }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 52, left: 56, right: 56 }, bufferPages: true, info: { Title: 'Industrial Carbon Footprint Assessment and Net Zero Roadmap', Author: 'CarbonScoreX' } });
  doc.pipe(response);
  let y = 56;
  let pageNumber = 1;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 112;
  const bottom = () => doc.page.height - 58;
  const fmt = (value, digits = 2) => value === null || value === undefined ? 'Not available' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const dateFmt = (value) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value || 'Not stated') : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const drawHeader = (title) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text('CARBONSCOREX  /  INDUSTRIAL GHG ASSESSMENT', 56, 30, { characterSpacing: 0.7 });
    doc.moveTo(56, 46).lineTo(pageWidth - 56, 46).strokeColor(COLORS.line).lineWidth(0.7).stroke();
    if (title) doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(title, 56, 50, { width: contentWidth, align: 'right' });
  };
  const addPage = (title) => {
    doc.addPage(); pageNumber += 1; y = 74; doc.y = y; doc.x = 56; drawHeader(title); doc.y = y;
  };
  const ensure = (height, section) => { if (y + height > bottom()) addPage(section); };
  const sectionTitle = (title, kicker) => {
    ensure(52, title);
    if (kicker) doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.green).text(kicker.toUpperCase(), 56, y, { characterSpacing: 1 });
    y += kicker ? 14 : 0;
    doc.font('Helvetica-Bold').fontSize(19).fillColor(COLORS.ink).text(title, 56, y, { width: contentWidth });
    y += 30;
  };
  const paragraph = (text, opts = {}) => {
    const fontSize = opts.fontSize || 9.5;
    const lineGap = opts.lineGap === undefined ? 4 : opts.lineGap;
    const width = opts.width || contentWidth;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const height = doc.heightOfString(String(text || ''), { width, lineGap });
    ensure(height + 4, opts.section || 'Assessment');
    doc.fillColor(opts.color || COLORS.ink).text(String(text || ''), opts.x || 56, y, { width, lineGap });
    y += height + (opts.after === undefined ? 8 : opts.after);
  };
  const bullet = (text, color = COLORS.ink) => {
    ensure(28, 'Assessment');
    doc.circle(62, y + 5, 2).fill(COLORS.green);
    paragraph(text, { x: 72, width: contentWidth - 16, color, after: 5 });
  };
  const card = (x, top, width, label, value, detail, accent = COLORS.green) => {
    doc.roundedRect(x, top, width, 66, 7).fill(COLORS.light).stroke(COLORS.line);
    doc.roundedRect(x, top, 4, 66, 2).fill(accent);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x + 12, top + 10, { width: width - 20, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.ink).text(value, x + 12, top + 25, { width: width - 20, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(detail || '', x + 12, top + 49, { width: width - 20, lineBreak: false, ellipsis: true });
  };
  const table = (headers, rows, widths, title) => {
    const rowHeight = 23;
    ensure(34 + rowHeight * Math.min(rows.length + 1, 4), title || 'Inventory');
    const drawHeaderRow = () => {
      doc.rect(56, y, contentWidth, 25).fill(COLORS.ink);
      let x = 64;
      headers.forEach((head, index) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white).text(head, x, y + 8, { width: widths[index] - 12, ellipsis: true });
        x += widths[index];
      });
      y += 25;
    };
    drawHeaderRow();
    rows.forEach((row, rowIndex) => {
      ensure(rowHeight + 4, title || 'Inventory');
      if (y === 74) drawHeaderRow();
      doc.rect(56, y, contentWidth, rowHeight).fill(rowIndex % 2 === 0 ? COLORS.light : COLORS.white);
      let x = 64;
      row.forEach((value, index) => {
        doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLORS.ink).text(String(value ?? ''), x, y + 7, { width: widths[index] - 12, ellipsis: true });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 10;
  };
  const barChart = (items, heading, unit = 'tCO2e') => {
    ensure(155, heading);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(heading, 56, y);
    y += 19;
    const maxValue = Math.max(1, ...items.map((item) => item.value || 0));
    items.forEach((item) => {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(item.label, 56, y + 3, { width: 94, lineBreak: false, ellipsis: true });
      const chartX = 154;
      const chartWidth = contentWidth - 205;
      doc.roundedRect(chartX, y, chartWidth, 14, 4).fill(COLORS.paleBlue);
      if (item.value !== null) doc.roundedRect(chartX, y, Math.max(2, chartWidth * item.value / maxValue), 14, 4).fill(item.color || COLORS.green);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.ink).text(item.value === null ? 'N/A' : `${fmt(item.value)} ${unit}`, chartX + chartWidth + 9, y + 3, { width: 95, lineBreak: false });
      y += 23;
    });
    y += 6;
  };
  const pathwayChart = (items, historical, heading) => {
    ensure(176, heading);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(heading, 56, y);
    y += 18;
    const x = 82; const top = y; const width = contentWidth - 38; const height = 112;
    const years = [...items.map((item) => item.year), ...historical.map((item) => item.year)];
    const firstYear = Math.min(...years); const lastYear = Math.max(...years);
    const maxValue = Math.max(1, ...items.map((item) => item.emissions), ...historical.map((item) => item.emissions));
    const xFor = (year) => x + (lastYear === firstYear ? 0 : (year - firstYear) / (lastYear - firstYear) * width);
    const yFor = (value) => top + height - value / maxValue * height;
    for (let step = 0; step <= 4; step += 1) {
      const gridY = top + height * step / 4;
      doc.moveTo(x, gridY).lineTo(x + width, gridY).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted).text(fmt(maxValue * (4 - step) / 4, 1), 56, gridY - 3, { width: 22, align: 'right' });
    }
    const drawSeries = (points, color, dashed = false) => {
      if (!points.length) return;
      if (points.length > 1) {
        if (dashed) doc.dash(4, { space: 3 });
        doc.moveTo(xFor(points[0].year), yFor(points[0].emissions));
        points.slice(1).forEach((point) => doc.lineTo(xFor(point.year), yFor(point.emissions)));
        doc.strokeColor(color).lineWidth(2).stroke();
      }
      if (dashed) doc.undash();
      points.forEach((point) => doc.circle(xFor(point.year), yFor(point.emissions), 2.5).fill(color));
    };
    drawSeries(items, COLORS.green, true);
    drawSeries(historical.slice().sort((a, b) => a.year - b.year), COLORS.blue);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(String(firstYear), x, top + height + 6);
    doc.text(String(lastYear), x + width - 24, top + height + 6);
    doc.fillColor(COLORS.blue).circle(x + 8, top + height + 23, 3).fill();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('Measured complete inventory', x + 16, top + height + 19);
    doc.fillColor(COLORS.green).circle(x + 190, top + height + 23, 3).fill();
    doc.text('Selected reduction scenario', x + 198, top + height + 19);
    y = top + height + 38;
  };
  const fmtPeriod = (period) => `${dateFmt(period.start)} - ${dateFmt(period.end)}`;
  const scopes = assessment.scopes;
  const d = assessment.data;
  const fullTotal = scopes.total;
  const contributions = fullTotal && fullTotal > 0 ? [
    { label: 'Scope 1', value: scopes.scope1, color: COLORS.amber },
    { label: 'Scope 2', value: scopes.scope2, color: COLORS.blue },
    { label: 'Scope 3', value: scopes.scope3, color: COLORS.green }
  ].filter((item) => item.value !== null).map((item) => ({ ...item, share: item.value / fullTotal * 100 })) : [];

  // Cover page
  doc.rect(0, 0, pageWidth, doc.page.height).fill('#F1F7F4');
  doc.rect(0, 0, pageWidth, 12).fill(COLORS.green);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.green).text('CARBONSCOREX', 56, 70, { characterSpacing: 2 });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('INDUSTRIAL SUSTAINABILITY INTELLIGENCE', 56, 92, { characterSpacing: 1 });
  doc.roundedRect(56, 164, contentWidth, 218, 12).fill(COLORS.ink);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(COLORS.white).text('Industrial Carbon\nFootprint Assessment', 80, 200, { width: contentWidth - 48, lineGap: 7 });
  doc.font('Helvetica').fontSize(20).fillColor('#B8E3D2').text('and Net Zero Roadmap', 80, 294);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink).text(company.company_name || 'Company', 56, 425, { width: contentWidth });
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(company.industry || 'Industry not specified', 56, 449);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text('REPORTING PERIOD', 56, 497, { characterSpacing: 0.6 });
  doc.font('Helvetica').fontSize(10).text(fmtPeriod(assessment.period), 56, 514);
  doc.font('Helvetica-Bold').fontSize(9).text('GENERATED', 56, 546, { characterSpacing: 0.6 });
  doc.font('Helvetica').fontSize(10).text(assessment.generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 56, 563);
  doc.roundedRect(56, 623, contentWidth, 66, 7).fill('#FFF6E5').stroke('#E8D6B3');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.amber).text('PRELIMINARY MANAGEMENT ASSESSMENT', 70, 636);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink).text('Prepared from company-submitted data for planning and academic use. This report is not independently verified, certified, audit-ready, or a legal compliance opinion.', 70, 652, { width: contentWidth - 28, lineGap: 2 });

  addPage('Report Contents');
  sectionTitle('Report Contents', '00 / Navigation');
  [
    'Executive summary and key indicators',
    'Assessment purpose and methodology',
    'Company activity and environmental profile',
    'Emissions inventory, calculations and scope detail',
    'Performance indicators and historical comparisons',
    'Recommendations and improvement opportunities',
    'Net Zero scenario and implementation roadmap',
    'Data quality, limitations and next steps'
  ].forEach((item) => bullet(item));

  // Executive summary
  addPage('Executive Summary');
  sectionTitle('Executive Summary', '01 / Overview');
  const summary = scopes.complete
    ? `The submitted inventory records ${fmt(fullTotal)} tCO2e across Scopes 1, 2 and 3 for ${fmtPeriod(assessment.period)}. The result is a preliminary calculation based on the data and factor disclosures shown in this report.`
    : scopes.knownCount
      ? `A complete company-wide total cannot be calculated from the submitted information. ${fmt(scopes.knownSubtotal)} tCO2e is the known subtotal for the ${scopes.knownCount} of 3 scopes with sufficient data; missing scopes are not treated as zero.`
      : 'No scope emissions values were submitted, so a company-wide total or known-scope subtotal cannot be calculated. Missing data is not treated as zero.';
  paragraph(summary, { fontSize: 10.5, after: 14 });
  const gap = 12;
  const cardW = (contentWidth - gap) / 2;
  card(56, y, cardW, 'Inventory total', fullTotal === null ? 'Incomplete' : `${fmt(fullTotal)} tCO2e`, fullTotal === null ? (scopes.knownCount ? 'Known scopes subtotal shown below' : 'No scopes quantified') : 'Calculated across all 3 scopes', fullTotal === null ? COLORS.amber : COLORS.green);
  card(56 + cardW + gap, y, cardW, 'Scope completeness', `${assessment.completeness}%`, `${scopes.knownCount} of 3 scopes quantified`, COLORS.blue);
  card(56, y + 76, cardW, 'Energy use', `${fmt(numberOrNull(d.energy_consumption), 0)} kWh`, 'Company-submitted energy consumption');
  card(56 + cardW + gap, y + 76, cardW, 'Renewable share', numberOrNull(d.renewable_energy_pct) === null ? 'N/A' : `${fmt(d.renewable_energy_pct, 1)}%`, 'Reported share; not used as an offset');
  y += 158;
  table(['GHG SCOPE', 'CALCULATED / REPORTED', 'SHARE OF TOTAL'], [
    ['Scope 1 - direct', scopes.scope1 === null ? 'Not provided' : `${fmt(scopes.scope1)} tCO2e`, contributions.find((item) => item.label === 'Scope 1') ? `${fmt(contributions.find((item) => item.label === 'Scope 1').share, 1)}%` : 'N/A'],
    ['Scope 2 - purchased electricity', scopes.scope2 === null ? 'Not calculable' : `${fmt(scopes.scope2)} tCO2e`, contributions.find((item) => item.label === 'Scope 2') ? `${fmt(contributions.find((item) => item.label === 'Scope 2').share, 1)}%` : 'N/A'],
    ['Scope 3 - value chain', scopes.scope3 === null ? 'Not provided' : `${fmt(scopes.scope3)} tCO2e`, contributions.find((item) => item.label === 'Scope 3') ? `${fmt(contributions.find((item) => item.label === 'Scope 3').share, 1)}%` : 'N/A']
  ], [105, 195, 183], 'Executive Summary');
  paragraph(`Operations snapshot: water ${fmt(numberOrNull(d.water_usage), 0)} L; waste recycling ${numberOrNull(d.waste_recycled_pct) === null ? 'not stated' : `${fmt(d.waste_recycled_pct, 1)}%`}; employees ${fmt(numberOrNull(d.employee_count), 0)}; production ${fmt(numberOrNull(d.production_volume), 0)} (unit not stated).`, { fontSize: 8.5 });
  if (fullTotal !== null && numberOrNull(d.production_volume) > 0) paragraph(`Emissions intensity: ${fmt(fullTotal / Number(d.production_volume), 4)} tCO2e per reported production unit. Production unit and product mix were not specified.`, { fontSize: 8.5 });
  if (fullTotal !== null && numberOrNull(d.employee_count) > 0) paragraph(`Emissions per employee: ${fmt(fullTotal / Number(d.employee_count), 3)} tCO2e per employee.`, { fontSize: 8.5 });
  paragraph(`${aiPlan.analysisSource || 'Planning analysis'}: ${aiPlan.executiveSummary}`, { fontSize: 9.5, color: COLORS.ink });

  // Objectives and boundary
  addPage('Introduction and Methodology');
  sectionTitle('Introduction and Assessment Objectives', '02 / Purpose');
  paragraph('A greenhouse gas (GHG) inventory organizes emissions associated with an organization and its value chain into defined scopes. Scope 1 covers direct emissions from sources the organization owns or controls. Scope 2 covers indirect emissions from purchased electricity, steam, heat or cooling. Scope 3 covers other indirect value-chain emissions.');
  paragraph('This assessment summarizes the company-submitted operational information, quantifies only emissions supported by explicit inputs and a disclosed calculation, and provides preliminary reduction planning. It is intended to support management discussion, sustainability planning and academic evaluation.');
  paragraph(`Organizational boundary: ${company.company_name || 'Company'}; company record held in CarbonScoreX. Reporting period: ${fmtPeriod(assessment.period)}${assessment.period.stated ? '' : ' (submission date used because no period was stated)'}. The record contains operational indicators and optional scope data; no facility-level boundary, consolidation policy or assurance evidence was supplied.`);
  sectionTitle('Methodology and Calculation Basis', '03 / Transparent calculation');
  paragraph('Scope 1 and Scope 3 amounts are company-entered tCO2e values. Where a scope total is absent, entered source categories are summed. If a total and category values are both entered, the total is used and the category split is shown separately; any difference is unreconciled.');
  paragraph('Scope 2 is calculated for purchased electricity as consumption (kWh) multiplied by the company-supplied electricity emission factor (kg CO2e/kWh), divided by 1,000. The factor and its source are displayed below. This is a location-based estimate when the factor represents the relevant grid. Renewable-energy percentage is not subtracted, no market-based contractual instruments are assumed, and purchased steam, heat or cooling are not captured.');
  paragraph('Reported inventory total = Scope 1 + Scope 2 + Scope 3 only when all three are quantified. If any scope is missing, only a labeled known-scope subtotal is shown; missing data is never silently treated as zero. The legacy CO2 field is not assigned to a scope and is excluded from the scope total. No default emission factors, offsets, avoided emissions or ML score are used as GHG emissions.');
  paragraph('Data basis: activity data and emissions inputs submitted to CarbonScoreX by the company. No factor library, meter invoices, fuel records, supplier records or independent verification evidence were provided through this assessment workflow. Results are therefore preliminary estimates and should be reviewed against source records before external disclosure.');

  // Inventory details
  addPage('Emissions Inventory');
  sectionTitle('Emissions Inventory and Activity Data', '04 / Results');
  paragraph(`Reporting period: ${fmtPeriod(assessment.period)}. Emissions unit: metric tonnes of carbon dioxide equivalent (tCO2e), as entered or calculated. Values are not independently verified.`);
  table(['SOURCE / INDICATOR', 'VALUE', 'BASIS / NOTE'], [
    ['Scope 1 - direct', scopes.scope1 === null ? 'Not provided' : `${fmt(scopes.scope1)} tCO2e`, 'Company-entered total; source categories shown when supplied'],
    ['Scope 2 - electricity', scopes.scope2 === null ? 'Not calculable' : `${fmt(scopes.scope2)} tCO2e`, scopes.scope2 === null ? 'Needs purchased electricity kWh and grid factor' : `${fmt(scopes.electricity, 0)} kWh x ${fmt(scopes.factor, 4)} kg/kWh / 1,000`],
    ['Purchased electricity', scopes.electricity === null ? 'Not supplied' : `${fmt(scopes.electricity, 0)} kWh`, 'Activity data used for the Scope 2 calculation'],
    ['Electricity factor source', d.electricity_factor_source || 'Not supplied', d.electricity_factor_source ? 'Company-supplied reference' : 'Factor cannot be independently checked'],
    ['Scope 3 - total', scopes.scope3 === null ? 'Not provided' : `${fmt(scopes.scope3)} tCO2e`, numberOrNull(d.scope3_total_tco2e) !== null ? 'Company-entered total' : 'Sum of entered categories'],
    ['Legacy reported CO2', scopes.legacyReported === null ? 'Not supplied' : `${fmt(scopes.legacyReported)} tCO2e`, 'Unassigned scope; excluded from inventory total'],
    ['Energy consumption', fmt(numberOrNull(d.energy_consumption), 0) + ' kWh', 'Activity indicator; unit assumed as submitted'],
    ['Renewable energy usage', numberOrNull(d.renewable_energy_pct) === null ? 'Not supplied' : `${fmt(d.renewable_energy_pct, 1)}%`, 'Company-reported share; not deducted from emissions'],
    ['Water usage', fmt(numberOrNull(d.water_usage), 0) + ' L', 'Activity indicator; unit assumed as submitted'],
    ['Waste recycling', numberOrNull(d.waste_recycled_pct) === null ? 'Not supplied' : `${fmt(d.waste_recycled_pct, 1)}%`, 'Company-reported rate'],
    ['Production volume', fmt(numberOrNull(d.production_volume), 0), 'Production unit not specified'],
    ['Employee count', fmt(numberOrNull(d.employee_count), 0), 'Company-submitted; headcount period is not stated']
  ], [130, 90, 253], 'Emissions Inventory');
  if (scopes.complete) barChart([
    { label: 'Scope 1', value: scopes.scope1, color: COLORS.amber },
    { label: 'Scope 2', value: scopes.scope2, color: COLORS.blue },
    { label: 'Scope 3', value: scopes.scope3, color: COLORS.green }
  ], 'Emissions by scope');
  if (scopes.enteredCategories.length) {
    table(['SCOPE 3 CATEGORY', 'AMOUNT'], scopes.enteredCategories.map((item) => [
      ({ scope3_purchased_goods_tco2e: 'Purchased goods and services', scope3_transport_tco2e: 'Upstream transportation', scope3_waste_tco2e: 'Waste generated in operations', scope3_business_travel_tco2e: 'Business travel', scope3_other_tco2e: 'Other value-chain sources' })[item.key], `${fmt(item.value)} tCO2e`
    ]), [290, 183], 'Scope 3 detail');
    const categorySum = scopes.enteredCategories.reduce((sum, item) => sum + item.value, 0);
    if (numberOrNull(d.scope3_total_tco2e) !== null && Math.abs(categorySum - scopes.scope3) > 0.01) paragraph(`Scope 3 reconciliation note: entered categories sum to ${fmt(categorySum)} tCO2e, compared with the reported total of ${fmt(scopes.scope3)} tCO2e. Difference: ${fmt(categorySum - scopes.scope3)} tCO2e.`, { color: COLORS.amber, fontSize: 8.5 });
  }
  if (scopes.enteredScope1Categories.length) {
    table(['SCOPE 1 SOURCE CATEGORY', 'AMOUNT'], scopes.enteredScope1Categories.map((item) => [
      ({ scope1_stationary_combustion_tco2e: 'Stationary fuel combustion', scope1_mobile_combustion_tco2e: 'Mobile combustion', scope1_process_tco2e: 'Process emissions', scope1_fugitive_tco2e: 'Fugitive / refrigerant emissions' })[item.key], `${fmt(item.value)} tCO2e`
    ]), [290, 183], 'Scope 1 detail');
    if (numberOrNull(d.scope1_tco2e) !== null && Math.abs(scopes.scope1CategoryTotal - scopes.scope1) > 0.01) paragraph(`Scope 1 reconciliation note: entered source categories sum to ${fmt(scopes.scope1CategoryTotal)} tCO2e, compared with the reported total of ${fmt(scopes.scope1)} tCO2e. Difference: ${fmt(scopes.scope1CategoryTotal - scopes.scope1)} tCO2e.`, { color: COLORS.amber, fontSize: 8.5 });
  }

  // Historical comparison
  addPage('Performance and Comparison');
  sectionTitle('Performance and Year-to-Year Comparison', '05 / Trend');
  const completeHistory = assessment.history.filter((item) => item.complete);
  if (completeHistory.length > 1) {
    const yearMap = new Map();
    completeHistory.forEach((item) => {
      const year = String(item.period.end || item.period.start).slice(0, 4);
      const prior = yearMap.get(year);
      yearMap.set(year, prior ? { total: prior.total + item.total, count: prior.count + 1 } : { total: item.total, count: 1 });
    });
    const yearly = [...yearMap.entries()].map(([year, value]) => ({ year, total: value.total / value.count })).sort((a, b) => a.year.localeCompare(b.year));
    paragraph('The chart shows the average of complete submitted inventory totals by reporting year. Multiple submissions in one year are averaged; incomplete submissions are omitted. Different periods or boundaries can limit comparability.');
    barChart(yearly.slice(-6).map((item) => ({ label: item.year, value: item.total })), 'Complete inventory total by year (tCO2e)');
    if (yearly.length > 1) {
      const prior = yearly[yearly.length - 2]; const current = yearly[yearly.length - 1];
      const change = prior.total === 0 ? null : (current.total - prior.total) / prior.total * 100;
      paragraph(change === null ? `Latest-year total is ${fmt(current.total)} tCO2e; the previous-year baseline is zero, so a percentage change is not meaningful.` : `Latest complete year: ${fmt(current.total)} tCO2e (${current.year}), compared with ${fmt(prior.total)} tCO2e (${prior.year}), a ${change > 0 ? 'increase' : 'decrease'} of ${fmt(Math.abs(change), 1)}%.`, { bold: true });
    }
  } else {
    paragraph('Year-to-year comparison is not available because at least two submissions with complete Scope 1, Scope 2 and Scope 3 totals are required. Historical CarbonScoreX scores are not substituted for emissions data.');
  }
  const activityRows = assessment.history.filter((item) => item.energy !== null || item.water !== null || item.recycling !== null);
  const activityYears = [...new Set(activityRows.map((item) => String(item.period.end || item.period.start).slice(0, 4)))].sort();
  if (activityYears.length > 1) {
    paragraph('Operational trends below show the average submitted value per reporting year. They are contextual indicators and should only be compared when periods, facility boundaries and units are consistent.', { fontSize: 8.5 });
    const energyByYear = activityYears.map((year) => {
      const values = activityRows.filter((item) => String(item.period.end || item.period.start).slice(0, 4) === year).map((item) => item.energy).filter((value) => value !== null);
      return { label: year, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
    });
    barChart(energyByYear, 'Average submitted energy consumption by year', 'kWh');
    const recyclingByYear = activityYears.map((year) => {
      const values = activityRows.filter((item) => String(item.period.end || item.period.start).slice(0, 4) === year).map((item) => item.recycling).filter((value) => value !== null);
      return { label: year, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
    });
    barChart(recyclingByYear, 'Average submitted waste recycling rate by year', '%');
  } else {
    paragraph('Operational year-to-year comparison is also unavailable because submissions do not span more than one reporting year.');
  }
  const currentProduction = numberOrNull(d.production_volume);
  const intensity = fullTotal !== null && currentProduction > 0 ? fullTotal / currentProduction : null;
  table(['OPERATIONAL INDICATOR', 'CURRENT VALUE', 'INTERPRETATION'], [
    ['Water intensity', numberOrNull(d.water_usage) !== null && currentProduction > 0 ? `${fmt(d.water_usage / currentProduction, 3)} L/unit` : 'Not calculable', 'Requires water and production values with consistent periods'],
    ['Energy intensity', scopes.energy !== null && currentProduction > 0 ? `${fmt(scopes.energy / currentProduction, 3)} kWh/unit` : 'Not calculable', 'Production unit is not stated'],
    ['GHG intensity', intensity === null ? 'Not calculable' : `${fmt(intensity, 4)} tCO2e/unit`, 'Available only for complete scope inventory'],
    ['GHG per employee', fullTotal !== null && numberOrNull(d.employee_count) > 0 ? `${fmt(fullTotal / d.employee_count, 3)} tCO2e` : 'Not calculable', 'Headcount period and boundary not documented']
  ], [145, 105, 221], 'Performance comparison');

  // Pathway
  addPage('Reduction Scenarios and Roadmap');
  sectionTitle('Reduction Scenarios and Net Zero Roadmap', '06 / Forward plan');
  paragraph('The selected scenario below is an illustrative planning trajectory from the latest complete baseline. It is arithmetic based on the stated reduction assumption, not a forecast, approved target or claim of alignment with a specific external standard. Absolute reductions are not quantified when the inventory baseline is incomplete.');
  if (pathway?.available) {
    paragraph(`Baseline year ${pathway.baselineYear}: ${fmt(pathway.baselineEmissions)} tCO2e. Selected target year: ${pathway.targetYear}. Scenario reduction rate: ${fmt(pathway.annualReductionPct, 2)}% of baseline (${fmt(pathway.annualReductionTco2e)} tCO2e) per year. At this rate, the arithmetic pathway reaches zero in ${pathway.estimatedTargetYear}; emissions at the selected target year are ${fmt(pathway.targetEmissions)} tCO2e.`);
    table(['YEAR', 'SCENARIO EMISSIONS', 'CHANGE FROM BASELINE'], pathway.trajectory.filter((item) => item.year === pathway.baselineYear || item.year === pathway.targetYear || (item.year - pathway.baselineYear) % 5 === 0).map((item) => [
      String(item.year), `${fmt(item.emissions)} tCO2e`, `${fmt(pathway.baselineEmissions - item.emissions)} tCO2e`
    ]), [90, 180, 193], 'Selected target pathway');
    pathwayChart(pathway.trajectory, pathway.historical, 'Measured inventory and deterministic scenario');
    paragraph(pathway.method, { fontSize: 8.5, color: COLORS.muted });
  } else {
    paragraph(pathway?.reason || 'No absolute reduction scenario is presented because the baseline is incomplete. Complete the missing scope data before setting a quantified target.', { color: COLORS.amber, bold: true });
  }
  paragraph('Priority opportunities based on the submitted record', { bold: true, fontSize: 11 });
  if (aiPlan.recommendationSource) paragraph(aiPlan.recommendationSource, { fontSize: 8.5, color: COLORS.muted });
  paragraph('The following actions are recommendations, not measured savings or achieved reductions.', { fontSize: 8.5, color: COLORS.muted });
  (aiPlan.recommendations || []).slice(0, 8).forEach((item) => {
    const evidence = item.evidence && typeof item.evidence === 'object'
      ? Object.entries(item.evidence).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.filter((part) => ['string', 'number', 'boolean'].includes(typeof part)).join(', ') : (value === null || ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : 'recorded')}`).join('; ')
      : 'No additional evidence supplied.';
    paragraph(`${item.priority || 'Medium'} priority - ${item.title || 'Recommendation'}`, { bold: true, fontSize: 9.5, after: 3 });
    paragraph(`Reason: ${item.rationale || 'Not provided.'} Action: ${item.action || 'Not provided.'} KPI: ${item.kpi || 'Not specified.'} Timeframe: ${item.timeframe || 'Not specified.'} Supporting evidence: ${evidence || 'No additional evidence supplied.'}`, { fontSize: 8.5, after: 7 });
  });
  if (!(aiPlan.recommendations || []).length) (aiPlan.priorities || []).slice(0, 5).forEach((item) => bullet(item));
  ensure(165, 'Reduction scenarios and roadmap');
  paragraph('Proposed implementation roadmap', { bold: true, fontSize: 11 });
  (aiPlan.roadmap || []).slice(0, 5).forEach((item) => bullet(item));
  paragraph(`Scenario note: the selected ${pathway?.available ? `${pathway.targetYear} target year and ${pathway.annualReductionPct}% annual rate` : 'target assumptions'} are planning assumptions, not company commitments. The company should assess feasibility, identify investment requirements and refresh the inventory annually. Residual emissions and any neutralization strategy require separate assessment.`);

  // Data quality, limits and sources
  addPage('Data Quality and Limitations');
  sectionTitle('Data Quality, Limitations and Next Steps', '07 / Read with care');
  paragraph(`Current scope coverage: ${assessment.completeness}% (${scopes.knownCount} of 3 scopes have a quantified value). This is a scope-presence indicator, not an assurance rating or data-quality score.`);
  if (assessment.limitations.length) assessment.limitations.forEach((item) => bullet(item, COLORS.amber));
  else bullet('No material missing fields were detected in the submitted inventory; underlying data and factor evidence were not independently checked.', COLORS.amber);
  paragraph('Recommended data improvements', { bold: true, fontSize: 11 });
  [
    'Define the organizational boundary, included facilities, consolidation approach and consistent annual reporting period.',
    'Retain source records for fuel, refrigerants, purchased electricity, supplier activity, waste, logistics and travel.',
    'Document the geography, year, source and calculation basis for every emission factor; refresh factors when appropriate.',
    'Break Scope 1 into stationary combustion, mobile combustion, process and fugitive sources where relevant.',
    'Expand material Scope 3 categories and reconcile category detail to any company-reported Scope 3 total.',
    'Specify production units and reporting-period alignment before comparing emissions intensity over time.'
  ].forEach((item) => bullet(item));
  paragraph('Data completeness and boundary limitations mean the results are suitable for preliminary planning only. They should not be represented as independently verified, certified, audit-ready or legally compliant. CarbonScoreX does not certify this assessment.');
  paragraph('Calculation reference: Scope 2 arithmetic shown in this report uses the company-provided electricity activity (kWh) and factor (kg CO2e/kWh). Scope 1 and Scope 3 are company-reported tCO2e inputs unless category detail is explicitly shown. No external factor dataset was applied.');
  paragraph(`Confidentiality: this report contains company-submitted operational information and is intended for the company and its authorized users. Generated ${assessment.generatedAt.toLocaleString('en-US')}.`, { color: COLORS.muted, fontSize: 8.5 });

  // Add consistent footer and page number after layout is complete.
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 31;
    if (index > 0) {
      const topMargin = doc.page.margins.top;
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.top = 0;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text('CARBONSCOREX  /  INDUSTRIAL GHG ASSESSMENT', 56, 30, { width: contentWidth, lineBreak: false, characterSpacing: 0.7 });
      doc.moveTo(56, 46).lineTo(pageWidth - 56, 46).strokeColor(COLORS.line).lineWidth(0.7).stroke();
      doc.moveTo(56, footerY - 8).lineTo(pageWidth - 56, footerY - 8).strokeColor(COLORS.line).lineWidth(0.6).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(company.company_name || 'CarbonScoreX', 56, footerY, { width: contentWidth / 2, lineBreak: false, ellipsis: true });
      doc.text(`PRELIMINARY  |  ${index + 1}`, pageWidth - 135, footerY, { width: 79, align: 'right' });
      doc.page.margins.top = topMargin;
      doc.page.margins.bottom = bottomMargin;
    }
  }
  doc.end();
}

module.exports = { buildAssessment, buildNetZeroPathway, buildNetZeroPlan, generate, safeFileName };
