/**
 * Authentication Controller
 * Handles user registration, login, and profile management
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../config/database');

class AuthController {
  /**
   * Register a new user
   */
  async register(req, res) {
    try {
      const { password, fullName, userType, companyName, industry, registrationNumber, address } = req.body;
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      // Validate required fields
      if (!email || !password || !fullName || !userType) {
        return res.status(400).json({
          error: 'Missing required fields: email, password, fullName, userType'
        });
      }

      // Validate user type
      if (!['company', 'individual', 'government'].includes(userType)) {
        return res.status(400).json({
          error: 'Invalid user type. Must be: company, individual, or government'
        });
      }

      if (userType === 'company' && !companyName?.trim()) {
        return res.status(400).json({ error: 'Company name is required for company accounts' });
      }

      // Check if email already exists
      const existingUser = await query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user and company in transaction
      const result = await transaction(async (client) => {
        // Create user
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, user_type, full_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, user_type, full_name, created_at`,
          [email, passwordHash, userType, fullName]
        );

        const user = userResult.rows[0];

        // If company user, create company record
        let company = null;
        if (userType === 'company') {
          if (!companyName) {
            throw new Error('Company name is required for company accounts');
          }

          const companyResult = await client.query(
            `INSERT INTO companies (user_id, company_name, industry, registration_number, address)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, company_name, industry, registration_number`,
            [user.id, companyName, industry || null, registrationNumber || null, address || null]
          );

          company = companyResult.rows[0];

          // Initialize credits for the company
          await client.query(
            'INSERT INTO credits (owner_id, amount) VALUES ($1, $2)',
            [user.id, 0]
          );
        }

        // If individual, initialize credits
        if (userType === 'individual') {
          await client.query(
            'INSERT INTO credits (owner_id, amount) VALUES ($1, $2)',
            [user.id, 100] // Give individuals some starting credits
          );
        }

        return { user, company };
      });

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: result.user.id,
          email: result.user.email,
          userType: result.user.user_type,
          companyId: result.company?.id || null
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.full_name,
          userType: result.user.user_type,
          company: result.company
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: error.message || 'Registration failed',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Login user
   */
  async login(req, res) {
    try {
      const { password } = req.body;
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Find user with company info if applicable
      const result = await query(
        `SELECT u.id, u.email, u.password_hash, u.user_type, u.full_name,
                c.id as company_id, c.company_name, c.industry
         FROM users u
         LEFT JOIN companies c ON u.id = c.user_id
         WHERE LOWER(u.email) = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          userType: user.user_type,
          companyId: user.company_id || null
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          userType: user.user_type,
          company: user.company_id ? {
            id: user.company_id,
            name: user.company_name,
            industry: user.industry
          } : null
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Login failed',
        details: error.message
      });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      const result = await query(
        `SELECT u.id, u.email, u.user_type, u.full_name, u.created_at,
                c.id as company_id, c.company_name, c.industry, c.registration_number, c.address,
                cr.amount as credit_balance
         FROM users u
         LEFT JOIN companies c ON u.id = c.user_id
         LEFT JOIN credits cr ON u.id = cr.owner_id
         WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];

      // Get latest carbon score if company
      let latestScore = null;
      if (user.company_id) {
        const scoreResult = await query(
          `SELECT score, score_category, scored_at
           FROM carbon_scores
           WHERE company_id = $1
           ORDER BY scored_at DESC
           LIMIT 1`,
          [user.company_id]
        );

        if (scoreResult.rows.length > 0) {
          latestScore = scoreResult.rows[0];
          latestScore.score = parseFloat(latestScore.score);
        }
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          userType: user.user_type,
          createdAt: user.created_at,
          creditBalance: parseFloat(user.credit_balance) || 0
        },
        company: user.company_id ? {
          id: user.company_id,
          name: user.company_name,
          industry: user.industry,
          registrationNumber: user.registration_number,
          address: user.address
        } : null,
        latestScore
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: 'Failed to fetch profile',
        details: error.message
      });
    }
  }
}

module.exports = new AuthController();
