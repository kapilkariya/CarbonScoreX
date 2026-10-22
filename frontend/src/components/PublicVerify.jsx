import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Shield, Building, Calendar, Award, Lock, Hash, Clock, RefreshCw } from 'lucide-react';
import api from '../services/api';

/* ---------- Design tokens ---------- */
const tokens = {
  bg: 'bg-[#070B14]',
  panel: 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]',
  gradientText: 'bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent',
};

const categoryStyle = {
  Excellent: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  Good:      'bg-blue-500/10    text-blue-300    ring-blue-500/25',
  Fair:      'bg-amber-500/10   text-amber-300   ring-amber-500/25',
  Poor:      'bg-red-500/10     text-red-300     ring-red-500/25',
};

const Spinner = ({ className = 'h-14 w-14' }) => (
  <span className={`inline-block animate-spin rounded-full border-2 border-white/10 border-t-blue-500 ${className}`} aria-hidden="true" />
);

/* ---------- Info row ---------- */
const InfoItem = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all">
    <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0 ring-1 ring-white/10">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-1 text-white font-medium truncate">{children}</div>
    </div>
  </div>
);

export default function PublicVerify() {
  const { certificateId } = useParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    verifyNow();
  }, [certificateId]);

  const verifyNow = async () => {
    setLoading(true);
    try {
      const response = await api.verifyCertificate(certificateId);
      setResult(response.data);
    } catch (error) {
      setResult({
        valid: false,
        message: 'Certificate verification failed',
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className={`min-h-screen ${tokens.bg} flex items-center justify-center relative`}>
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-500/[0.07] blur-[140px]" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.07] blur-[140px]" />
        </div>
        <div className="relative flex flex-col items-center gap-4">
          <Spinner />
          <div className="text-slate-400 text-sm tracking-wide">Verifying certificate…</div>
        </div>
      </div>
    );
  }

  const valid = result?.valid;
  const details = result?.details;
  const tone = details ? (categoryStyle[details.category] || 'bg-white/[0.06] text-slate-300 ring-white/10') : '';

  return (
    <div className={`min-h-screen ${tokens.bg} text-slate-200 antialiased relative`}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full ${valid ? 'bg-emerald-500/[0.08]' : 'bg-red-500/[0.06]'} blur-[140px]`} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-blue-500/[0.07] blur-[140px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center shadow-lg shadow-blue-500/25 ring-1 ring-white/10 mb-5">
            <Shield className="w-8 h-8 text-white" strokeWidth={1.8} />
          </div>
          <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${tokens.gradientText}`}>
            Certificate Verification
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Certificate ID:{' '}
            <span className="font-mono font-medium text-slate-200 bg-white/[0.06] ring-1 ring-white/10 px-2 py-0.5 rounded-md">
              {certificateId}
            </span>
          </p>
        </div>

        {/* Result Card */}
        <div className={`${tokens.panel} rounded-3xl p-8 md:p-10 mb-6 relative overflow-hidden`}>
          {/* Corner glow inside card */}
          <div className={`absolute inset-0 bg-gradient-to-br ${valid ? 'from-emerald-500/[0.06]' : 'from-red-500/[0.06]'} via-transparent to-transparent pointer-events-none`} />

          <div className="relative">
            {valid ? (
              <>
                {/* Valid badge */}
                <div className="flex flex-col items-center mb-8">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl" />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
                      <CheckCircle className="w-11 h-11 text-emerald-400" strokeWidth={1.8} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-300 tracking-tight">Certificate Verified</h2>
                  <p className="text-slate-400 text-sm mt-1.5 text-center max-w-md">{result.message}</p>
                </div>

                {/* Details grid */}
                {details && (
                  <div className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <InfoItem
                        label="Company"
                        icon={<Building className="w-4 h-4 text-slate-400" strokeWidth={1.8} />}
                      >
                        <div>
                          <div className="truncate">{details.companyName}</div>
                          {details.registrationNumber && (
                            <div className="text-[11px] font-normal text-slate-500 mt-0.5 truncate">
                              Reg: {details.registrationNumber}
                            </div>
                          )}
                        </div>
                      </InfoItem>

                      <InfoItem
                        label="Carbon Score"
                        icon={<Award className="w-4 h-4 text-slate-400" strokeWidth={1.8} />}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl font-bold tabular-nums">{details.score}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ${tone}`}>
                            {details.category}
                          </span>
                        </div>
                      </InfoItem>

                      <InfoItem
                        label="Issue Date"
                        icon={<Calendar className="w-4 h-4 text-slate-400" strokeWidth={1.8} />}
                      >
                        {new Date(details.issueDate).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </InfoItem>

                      <InfoItem
                        label="Valid Until"
                        icon={<Calendar className="w-4 h-4 text-slate-400" strokeWidth={1.8} />}
                      >
                        {new Date(details.validUntil).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </InfoItem>
                    </div>

                    {/* Authenticity banner */}
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.08] to-blue-500/[0.04] p-4">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center flex-shrink-0">
                        <Lock className="w-4 h-4 text-emerald-300" strokeWidth={1.8} />
                      </div>
                      <div className="text-sm">
                        <div className="font-semibold text-emerald-200">Authenticity Verified</div>
                        <div className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                          This certificate has been cryptographically verified and is issued by the CarbonScoreX Platform.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Invalid badge */}
                <div className="flex flex-col items-center mb-8">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full bg-red-500/20 blur-2xl" />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 ring-1 ring-red-500/30 flex items-center justify-center">
                      <XCircle className="w-11 h-11 text-red-400" strokeWidth={1.8} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-red-300 tracking-tight">Certificate Invalid</h2>
                  <p className="text-slate-400 text-sm mt-1.5 text-center max-w-md">{result.message}</p>
                </div>

                {details && (
                  <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm text-red-200 space-y-1">
                    {details.expiredOn && (
                      <p className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-red-400 flex-shrink-0" strokeWidth={1.8} />
                        <span>Certificate expired on: {new Date(details.expiredOn).toLocaleDateString()}</span>
                      </p>
                    )}
                    {details.status && (
                      <p className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" strokeWidth={1.8} />
                        <span>Status: <span className="font-medium capitalize">{details.status}</span></span>
                      </p>
                    )}
                  </div>
                )}

                {result?.error && (
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Reference: <span className="font-mono">{result.error}</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className={`${tokens.panel} rounded-2xl p-6 md:p-7`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
            </div>
            <h3 className="font-semibold text-white tracking-tight">About Certificate Verification</h3>
          </div>
          <ul className="space-y-3 text-sm text-slate-400">
            {[
              { icon: <Lock className="w-3.5 h-3.5" />, text: 'Certificates are cryptographically signed using HMAC-SHA256' },
              { icon: <Hash className="w-3.5 h-3.5" />, text: 'Each certificate has a unique ID and cannot be forged' },
              { icon: <RefreshCw className="w-3.5 h-3.5" />, text: 'Certificates are automatically revoked when new scores are issued' },
              { icon: <Clock className="w-3.5 h-3.5" />, text: 'Valid for 1 year from issue date' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-300">{item.icon}</span>
                </div>
                <span className="leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 mt-8">
          Powered by <span className="text-slate-400 font-medium">CarbonScoreX</span> · Public verification portal
        </p>
      </div>
    </div>
  );
}