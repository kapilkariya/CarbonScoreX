/**
 * BillUploader.jsx — Premium redesign
 * AI-powered utility bill upload for CarbonScoreX.
 * Supports: Electricity, Water, Fuel, Natural Gas, Waste.
 * Contract preserved: onExtracted(formFields, extracted)
 */
import React, { useState, useCallback, useRef } from 'react';
import api from '../services/api';

/* ── constants ─────────────────────────────────────────────────────────── */
const BILL_TYPES = [
  { value: '',            label: 'Auto-detect',    emoji: '🔍' },
  { value: 'electricity', label: 'Electricity',    emoji: '⚡' },
  { value: 'water',       label: 'Water',          emoji: '💧' },
  { value: 'fuel',        label: 'Fuel',           emoji: '⛽' },
  { value: 'gas',         label: 'Natural Gas',    emoji: '🔥' },
  { value: 'waste',       label: 'Waste',          emoji: '♻️' },
];

const ACCEPT_TYPES = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX_SIZE_MB  = 10;

const METRIC_LABELS = {
  electricity_kwh: 'Electricity',
  water_liters:    'Water',
  natural_gas_m3:  'Natural Gas',
  diesel_liters:   'Diesel',
  petrol_liters:   'Petrol',
  lpg_liters:      'LPG',
  waste_kg:        'Waste',
};

