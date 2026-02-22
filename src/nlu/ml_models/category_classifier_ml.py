"""
ML-Based Category Classifier using DistilBERT
VERSION 1: Machine Learning Implementation

This module trains and uses a DistilBERT model for complaint category classification.
THIS IS THE MACHINE LEARNING COMPONENT!
"""

import torch
import json
import os
from typing import Dict, List, Tuple
from transformers import (
    DistilBertTokenizer,
    DistilBertForSequenceClassification,
    Trainer,
    TrainingArguments
)
from torch.utils.data import Dataset
import numpy as np


class ComplaintDataset(Dataset):
    """
    Custom Dataset for complaint transcripts
    Prepares data for PyTorch training
    """
    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = self.labels[idx]
        
        # Tokenize text
        encoding = self.tokenizer(
            text,
            add_special_tokens=True,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        return {
            'input_ids': encoding['input_ids'].flatten(),
            'attention_mask': encoding['attention_mask'].flatten(),
            'labels': torch.tensor(label, dtype=torch.long)
        }


class DistilBERTCategoryClassifier:
    """
    DistilBERT-based category classifier for complaint classification
    
    This is the MACHINE LEARNING component that:
    - Trains on labeled data (supervised learning)
    - Uses deep learning (Transformer architecture)
    - Learns patterns from examples
    - Improves with more training data
    """
    
    def __init__(
        self,
        model_name: str = "distilbert-base-uncased",
        num_labels: int = 10,
        max_length: int = 128,
        auto_load: bool = True  # NEW: Auto-load model on initialization
    ):
        """
        Initialize the ML classifier
        
        Args:
            model_name: Pre-trained model to use for transfer learning
            num_labels: Number of categories to classify
            max_length: Maximum sequence length for tokenization
            auto_load: Whether to automatically load trained model (default: True)
        """
        self.model_name = model_name
        self.num_labels = num_labels
        self.max_length = max_length
        
        # Load tokenizer
        self.tokenizer = DistilBertTokenizer.from_pretrained(model_name)
        
        # Initialize model (will be loaded or trained)
        self.model = None
        
        # Category mappings
        self.label_to_category = {}
        self.category_to_label = {}
        
        # Device configuration
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")
        
        # ========== NEW: AUTO-LOAD TRAINED MODEL ==========
        if auto_load:
            try:
                # Try to load from default location
                self.load_model("ml-models/saved-models/category_classifier")
            except Exception as e:
                print(f"⚠️  Could not auto-load model: {e}")
                print("   You can manually call load_model() or train a new model")
    
    def load_categories(self, categories_file: str = "data/categories.json"):
        """
        Load category mappings from JSON file
        
        Args:
            categories_file: Path to categories.json
        """
        try:
            with open(categories_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                categories = data.get('categories', [])
            
            # Create label mappings
            for idx, category in enumerate(categories):
                cat_id = category['id']
                self.label_to_category[idx] = cat_id
                self.category_to_label[cat_id] = idx
            
            self.num_labels = len(categories)
            print(f"Loaded {self.num_labels} categories")
            
        except FileNotFoundError:
            print(f"Warning: {categories_file} not found. Using default categories.")
            self._load_default_categories()
    
    def _load_default_categories(self):
        """Load default categories if file not found"""
        default_categories = [
            "pothole", "water_supply", "garbage", "streetlight",
            "traffic_signal", "drainage", "noise", "stray_animals",
            "tree_fallen", "park_maintenance"
        ]
        
        for idx, cat_id in enumerate(default_categories):
            self.label_to_category[idx] = cat_id
            self.category_to_label[cat_id] = idx
        
        self.num_labels = len(default_categories)
    
    def initialize_model(self):
        """
        Initialize the DistilBERT model
        This is TRANSFER LEARNING - starting from pre-trained weights
        """
        print(f"Initializing {self.model_name}...")
        self.model = DistilBertForSequenceClassification.from_pretrained(
            self.model_name,
            num_labels=self.num_labels
        )
        self.model.to(self.device)
        print(f"Model initialized with {self.num_labels} output classes")
    
    def prepare_data(self, texts: List[str], labels: List[str]) -> ComplaintDataset:
        """
        Prepare data for training/evaluation
        
        Args:
            texts: List of complaint transcripts
            labels: List of category labels (string IDs)
            
        Returns:
            ComplaintDataset ready for training
        """
        # Convert category labels to numeric labels
        numeric_labels = [self.category_to_label[label] for label in labels]
        
        # Create dataset
        dataset = ComplaintDataset(
            texts=texts,
            labels=numeric_labels,
            tokenizer=self.tokenizer,
            max_length=self.max_length
        )
        
        return dataset
    
    def train(
        self,
        train_texts: List[str],
        train_labels: List[str],
        eval_texts: List[str] = None,
        eval_labels: List[str] = None,
        output_dir: str = "saved_models/category_classifier",
        num_epochs: int = 5,
        batch_size: int = 8,
        learning_rate: float = 2e-5
    ):
        """
        Train the ML model on labeled data
        THIS IS THE MACHINE LEARNING TRAINING!
        
        Args:
            train_texts: Training transcripts
            train_labels: Training category labels
            eval_texts: Evaluation transcripts (optional)
            eval_labels: Evaluation labels (optional)
            output_dir: Where to save trained model
            num_epochs: Number of training epochs
            batch_size: Batch size for training
            learning_rate: Learning rate
        """
        print("=" * 70)
        print("STARTING MACHINE LEARNING TRAINING")
        print("=" * 70)
        print(f"Training samples: {len(train_texts)}")
        print(f"Epochs: {num_epochs}")
        print(f"Batch size: {batch_size}")
        print(f"Learning rate: {learning_rate}")
        print(f"Model: {self.model_name}")
        print()
        
        # Prepare datasets
        print("Preparing training data...")
        train_dataset = self.prepare_data(train_texts, train_labels)
        
        eval_dataset = None
        if eval_texts and eval_labels:
            print("Preparing evaluation data...")
            eval_dataset = self.prepare_data(eval_texts, eval_labels)
            print(f"Evaluation samples: {len(eval_texts)}")
        
        # Training arguments
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=num_epochs,
            per_device_train_batch_size=batch_size,
            per_device_eval_batch_size=batch_size,
            learning_rate=learning_rate,
            weight_decay=0.01,
            logging_dir=f'{output_dir}/logs',
            logging_steps=10,
            eval_strategy="epoch" if eval_dataset else "no",
            save_strategy="epoch",
            load_best_model_at_end=True if eval_dataset else False,
            metric_for_best_model="accuracy" if eval_dataset else None,
            save_total_limit=2,
            report_to="none"
        )
        
        # Initialize trainer
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            compute_metrics=self._compute_metrics if eval_dataset else None
        )
        
        # Train the model (THIS IS WHERE ML LEARNING HAPPENS!)
        print("\nTraining started...")
        print("The model is learning patterns from your data...")
        train_result = trainer.train()
        
        print("\n" + "=" * 70)
        print("TRAINING COMPLETED!")
        print("=" * 70)
        print(f"Final training loss: {train_result.training_loss:.4f}")
        
        # Evaluate on test set
        if eval_dataset:
            print("\nEvaluating on test set...")
            eval_result = trainer.evaluate()
            print(f"Test Accuracy: {eval_result['eval_accuracy']*100:.2f}%")
            print(f"Test Loss: {eval_result['eval_loss']:.4f}")
        
        # Save model
        print(f"\nSaving trained model to: {output_dir}")
        trainer.save_model(output_dir)
        self.tokenizer.save_pretrained(output_dir)
        
        # Save category mappings
        self._save_mappings(output_dir)
        
        print("\n" + "=" * 70)
        print("MODEL SAVED SUCCESSFULLY!")
        print("You can now use this trained model for predictions.")
        print("=" * 70)
    
    def _compute_metrics(self, eval_pred):
        """
        Compute metrics for evaluation during training
        """
        predictions, labels = eval_pred
        predictions = np.argmax(predictions, axis=1)
        
        accuracy = (predictions == labels).mean()
        
        return {
            'accuracy': accuracy
        }
    
    def load_model(self, model_dir: str = "saved_models/category_classifier"):
        """
        Load a trained model
        
        Args:
            model_dir: Directory containing saved model
        """
        if not os.path.exists(model_dir):
            raise FileNotFoundError(
                f"Model directory not found: {model_dir}\n"
                f"Please train the model first using train_classifier.py"
            )
        
        print(f"Loading trained model from: {model_dir}")
        
        # Load model
        self.model = DistilBertForSequenceClassification.from_pretrained(model_dir)
        self.model.to(self.device)
        self.model.eval()  # Set to evaluation mode
        
        # Load tokenizer
        self.tokenizer = DistilBertTokenizer.from_pretrained(model_dir)
        
        # Load category mappings
        self._load_mappings(model_dir)
        
        print("✓ Model loaded successfully!")
    
    def predict(self, text: str) -> Dict:
        """
        Predict category for a single transcript using the trained ML model
        
        Args:
            text: Complaint transcript
            
        Returns:
            Dictionary with prediction results
        """
        if self.model is None:
            raise ValueError(
                "Model not loaded. Please call load_model() first or train a model."
            )
        
        # Tokenize input
        encoding = self.tokenizer(
            text,
            add_special_tokens=True,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Move to device
        input_ids = encoding['input_ids'].to(self.device)
        attention_mask = encoding['attention_mask'].to(self.device)
        
        # Get prediction from ML model
        with torch.no_grad():
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            
            # Get probabilities using softmax
            probabilities = torch.softmax(logits, dim=1)[0]
            
            # Get predicted class
            predicted_label = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_label].item()
        
        # Get category name
        category = self.label_to_category[predicted_label]
        
        # Get all probabilities
        all_probabilities = {
            self.label_to_category[i]: round(prob.item(), 4)
            for i, prob in enumerate(probabilities)
        }
        
        return {
            'category': category,
            'confidence': round(confidence, 4),
            'probabilities': all_probabilities
        }
    
    def predict_batch(self, texts: List[str]) -> List[Dict]:
        """
        Predict categories for multiple transcripts
        
        Args:
            texts: List of complaint transcripts
            
        Returns:
            List of prediction dictionaries
        """
        predictions = []
        for text in texts:
            pred = self.predict(text)
            predictions.append(pred)
        return predictions
    
    def _save_mappings(self, output_dir: str):
        """Save category mappings to JSON"""
        mappings = {
            'label_to_category': self.label_to_category,
            'category_to_label': self.category_to_label
        }
        
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, 'category_mappings.json'), 'w') as f:
            json.dump(mappings, f, indent=2)
    
    def _load_mappings(self, model_dir: str):
        """Load category mappings from JSON"""
        mappings_file = os.path.join(model_dir, 'category_mappings.json')
        
        if os.path.exists(mappings_file):
            with open(mappings_file, 'r') as f:
                mappings = json.load(f)
                
            # Convert string keys back to integers for label_to_category
            self.label_to_category = {
                int(k): v for k, v in mappings['label_to_category'].items()
            }
            self.category_to_label = mappings['category_to_label']
        else:
            print("Warning: category_mappings.json not found. Using default mappings.")
            self._load_default_categories()


# Example usage for testing
if __name__ == "__main__":
    print("DistilBERT Category Classifier")
    print("This is a Machine Learning model for complaint classification")
    print("\nTo use this model:")
    print("1. Train it: python scripts/train_nlu_model.py")
    print("2. Use it: from ml_models import DistilBERTCategoryClassifier")