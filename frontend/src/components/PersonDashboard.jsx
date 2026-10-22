/**
 * Individual/Person Dashboard — Premium redesign
 * Credit balance, sell listings, and transaction history.
 * All business logic preserved; UI restyled to the dark glass design system.
 */
import React, { useState, useEffect } from 'react';
import api from '../services/api';

/* ---------- Design tokens ---------- */
const tokens = {
  bg: 'bg-[#070B14]',
  panel: 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]',
  panelHover: 'hover:bg-white/[0.05] hover:border-white/[0.1]',
  gradientText: 'bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent',
  input:
    'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed',
  label: 'block text-[12px] font-medium uppercase tracking-wider text-slate-400 mb-1.5',
};

/* ---------- Small primitives ---------- */
const Spinner = ({ className = 'h-5 w-5 border-blue-500' }) => (
  <span className={`inline-block animate-spin rounded-full border-2 border-white/10 ${className}`} aria-hidden="true" />
);

const Badge = ({ children, tone = 'blue' }) => {
  const tones = {
    blue:  'bg-blue-500/10    text-blue-300    ring-blue-500/25',
    green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
    red:   'bg-red-500/10     text-red-300     ring-red-500/25',
    slate: 'bg-white/[0.06]   text-slate-300   ring-white/10',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
};

const BalanceTile = ({ label, value, sub, accent, icon, glow = 'emerald' }) => (
  <div className={`${tokens.panel} relative overflow-hidden rounded-2xl p-6 group transition-all duration-300 ${tokens.panelHover}`}>
    <div className={`absolute inset-0 bg-gradient-to-br from-${glow}-500/[0.08] via-transparent to-transparent pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity`} />
    <div className="relative">
      <div className="flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">{label}</div>
        {icon && <div className="text-slate-600 group-hover:text-slate-400 transition-colors">{icon}</div>}
      </div>
      <div className={`mt-3 text-5xl font-bold tabular-nums tracking-tight ${accent}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  </div>
);

/* =================================================================== */
function PersonDashboard() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [myListings, setMyListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [sellAmount, setSellAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        api.getCreditBalance(),
        api.getTransactionHistory(),
      ]);
      setBalance(balRes.data.balance);
      setTransactions(txRes.data.transactions);
      loadMyListings();
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyListings = async () => {
    setLoadingListings(true);
    try {
      const res = await api.getMyListings();
      setMyListings(res.data.listings || []);
    } catch (error) {
      console.error('Failed to load listings:', error);
    } finally {
      setLoadingListings(false);
    }
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    const amount = parseFloat(sellAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const listedAmount = myListings
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const availableBalance = balance - listedAmount;

    if (amount > availableBalance) {
      alert(
        `You can only list up to ${availableBalance.toFixed(2)} credits (${balance.toFixed(2)} total - ${listedAmount.toFixed(2)} already listed)`
      );
      return;
    }

    setCreating(true);
    try {
      await api.createSellListing({ amount });
      alert(`Successfully listed ${amount} credits for sale!`);
      setSellAmount('');
      loadMyListings();
    } catch (error) {
      console.error('Create listing error:', error);
      alert('Failed to create listing: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
    }
  };

  const handleCancelListing = async (listingId) => {
    if (!window.confirm('Are you sure you want to cancel this listing?')) return;
    setCancelling(listingId);
    try {
      await api.cancelSellListing(listingId);
      alert('Listing cancelled successfully');
      loadMyListings();
    } catch (error) {
      console.error('Cancel listing error:', error);
      alert('Failed to cancel listing: ' + (error.response?.data?.error || error.message));
    } finally {
      setCancelling(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className={`min-h-screen ${tokens.bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12 border-t-emerald-500" />
          <div className="text-slate-400 text-sm tracking-wide">Loading dashboard…</div>
        </div>
      </div>
    );
  }

  const listedAmount = myListings
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + parseFloat(l.amount), 0);
  const availableBalance = balance - listedAmount;
  const activeListings = myListings.filter((l) => l.status === 'active');

  return (
    <div className={`min-h-screen ${tokens.bg} text-slate-200 antialiased relative`}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.07] blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-blue-500/[0.07] blur-[140px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070B14]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/10">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Personal Portal</div>
              <h1 className="text-lg font-semibold text-white tracking-tight">Individual Dashboard</h1>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-slate-300 border border-white/[0.08] bg-white/[0.02] hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Balance tiles */}
        <div className="grid md:grid-cols-2 gap-4">
          <BalanceTile
            label="Your Credit Balance"
            value={balance.toFixed(2)}
            sub="Total carbon credits earned"
            accent="text-emerald-300"
            glow="emerald"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <BalanceTile
            label="Available to Sell"
            value={availableBalance.toFixed(2)}
            sub={
              listedAmount > 0
                ? `${listedAmount.toFixed(2)} credits currently listed`
                : 'No credits currently listed'
            }
            accent="text-blue-300"
            glow="blue"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        </div>

        {/* Sell Credits */}
        <section className={`${tokens.panel} rounded-2xl p-6 md:p-7`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center ring-1 ring-white/10">
              <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Sell Your Credits</h2>
              <p className="text-sm text-slate-400">List carbon credits for companies to purchase.</p>
            </div>
          </div>

          <form onSubmit={handleCreateListing} className="mt-5 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className={tokens.label}>Amount to list for sale</label>
              <input
                type="number"
                min="0.01"
                max={availableBalance}
                step="0.01"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                className={tokens.input}
                placeholder={`Max: ${availableBalance.toFixed(2)}`}
                disabled={availableBalance <= 0}
              />
            </div>
            <button
              type="submit"
              disabled={creating || !sellAmount || availableBalance <= 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all"
            >
              {creating ? (
                <>
                  <Spinner className="h-4 w-4 border-t-white" />
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  List for Sale
                </>
              )}
            </button>
          </form>

          {/* My active listings */}
          <div className="border-t border-white/[0.06] pt-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Your Active Listings</h3>
                <Badge tone="slate">{activeListings.length}</Badge>
              </div>
              <button
                onClick={loadMyListings}
                disabled={loadingListings}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${loadingListings ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loadingListings ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {loadingListings ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-7 w-7 border-t-emerald-500" />
              </div>
            ) : activeListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">No active listings</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 hover:border-white/[0.1] hover:bg-white/[0.04] transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-emerald-300 tabular-nums">
                          {parseFloat(listing.amount).toFixed(2)} credits
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Listed on {new Date(listing.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelListing(listing.id)}
                      disabled={cancelling === listing.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 border border-red-500/25 bg-red-500/[0.06] hover:bg-red-500/15 hover:border-red-500/40 disabled:opacity-50 transition-all"
                    >
                      {cancelling === listing.id ? (
                        <>
                          <Spinner className="h-3 w-3 border-t-red-300" />
                          Cancelling…
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Transaction History */}
        <section className={`${tokens.panel} rounded-2xl overflow-hidden`}>
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white tracking-tight">Transaction History</h2>
              <Badge tone="slate">{transactions.length}</Badge>
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <p className="text-sm text-slate-400">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {['Date', 'Type', 'Amount', 'Party'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                        {new Date(txn.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge tone="blue">{txn.transaction_type}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-300 tabular-nums">
                        +{txn.amount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 truncate">
                        {txn.from_name || txn.to_name || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default PersonDashboard;