/* ── helpers ───────────────────────────────────────────────────────────── */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const Spinner = ({ className = 'h-4 w-4' }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

/* ── main component ────────────────────────────────────────────────────── */
export default function BillUploader({ onExtracted, disabled = false }) {
  const [hint, setHint]             = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [file, setFile]             = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const inputRef = useRef(null);

  function validateFile(f) {
    if (!f) return 'No file selected.';
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(f.type)) return `Unsupported type "${f.type}". Use PDF, PNG, JPG or WEBP.`;
    if (f.size > MAX_SIZE_MB * 1024 * 1024)
      return `File is too large (${humanSize(f.size)}). Maximum is ${MAX_SIZE_MB} MB.`;
    return null;
  }

  const onDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDrop      = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    selectFile(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectFile(f) {
    setError('');
    setResult(null);
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
  }

  async function handleExtract() {
    if (!file) { setError('Please select a file first.'); return; }
    setExtracting(true);
    setError('');
    setResult(null);

    try {
      const response = await api.extractBillData(file, hint);
      const { extracted, form_fields, filename } = response.data;
      setResult({ extracted, form_fields, filename });
      if (onExtracted) onExtracted(form_fields, extracted);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.code === 'ECONNABORTED'
          ? 'Request timed out. The document may be too complex — try a clearer scan.'
          : null) ||
        'Extraction failed. Please try again.';
      setError(msg);
    } finally {
      setExtracting(false);
    }
  }

  function handleClear() {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  /* ── Drop zone ─────────────────────────────────────────────────────────── */
  function renderDropZone() {
    const hasFile = !!file;
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload utility bill"
        className={`
          group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center
          transition-all duration-200 cursor-pointer overflow-hidden
          ${dragOver
            ? 'border-emerald-400 bg-emerald-500/10 ring-4 ring-emerald-500/10'
            : 'border-white/[0.1] bg-white/[0.02] hover:border-emerald-400/40 hover:bg-emerald-500/[0.04]'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* Ambient glow on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-transparent to-blue-500/0 group-hover:from-emerald-500/[0.04] group-hover:to-blue-500/[0.04] pointer-events-none transition-all duration-300" />

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_TYPES}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => selectFile(e.target.files[0])}
        />

        {hasFile ? (
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center ring-1 ring-white/10">
              <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-medium text-white text-sm truncate max-w-[240px]">{file.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{humanSize(file.size)}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] flex items-center justify-center ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-6 h-6 text-slate-400 group-hover:text-emerald-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="relative">
              <p className="text-sm font-medium text-slate-200">
                Drag &amp; drop or <span className="text-emerald-300 underline underline-offset-2">browse</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">PDF, PNG, JPG, WEBP · max {MAX_SIZE_MB} MB</p>
            </div>
          </>
        )}

        {hasFile && (
          <p className="relative text-[11px] text-slate-500">Click or drag to replace</p>
        )}
      </div>
    );
  }

  /* ── Extraction result ─────────────────────────────────────────────────── */
  function renderExtractionResult() {
    if (!result) return null;
    const { extracted, form_fields } = result;
    const entries = (extracted.consumption_entries || []).filter(
      (e) => e.normalized_value != null || e.consumption_value != null
    );
    const confidence = extracted.confidence ?? null;
    const autoFilledCount = Object.keys(form_fields).filter((k) => !k.startsWith('_')).length;

    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-blue-500/[0.03] p-4 space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center ring-1 ring-emerald-500/30">
              <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-semibold text-white text-sm">Extraction successful</span>
            {confidence != null && (
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ring-1 ${
                confidence >= 0.8
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
              }`}>
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>
          {extracted.utility_provider && (
            <span className="text-[11px] text-slate-300 bg-white/[0.06] ring-1 ring-white/10 rounded-lg px-2.5 py-1">
              {extracted.utility_provider}
            </span>
          )}
        </div>

        {/* Billing period */}
        {(extracted.billing_period_start || extracted.billing_period_end) && (
          <div className="flex items-center gap-2 text-xs text-slate-300 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              Billing period:&nbsp;
              <strong className="text-white">{extracted.billing_period_start ?? '?'}</strong>
              <span className="text-slate-500 mx-1">→</span>
              <strong className="text-white">{extracted.billing_period_end ?? '?'}</strong>
            </span>
          </div>
        )}

        {/* Consumption entries */}
        {entries.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
            {entries.map((entry, i) => {
              const label = METRIC_LABELS[entry.metric] || entry.metric;
              const value = entry.normalized_value ?? entry.consumption_value;
              const unit  = entry.normalized_unit  || entry.consumption_unit || '';
              return (
                <div key={i} className="flex items-center gap-2.5 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] flex-shrink-0" />
                  <span className="text-slate-400 text-xs w-32 truncate">{label}</span>
                  <span className="text-white font-semibold tabular-nums">
                    {value?.toLocaleString()}
                    {unit && <span className="text-slate-500 font-normal ml-1 text-xs">{unit}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Grid factor */}
        {extracted.grid_emission_factor_kg_kwh != null && (
          <div className="flex items-start gap-2 text-xs text-slate-300 bg-blue-500/[0.06] border border-blue-500/20 rounded-lg px-3 py-2">
            <span className="text-blue-300">⚡</span>
            <span>
              Grid factor: <strong className="text-white">{extracted.grid_emission_factor_kg_kwh} kg CO₂e/kWh</strong>
              {extracted.grid_emission_factor_source && (
                <span className="text-slate-500"> · {extracted.grid_emission_factor_source}</span>
              )}
            </span>
          </div>
        )}

        {/* Notes */}
        {extracted.extraction_notes && (
          <p className="text-xs text-amber-200/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
            <span className="mr-1">ℹ️</span>
            {extracted.extraction_notes}
          </p>
        )}

        {/* Auto-filled summary */}
        {autoFilledCount > 0 && (
          <p className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
            <span>✨</span>
            Auto-filled {autoFilledCount} form field{autoFilledCount === 1 ? '' : 's'} — review values before submitting.
          </p>
        )}
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-3">
      {/* Bill type chips */}
      <div className="flex flex-wrap gap-2">
        {BILL_TYPES.map((bt) => {
          const active = hint === bt.value;
          return (
            <button
              key={bt.value}
              type="button"
              disabled={disabled || extracting}
              onClick={() => setHint(bt.value)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                border transition-all duration-200
                ${active
                  ? 'bg-gradient-to-r from-emerald-500 to-blue-600 text-white border-transparent shadow-lg shadow-emerald-500/20'
                  : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] hover:text-white'}
                ${(disabled || extracting) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="text-[13px]">{bt.emoji}</span>
              {bt.label}
            </button>
          );
        })}
      </div>

      {/* Drop zone */}
      {renderDropZone()}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-2.5 text-sm text-red-200" role="alert">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!file || extracting || disabled}
          onClick={handleExtract}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white
            bg-gradient-to-r from-emerald-500 to-blue-600
            hover:from-emerald-600 hover:to-blue-700
            shadow-lg shadow-emerald-500/20
            disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
            transition-all duration-200"
        >
          {extracting ? (
            <>
              <Spinner className="h-4 w-4" />
              Extracting with AI…
            </>
          ) : (
            <>
              <span>🤖</span>
              Extract &amp; Auto-fill
            </>
          )}
        </button>
        {(file || result) && (
          <button
            type="button"
            disabled={extracting}
            onClick={handleClear}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300
              hover:bg-white/[0.06] hover:text-white hover:border-white/[0.15]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Result */}
      {renderExtractionResult()}
    </div>
  );
}