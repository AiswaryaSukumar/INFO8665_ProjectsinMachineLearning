"""
Test Script for Trained NLU Model
Tests the trained DistilBERT model with sample predictions
"""

import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
sys.path.insert(0, project_root)
os.chdir(project_root)

from nlp_service.model.models.category_classifier_ml import DistilBERTCategoryClassifier

def test_model():
    print("TESTING TRAINED ML MODEL")
    classifier = DistilBERTCategoryClassifier()
    classifier.load_categories("nlp_service/data/models/categories.json")
    classifier.load_model("nlp_service/ml_models/saved_models/category_classifier")
    
    test_samples = [
        {"text": "Someone spray painted graffiti all over the wall on Main Street", "expected": "graffiti"},
        {"text": "Car parked illegally blocking my driveway for 2 days", "expected": "parking_complaint"},
        {"text": "Huge pothole on Kennedy Road that damaged my tire", "expected": "pothole"},
    ]
    
    correct = 0
    total = len(test_samples)
    
    for i, sample in enumerate(test_samples, 1):
        result = classifier.predict(sample['text'])
        predicted = result['category']
        is_correct = predicted == sample['expected']
        if is_correct: correct += 1
        
        status = "✓ CORRECT" if is_correct else "✗ WRONG"
        print(f"Input: {sample['text'][:60]} | Predicted: {predicted} {status}")
    
    accuracy = (correct / total) * 100
    print(f"\nAccuracy: {accuracy:.2f}%")

if __name__ == "__main__":
    test_model()
