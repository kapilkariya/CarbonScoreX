/**
 * BillUploader.jsx
 * AI-powered utility bill upload component for CarbonScoreX.
 *
 * Supports: Electricity, Water, Fuel (Diesel/Petrol/LPG), Natural Gas, Waste bills.
 * After AI extraction it calls onExtracted(formFields, extracted) so the parent
 * form can merge the auto-filled values.
 */
import React, { useState, useCallback, useRef } from 'react';
import api from '../services/api';

// ── constants ──────────────────────────────────────────────────────────────
const BILL_TYPES = [
  { value: '',            label: 'Auto-detect',    emoji: '🔍' },
  { value: 'electricity', label: 'Electricity',    emoji: '⚡' },
  { value: 'water',       label: 'Water',          emoji: '💧' },
  { value: 'fuel',        label: 'Fuel (diesel/petrol/LPG)', emoji: '⛽' },
  { value: 'gas',         label: 'Natural Gas',   emoji: '🔥' },
  { value: 'waste',       label: 'Waste / Recycling', emoji: '♻️' },
];

const ACCEPT_TYPES = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX_SIZE_MB   = 10;

// ── helper: human-readable file size ──────────────────────────────────────
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── helper: metric label for the extraction preview ────────────────────────
const METRIC_LABELS = {
  electricity_kwh:     'Electricity',
  water_liters:        'Water',
  natural_gas_m3:      'Natural Gas',
  diesel_liters:       'Diesel',
  petrol_liters:       'Petrol / Gasoline',
  lpg_liters:          'LPG',
  waste_kg:            'Waste',
};

// ── main component ─────────────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {function} props.onExtracted  - (formFields, fullExtracted) => void
 * @param {boolean}  [props.disabled]
 */
export default function BillUploader({ onExtracted, disabled = false }) {
  const [hint, setHint]             = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [file, setFile]             = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult]         = useState(null);   // last successful extraction
  const [error, setError]           = useState('');
  const inputRef = useRef(null);

  // ── file validation ──────────────────────────────────────────────────────
  function validateFile(f) {
    if (!f) return 'No file selected.';
    const allowed = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
    if (!allowed.includes(f.type)) return `Unsupported type "${f.type}". Use PDF, PNG, JPG or WEBP.`;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `File is too large (${humanSize(f.size)}). Maximum is ${MAX_SIZE_MB} MB.`;
    return null;
  }

  // ── drag & drop ──────────────────────────────────────────────────────────
  const onDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true);  }, []);
  const onDragLeave = useCallback(()  => { setDragOver(false); }, []);
  const onDrop      = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    selectFile(dropped);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectFile(f) {
    setError('');
    setResult(null);
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
  }

  // ── upload & extract ─────────────────────────────────────────────────────
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
        (err.code === 'ECONNABORTED' ? 'Request timed out. The document may be too complex — try a clearer scan.' : null) ||
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

  // ── render helpers ───────────────────────────────────────────────────────
  function renderDropZone() {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors
          ${dragOver ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50/50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload utility bill"
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_TYPES}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => selectFile(e.target.files[0])}
        />

        {file ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl">📄</span>
              <div>
                <p className="font-medium text-gray-800 text-sm">{file.name}</p>
                <p className="text-xs text-gray-500">{humanSize(file.size)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Click or drag to replace</p>
          </>
        ) : (
          <>
            <span className="text-4xl">📁</span>
            <p className="text-sm font-medium text-gray-700">
              Drag &amp; drop your bill here, or <span className="text-green-600 underline">browse</span>
            </p>
            <p className="text-xs text-gray-500">PDF, PNG, JPG, WEBP · max {MAX_SIZE_MB} MB</p>
          </>
        )}
      </div>
    );
  }

  function renderExtractionResult() {
    if (!result) return null;
    const { extracted, form_fields } = result;
    const entries = (extracted.consumption_entries || []).filter(e => e.normalized_value != null || e.consumption_value != null);
    const confidence = extracted.confidence ?? null;

    return (
      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-xl">✅</span>
            <span className="font-semibold text-green-800 text-sm">Extraction successful</span>
            {confidence != null && (
              <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-medium
                ${confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>
          {extracted.utility_provider && (
            <span className="text-xs text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
              {extracted.utility_provider}
            </span>
          )}
        </div>

        {/* Billing period */}
        {(extracted.billing_period_start || extracted.billing_period_end) && (
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <span>🗓️</span>
            <span>
              Billing period:&nbsp;
              <strong>{extracted.billing_period_start ?? '?'}</strong>
              &nbsp;→&nbsp;
              <strong>{extracted.billing_period_end ?? '?'}</strong>
            </span>
          </div>
        )}

        {/* Consumption entries */}
        {entries.length > 0 && (
          <div className="space-y-1">
            {entries.map((entry, i) => {
              const label = METRIC_LABELS[entry.metric] || entry.metric;
              const value = entry.normalized_value ?? entry.consumption_value;
              const unit  = entry.normalized_unit  || entry.consumption_unit || '';
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-gray-700 font-medium w-36">{label}</span>
                  <span className="text-gray-900 font-semibold">
                    {value?.toLocaleString()} <span className="text-gray-500 font-normal">{unit}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Grid emission factor */}
        {extracted.grid_emission_factor_kg_kwh != null && (
          <div className="text-xs text-gray-600">
            ⚡ Grid factor: <strong>{extracted.grid_emission_factor_kg_kwh} kg CO₂e/kWh</strong>
            {extracted.grid_emission_factor_source && <span> ({extracted.grid_emission_factor_source})</span>}
          </div>
        )}

        {/* Notes */}
        {extracted.extraction_notes && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
            ℹ️ {extracted.extraction_notes}
          </p>
        )}

        {/* Auto-filled fields summary */}
        {Object.keys(form_fields).filter(k => !k.startsWith('_')).length > 0 && (
          <p className="text-xs text-green-700 font-medium">
            ✨ Auto-filled {Object.keys(form_fields).filter(k => !k.startsWith('_')).length} form field(s) — review values before submitting.
          </p>
        )}
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Bill type selector */}
      <div className="flex flex-wrap gap-2">
        {BILL_TYPES.map((bt) => (
          <button
            key={bt.value}
            type="button"
            disabled={disabled || extracting}
            onClick={() => setHint(bt.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${hint === bt.value
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:text-green-700'}
              ${(disabled || extracting) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span>{bt.emoji}</span> {bt.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      {renderDropZone()}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          <span className="flex-shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!file || extracting || disabled}
          onClick={handleExtract}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {extracting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
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
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
