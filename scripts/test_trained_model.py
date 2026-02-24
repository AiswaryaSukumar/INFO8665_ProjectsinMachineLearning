"""
Test Script for Trained NLU Model
Tests the trained DistilBERT model with sample predictions

Run this script: python scripts/test_trained_model.py
"""

import sys
import os

# Add project root to path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)
os.chdir(project_root)

from src.nlu.ml_models.category_classifier_ml import DistilBERTCategoryClassifier


def test_model():
    """
    Test the trained model with sample predictions
    """
    print("=" * 70)
    print("TESTING TRAINED ML MODEL")
    print("=" * 70)
    print()
    
    # Initialize classifier
    print("Loading trained model...")
    classifier = DistilBERTCategoryClassifier()
    
    # Load categories
    classifier.load_categories("data/models/categories.json")
    
    # Load trained model
    model_path = "ml-models/saved-models/category_classifier"
    classifier.load_model(model_path)
    print()
    
    # Test samples
    test_samples = [
        {
            "text": "Someone spray painted graffiti all over the wall on Main Street",
            "expected": "graffiti"
        },
        {
            "text": "There's an illegal sign posted on the telephone pole",
            "expected": "illegal_sign"
        },
        {
            "text": "The park is full of trash and litter everywhere",
            "expected": "litter"
        },
        {
            "text": "Found needles on the playground. Very dangerous for children",
            "expected": "needles"
        },
        {
            "text": "Car parked illegally blocking my driveway for 2 days",
            "expected": "parking_complaint"
        },
        {
            "text": "The property at 456 Oak Street has overgrown lawn and broken windows",
            "expected": "property_standards"
        },
        {
            "text": "Huge pothole on Kennedy Road that damaged my tire",
            "expected": "pothole"
        },
        {
            "text": "Sidewalk hasn't been cleared of snow for days. Very icy",
            "expected": "sidewalk_snow"
        },
        {
            "text": "Trip hazard on the sidewalk. The concrete is raised and uneven",
            "expected": "sidewalk_hazard"
        },
        {
            "text": "The trail is completely washed out and eroded",
            "expected": "trail_maintenance"
        },
        {
            "text": "There's a fire hydrant leaking water constantly",
            "expected": "other"
        }
    ]
    
    print("=" * 70)
    print("RUNNING PREDICTIONS")
    print("=" * 70)
    print()
    
    correct = 0
    total = len(test_samples)
    
    for i, sample in enumerate(test_samples, 1):
        print(f"Test {i}/{total}")
        print(f"Input: {sample['text'][:60]}...")
        print(f"Expected: {sample['expected']}")
        
        # Make prediction
        result = classifier.predict(sample['text'])
        predicted = result['category']
        confidence = result['confidence']
        
        # Check if correct
        is_correct = predicted == sample['expected']
        if is_correct:
            correct += 1
            status = "✓ CORRECT"
        else:
            status = "✗ WRONG"
        
        print(f"Predicted: {predicted} (confidence: {confidence:.2f}) {status}")
        
        # Show top 3 predictions
        top_3 = sorted(result['probabilities'].items(), key=lambda x: x[1], reverse=True)[:3]
        print("Top 3 predictions:")
        for cat, prob in top_3:
            print(f"  {cat}: {prob:.4f}")
        
        print("-" * 70)
        print()
    
    # Final accuracy
    accuracy = (correct / total) * 100
    
    print("=" * 70)
    print("TEST RESULTS")
    print("=" * 70)
    print(f"Total tests: {total}")
    print(f"Correct predictions: {correct}")
    print(f"Wrong predictions: {total - correct}")
    print(f"Accuracy: {accuracy:.2f}%")
    print("=" * 70)
    
    # Performance notes
    print()
    print("NOTES:")
    if accuracy < 30:
        print("⚠️  Low accuracy is expected with only 33 training samples.")
        print("   To improve accuracy:")
        print("   - Add more training data (100-200 samples)")
        print("   - Train for more epochs (10-20)")
        print("   - Use data augmentation")
    elif accuracy < 60:
        print("✓  Moderate accuracy. Model is learning patterns.")
        print("   Can be improved with more data and tuning.")
    else:
        print("✓✓ Good accuracy! Model is working well.")
    
    print()
    print("This demonstrates:")
    print("✓ Supervised learning - model learned from labeled examples")
    print("✓ Deep learning - using DistilBERT transformer")
    print("✓ Transfer learning - fine-tuned pre-trained model")
    print("✓ Real-time predictions - can classify new complaints")


if __name__ == "__main__":
    try:
        test_model()
    except FileNotFoundError as e:
        print(f"\n❌ ERROR: {e}")
        print("\nPlease ensure:")
        print("1. Model has been trained (run: python scripts/train_nlu_model.py)")
        print("2. Model exists at: ml-models/saved-models/category_classifier/")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()