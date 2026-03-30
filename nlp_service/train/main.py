"""
Training Script for NLU Category Classifier
VERSION 1: Machine Learning Implementation

This script:
1. Loads training data from data/models/training_data.json
2. Loads test data from data/models/test.json
3. Trains a DistilBERT model (SUPERVISED LEARNING)
4. Evaluates the model
5. Saves trained model to ml-models/saved-models/
"""

import sys
import os
import json

# Add project root to path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
sys.path.insert(0, project_root)
os.chdir(project_root)

from logging_config import setup_logging, get_logger
setup_logging()

from config import (
    MODEL_NAME, NUM_LABELS, MAX_SEQ_LENGTH, NUM_EPOCHS,
    BATCH_SIZE, LEARNING_RATE, EXPERIMENT_NAME, EXPERIMENT_VERSION,
    EXPECTED_ACCURACY, FEATURE_NAMES,
)
from nlp_service.model.models.category_classifier_ml import DistilBERTCategoryClassifier

logger = get_logger("insight311.train")

def load_training_data(filepath="nlp_service/data/models/training_data.json"):
    abs_filepath = os.path.join(project_root, filepath)
    if not os.path.exists(abs_filepath):
        raise FileNotFoundError(f"Training data not found at: {abs_filepath}")
    
    with open(abs_filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    train_texts = [item['transcript'] for item in data['transcripts']]
    train_labels = [item['labels']['category'] for item in data['transcripts']]
    
    print(f"✓ Loaded {len(train_texts)} training samples")
    return train_texts, train_labels

def load_test_data(filepath="nlp_service/data/models/test.json"):
    abs_filepath = os.path.join(project_root, filepath)
    try:
        if not os.path.exists(abs_filepath): return None, None
        with open(abs_filepath, 'r', encoding='utf-8') as f: data = json.load(f)
        if 'transcripts' not in data: return None, None
        
        test_texts = [item['transcript'] for item in data['transcripts']]
        test_labels = [item['labels']['category'] for item in data['transcripts']]
        print(f"✓ Loaded {len(test_texts)} test samples")
        return test_texts, test_labels
    except Exception as e:
        print(f"Warning: Could not load test data: {e}")
        return None, None

def main():
    print("NLU CATEGORY CLASSIFIER - TRAINING")
    logger.info(
        "training_start experiment=%s version=%s model=%s epochs=%d "
        "batch_size=%d lr=%s expected_accuracy=%s features=%s",
        EXPERIMENT_NAME, EXPERIMENT_VERSION, MODEL_NAME, NUM_EPOCHS,
        BATCH_SIZE, LEARNING_RATE, EXPECTED_ACCURACY, FEATURE_NAMES,
    )
    try:
        train_texts, train_labels = load_training_data()
        test_texts, test_labels = load_test_data()
    except FileNotFoundError as e:
        print(f"\n❌ ERROR: {e}")
        logger.error("training_data_not_found error=%s", e)
        return
    
    classifier = DistilBERTCategoryClassifier(
        model_name=MODEL_NAME,
        num_labels=NUM_LABELS,
        max_length=MAX_SEQ_LENGTH,
    )
    
    categories_path = os.path.join(project_root, "nlp_service/data/models/categories.json")
    classifier.load_categories(categories_path)
    classifier.initialize_model()
    
    output_dir = os.path.join(project_root, "nlp_service/ml_models/saved_models/category_classifier")
    classifier.train(
        train_texts=train_texts,
        train_labels=train_labels,
        eval_texts=test_texts,
        eval_labels=test_labels,
        output_dir=output_dir,
        num_epochs=NUM_EPOCHS,
        batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
    )
    
    logger.info(
        "training_complete experiment=%s version=%s output_dir=%s",
        EXPERIMENT_NAME, EXPERIMENT_VERSION, output_dir,
    )
    print(f"✓ TRAINING COMPLETE! Model saved to: {output_dir}")

if __name__ == "__main__":
    main()
