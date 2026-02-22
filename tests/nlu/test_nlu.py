"""
Test script for NLU module
Location: tests/nlu/test_nlu.py
"""

# Add project root to Python path (go up 2 levels from tests/nlu/)
import sys
import os

# Get the project root directory
# Current file is at: tests/nlu/test_nlu.py
# We need to go up 2 levels to reach project root
current_file = os.path.abspath(__file__)
tests_nlu_dir = os.path.dirname(current_file)  # tests/nlu/
tests_dir = os.path.dirname(tests_nlu_dir)     # tests/
project_root = os.path.dirname(tests_dir)      # project root

# Add project root to Python path
sys.path.insert(0, project_root)

print(f"Project root: {project_root}")
print("Importing NLU module...")

# Now import NLU module
from src.nlu.nlu_processor import NLUProcessor

# Initialize NLU Processor
print("\nInitializing NLU Processor...")
processor = NLUProcessor()

# Test transcript
transcript = """
Hello, I want to report a pothole on Main Street near the park.
It's huge, about 3 feet wide, been there for 2 weeks. Cars are
getting damaged. My name is John Smith, call me at 555-1234.
"""

print("\nProcessing transcript...")

# Process transcript
result = processor.process(transcript)

# Print results
print("=" * 60)
print("NLU PROCESSING RESULTS")
print("=" * 60)
print(f"\nCategory: {result['category']['value']}")
print(f"Confidence: {result['category']['confidence']}")
print(f"Status: {result['category']['confirmed']}")

print(f"\nLocation: {result['location']['value']}")
print(f"Confidence: {result['location']['confidence']}")

print(f"\nDescription: {result['description']['value']}")

print(f"\nCaller: {result['caller_name']['value']}")
print(f"Phone: {result['caller_phone']['value']}")

print(f"\nSentiment: {result['sentiment']['overall_score']}")
print(f"Urgency: {result['sentiment']['urgency_level']}")

print(f"\nMissing Fields: {result['missing_fields']}")
print(f"Needs Clarification: {result['requires_clarification']}")

print(f"\nProcessing Time: {result['processing_time_ms']}ms")

print("\n" + "=" * 60)
print("TEST COMPLETED SUCCESSFULLY!")
print("=" * 60)