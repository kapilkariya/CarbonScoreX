"""
Inference module for CarbonScoreX
Loads trained model and generates predictions with explanations
"""
import os
from pathlib import Path
import joblib
import numpy as np
from typing import Dict, Any


class RecommendationPredictor:
    """Classifier for operational actions; scope completeness stays rule based.

    API-to-model feature aliases are explicit in FEATURE_INPUTS. Missing values
    are represented as NaN for the fitted median imputer, never as zero. Scope
    completeness is evaluated separately because missing-scope labels were not
    part of classifier training.
    """
    MODEL_VERSION = "carbonscorex_recommendation_model"
    FEATURE_INPUTS = {
        'renewable_energy_usage_pct': ('renewable_energy_usage_pct', 'renewable_energy_pct', 'renewable_pct'),
        'waste_recycling_rate_pct': ('waste_recycling_rate_pct', 'waste_recycled_pct', 'recycling_pct'),
        'energy_consumption_kwh': ('energy_consumption_kwh', 'energy_consumption', 'energy_usage'),
        'co2_emissions_tons': ('co2_emissions_tons', 'emissions_co2', 'co2_emissions'),
        'water_usage_liters': ('water_usage_liters', 'water_usage', 'water_consumption'),
        'employee_count': ('employee_count', 'employees', 'workforce'),
        'production_volume': ('production_volume', 'output', 'production'),
        'scope1_direct_emissions_tco2e': ('scope1_direct_emissions_tco2e', 'scope1_tco2e'),
        'scope1_stationary_fuel_combustion_tco2e': ('scope1_stationary_fuel_combustion_tco2e', 'scope1_stationary_combustion_tco2e'),
        'scope1_mobile_combustion_tco2e': ('scope1_mobile_combustion_tco2e',),
        'scope1_process_emissions_tco2e': ('scope1_process_emissions_tco2e', 'scope1_process_tco2e'),
        'scope1_fugitive_refrigerant_emissions_tco2e': ('scope1_fugitive_refrigerant_emissions_tco2e', 'scope1_fugitive_tco2e'),
        'purchased_electricity_kwh': ('purchased_electricity_kwh', 'electricity_consumption_kwh'),
        'electricity_grid_factor_kgco2e_per_kwh': ('electricity_grid_factor_kgco2e_per_kwh', 'electricity_grid_factor_kg_kwh'),
        'scope3_reported_total_tco2e': ('scope3_reported_total_tco2e', 'scope3_total_tco2e'),
        'scope3_purchased_goods_services_tco2e': ('scope3_purchased_goods_services_tco2e', 'scope3_purchased_goods_tco2e'),
        'scope3_upstream_transportation_tco2e': ('scope3_upstream_transportation_tco2e', 'scope3_transport_tco2e'),
        'scope3_waste_generated_operations_tco2e': ('scope3_waste_generated_operations_tco2e', 'scope3_waste_tco2e'),
        'scope3_business_travel_tco2e': ('scope3_business_travel_tco2e',),
        'scope3_other_value_chain_sources_tco2e': ('scope3_other_value_chain_sources_tco2e', 'scope3_other_tco2e'),
    }

    def __init__(self, model_path=None):
        self.model_path = Path(model_path) if model_path else Path(__file__).resolve().parents[1] / 'models' / 'carbonscorex_recommendation_model.joblib'
        self.model = None
        self.feature_cols = []
        self.recommendation_classes = []
        self.load_error = None
        try:
            artifact = joblib.load(self.model_path)
            self.model = artifact['model']
            self.feature_cols = list(artifact['feature_cols'])
            self.recommendation_classes = list(artifact['recommendation_classes'])
        except Exception as exc:
            self.load_error = str(exc)

    @classmethod
    def map_features(cls, data):
        features = {}
        for feature, aliases in cls.FEATURE_INPUTS.items():
            value = next((data[key] for key in aliases if data.get(key) is not None), None)
            try:
                features[feature] = float(value) if value is not None else np.nan
            except (TypeError, ValueError):
                features[feature] = np.nan
        return features

    @staticmethod
    def completeness_recommendations(data):
        """Return deterministic gaps; legacy emissions_co2 is not scope data."""
        scope1_parts = ('scope1_stationary_combustion_tco2e', 'scope1_stationary_fuel_combustion_tco2e', 'scope1_mobile_combustion_tco2e', 'scope1_process_tco2e', 'scope1_process_emissions_tco2e', 'scope1_fugitive_tco2e', 'scope1_fugitive_refrigerant_emissions_tco2e')
        scope1_present = data.get('scope1_tco2e') is not None or data.get('scope1_direct_emissions_tco2e') is not None or any(data.get(k) is not None for k in scope1_parts)
        electricity = data.get('purchased_electricity_kwh', data.get('electricity_consumption_kwh'))
        factor = data.get('electricity_grid_factor_kgco2e_per_kwh', data.get('electricity_grid_factor_kg_kwh'))
        scope3_keys = ('scope3_purchased_goods_tco2e', 'scope3_purchased_goods_services_tco2e', 'scope3_transport_tco2e', 'scope3_upstream_transportation_tco2e', 'scope3_waste_tco2e', 'scope3_waste_generated_operations_tco2e', 'scope3_business_travel_tco2e', 'scope3_other_tco2e', 'scope3_other_value_chain_sources_tco2e')
        gaps = []
        if not scope1_present:
            gaps.append({'key': 'scope1_inventory', 'recommendation': 'Establish a Scope 1 direct-emissions baseline from fuel, process, fleet, and refrigerant sources.'})
        if electricity is None or factor is None:
            gaps.append({'key': 'scope2_inventory', 'recommendation': 'Collect purchased-electricity consumption and a documented grid emission factor to quantify Scope 2.'})
        if data.get('scope3_total_tco2e') is None and data.get('scope3_reported_total_tco2e') is None and not any(data.get(k) is not None for k in scope3_keys):
            gaps.append({'key': 'scope3_screening', 'recommendation': 'Screen material value-chain categories and establish a Scope 3 baseline.'})
        return gaps

    def predict(self, data):
        gaps = self.completeness_recommendations(data)
        base = {'model_version': self.MODEL_VERSION, 'data_completeness_recommendations': gaps}
        if self.model is None:
            return {**base, 'status': 'fallback', 'recommendations': [], 'message': f'Recommendation model unavailable: {self.load_error or "not loaded"}'}
        try:
            mapped = self.map_features(data)
            row = np.array([[mapped.get(name, np.nan) for name in self.feature_cols]], dtype=float)
            prediction = np.asarray(self.model.predict(row)[0])
            # The trained forest emits a four-position binary indicator vector
            # aligned with recommendation_classes. Keep scalar estimators usable
            # for compatibility with other serialized classifier forms.
            if prediction.ndim > 0 and prediction.size == len(self.recommendation_classes):
                labels = [
                    label for label, selected in zip(self.recommendation_classes, prediction.reshape(-1))
                    if bool(selected)
                ]
            else:
                labels = [str(prediction.item())]
            return {**base, 'status': 'predicted', 'recommendations': labels}
        except Exception as exc:
            return {**base, 'status': 'fallback', 'recommendations': [], 'message': f'Recommendation inference failed: {exc}'}

