"""
Training Script for NLU Category Classifier
VERSION 1: Machine Learning Implementation

This script:
1. Loads training data from data/models/training_data.json
2. Loads test data from data/models/test.json
3. Trains a DistilBERT model (SUPERVISED LEARNING)
4. Evaluates the model
5. Saves trained model to ml-models/saved-models/

Run this script: python scripts/train_nlu_model.py
"""

import sys
import os
import json

# Add project root to path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)

# Set working directory to project root
os.chdir(project_root)

print(f"Project root: {project_root}")
print(f"Current working directory: {os.getcwd()}")
print()

from src.ai_orchestration.nlu.models.category_classifier_ml import DistilBERTCategoryClassifier


def load_training_data(filepath="data/models/training_data.json"):
    """
    Load training data from JSON file
    
    Returns:
        train_texts: List of transcripts
        train_labels: List of category labels
    """
    # Make absolute path
    abs_filepath = os.path.join(project_root, filepath)
    print(f"Loading training data from: {abs_filepath}")
    
    if not os.path.exists(abs_filepath):
        raise FileNotFoundError(f"Training data not found at: {abs_filepath}")
    
    with open(abs_filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    transcripts = data['transcripts']
    
    train_texts = []
    train_labels = []
    
    for item in transcripts:
        train_texts.append(item['transcript'])
        train_labels.append(item['labels']['category'])
    
    print(f"✓ Loaded {len(train_texts)} training samples")
    return train_texts, train_labels


def load_test_data(filepath="data/models/test.json"):
    """
    Load test data from JSON file
    
    Returns:
        test_texts: List of transcripts
        test_labels: List of category labels
    """
    # Make absolute path
    abs_filepath = os.path.join(project_root, filepath)
    print(f"Loading test data from: {abs_filepath}")
    
    try:
        if not os.path.exists(abs_filepath):
            print("Warning: test.json not found. Training without test set.")
            return None, None
        
        with open(abs_filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check if it has transcripts
        if 'transcripts' not in data:
            print("Warning: test.json doesn't have 'transcripts' field. Skipping test set.")
            return None, None
        
        transcripts = data['transcripts']
        
        test_texts = []
        test_labels = []
        
        for item in transcripts:
            test_texts.append(item['transcript'])
            test_labels.append(item['labels']['category'])
        
        print(f"✓ Loaded {len(test_texts)} test samples")
        return test_texts, test_labels
    
    except Exception as e:
        print(f"Warning: Could not load test data: {e}")
        print("Training without test set.")
        return None, None


def main():
    """
    Main training function
    """
    print("=" * 70)
    print("NLU CATEGORY CLASSIFIER - MACHINE LEARNING TRAINING")
    print("=" * 70)
    print()
    
    # Step 1: Load data
    print("STEP 1: Loading Data")
    print("-" * 70)
    try:
        train_texts, train_labels = load_training_data()
        test_texts, test_labels = load_test_data()
    except FileNotFoundError as e:
        print(f"\n❌ ERROR: {e}")
        print("\nPlease ensure these files exist:")
        print("  - data/models/training_data.json")
        print("  - data/models/test.json (optional)")
        print("  - data/models/categories.json")
        return
    print()
    
    # Step 2: Initialize ML model
    print("STEP 2: Initializing Machine Learning Model")
    print("-" * 70)
    classifier = DistilBERTCategoryClassifier(
        model_name="distilbert-base-uncased",
        num_labels=11,  # 11 categories
        max_length=128
    )
    
    # Load categories from data/models/
    categories_path = os.path.join(project_root, "data/models/categories.json")
    print(f"Loading categories from: {categories_path}")
    classifier.load_categories(categories_path)
    
    # Initialize model
    classifier.initialize_model()
    print()
    
    # Step 3: Train the model (THIS IS MACHINE LEARNING!)
    print("STEP 3: Training the Model")
    print("-" * 70)
    print("This is SUPERVISED LEARNING:")
    print("  ✓ Model learns from labeled examples")
    print("  ✓ Uses deep learning (DistilBERT transformer)")
    print("  ✓ Trains over multiple epochs")
    print("  ✓ Accuracy improves with each epoch")
    print()
    
    output_dir = os.path.join(project_root, "ml_models/saved_models/category_classifier")
    print(f"Model will be saved to: {output_dir}")
    print()
    
    classifier.train(
        train_texts=train_texts,
        train_labels=train_labels,
        eval_texts=test_texts,
        eval_labels=test_labels,
        output_dir=output_dir,
        num_epochs=15,
        batch_size=8,
        learning_rate=2e-5
    )
    
    print()
    print("=" * 70)
    print("✓ TRAINING COMPLETE!")
    print("=" * 70)
    print()
    print(f"Model saved to: {output_dir}")
    print()
    print("Files created:")
    print("  ✓ pytorch_model.bin (trained weights)")
    print("  ✓ config.json (model configuration)")
    print("  ✓ tokenizer/ (tokenizer files)")
    print("  ✓ category_mappings.json (category labels)")
    print()
    print("Next steps:")
    print("  1. Test the model with sample predictions")
    print("  2. Integrate with NLU processor")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTraining interrupted by user.")
    except Exception as e:
        print(f"\n\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()