// GovDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/* ---------- Design Tokens (reusable) ---------- */
const styles = {
  bg: 'bg-[#070B14]',
  panel: 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]',
  panelHover: 'hover:bg-white/[0.06] hover:border-white/[0.1]',
  muted: 'text-slate-400',
  subtle: 'text-slate-500',
  gradientText: 'bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent',
  accentGlow: 'shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)]',
};

/* ---------- Helper: category styling ---------- */
const categoryStyles = {
  Excellent: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/30', dot: 'bg-emerald-400' },
  Good:      { bg: 'bg-blue-500/10',    text: 'text-blue-300',    ring: 'ring-blue-500/30',    dot: 'bg-blue-400' },
  Fair:      { bg: 'bg-amber-500/10',   text: 'text-amber-300',   ring: 'ring-amber-500/30',   dot: 'bg-amber-400' },
  default:   { bg: 'bg-red-500/10',     text: 'text-red-300',     ring: 'ring-red-500/30',     dot: 'bg-red-400' },
};
const getCategoryStyle = (c) => categoryStyles[c] ?? categoryStyles.default;

const getScoreColor = (score) =>
  score >= 80 ? 'text-emerald-300' : score >= 65 ? 'text-blue-300' : score >= 50 ? 'text-amber-300' : 'text-red-300';
const getCreditColor = (credits) =>
  credits >= 2000 ? 'text-emerald-300' : credits >= 1000 ? 'text-blue-300' : credits >= 500 ? 'text-amber-300' : 'text-slate-300';

/* ---------- Reusable Avatar ---------- */
const Avatar = ({ name, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm' };
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div className={`${sizes[size]} rounded-xl bg-gradient-to-br from-blue-500/80 via-indigo-500/80 to-purple-600/80 flex items-center justify-center text-white font-semibold shadow-lg shadow-blue-500/20 ring-1 ring-white/10`}>
      {initial}
    </div>
  );
};