class CarbonScorePredictor:
    """Carbon score prediction with SHAP explanations"""
    
    def __init__(self, model_path='../models'):
        """
        Initialize predictor with trained model
        
        Args:
            model_path: Directory containing model artifacts
        """
        self.model_path = model_path
        self.model = None
        self.scaler = None
        self.feature_names = None
        self.metadata = None
        self.load_model()
    
    def load_model(self):
        """Load model and preprocessing artifacts"""
        try:
            # Try XGBoost model first
            model_file = os.path.join(self.model_path, 'carbon_score_model_xgboost.joblib')
            if not os.path.exists(model_file):
                model_file = os.path.join(self.model_path, 'carbon_score_model_random_forest.joblib')
            
            self.model = joblib.load(model_file)
            self.scaler = joblib.load(os.path.join(self.model_path, 'scaler.joblib'))
            self.feature_names = joblib.load(os.path.join(self.model_path, 'feature_names.joblib'))
            self.metadata = joblib.load(os.path.join(self.model_path, 'model_metadata.joblib'))
            
            print(f"✓ Model loaded: {self.metadata['model_type']}")
            print(f"✓ Features: {len(self.feature_names)}")
        except Exception as e:
            print(f"Error loading model: {e}")
            raise
    
    def predict(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict carbon score for company
        
        Args:
            company_data: Dictionary with company metrics
            
        Returns:
            Dictionary with score, category, and explanation
        """
        # Extract features in correct order
        features = self._extract_features(company_data)
        
        # Scale features
        features_scaled = self.scaler.transform(features.reshape(1, -1))
        
        # Predict
        score = self.model.predict(features_scaled)[0]
        
        # Ensure score is in valid range
        score = np.clip(score, 0, 100)
        
        # Determine category
        category = self._get_category(score)
        
        # Generate explanation
        explanation = self._generate_explanation(features, score)
        
        return {
            'score': float(score),
            'category': category,
            'explanation': explanation,
            'confidence': self._calculate_confidence(score)
        }
    
    def _extract_features(self, data: Dict[str, Any]) -> np.ndarray:
        """Extract features from input data matching training features"""
        # Map common input fields to expected features
        feature_mapping = {
            'energy_consumption': ['energy_consumption', 'energy_usage', 'power_consumption'],
            'renewable_energy_pct': ['renewable_energy_pct', 'renewable_pct', 'clean_energy_pct'],
            'waste_recycled_pct': ['waste_recycled_pct', 'recycling_pct', 'waste_recycling'],
            'emissions_co2': ['emissions_co2', 'co2_emissions', 'carbon_emissions'],
            'water_usage': ['water_usage', 'water_consumption'],
            'employee_count': ['employee_count', 'employees', 'workforce'],
            'production_volume': ['production_volume', 'output', 'production']
        }
        
        features = []
        for feat_name in self.feature_names:
            # Try direct match first
            value = data.get(feat_name, None)
            
            # Try alternative names
            if value is None:
                for alt_names in feature_mapping.values():
                    if feat_name in alt_names:
                        for alt in alt_names:
                            if alt in data:
                                value = data[alt]
                                break
                        break
            
            # Default to 0 if not found
            features.append(float(value) if value is not None else 0.0)
        
        return np.array(features)
    
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
    
    def _generate_explanation(self, features: np.ndarray, score: float) -> Dict[str, Any]:
        """Generate human-readable explanation of score"""
        # Get feature importances
        if hasattr(self.model, 'feature_importances_'):
            importances = self.model.feature_importances_
        else:
            importances = np.ones(len(features)) / len(features)
        
        # Get top contributing features
        top_indices = np.argsort(importances)[::-1][:5]
        
        top_features = {}
        for idx in top_indices:
            feature_name = self.feature_names[idx]
            importance = float(importances[idx])
            feature_value = float(features[idx])
            
            top_features[feature_name] = {
                'importance': importance,
                'value': feature_value
            }
        
        # Generate recommendations
        recommendations = self._generate_recommendations(score, top_features)
        
        return {
            'top_features': top_features,
            'recommendations': recommendations,
            'score_breakdown': {
                'environmental_impact': min(score * 0.4, 40),
                'sustainability_practices': min(score * 0.35, 35),
                'regulatory_compliance': min(score * 0.25, 25)
            }
        }
    
    def _generate_recommendations(self, score: float, top_features: Dict) -> list:
        """Generate actionable recommendations"""
        recommendations = []
        
        if score < 50:
            recommendations.append("Critical: Immediate action required to reduce carbon footprint")
            recommendations.append("Consider switching to renewable energy sources")
            recommendations.append("Implement comprehensive waste recycling program")
        elif score < 70:
            recommendations.append("Increase renewable energy usage to above 50%")
            recommendations.append("Improve waste management and recycling rates")
        else:
            recommendations.append("Maintain current excellent environmental practices")
            recommendations.append("Consider carbon offset programs to achieve net-zero")
        
        return recommendations
    
    def _calculate_confidence(self, score: float) -> float:
        """Calculate prediction confidence (0-1)"""
        # Simple confidence based on training metrics
        if self.metadata:
            # Higher R² = higher confidence
            base_confidence = self.metadata.get('test_r2', 0.8)
            return min(base_confidence + 0.1, 0.95)
        return 0.85
    
    def fallback_score(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic fallback scoring when ML model is unavailable
        Rule-based scoring system
        """
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
