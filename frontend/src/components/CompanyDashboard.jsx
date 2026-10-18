/**
 * Company Dashboard Component
 * Displays company carbon score, history, and data submission
 */
import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import QRCode from 'react-qr-code';
import api from '../services/api';
import { normalizeRecommendation } from '../utils/recommendations';

function CompanyDashboard() {
    const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [scoreHistory, setScoreHistory] = useState([]);
    const [certificates, setCertificates] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [downloadingReport, setDownloadingReport] = useState(false);
    const [formData, setFormData] = useState({
        reporting_period_start: `${new Date().getFullYear()}-01-01`,
        reporting_period_end: todayLocal,
        energy_consumption: 0,
        renewable_energy_pct: 0,
        waste_recycled_pct: 0,
        emissions_co2: 0,
        water_usage: 0,
        employee_count: 0,
        production_volume: 0,
        scope1_tco2e: '',
        scope1_stationary_combustion_tco2e: '',
        scope1_mobile_combustion_tco2e: '',
        scope1_process_tco2e: '',
        scope1_fugitive_tco2e: '',
        electricity_consumption_kwh: '',
        electricity_grid_factor_kg_kwh: '',
        electricity_factor_source: '',
        scope3_total_tco2e: '',
        scope3_purchased_goods_tco2e: '',
        scope3_transport_tco2e: '',
        scope3_waste_tco2e: '',
        scope3_business_travel_tco2e: '',
        scope3_other_tco2e: '',
        data_quality_notes: ''
    });
    const [recommendations, setRecommendations] = useState([]);
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const recommendationRequestInFlight = useRef(false);
    const [recommendationError, setRecommendationError] = useState('');
    const [recommendationNotice, setRecommendationNotice] = useState('');
    const [reportError, setReportError] = useState('');
    const [pathway, setPathway] = useState(null);
    const [loadingPathway, setLoadingPathway] = useState(false);
    const [pathwayError, setPathwayError] = useState('');
    const [pathwayRetry, setPathwayRetry] = useState(0);
    const [targetYear, setTargetYear] = useState(new Date().getFullYear() + 24);
    const [annualReductionPct, setAnnualReductionPct] = useState(4);

    // Marketplace state
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sellListings, setSellListings] = useState([]);
    const [loadingListings, setLoadingListings] = useState(false);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [selectedListing, setSelectedListing] = useState(null);
    const [purchaseAmount, setPurchaseAmount] = useState('');
    const [purchasing, setPurchasing] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    // Load recommendations when profile changes and has a company with a score
    useEffect(() => {
        if (profile?.company?.id && profile?.latestScore?.score) {
            loadRecommendations(profile.company.id);
        }
        // This effect is intentionally keyed to the current company score only;
        // loadRecommendations changes identity as its in-flight state changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.company?.id, profile?.latestScore?.score]);

    useEffect(() => {
        const companyId = profile?.company?.id;
        if (!companyId) return undefined;
        let current = true;
        setLoadingPathway(true);
        setPathwayError('');
        api.getNetZeroPathway(companyId, { targetYear, annualReductionPct })
            .then((response) => { if (current) setPathway(response.data.pathway); })
            .catch((error) => {
                if (current) {
                    setPathway(null);
                    setPathwayError(error.response?.data?.error || 'Could not calculate the pathway. Retry after checking the submitted data.');
                }
            })
            .finally(() => { if (current) setLoadingPathway(false); });
        return () => { current = false; };
    }, [profile?.company?.id, targetYear, annualReductionPct, pathwayRetry]);

    const loadData = async () => {
        try {
            const profileRes = await api.getProfile();
            setProfile(profileRes.data);

            if (profileRes.data.company?.id) {
                const [histRes, certRes] = await Promise.all([
                    api.getScoreHistory(profileRes.data.company.id),
                    api.getCompanyCertificates(profileRes.data.company.id)
                ]);
                setScoreHistory(histRes.data.history || []);
                setCertificates(certRes.data.certificates || []);
            } else {
                setScoreHistory([]);
                setCertificates([]);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadListings = async () => {
        setLoadingListings(true);
        try {
            const res = await api.getSellListings();
            setSellListings(res.data.listings || []);
        } catch (error) {
            console.error('Failed to load listings:', error);
        } finally {
            setLoadingListings(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'buy') {
            loadListings();
        }
    }, [activeTab]);

    const loadRecommendations = async (companyId, { forceRefresh = false } = {}) => {
        if (recommendationRequestInFlight.current) return null;
        recommendationRequestInFlight.current = true;
        setLoadingRecommendations(true);
        setRecommendationError('');
        try {
            const recRes = forceRefresh
                ? await api.generateRecommendations(companyId)
                : await api.getRecommendations(companyId);
            const items = Array.isArray(recRes.data?.recommendations) ? recRes.data.recommendations : [];
            setRecommendations(items.map(normalizeRecommendation).filter(Boolean));
            if (forceRefresh) {
                setRecommendationNotice(recRes.data.generation || 'Suggestions were refreshed from the latest assessment.');
            }
            return recRes.data;
        } catch (error) {
            console.error('Failed to load recommendations:', error);
            setRecommendationError(error.response?.data?.error || 'Could not generate recommendations. Retry when the service is available.');
            return null;
        } finally {
            recommendationRequestInFlight.current = false;
            setLoadingRecommendations(false);
        }
    };

    const updateRecommendation = async (recommendationId, status) => {
        try {
            await api.updateRecommendationStatus(profile.company.id, recommendationId, status);
            await loadRecommendations(profile.company.id);
        } catch (error) {
            console.error('Failed to update recommendation:', error);
            alert(error.response?.data?.error || 'Failed to update recommendation status.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!profile?.company?.id) return;

        setSubmitting(true);
        try {
            await api.submitCompanyData(profile.company.id, formData);
            await loadData();
            // Refresh recommendations after new data submission
            await loadRecommendations(profile.company.id);
            alert('Data submitted successfully! Your carbon score has been updated.');
        } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to submit data: ' + (error.response?.data?.error || error.message));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDownload = async (certId) => {
        try {
            const response = await api.downloadCertificate(certId);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `certificate-${certId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download certificate');
        }
    };

    const handleDownloadAssessmentReport = async () => {
        if (!profile?.company?.id || downloadingReport || loadingRecommendations) return;
        setReportError('');
        setDownloadingReport(true);
        try {
            const response = await api.downloadAssessmentReport(profile.company.id, { targetYear, annualReductionPct });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${(profile.company.name || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-carbon-assessment.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Assessment report download failed:', error);
            setReportError(error.response?.data?.error || 'Could not prepare the assessment report. Retry after checking the latest submission.');
        } finally {
            setDownloadingReport(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    };

    const handlePurchase = async () => {
        if (!selectedListing || !purchaseAmount) return;

        const amount = parseFloat(purchaseAmount);
        if (isNaN(amount) || amount <= 0 || amount > parseFloat(selectedListing.amount)) {
            alert('Please enter a valid amount');
            return;
        }

        setPurchasing(true);
        try {
            await api.purchaseCredits({
                listingId: selectedListing.id,
                amount: amount
            });
            alert(`Successfully purchased ${amount} credits from ${selectedListing.seller_name}!`);
            setShowPurchaseModal(false);
            setSelectedListing(null);
            setPurchaseAmount('');
            loadListings();
            loadData(); // Refresh balance
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Purchase failed: ' + (error.response?.data?.error || error.message));
        } finally {
            setPurchasing(false);
        }
    };

    const openPurchaseModal = (listing) => {
        setSelectedListing(listing);
        setPurchaseAmount('');
        setShowPurchaseModal(true);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading dashboard...</div>
            </div>
        );
    }

    const latestScore = profile?.latestScore;
    const pathwayChartData = pathway?.available
        ? [...new Set([...(pathway.historical || []).map((item) => item.year), ...pathway.trajectory.map((item) => item.year)])]
            .sort((a, b) => a - b)
            .map((year) => ({
                year,
                historical: pathway.historical?.filter((item) => item.year === year).slice(-1)[0]?.emissions ?? null,
                projected: pathway.trajectory.find((item) => item.year === year)?.emissions ?? null
            }))
        : [];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {profile?.company?.name || 'Company Dashboard'}
                        </h1>
                        <p className="text-gray-600">{profile?.company?.industry || 'Carbon Score Management'}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                    >
                        Logout
                    </button>
                </div>
                {/* Tab Navigation */}
                <div className="max-w-7xl mx-auto px-4 border-t">
                    <div className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm ${activeTab === 'dashboard'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('buy')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === 'buy'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <span>🛒</span> Buy Credits
                        </button>
                    </div>
                </div>
            </div>

            {/* Purchase Modal */}
            {showPurchaseModal && selectedListing && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                        <h3 className="text-xl font-bold mb-4">Purchase Carbon Credits</h3>
                        <div className="mb-4">
                            <p className="text-gray-600">Seller: <span className="font-semibold">{selectedListing.seller_name}</span></p>
                            <p className="text-gray-600">Available: <span className="font-semibold">{parseFloat(selectedListing.amount).toFixed(2)} credits</span></p>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Amount to Purchase
                            </label>
                            <input
                                type="number"
                                min="0.01"
                                max={selectedListing.amount}
                                step="0.01"
                                value={purchaseAmount}
                                onChange={(e) => setPurchaseAmount(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="Enter amount"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowPurchaseModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                                disabled={purchasing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePurchase}
                                disabled={purchasing || !purchaseAmount}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                {purchasing ? 'Processing...' : 'Confirm Purchase'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Buy Credits Tab */}
                {activeTab === 'buy' && (
                    <div className="bg-white rounded-lg shadow p-6 mb-8">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Carbon Credit Marketplace</h2>
                                <p className="text-gray-600">Purchase credits from individuals</p>
                            </div>
                            <button
                                onClick={loadListings}
                                disabled={loadingListings}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                            >
                                {loadingListings ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>

                        {loadingListings ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto"></div>
                                <p className="mt-4 text-gray-600">Loading available credits...</p>
                            </div>
                        ) : sellListings.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p className="text-5xl mb-4">📭</p>
                                <p className="text-lg">No credits available for purchase at the moment.</p>
                                <p className="text-sm mt-2">Check back later for new listings from individuals.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available Credits</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Listed Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {sellListings.map((listing) => (
                                            <tr key={listing.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{listing.seller_name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-lg font-semibold text-green-600">
                                                        {parseFloat(listing.amount).toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(listing.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button
                                                        onClick={() => openPurchaseModal(listing)}
                                                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                                                    >
                                                        Buy
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Dashboard Content */}
                {activeTab === 'dashboard' && (
                    <>
                        {/* Score Card */}
                        <div className="bg-white rounded-lg shadow p-8 mb-8">
                            <div className="grid md:grid-cols-3 gap-8">
                                <div className="text-center">
                                    <h2 className="text-lg font-semibold text-gray-600 mb-2">Current Carbon Score</h2>
                                    <div className="text-6xl font-bold text-green-600">
                                        {latestScore?.score ? Number(latestScore.score).toFixed(1) : '—'}
                                    </div>
                                    <div className={`inline-block mt-2 px-4 py-1 rounded-full text-sm font-medium ${latestScore?.score_category === 'Excellent' ? 'bg-green-100 text-green-800' :
                                        latestScore?.score_category === 'Good' ? 'bg-blue-100 text-blue-800' :
                                            latestScore?.score_category === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                        }`}>
                                        {latestScore?.score_category || 'Not Scored'}
                                    </div>
                                    {latestScore?.scoring_method === 'fallback' && <p className="mt-2 text-xs text-amber-700">Rule-based fallback score; the carbon-score model is unavailable.</p>}
                                    {latestScore?.scoring_method === 'model' && <p className="mt-2 text-xs text-gray-500">Carbon-score model: {latestScore.model_version}</p>}
                                    {latestScore?.scoring_method === 'unknown' && latestScore?.score && <p className="mt-2 text-xs text-gray-500">Scoring method was not recorded for this earlier result.</p>}
                                </div>

                                <div className="text-center">
                                    <h2 className="text-lg font-semibold text-gray-600 mb-2">Credit Balance</h2>
                                    <div className="text-4xl font-bold text-blue-600">
                                        {profile?.user?.creditBalance?.toFixed(2) || '0.00'}
                                    </div>
                                    <p className="text-gray-500 mt-2">Carbon Credits</p>
                                </div>

                                <div className="text-center">
                                    <h2 className="text-lg font-semibold text-gray-600 mb-2">Certificates</h2>
                                    <div className="text-4xl font-bold text-purple-600">
                                        {certificates.filter(c => c.status === 'active').length}
                                    </div>
                                    <p className="text-gray-500 mt-2">Active Certificates</p>
                                </div>
                            </div>
                        </div>

                        {/* AI Recommendations Section */}
                        {latestScore?.score && (
                            <div className="bg-white rounded-lg shadow p-6 mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                            <span className="text-white text-lg">💡</span>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-800">Recommendations</h2>
                                            <p className="text-sm text-gray-500">Actions grounded in your latest submitted data</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => loadRecommendations(profile.company.id, { forceRefresh: true })}
                                        disabled={loadingRecommendations}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all duration-200"
                                    >
                                        <svg
                                            className={`w-4 h-4 ${loadingRecommendations ? 'animate-spin' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        {loadingRecommendations ? 'Generating...' : 'Get New Suggestions'}
                                    </button>
                                </div>

                                {recommendationNotice && <p className="mb-3 rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800" role="status">{recommendationNotice}</p>}
                                {recommendationError && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                                    <span>{recommendationError}</span>
                                    <button onClick={() => loadRecommendations(profile.company.id, { forceRefresh: true })} disabled={loadingRecommendations} className="rounded border border-red-300 px-3 py-1 font-medium disabled:opacity-50">Retry</button>
                                </div>}

                                {loadingRecommendations ? (
                                    <div className="flex items-center justify-center gap-3 py-8" role="status" aria-live="polite">
                                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" aria-hidden="true"></div>
                                        <span className="text-gray-600">Generating company-specific recommendations from your latest data...</span>
                                    </div>
                                ) : recommendations.length > 0 ? (
                                    <ul className="space-y-3">
                                        {recommendations.map((rec, index) => (
                                            <li key={rec.id} className="flex items-start gap-3 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-100">
                                                <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                                    {index + 1}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold text-gray-800">{rec.title}</div>
                                                    <p className="mt-1 text-sm text-gray-700">{rec.rationale}</p>
                                                    <p className="mt-1 text-sm text-gray-600">{rec.action}</p>
                                                    <div className="mt-2 grid gap-1 text-xs text-gray-600 md:grid-cols-3">
                                                        <span><strong>Priority:</strong> {rec.priority}</span>
                                                        <span><strong>Suggested timeframe:</strong> {rec.timeframe}</span>
                                                        <span className="md:col-span-3"><strong>Measure:</strong> {rec.kpi || 'Track the relevant submitted metric against a documented baseline.'}</span>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className="text-xs text-gray-500">{rec.source === 'classifier' ? 'Classifier-selected category · data-grounded details' : 'Data-driven rule'} · {rec.status}</span>
                                                        {rec.status === 'active' && <>
                                                            <button onClick={() => updateRecommendation(rec.id, 'accepted')} className="rounded border border-green-600 px-2 py-1 text-xs text-green-700">Accept</button>
                                                            <button onClick={() => updateRecommendation(rec.id, 'dismissed')} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600">Dismiss</button>
                                                        </>}
                                                        {rec.status === 'accepted' && <button onClick={() => updateRecommendation(rec.id, 'completed')} className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700">Mark completed</button>}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-center py-6 text-gray-500">
                                        <p>No recommendations available. Submit environmental data to get personalized suggestions.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Deterministic Net Zero scenario */}
                        <section className="mb-8 rounded-lg bg-white p-6 shadow" aria-labelledby="net-zero-pathway-heading">
                            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h2 id="net-zero-pathway-heading" className="text-xl font-bold text-gray-900">Net Zero Pathway</h2>
                                    <p className="text-sm text-gray-600">A transparent scenario using submitted emissions and your selected reduction assumptions.</p>
                                </div>
                                <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
                                    <label className="text-sm font-medium text-gray-700">Target year
                                        <input type="number" min={new Date().getFullYear() + 1} max="2100" value={targetYear} onChange={(event) => setTargetYear(Number(event.target.value))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                                    </label>
                                    <label className="text-sm font-medium text-gray-700">Annual reduction (% of baseline)
                                        <input type="number" min="0.1" max="100" step="0.1" value={annualReductionPct} onChange={(event) => setAnnualReductionPct(Number(event.target.value))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                                    </label>
                                </div>
                            </div>
                            {loadingPathway && <div className="flex items-center gap-3 py-4 text-sm text-gray-600" role="status" aria-live="polite"><span className="h-5 w-5 animate-spin rounded-full border-b-2 border-green-600" aria-hidden="true" />Calculating the emissions scenario...</div>}
                            {pathwayError && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><span>{pathwayError}</span><button onClick={() => setPathwayRetry((attempt) => attempt + 1)} disabled={loadingPathway} className="rounded border border-red-300 px-3 py-1 font-medium disabled:opacity-50">Retry calculation</button></div>}
                            {!loadingPathway && pathway?.available && <>
                                <p className="mb-4 rounded border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">Scenario only, not a forecast or approved company target. It assumes a linear absolute reduction of {pathway.annualReductionPct}% of baseline ({pathway.annualReductionTco2e.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e) each year. Offsets are excluded.</p>
                                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                    {[
                                        ['Baseline', `${pathway.baselineEmissions.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`, `Year ${pathway.baselineYear}`],
                                        ['Current inventory', pathway.currentEmissions === null ? 'Not available' : `${pathway.currentEmissions.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`, pathway.currentEmissions === null ? 'Latest submission is incomplete' : 'Latest complete inventory'],
                                        ['Target year', `${pathway.targetEmissions.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`, `Year ${pathway.targetYear}`],
                                        ['Reduction at target', `${pathway.reductionAtTargetPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`, 'Absolute emissions'],
                                        ['Remaining at target', `${(100 - pathway.reductionAtTargetPct).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`, `${pathway.targetEmissions.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2e`],
                                        ['Scenario reaches zero', String(pathway.estimatedTargetYear), 'At selected annual rate']
                                    ].map(([label, value, detail]) => <div key={label} className="rounded border border-gray-200 bg-gray-50 p-3"><div className="text-xs font-semibold uppercase text-gray-500">{label}</div><div className="mt-1 text-lg font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{detail}</div></div>)}
                                </div>
                                {pathwayChartData.length > 1 && <div className="h-72" aria-label="Historical emissions and deterministic target pathway chart">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={pathwayChartData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="year" />
                                            <YAxis unit=" tCO2e" />
                                            <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} tCO2e`, name === 'historical' ? 'Measured inventory' : 'Scenario pathway']} />
                                            <Line type="monotone" dataKey="historical" name="Measured inventory" stroke="#2563a6" strokeWidth={2} connectNulls />
                                            <Line type="linear" dataKey="projected" name="Scenario pathway" stroke="#14805e" strokeWidth={2} strokeDasharray="6 4" connectNulls />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>}
                                <p className="mt-3 text-xs text-gray-500">Historical points use complete submitted inventories only. Projection method: {pathway.method}</p>
                            </>}
                            {!loadingPathway && pathway && !pathway.available && <p className="rounded border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">{pathway.reason}</p>}
                        </section>

                        {/* Score History Chart */}
                        {scoreHistory.length > 0 && (
                            <div className="bg-white rounded-lg shadow p-6 mb-8">
                                <h2 className="text-xl font-bold mb-4">Score History</h2>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={scoreHistory.slice().reverse()}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="scoredAt"
                                            tickFormatter={(date) => new Date(date).toLocaleDateString()}
                                        />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip
                                            labelFormatter={(date) => new Date(date).toLocaleString()}
                                            formatter={(value) => [value.toFixed(1), 'Score']}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="score"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            dot={{ fill: '#10b981' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Data Submission Form */}
                        <div className="bg-white rounded-lg shadow p-6 mb-8">
                            <h2 className="text-xl font-bold mb-4">Submit Environmental Data</h2>
                            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-green-100 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Industrial GHG Assessment & Net Zero Roadmap</h3>
                                    <p className="text-sm text-gray-600">Generate a company-specific PDF from your latest submitted inventory.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadAssessmentReport}
                                    disabled={downloadingReport || loadingRecommendations || !profile?.company?.id}
                                    className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {downloadingReport ? 'Preparing report...' : 'Download Assessment Report'}
                                </button>
                            </div>
                            {reportError && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><span>{reportError}</span><button type="button" onClick={handleDownloadAssessmentReport} disabled={downloadingReport || loadingRecommendations} className="rounded border border-red-300 px-3 py-1 font-medium disabled:opacity-50">Retry report</button></div>}
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <h3 className="mb-3 font-semibold text-gray-800">Reporting period</h3>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <label className="text-sm font-medium text-gray-700">Start date
                                            <input type="date" required value={formData.reporting_period_start} onChange={(e) => setFormData({ ...formData, reporting_period_start: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        <label className="text-sm font-medium text-gray-700">End date
                                            <input type="date" required min={formData.reporting_period_start} value={formData.reporting_period_end} onChange={(e) => setFormData({ ...formData, reporting_period_end: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Renewable Energy Usage (%)
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={formData.renewable_energy_pct}
                                            onChange={(e) => setFormData({ ...formData, renewable_energy_pct: parseInt(e.target.value) })}
                                            className="w-full"
                                        />
                                        <div className="text-center text-gray-600">{formData.renewable_energy_pct}%</div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Waste Recycling Rate (%)
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={formData.waste_recycled_pct}
                                            onChange={(e) => setFormData({ ...formData, waste_recycled_pct: parseInt(e.target.value) })}
                                            className="w-full"
                                        />
                                        <div className="text-center text-gray-600">{formData.waste_recycled_pct}%</div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Energy Consumption (kWh)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.energy_consumption}
                                            onChange={(e) => setFormData({ ...formData, energy_consumption: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            CO2 Emissions (tons)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.emissions_co2}
                                            onChange={(e) => setFormData({ ...formData, emissions_co2: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Water Usage (liters)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.water_usage}
                                            onChange={(e) => setFormData({ ...formData, water_usage: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Employee Count
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.employee_count}
                                            onChange={(e) => setFormData({ ...formData, employee_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Production Volume
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.production_volume}
                                            onChange={(e) => setFormData({ ...formData, production_volume: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>
                                </div>

                                <div className="border-t pt-5">
                                    <h3 className="text-lg font-semibold text-gray-900">GHG inventory inputs (tCO2e)</h3>
                                    <p className="mb-4 text-sm text-gray-600">Enter scope totals from your records. Missing scopes remain unquantified in the report.</p>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <label className="text-sm font-medium text-gray-700">Scope 1 direct emissions
                                            <input type="number" min="0" step="any" value={formData.scope1_tco2e} onChange={(e) => setFormData({ ...formData, scope1_tco2e: e.target.value })} placeholder="Optional" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        {[
                                            ['scope1_stationary_combustion_tco2e', 'Scope 1: stationary fuel combustion'],
                                            ['scope1_mobile_combustion_tco2e', 'Scope 1: mobile combustion'],
                                            ['scope1_process_tco2e', 'Scope 1: process emissions'],
                                            ['scope1_fugitive_tco2e', 'Scope 1: fugitive / refrigerant emissions']
                                        ].map(([name, label]) => (
                                            <label key={name} className="text-sm font-medium text-gray-700">{label}
                                                <input type="number" min="0" step="any" value={formData[name]} onChange={(e) => setFormData({ ...formData, [name]: e.target.value })} placeholder="Optional" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                            </label>
                                        ))}
                                        <label className="text-sm font-medium text-gray-700">Purchased electricity (kWh)
                                            <input type="number" min="0" step="any" value={formData.electricity_consumption_kwh} onChange={(e) => setFormData({ ...formData, electricity_consumption_kwh: e.target.value })} placeholder="Required to calculate Scope 2" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        <label className="text-sm font-medium text-gray-700">Electricity grid factor (kg CO2e/kWh)
                                            <input type="number" min="0" step="any" value={formData.electricity_grid_factor_kg_kwh} onChange={(e) => setFormData({ ...formData, electricity_grid_factor_kg_kwh: e.target.value })} placeholder="Required to calculate Scope 2" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        <label className="text-sm font-medium text-gray-700 md:col-span-2">Electricity factor source / reference
                                            <input type="text" maxLength="500" value={formData.electricity_factor_source} onChange={(e) => setFormData({ ...formData, electricity_factor_source: e.target.value })} placeholder="Publisher, region, year, URL or document reference" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        <label className="text-sm font-medium text-gray-700">Scope 3 reported total
                                            <input type="number" min="0" step="any" value={formData.scope3_total_tco2e} onChange={(e) => setFormData({ ...formData, scope3_total_tco2e: e.target.value })} placeholder="Optional; category sum used if blank" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                        <div className="hidden md:block" />
                                        {[
                                            ['scope3_purchased_goods_tco2e', 'Scope 3: purchased goods and services'],
                                            ['scope3_transport_tco2e', 'Scope 3: upstream transportation'],
                                            ['scope3_waste_tco2e', 'Scope 3: waste generated in operations'],
                                            ['scope3_business_travel_tco2e', 'Scope 3: business travel'],
                                            ['scope3_other_tco2e', 'Scope 3: other value-chain sources']
                                        ].map(([name, label]) => (
                                            <label key={name} className="text-sm font-medium text-gray-700">{label}
                                                <input type="number" min="0" step="any" value={formData[name]} onChange={(e) => setFormData({ ...formData, [name]: e.target.value })} placeholder="Optional" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                            </label>
                                        ))}
                                        <label className="text-sm font-medium text-gray-700 md:col-span-2">Data quality notes
                                            <textarea rows="3" maxLength="2000" value={formData.data_quality_notes} onChange={(e) => setFormData({ ...formData, data_quality_notes: e.target.value })} placeholder="Estimates, exclusions, boundary notes, source records or known limitations" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                                        </label>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                                >
                                    {submitting ? 'Submitting...' : 'Submit Data & Get Score'}
                                </button>
                            </form>
                        </div>

                        {/* Certificates */}
                        {certificates.length > 0 && (
                            <div className="bg-white rounded-lg shadow p-6">
                                <h2 className="text-xl font-bold mb-4">Your Certificates</h2>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {certificates.map((cert) => (
                                        <div key={cert.certificate_id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="text-sm text-gray-500">Certificate ID</div>
                                                    <div className="font-mono text-sm">{cert.certificate_id}</div>
                                                </div>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${cert.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {cert.status}
                                                </span>
                                            </div>
                                            <div className="flex justify-center mb-4">
                                                <QRCode
                                                    value={`${window.location.origin}/verify/${cert.certificate_id}`}
                                                    size={100}
                                                />
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-bold">{cert.score}</div>
                                                <div className={`text-sm ${cert.score_category === 'Excellent' ? 'text-green-600' :
                                                    cert.score_category === 'Good' ? 'text-blue-600' :
                                                        cert.score_category === 'Fair' ? 'text-yellow-600' :
                                                            'text-red-600'
                                                    }`}>
                                                    {cert.score_category}
                                                </div>
                                            </div>
                                            <div className="mt-4 text-xs text-gray-500 text-center">
                                                Valid until: {new Date(cert.valid_until).toLocaleDateString()}
                                            </div>
                                            <button
                                                onClick={() => handleDownload(cert.certificate_id)}
                                                className="w-full mt-4 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
                                            >
                                                Download PDF
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default CompanyDashboard;

