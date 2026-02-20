"""
Verification script to check if all required libraries are installed correctly.
Run this after installing requirements.txt
"""

def verify_installations():
    print("=" * 60)
    print("VERIFYING NLU MODULE SETUP")
    print("=" * 60)
    
    checks_passed = 0
    checks_failed = 0
    
    # Check 1: spaCy
    print("\n1. Checking spaCy...")
    try:
        import spacy
        print(f"   [PASS] spaCy {spacy.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] spaCy NOT installed: {e}")
        checks_failed += 1
    
    # Check 2: spaCy model
    print("\n2. Checking spaCy English model...")
    try:
        import spacy
        nlp = spacy.load("en_core_web_md")
        print(f"   [PASS] en_core_web_md model loaded successfully")
        checks_passed += 1
    except Exception as e:
        print(f"   [FAIL] en_core_web_md model NOT found: {e}")
        print("   -> Run: python -m spacy download en_core_web_md")
        checks_failed += 1
    
    # Check 3: Transformers
    print("\n3. Checking Transformers (Hugging Face)...")
    try:
        import transformers
        print(f"   [PASS] Transformers {transformers.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] Transformers NOT installed: {e}")
        checks_failed += 1
    
    # Check 4: PyTorch
    print("\n4. Checking PyTorch...")
    try:
        import torch
        print(f"   [PASS] PyTorch {torch.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] PyTorch NOT installed: {e}")
        checks_failed += 1
    
    # Check 5: VADER
    print("\n5. Checking VADER Sentiment...")
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
        print(f"   [PASS] VADER Sentiment installed and working")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] VADER Sentiment NOT installed: {e}")
        checks_failed += 1
    
    # Check 6: scikit-learn
    print("\n6. Checking scikit-learn...")
    try:
        import sklearn
        print(f"   [PASS] scikit-learn {sklearn.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] scikit-learn NOT installed: {e}")
        checks_failed += 1
    
    # Check 7: pandas
    print("\n7. Checking pandas...")
    try:
        import pandas
        print(f"   [PASS] pandas {pandas.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] pandas NOT installed: {e}")
        checks_failed += 1
    
    # Check 8: numpy
    print("\n8. Checking numpy...")
    try:
        import numpy
        print(f"   [PASS] numpy {numpy.__version__} installed")
        checks_passed += 1
    except ImportError as e:
        print(f"   [FAIL] numpy NOT installed: {e}")
        checks_failed += 1
    
    # Summary
    print("\n" + "=" * 60)
    print(f"VERIFICATION COMPLETE")
    print(f"[PASS] Passed: {checks_passed}")
    print(f"[FAIL] Failed: {checks_failed}")
    print("=" * 60)
    
    if checks_failed == 0:
        print("\nAll libraries installed successfully!")
        print("You're ready to proceed to Step 3!")
    else:
        print(f"\n{checks_failed} check(s) failed. Please install missing libraries.")
        print("Run: pip install -r requirements.txt")
    
    return checks_failed == 0

if __name__ == "__main__":
    verify_installations()