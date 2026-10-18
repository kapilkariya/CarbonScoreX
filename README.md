# CarbonScoreX 🌿

**Indian Carbon Market Compliance Platform**

A full-stack web application for carbon credit trading, scoring, and compliance management aligned with India's Carbon Credit Trading Scheme (CCTS).

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Python](https://img.shields.io/badge/python-%3E%3D3.9-blue)

## 🌟 Features

### For Companies
- **Carbon Score Assessment** - carbon-score model when its artifacts are supplied; otherwise a clearly identified deterministic fallback
- **Certificate Generation** - Downloadable PDF certificates with QR codes
- **Credit Trading** - Buy carbon credits from marketplace
- **Score History** - Track improvement over time
- **Recommendations** - classifier-selected categories with data-grounded backend actions and scope-completeness guidance

### For Individuals
- **Credit Balance** - Track owned carbon credits
- **Sell Credits** - List credits for sale to companies
- **Transaction History** - Complete audit trail

### For Government
- **Dashboard Analytics** - Industry-wide statistics
- **Company Monitoring** - Detailed company views with ML analysis
- **Individual Tracking** - Monitor individual credit holdings
- **User Management** - Temporary ban functionality
- **Tender System** - Create tenders with minimum score requirements

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                   (React + Vite + TailwindCSS)              │
│                     Port: 3000                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│                   (Node.js + Express)                        │
│                     Port: 5000                               │
│  • Auth, Companies, Credits, Certificates, Government       │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│   ML Service     │    │   PostgreSQL     │
│ (FastAPI/Python) │    │    Database      │
│   Port: 8000     │    │   Port: 5432     │
│                  │    │                  │
│ • Carbon Score   │    │ • Users          │
│ • Risk Analysis  │    │ • Companies      │
│ • Credibility    │    │ • Credits        │
│ • System Tier    │    │ • Certificates   │
└──────────────────┘    └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- Python >= 3.9
- PostgreSQL >= 14
- npm or yarn

### 1. Clone the repository
```bash
git clone https://github.com/MrCrow-creator/CarbonScoreX.git
cd CarbonScoreX
```

### 2. Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev
```

### 3. Setup Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm start
```

### 4. Setup ML Service
```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python src/api.py
```

### 5. Initialize Database
```bash
cd backend
psql $DATABASE_URL -f migrations/001_init_schema.sql
psql $DATABASE_URL -f migrations/002_credit_listings.sql
psql $DATABASE_URL -f migrations/003_company_recommendations.sql
psql $DATABASE_URL -f migrations/004_recommendation_planning_details.sql
```

## 🌐 Vercel Deployment

Each service can be deployed separately to Vercel:

### Frontend
```bash
cd frontend
vercel
```

### Backend
```bash
cd backend
vercel
```
Set environment variables in Vercel dashboard:
- `DATABASE_URL`
- `JWT_SECRET`
- `ML_SERVICE_URL` (for example, `http://ml-service:8000` on the Compose network)
- `ML_SERVICE_URL`

### ML Service
```bash
cd ml-service
vercel
```

## Industrial GHG assessment reports

Company users can submit a reporting period, Scope 1 emissions, purchased electricity and its emission factor, and Scope 3 totals or category detail from the company dashboard. The generated PDF uses the latest submitted company record and earlier submissions for available trend comparisons. Scope 2 is calculated from the company-entered electricity activity and factor; a complete total is shown only when all three scopes are quantified. The legacy CO2 field remains separately disclosed because its scope boundary is unknown.

No PostgreSQL migration is needed for the GHG input fields: they are stored in `company_data_records.data` JSONB and older records remain valid. Recommendation lifecycle and planning metadata use migrations `003_company_recommendations.sql` and `004_recommendation_planning_details.sql`.

### Recommendation classifier and Net Zero planning

The backend sends only numeric assessment fields to `POST /recommendations/predict` at `ML_SERVICE_URL` (Compose service hostname `ml-service`, port `8000`). Missing fields remain absent. The classifier selects among four trained action categories; backend rules provide the detailed action, rationale, priority, timeframe, KPI and evidence. Scope 1, Scope 2 and Scope 3 completeness actions are deterministic and are retained independently of classifier output. If the classifier is unavailable, supported deterministic recommendations remain available without waiting for a language model.

The Net Zero pathway uses the existing deterministic inventory calculator. It calculates a scenario only from a complete Scope 1, Scope 2 and Scope 3 baseline, labels the trajectory as illustrative arithmetic, and does not present it as a verified forecast or company commitment. PDF reports use the same saved assessment, recommendations and pathway calculations as the dashboard.

The recommendation artifact was trained on 200 synthetic records with rule-generated labels; its evaluation does not establish real-world accuracy. The separate carbon-score model artifacts are not currently included under `ml-service/models`. In their absence, `/health` reports `model_loaded: false` and carbon scoring uses a rule-based fallback; score provenance is shown in the company dashboard.

Start the full development stack with Docker Compose:

```powershell
docker compose up --build
```

Compose supplies `ML_SERVICE_URL=http://ml-service:8000` for backend-to-ML traffic. Recommendation generation has no external language-model dependency.

## 📁 Project Structure

```
carbonscorex/
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # Dashboard components
│   │   ├── pages/         # Route pages
│   │   └── services/      # API client
│   └── vercel.json
│
├── backend/                # Express backend
│   ├── src/
│   │   ├── controllers/   # Route handlers
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth middleware
│   │   └── services/      # External services
│   ├── migrations/        # SQL migrations
│   └── vercel.json
│
└── ml-service/             # Python ML service
    ├── src/
    │   ├── models/        # 4 ML models
    │   ├── api.py         # FastAPI app
    │   └── pipeline.py    # ML pipeline
    ├── api/               # Vercel entry point
    └── vercel.json
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get profile

### Companies
- `GET /api/companies` - List companies
- `POST /api/companies/:id/data` - Submit data for scoring
- `GET /api/companies/:id/score-history` - Score history

### Credits
- `GET /api/credits/balance` - Get balance
- `POST /api/credits/transfer` - Transfer credits
- `GET /api/credits/listings` - Get marketplace listings
- `POST /api/credits/purchase` - Buy credits

### Certificates
- `GET /certificates/download/:id` - Download PDF
- `GET /verify/:certId` - Verify certificate (public)

### Government
- `GET /api/gov/dashboard` - Dashboard stats
- `GET /api/gov/companies` - All companies
- `POST /api/gov/users/:id/ban` - Ban user

## 🤖 ML Models
1. **Carbon Score Model** - Calculates 0-100 sustainability score
2. **Risk Model** - Predicts environmental risk probability
3. **Credibility Model** - Detects greenwashing
4. **System Model** - Assigns tier (Platinum/Gold/Silver/Bronze)

## 📜 Indian Carbon Market Compliance
Aligned with Bureau of Energy Efficiency's CCTS guidelines:
- GHG Emission Intensity tracking
- Carbon Credit Certificate issuance
- Verification workflow support
- Government oversight features

## 🛡️ Security
- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Helmet.js security headers
- Certificate signature verification

## 📄 License
MIT License - see [LICENSE](LICENSE)

## 👥 Contributors
- CarbonScoreX Team

---

**Built with ❤️ for a sustainable future**
