/**
 * Company Routes
 */
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authenticateToken, requireCompany } = require('../middleware/auth');

// Get all companies (public or authenticated)
router.get('/', companyController.getAllCompanies);

// Protected routes
router.post('/:id/data', authenticateToken, requireCompany, companyController.submitData);
router.get('/:id/score', authenticateToken, companyController.getScore);
router.get('/:id/score-history', authenticateToken, companyController.getScoreHistory);
router.get('/:id/recommendations', authenticateToken, companyController.getRecommendations);
router.post('/:id/recommendations/generate', authenticateToken, companyController.getRecommendations);
router.patch('/:id/recommendations/:recommendationId', authenticateToken, companyController.updateRecommendationStatus);
router.get('/:id/net-zero-pathway', authenticateToken, companyController.getNetZeroPathway);
router.get('/:id/assessment-report', authenticateToken, requireCompany, companyController.downloadAssessmentReport);

module.exports = router;
