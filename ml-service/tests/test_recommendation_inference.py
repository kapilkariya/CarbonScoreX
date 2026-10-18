import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from inference import RecommendationPredictor


class FakeModel:
    def __init__(self, label='Reduce grid electricity dependence'):
        self.label = label
        self.rows = None

    def predict(self, rows):
        self.rows = rows
        return [self.label]


class RecommendationPredictorTests(unittest.TestCase):
    def test_loads_real_artifact_and_expected_feature_names(self):
        predictor = RecommendationPredictor()
        self.assertIsNotNone(predictor.model, predictor.load_error)
        self.assertEqual(len(predictor.feature_cols), 20)
        self.assertEqual(len(predictor.recommendation_classes), 4)
        self.assertTrue(predictor.model_path.is_absolute())

    def test_explicit_feature_mapping_keeps_missing_values_missing(self):
        values = RecommendationPredictor.map_features({'renewable_energy_pct': 40, 'scope1_tco2e': 12})
        self.assertEqual(values['renewable_energy_usage_pct'], 40)
        self.assertEqual(values['scope1_direct_emissions_tco2e'], 12)
        self.assertTrue(__import__('numpy').isnan(values['purchased_electricity_kwh']))

    def test_prediction_and_model_version(self):
        model = FakeModel()
        with patch('inference.joblib.load', return_value={
            'model': model,
            'feature_cols': ['renewable_energy_usage_pct', 'purchased_electricity_kwh'],
            'recommendation_classes': ['Reduce grid electricity dependence'],
        }):
            predictor = RecommendationPredictor('unused.joblib')
        result = predictor.predict({'renewable_energy_pct': 30, 'electricity_consumption_kwh': 100, 'electricity_grid_factor_kg_kwh': 0.5})
        self.assertEqual(result['recommendations'], ['Reduce grid electricity dependence'])
        self.assertEqual(result['status'], 'predicted')
        self.assertEqual(result['model_version'], RecommendationPredictor.MODEL_VERSION)
        self.assertEqual(model.rows.shape, (1, 2))

    def test_binary_prediction_vector_maps_to_recommendation_labels(self):
        class MultiLabelModel:
            def predict(self, rows):
                return [[1, 0, 1, 0]]

        classes = ['Improve waste prevention and recovery', 'Investigate process water reduction', 'Reduce grid electricity dependence', 'Target high-use equipment for efficiency']
        with patch('inference.joblib.load', return_value={
            'model': MultiLabelModel(), 'feature_cols': ['renewable_energy_usage_pct'],
            'recommendation_classes': classes,
        }):
            predictor = RecommendationPredictor('unused.joblib')
        result = predictor.predict({'renewable_energy_pct': 30})
        self.assertEqual(result['recommendations'], [classes[0], classes[2]])

    def test_missing_scope_data_gets_deterministic_completeness_recommendations(self):
        gaps = RecommendationPredictor.completeness_recommendations({'emissions_co2': 0})
        self.assertEqual([gap['key'] for gap in gaps], ['scope1_inventory', 'scope2_inventory', 'scope3_screening'])
        complete = RecommendationPredictor.completeness_recommendations({
            'scope1_tco2e': 0, 'electricity_consumption_kwh': 0,
            'electricity_grid_factor_kg_kwh': 0, 'scope3_total_tco2e': 0,
        })
        self.assertEqual(complete, [])

    def test_load_and_inference_failures_return_clear_fallback(self):
        with patch('inference.joblib.load', side_effect=OSError('missing artifact')):
            predictor = RecommendationPredictor('missing.joblib')
        result = predictor.predict({})
        self.assertEqual(result['status'], 'fallback')
        self.assertIn('missing artifact', result['message'])
        self.assertEqual(len(result['data_completeness_recommendations']), 3)

        with patch('inference.joblib.load', return_value={
            'model': FakeModel(), 'feature_cols': ['x'], 'recommendation_classes': []
        }):
            predictor = RecommendationPredictor('model.joblib')
        predictor.model.predict = lambda _: (_ for _ in ()).throw(RuntimeError('predict failed'))
        self.assertIn('predict failed', predictor.predict({})['message'])


if __name__ == '__main__':
    unittest.main()
