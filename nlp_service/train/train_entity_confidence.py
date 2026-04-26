"""
Training script for the Location Confidence Calibrator MLP.

Reads training_data.json, computes 5 binary location-specificity features
for each sample, labels each sample by whether the extracted location matches
the ground-truth location, and trains a 2-layer PyTorch MLP.

Usage:
    cd insight311
    python -m nlp_service.train.train_entity_confidence

Output:
    nlp_service/ml_models/saved_models/location_calibrator.pt
"""

import json
import os
import re
import sys

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split

# Ensure the insight311 package root is on sys.path when run as a script
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# ── Constants ──────────────────────────────────────────────────────────────────
TRAINING_DATA_PATH = os.path.join(_ROOT, "nlp_service", "data", "models", "training_data.json")
OUTPUT_PATH        = os.path.join(_ROOT, "nlp_service", "ml_models", "saved_models", "location_calibrator.pt")

ROAD_TYPES = (
    "street", "avenue", "road", "boulevard", "drive", "lane",
    "court", "place", "way", "blvd", "ave", "rd", "st", "crescent",
    "circle", "trail", "terrace", "highway", "hwy",
)
VAGUE_PHRASES = (
    "near", "around", "close to", "next to", "by the", "across from",
    "between", "behind", "in front of",
)

EPOCHS     = 50
BATCH_SIZE = 16
LR         = 1e-3
HIDDEN_DIM = 16

# ── Feature extraction ─────────────────────────────────────────────────────────

def _extract_features(location_text: str) -> list:
    """
    Compute the 5 binary features used by LocationCalibrator.

    Returns:
        [has_street_number, has_intersection, has_road_name,
         has_gpe_entity, has_vague_landmark]
    """
    if not location_text:
        return [0.0, 0.0, 0.0, 0.0, 0.0]

    text = location_text.lower()

    has_street_number = float(bool(re.search(r"\b\d+\s+\w", text)))
    has_intersection  = float(" and " in text or " & " in text)
    has_road_name     = float(any(rt in text for rt in ROAD_TYPES))
    # Approximate GPE: capitalised word or known city/district indicator
    has_gpe_entity    = float(bool(re.search(r"[A-Z][a-z]+", location_text)))
    has_vague_landmark= float(any(vp in text for vp in VAGUE_PHRASES))

    return [has_street_number, has_intersection, has_road_name,
            has_gpe_entity, has_vague_landmark]


def _location_match(extracted: str, ground_truth: str) -> float:
    """1.0 if extracted closely matches ground_truth, else 0.0."""
    if not extracted or not ground_truth:
        return 0.0
    e = extracted.lower().strip()
    g = ground_truth.lower().strip()
    if e == g:
        return 1.0
    # Partial match: one is a substring of the other
    if e in g or g in e:
        return 1.0
    # Word overlap ≥ 50 %
    e_words = set(e.split())
    g_words = set(g.split())
    if e_words and g_words:
        overlap = len(e_words & g_words) / max(len(e_words), len(g_words))
        if overlap >= 0.5:
            return 1.0
    return 0.0


# ── Model ──────────────────────────────────────────────────────────────────────

class _MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(5, HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(HIDDEN_DIM, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # 1. Load training data
    if not os.path.exists(TRAINING_DATA_PATH):
        print(f"ERROR: training data not found at {TRAINING_DATA_PATH}")
        sys.exit(1)

    with open(TRAINING_DATA_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    # Support both flat list and {"transcripts": [...]} wrapper formats
    if isinstance(raw, list):
        samples = raw
    else:
        samples = raw.get("transcripts", raw.get("samples", []))

    print(f"Loaded {len(samples)} training samples.")

    # 2. Build feature matrix and labels
    features = []
    labels   = []

    skipped = 0
    for sample in samples:
        # Labels may be nested under "labels" key or flat at the top level
        label_data  = sample.get("labels", sample)
        transcript  = sample.get("transcript", "")
        gt_location = label_data.get("location", "")

        # Extract location from transcript using a simple heuristic
        # (mirrors what EntityExtractor would find)
        extracted_loc = _simple_extract_location(transcript)

        # Skip samples where extraction failed: computing features from gt_location
        # but labeling as 0 creates contradictory training signal for the MLP.
        if not extracted_loc:
            skipped += 1
            continue

        feat  = _extract_features(extracted_loc)
        label = _location_match(extracted_loc, gt_location)

        features.append(feat)
        labels.append(label)

    print(f"Skipped {skipped} samples (no extraction). Training on {len(features)} samples.")

    X = torch.tensor(features, dtype=torch.float32)
    y = torch.tensor(labels,   dtype=torch.float32)

    print(f"Positive labels: {int(y.sum())}/{len(y)}")

    # 3. Train/val split
    dataset  = TensorDataset(X, y)
    val_size = max(1, int(len(dataset) * 0.15))
    trn_size = len(dataset) - val_size
    trn_ds, val_ds = random_split(dataset, [trn_size, val_size])

    trn_loader = DataLoader(trn_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)

    # 4. Train MLP
    model     = _MLP()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    criterion = nn.BCELoss()

    best_val_loss = float("inf")
    best_state    = None

    for epoch in range(1, EPOCHS + 1):
        model.train()
        for xb, yb in trn_loader:
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()

        model.eval()
        val_losses = []
        with torch.no_grad():
            for xb, yb in val_loader:
                val_losses.append(criterion(model(xb), yb).item())
        val_loss = sum(val_losses) / len(val_losses)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state    = {k: v.clone() for k, v in model.state_dict().items()}

        if epoch % 10 == 0:
            print(f"  Epoch {epoch:3d}/{EPOCHS}  val_loss={val_loss:.4f}")

    # 5. Save best model
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    torch.save(best_state, OUTPUT_PATH)
    print(f"\n[OK] Location calibrator saved to: {OUTPUT_PATH}")
    print(f"   Best val loss: {best_val_loss:.4f}")


def _simple_extract_location(transcript: str) -> str:
    """
    Lightweight location extraction for label generation.
    Looks for address patterns or road-type keywords.
    """
    t = transcript.lower()
    # Address with number
    m = re.search(
        r"\d+\s+[\w\s]+?\s+(?:" + "|".join(ROAD_TYPES) + r")\b",
        t, re.IGNORECASE
    )
    if m:
        return m.group(0).strip()
    # Road name only
    for rt in ROAD_TYPES:
        idx = t.find(rt)
        if idx > 0:
            start = max(0, idx - 25)
            return transcript[start: idx + len(rt) + 5].strip()
    return ""


if __name__ == "__main__":
    main()
