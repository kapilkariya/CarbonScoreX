/**
 * Company Routes
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const companyController = require('../controllers/companyController');
const { authenticateToken, requireCompany } = require('../middleware/auth');

// Multer: memory storage for bill uploads (max 10 MB, bills only)
const billUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        }
    },
});

// Get all companies (public or authenticated)
router.get('/', companyController.getAllCompanies);

// ── AI bill extraction (authenticated company only) ──────────────────────────
// POST /api/companies/extract-bill
// Multipart body: file (required), hint (optional string)
router.post(
    '/extract-bill',
    authenticateToken,
    requireCompany,
    billUpload.single('file'),
    (err, req, res, next) => {
        // Handle multer errors specifically
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File is too large. Maximum size is 10 MB.' });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(415).json({ error: 'Unsupported file type. Please upload a PDF, PNG, JPG, or WEBP.' });
            }
            return res.status(400).json({ error: err.message });
        }
        next(err);
    },
    companyController.extractBill
);

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
