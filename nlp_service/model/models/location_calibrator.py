"""
Location confidence calibrator — 2-layer PyTorch MLP.

Maps the 5 binary location-specificity features already computed in
entity_extractor._is_location_specific() to a calibrated confidence
probability in [0.0, 1.0].

Feature vector (order matters — must match training):
  [0] has_street_number   (1 if address contains a building number)
  [1] has_intersection    (1 if "and" or "&" joins two road names)
  [2] has_road_name       (1 if a recognized road-type word is present)
  [3] has_gpe_entity      (1 if spaCy found a GPE/LOC/FAC entity)
  [4] has_vague_landmark  (1 if only a vague proximity phrase was found)

If the saved model file is missing, calibrate() returns a weighted
heuristic score so the pipeline degrades gracefully.
"""

import os
from typing import List

import torch
import torch.nn as nn

_MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "ml_models", "saved_models", "location_calibrator.pt"
)
_MODEL_PATH = os.path.normpath(_MODEL_PATH)

_INPUT_DIM  = 5
_HIDDEN_DIM = 16


class _MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(_INPUT_DIM, _HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(_HIDDEN_DIM, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


class LocationCalibrator:
    """
    Calibrates location extraction confidence via a trained MLP.
    Falls back to a weighted heuristic when the model file is absent.
    """

    def __init__(self):
        self._model: _MLP = None
        self._loaded = False
        self._load()

    def _load(self):
        if self._loaded:
            return
        self._loaded = True
        if not os.path.exists(_MODEL_PATH):
            print(f"ℹ️  Location calibrator model not found at {_MODEL_PATH}. "
                  "Run train/train_entity_confidence.py to train it. Using heuristic fallback.")
            return
        try:
            model = _MLP()
            model.load_state_dict(torch.load(_MODEL_PATH, map_location="cpu"))
            model.eval()
            self._model = model
            print("✓ Location calibrator model loaded.")
        except Exception as e:
            print(f"⚠️  Location calibrator load error: {e}. Using heuristic fallback.")

    def calibrate(self, feature_vector: List[float]) -> float:
        """
        Map 5-feature vector → calibrated confidence float in [0.0, 1.0].

        Args:
            feature_vector: [has_street_number, has_intersection, has_road_name,
                             has_gpe_entity, has_vague_landmark]
        Returns:
            float confidence score
        """
        if len(feature_vector) != _INPUT_DIM:
            raise ValueError(f"Expected {_INPUT_DIM} features, got {len(feature_vector)}")

        if self._model is not None:
            with torch.no_grad():
                x = torch.tensor([feature_vector], dtype=torch.float32)
                score = self._model(x).item()
            # A named GPE/LOC/FAC entity combined with a recognized road type is
            # actionable even without a building number (e.g. "Victoria Park on King St. E").
            # The MLP may under-score this [0,0,1,1,*] combination if it was under-
            # represented in training data, so we apply a justified floor here.
            has_road_name, has_gpe_entity = feature_vector[2], feature_vector[3]
            if has_road_name and has_gpe_entity:
                score = max(score, 0.65)
            return round(score, 4)

        # Heuristic fallback (matches original rule weights)
        has_street_number, has_intersection, has_road_name, has_gpe_entity, has_vague_landmark = feature_vector
        if has_street_number and has_road_name:
            return 0.85
        if has_intersection:
            return 0.80
        # Floor rule: landmark-only (no street number, no road type) → cap at 0.35
        if not has_street_number and not has_road_name:
            return min(0.35, 0.75 if has_gpe_entity else 0.45 if has_vague_landmark else 0.40)
        if has_gpe_entity:
            return 0.75
        if has_road_name:
            return 0.65
        if has_vague_landmark:
            return 0.45
        return 0.40

    def is_trained(self) -> bool:
        return self._model is not None
