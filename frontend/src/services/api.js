/**
 * API Service
 * Centralized API client for backend communication
 */
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRequest = /\/auth\/(login|register)(?:\?|$)/.test(error.config?.url || '');
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API methods
const api = {
  // Auth
  register: (data) => apiClient.post('/auth/register', data),
  login: (data) => apiClient.post('/auth/login', data),
  getProfile: () => apiClient.get('/auth/profile'),

  // Companies
  getAllCompanies: () => apiClient.get('/companies'),
  submitCompanyData: (companyId, data) =>
    apiClient.post(`/companies/${companyId}/data`, data),
  getCompanyScore: (companyId) =>
    apiClient.get(`/companies/${companyId}/score`),
  getScoreHistory: (companyId) =>
    apiClient.get(`/companies/${companyId}/score-history`),
  getRecommendations: (companyId) =>
    apiClient.get(`/companies/${companyId}/recommendations`),

  // Certificates
  downloadCertificate: (certId) =>
    apiClient.get(`/certificates/download/${certId}`, { responseType: 'blob' }),
  verifyCertificate: (certId) =>
    axios.get(`${API_BASE_URL}/../verify/${certId}`),
  getCompanyCertificates: (companyId) =>
    apiClient.get(`/certificates/company/${companyId}`),
  getCertificateAuditLog: () =>
    apiClient.get('/certificates/audit/log'),

  // Credits
  getCreditBalance: () => apiClient.get('/credits/balance'),
  transferCredits: (data) => apiClient.post('/credits/transfer', data),
  getTransactionHistory: () => apiClient.get('/credits/transactions'),
  getMarketplace: () => apiClient.get('/credits/marketplace'),

  // Credit Listings (Marketplace)
  createSellListing: (data) => apiClient.post('/credits/listings', data),
  getSellListings: () => apiClient.get('/credits/listings'),
  getMyListings: () => apiClient.get('/credits/my-listings'),
  cancelSellListing: (id) => apiClient.delete(`/credits/listings/${id}`),
  purchaseCredits: (data) => apiClient.post('/credits/purchase', data),

  // Tenders
  getTenders: () => apiClient.get('/tenders'),
  createTender: (data) => apiClient.post('/tenders', data),
  applyForTender: (tenderId, data) =>
    apiClient.post(`/tenders/${tenderId}/apply`, data),
  getMyApplications: () => apiClient.get('/tenders/my-applications'),
  getTenderApplications: (tenderId) =>
    apiClient.get(`/tenders/${tenderId}/applications`),

  // Government
  getGovDashboard: () => apiClient.get('/gov/dashboard'),
  getAllGovCompanies: (params) => apiClient.get('/gov/companies', { params }),
  getAllGovIndividuals: (params) => apiClient.get('/gov/individuals', { params }),
  getIndustryAnalysis: () => apiClient.get('/gov/industry-analysis'),
  getScoreDistribution: () => apiClient.get('/gov/score-distribution'),
};

export default api;