/* ---------- Reusable Stat Card ---------- */
const StatCard = ({ label, value, accent = 'text-white', icon }) => (
  <div className={`${styles.panel} rounded-2xl p-4 relative overflow-hidden group transition-all duration-300 ${styles.panelHover}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
    <div className="flex items-start justify-between relative">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-slate-500 font-medium">{label}</div>
        <div className={`text-2xl font-bold mt-1.5 ${accent}`}>{value}</div>
      </div>
      {icon && <div className="text-slate-600 group-hover:text-slate-400 transition-colors">{icon}</div>}
    </div>
  </div>
);

/* ---------- Reusable Score Bars ---------- */
const ScoreBars = ({ value, thresholds, colorClass }) => (
  <div className="flex justify-end gap-1">
    {thresholds.map((t, i) => (
      <div
        key={i}
        className={`w-1 h-5 rounded-full transition-all ${value >= t ? `bg-current ${colorClass}` : 'bg-white/[0.06]'}`}
      />
    ))}
  </div>
);

/* ===================================================================
   GOV DASHBOARD
   =================================================================== */
export function GovDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);

  const [activeTab, setActiveTab] = useState('companies');

  const [companies, setCompanies] = useState([]);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [companySearch, setCompanySearch] = useState('');
  const [companySortOrder, setCompanySortOrder] = useState('desc');
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const [individuals, setIndividuals] = useState([]);
  const [totalIndividuals, setTotalIndividuals] = useState(0);
  const [individualSearch, setIndividualSearch] = useState('');
  const [individualSortOrder, setIndividualSortOrder] = useState('desc');
  const [individualsLoading, setIndividualsLoading] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  const loadCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const response = await api.getAllGovCompanies({
        search: companySearch, sortOrder: companySortOrder, limit: 100,
      });
      setCompanies(response.data.companies);
      setTotalCompanies(response.data.total);
    } catch (e) { console.error(e); }
    finally { setCompaniesLoading(false); }
  }, [companySearch, companySortOrder]);

  const loadIndividuals = useCallback(async () => {
    setIndividualsLoading(true);
    try {
      const response = await api.getAllGovIndividuals({
        search: individualSearch, sortOrder: individualSortOrder,
      });
      setIndividuals(response.data.individuals);
      setTotalIndividuals(response.data.total);
    } catch (e) { console.error(e); }
    finally { setIndividualsLoading(false); }
  }, [individualSearch, individualSortOrder]);

  useEffect(() => { if (activeTab === 'companies') loadCompanies(); }, [activeTab, loadCompanies]);
  useEffect(() => { if (activeTab === 'individuals') loadIndividuals(); }, [activeTab, loadIndividuals]);

  const loadDashboard = async () => {
    try {
      const dashRes = await api.getGovDashboard();
      setDashboard(dashRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${styles.bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
          <div className="text-slate-400 text-sm tracking-wide">Loading dashboard…</div>
        </div>
      </div>
    );
  }

  const isCompanies = activeTab === 'companies';
  const search = isCompanies ? companySearch : individualSearch;
  const setSearch = isCompanies ? setCompanySearch : setIndividualSearch;
  const sortOrder = isCompanies ? companySortOrder : individualSortOrder;
  const setSortOrder = isCompanies ? setCompanySortOrder : setIndividualSortOrder;

  return (
    <div className={`min-h-screen ${styles.bg} flex text-slate-200 antialiased`}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      {/* Sidebar */}
      <aside className="relative w-72 border-r border-white/[0.06] bg-black/30 backdrop-blur-xl flex flex-col">
        {/* Brand */}
        <div className="px-6 py-7 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg tracking-tight">Gov Portal</h1>
              <p className="text-[11px] uppercase tracking-widest text-slate-500">Compliance Suite</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="px-3 py-2 text-[11px] uppercase tracking-widest text-slate-600 font-semibold">Registry</p>
          {[
            { key: 'companies', label: 'Companies', count: totalCompanies, path: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
            { key: 'individuals', label: 'Individuals', count: totalIndividuals, path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
          ].map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  active
                    ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/10 text-white ring-1 ring-blue-400/30 shadow-lg shadow-blue-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <svg className={`w-4 h-4 ${active ? 'text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.path} />
                </svg>
                <span className="font-medium">{item.label}</span>
                <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-md tabular-nums ${active ? 'bg-blue-400/20 text-blue-200' : 'bg-white/[0.04] text-slate-500'}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Footer stats */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Avg Score"
              value={dashboard?.statistics?.average_score?.toFixed(0) ?? 0}
              accent="text-white"
            />
            <StatCard
              label="Certified"
              value={dashboard?.statistics?.active_certificates ?? 0}
              accent="text-emerald-300"
            />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 px-8 py-6 border-b border-white/[0.06] bg-[#070B14]/70 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
                {isCompanies ? 'Company Registry' : 'Individual Registry'}
              </div>
              <h2 className={`text-3xl font-bold tracking-tight ${styles.gradientText}`}>
                {isCompanies ? 'All Companies' : 'All Individuals'}
              </h2>
            </div>
            <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-xl ${styles.panel}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              <span className="text-xs text-slate-300">Live Monitoring</span>
            </div>
          </div>
        </header>

        {/* Search / filter bar */}
        <div className="px-8 py-5 border-b border-white/[0.06]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-medium ${styles.panel}`}>
                <span className="text-white font-semibold">
                  {isCompanies ? totalCompanies : totalIndividuals}
                </span>
                <span className="text-slate-500 ml-1.5">
                  {isCompanies ? 'companies' : 'individuals'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative group">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={isCompanies ? 'Search companies…' : 'Search individuals…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-72 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
                />
              </div>

              <div className="relative">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="appearance-none pl-4 pr-10 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer hover:bg-white/[0.06] transition-all"
                >
                  <option value="desc" className="bg-slate-900">
                    {isCompanies ? 'Score: High → Low' : 'Credits: High → Low'}
                  </option>
                  <option value="asc" className="bg-slate-900">
                    {isCompanies ? 'Score: Low → High' : 'Credits: Low → High'}
                  </option>
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="px-8 py-6">
          <div className={`${styles.panel} rounded-2xl overflow-hidden`}>
            {/* Column headers */}
            <div className="grid grid-cols-[48px_1fr_100px_140px_80px] gap-4 px-6 py-3.5 border-b border-white/[0.06] text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              <div>#</div>
              <div>{isCompanies ? 'Company' : 'Individual'}</div>
              <div className="text-right">{isCompanies ? 'Score' : 'Credits'}</div>
              <div className="text-right">{isCompanies ? 'Category' : 'Status'}</div>
              <div className="text-right">Trend</div>
            </div>

            {/* Rows */}
            {isCompanies ? (
              companiesLoading ? <LoadingRow /> :
              companies.length === 0 ? <EmptyState search={companySearch} type="companies" /> :
              companies.map((c, i) => {
                const cat = getCategoryStyle(c.score_category);
                return (
                  <div key={c.id} className="grid grid-cols-[48px_1fr_100px_140px_80px] gap-4 items-center px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer group">
                    <div className="text-slate-600 font-mono text-xs tabular-nums">
                      {String(companySortOrder === 'desc' ? i + 1 : companies.length - i).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-white font-medium truncate group-hover:text-blue-300 transition-colors">
                          {c.company_name}
                        </span>
                        {c.certificate_id && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Verified
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{c.industry}</div>
                    </div>
                    <div className={`text-right font-bold text-lg tabular-nums ${getScoreColor(c.score)}`}>
                      {c.score}
                    </div>
                    <div className="flex justify-end">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ring-1 ${cat.bg} ${cat.text} ${cat.ring}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                        {c.score_category}
                      </span>
                    </div>
                    <ScoreBars value={c.score} thresholds={[25, 50, 75]} colorClass={getScoreColor(c.score)} />
                  </div>
                );
              })
            ) : (
              individualsLoading ? <LoadingRow /> :
              individuals.length === 0 ? <EmptyState search={individualSearch} type="individuals" /> :
              individuals.map((ind, i) => {
                const credits = parseFloat(ind.credit_balance);
                return (
                  <div key={ind.id} className="grid grid-cols-[48px_1fr_100px_140px_80px] gap-4 items-center px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer group">
                    <div className="text-slate-600 font-mono text-xs tabular-nums">
                      {String(individualSortOrder === 'desc' ? i + 1 : individuals.length - i).padStart(2, '0')}
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={ind.full_name} size="sm" />
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate group-hover:text-blue-300 transition-colors">
                          {ind.full_name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{ind.email}</div>
                      </div>
                    </div>
                    <div className={`text-right font-bold text-lg tabular-nums ${getCreditColor(credits)}`}>
                      {credits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-right text-xs text-slate-500">credits</div>
                    <ScoreBars value={credits} thresholds={[500, 1500, 2500]} colorClass={getCreditColor(credits)} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Small helper components ---------- */
const LoadingRow = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
  </div>
);

const EmptyState = ({ search, type }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
      <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    <div className="text-slate-300 font-medium">No {type} found</div>
    {search && <div className="text-sm text-slate-500 mt-1">No results for “{search}”</div>}
  </div>
);

/* ===================================================================
   PERSON DASHBOARD
   =================================================================== */
export function PersonDashboard() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        api.getCreditBalance(),
        api.getTransactionHistory(),
      ]);
      setBalance(balRes.data.balance);
      setTransactions(txRes.data.transactions);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${styles.bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-emerald-500 animate-spin" />
          <div className="text-slate-400 text-sm tracking-wide">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${styles.bg} text-slate-200 antialiased relative`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-0 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Personal Portal</div>
          <h1 className={`text-4xl font-bold tracking-tight ${styles.gradientText}`}>Individual Dashboard</h1>
          <p className="text-slate-400 mt-2">Manage your carbon credit portfolio</p>
        </div>

        {/* Balance Card */}
        <div className={`relative rounded-3xl p-8 mb-8 overflow-hidden ${styles.panel} ${styles.accentGlow}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-300 font-semibold mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Available Balance
            </div>
            <div className="flex items-end gap-3">
              <div className="text-6xl font-bold tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent tabular-nums">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-slate-400 mb-3 text-sm">credits</div>
            </div>
            <p className="text-sm text-slate-400 mt-3">Ready for sale to registered companies</p>
          </div>
        </div>

        {/* Transactions */}
        <div className={`${styles.panel} rounded-2xl overflow-hidden`}>
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-white font-semibold">Transaction History</h2>
            <span className="text-xs text-slate-500">{transactions.length} records</span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">No transactions yet</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {transactions.map((txn) => (
                <div key={txn.id} className="grid grid-cols-[110px_1fr_120px_1fr] gap-4 items-center px-6 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="text-xs text-slate-500 font-mono">
                    {new Date(txn.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                  </div>
                  <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20">
                      {txn.transaction_type}
                    </span>
                  </div>
                  <div className="text-right font-semibold text-emerald-300 tabular-nums">
                    +{txn.amount}
                  </div>
                  <div className="text-sm text-slate-400 text-right truncate">{txn.from_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GovDashboard;