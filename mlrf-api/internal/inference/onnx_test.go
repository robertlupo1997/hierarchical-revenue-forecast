package inference

import (
	"testing"
)

func TestFeatureNames(t *testing.T) {
	names := FeatureNames()

	if len(names) != NumFeatures {
		t.Errorf("expected %d features, got %d", NumFeatures, len(names))
	}

	// Check for expected feature names. Must match the Python contract in
	// mlrf-ml/src/mlrf_ml/models/lightgbm_model.py (FEATURE_COLS + CATEGORICAL_COLS),
	// where the categorical columns are named "family" and "type".
	expectedFeatures := []string{
		"year",
		"month",
		"sales_lag_7",
		"oil_price",
		"family",
		"type",
	}

	for _, expected := range expectedFeatures {
		found := false
		for _, name := range names {
			if name == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find feature %q", expected)
		}
	}
}

func TestNumFeatures(t *testing.T) {
	// NumFeatures should be 27 (25 numeric + 2 categorical)
	if NumFeatures != 27 {
		t.Errorf("expected NumFeatures to be 27, got %d", NumFeatures)
	}
}

func TestNewONNXSessionMissingModel(t *testing.T) {
	_, err := NewONNXSession("nonexistent_model.onnx")
	if err == nil {
		t.Error("expected error for missing model file")
	}
}
