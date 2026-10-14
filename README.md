# CarbonScoreX 🌿

**Indian Carbon Market Compliance Platform**

A full-stack web application for carbon credit trading, scoring, and compliance management aligned with India's Carbon Credit Trading Scheme (CCTS).

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Python](https://img.shields.io/badge/python-%3E%3D3.9-blue)

## 🌟 Features

### For Companies
- **Carbon Score Assessment** - AI-powered 4-model ML pipeline
- **Certificate Generation** - Downloadable PDF certificates with QR codes
- **Credit Trading** - Buy carbon credits from marketplace
- **Score History** - Track improvement over time
- **AI Recommendations** - Gemini-powered suggestions for improvement

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
- `GEMINI_API_KEY`
- `ML_SERVICE_URL`

### ML Service
```bash
cd ml-service
vercel
```

## Industrial GHG assessment reports

Company users can submit a reporting period, Scope 1 emissions, purchased electricity and its emission factor, and Scope 3 totals or category detail from the company dashboard. The generated PDF uses the latest submitted company record and earlier submissions for available trend comparisons. Scope 2 is calculated from the company-entered electricity activity and factor; a complete total is shown only when all three scopes are quantified. The legacy CO2 field remains separately disclosed because its scope boundary is unknown.

No PostgreSQL migration is needed for the GHG input fields: they are stored in `company_data_records.data` JSONB and older records remain valid. Recommendation lifecycle and planning metadata use migrations `003_company_recommendations.sql` and `004_recommendation_planning_details.sql`.

### Local Ollama recommendations and Net Zero planning

CarbonScoreX sends company metrics and up to five recent submissions to the backend-configured language model for recommendation wording and report planning. Deterministic scoring, scope calculations, and the Python ML service remain independent. Recommendation rules validate the candidate actions, and the AI must return structured action, reason, priority, KPI, and timeframe fields. If Ollama is unavailable or its response is invalid, the API logs the failure and returns explicitly labeled data-driven rule recommendations; the report retains its deterministic planning fallback.

1. Install/start Ollama on the Windows host, then pull the configured model:

   ```powershell
   ollama pull qwen3:4b
   ollama serve
   ```

2. For the Node backend running directly on Windows, copy `.env.example` to `backend/.env` and keep `OLLAMA_BASE_URL=http://localhost:11434` with `AI_PROVIDER=ollama`.
3. With Docker Desktop, copy `.env.example` to the project `.env` file and set `OLLAMA_BASE_URL=http://host.docker.internal:11434` (Compose uses this default when unset). Keep Ollama on a trusted local interface and do not port-forward or publish port 11434 to the internet. If Docker cannot reach an Ollama instance bound only to loopback, allow host access only on the private Docker Desktop path and restrict inbound access with Windows Firewall; do not open the port to public networks.
4. Start the app with `docker compose up --build`. Compose mounts migrations only when initializing a new PostgreSQL volume. For an existing database, run migration `004_recommendation_planning_details.sql` after migration 003:

   ```powershell
   cd backend
   psql $env:DATABASE_URL -f migrations/004_recommendation_planning_details.sql
   ```

Set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` only if you want the optional Gemini provider instead. Ollama requests use `/api/chat`, the `qwen3:4b` default, JSON mode, and a 120-second configurable timeout (`OLLAMA_TIMEOUT_MS`). The API remains backend-only; the React app never connects to Ollama directly.

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
