"""
FastAPI ML Microservice for CarbonScoreX
Exposes /predict endpoint for carbon score inference
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
import uvicorn

try:
    from inference import CarbonScorePredictor, RecommendationPredictor
    INFERENCE_AVAILABLE = True
except ImportError:
    INFERENCE_AVAILABLE = False
    print("Warning: Could not import inference module. Using fallback.")
    RecommendationPredictor = None

# Initialize FastAPI app
app = FastAPI(
    title="CarbonScoreX ML Service",
    description="Machine Learning microservice for carbon score prediction",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize predictor
try:
    if INFERENCE_AVAILABLE:
        predictor = CarbonScorePredictor(model_path='../models')
        MODEL_LOADED = True
    else:
        raise Exception("Inference module not available")
except Exception as e:
    print(f"Warning: Could not load ML model: {e}")
    print("Using fallback rule-based scoring")
    # Create a minimal instance for fallback with required methods
    class FallbackPredictor:
        def __init__(self):
            self.metadata = {}
        
        def _get_category(self, score: float) -> str:
            """Categorize score"""
            if score >= 80:
                return 'Excellent'
            elif score >= 65:
                return 'Good'
            elif score >= 50:
                return 'Fair'
            else:
                return 'Poor'
        
        def fallback_score(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
            """Deterministic fallback scoring when ML model is unavailable"""
            import numpy as np
            score = 50  # Base score
            
            # Renewable energy contribution (0-25 points)
            renewable_pct = company_data.get('renewable_energy_pct', 0)
            score += (renewable_pct / 100) * 25
            
            # Waste recycling contribution (0-20 points)
            recycling_pct = company_data.get('waste_recycled_pct', 0)
            score += (recycling_pct / 100) * 20
            
            # Emissions penalty (0 to -30 points)
            emissions = company_data.get('emissions_co2', 0)
            if emissions > 0:
                # Normalize emissions (assuming typical range 0-10000)
                normalized_emissions = min(emissions / 10000, 1.0)
                score -= normalized_emissions * 30
            
            # Energy efficiency bonus (0-15 points)
            energy = company_data.get('energy_consumption', 0)
            if energy > 0 and renewable_pct > 50:
                score += 15
            
            score = np.clip(score, 0, 100)
            
            return {
                'score': float(score),
                'category': self._get_category(score),
                'explanation': {
                    'method': 'rule_based_fallback',
                    'recommendations': ['ML service unavailable - using deterministic scoring']
                },
                'confidence': 0.7
            }
    
    predictor = FallbackPredictor()
    MODEL_LOADED = False

# Recommendations are isolated from the carbon-score predictor. Loading or
# running this classifier must never affect the existing score endpoints.
recommendation_predictor = RecommendationPredictor() if RecommendationPredictor else None

# Request/Response models
class CompanyDataInput(BaseModel):
    """Input schema for company data"""
    energy_consumption: Optional[float] = Field(None, description="Energy consumption (kWh)")
    renewable_energy_pct: Optional[float] = Field(None, ge=0, le=100, description="Renewable energy percentage")
    waste_recycled_pct: Optional[float] = Field(None, ge=0, le=100, description="Waste recycled percentage")
    emissions_co2: Optional[float] = Field(None, ge=0, description="CO2 emissions (tons)")
    water_usage: Optional[float] = Field(None, description="Water usage (liters)")
    employee_count: Optional[int] = Field(None, description="Number of employees")
    production_volume: Optional[float] = Field(None, description="Production volume")
    
    class Config:
        json_schema_extra = {
            "example": {
                "energy_consumption": 5000,
                "renewable_energy_pct": 65,
                "waste_recycled_pct": 70,
                "emissions_co2": 2000,
                "water_usage": 3000,
                "employee_count": 150,
                "production_volume": 10000
            }
        }

class PredictionResponse(BaseModel):
    """Response schema for predictions"""
    score: float = Field(..., description="Carbon score (0-100)")
    category: str = Field(..., description="Score category")
    explanation: Dict[str, Any] = Field(..., description="Detailed explanation")
    confidence: float = Field(..., description="Prediction confidence (0-1)")
    model_version: str = Field(..., description="Model version used")

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    model_type: Optional[str]

# API Endpoints
@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "service": "CarbonScoreX ML Service",
        "version": "1.0.0",
        "status": "operational"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": MODEL_LOADED,
        "model_type": predictor.metadata.get('model_type') if MODEL_LOADED else "fallback"
    }

@app.post("/predict", response_model=PredictionResponse)
async def predict_carbon_score(data: CompanyDataInput):
    """
    Predict carbon score for company data
    
    Args:
        data: Company environmental metrics
        
    Returns:
        Carbon score with explanation
    """
    try:
        # Convert to dictionary
        company_data = data.model_dump(exclude_none=True)
        
        # Make prediction
        if MODEL_LOADED:
            result = predictor.predict(company_data)
            model_version = predictor.metadata.get('model_type', 'unknown')
        else:
            result = predictor.fallback_score(company_data)
            model_version = "rule_based_fallback"
        
        # Add model version
        result['model_version'] = model_version
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {str(e)}"
        )

@app.post("/batch-predict")
async def batch_predict(data_list: list[CompanyDataInput]):
    """
    Batch prediction endpoint for multiple companies
    
    Args:
        data_list: List of company data
        
    Returns:
        List of predictions
    """
    try:
        results = []
        for data in data_list:
            company_data = data.model_dump(exclude_none=True)
            
            if MODEL_LOADED:
                result = predictor.predict(company_data)
                result['model_version'] = predictor.metadata.get('model_type', 'unknown')
            else:
                result = predictor.fallback_score(company_data)
                result['model_version'] = "rule_based_fallback"
            
            results.append(result)
        
        return {"predictions": results, "count": len(results)}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Batch prediction error: {str(e)}"
        )

@app.get("/model-info")
async def model_info():
    """Get information about the loaded model"""
    if MODEL_LOADED and predictor.metadata:
        return {
            "model_type": predictor.metadata.get('model_type'),
            "n_features": predictor.metadata.get('n_features'),
            "test_mae": predictor.metadata.get('test_mae'),
            "test_r2": predictor.metadata.get('test_r2'),
            "feature_names": predictor.metadata.get('feature_names', [])
        }
    else:
        return {
            "model_type": "fallback",
            "message": "Using rule-based fallback scoring"
        }

@app.post("/recommendations/predict")
async def predict_recommendations(company_data: Dict[str, Any]):
    """Predict action labels and report deterministic scope data gaps."""
    if recommendation_predictor is None:
        return {
            'model_version': 'carbonscorex_recommendation_model',
            'status': 'fallback',
            'recommendations': [],
            'data_completeness_recommendations': RecommendationPredictor.completeness_recommendations(company_data) if RecommendationPredictor else [],
            'message': 'Recommendation inference module unavailable.'
        }
    return recommendation_predictor.predict(company_data)

# Run server
if __name__ == "__main__":
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
