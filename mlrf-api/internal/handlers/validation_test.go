package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Unit tests for validation functions

func TestValidateDate(t *testing.T) {
	testCases := []struct {
		name        string
		date        string
		expectError bool
		errorCode   string
	}{
		{"valid date", "2017-08-01", false, ""},
		{"valid date leap year", "2016-02-29", false, ""},
		{"empty date", "", true, "MISSING_DATE"},
		{"invalid format mm/dd/yyyy", "08/01/2017", true, "INVALID_DATE"},
		{"invalid format yyyy/mm/dd", "2017/08/01", true, "INVALID_DATE"},
		{"invalid format dd-mm-yyyy", "01-08-2017", true, "INVALID_DATE"},
		{"invalid month", "2017-13-01", true, "INVALID_DATE"},
		{"invalid day", "2017-08-32", true, "INVALID_DATE"},
		{"invalid day for month", "2017-02-30", true, "INVALID_DATE"},
		{"random string", "not-a-date", true, "INVALID_DATE"},
		{"partial date", "2017-08", true, "INVALID_DATE"},
		{"date with time", "2017-08-01T12:00:00", true, "INVALID_DATE"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateDate(tc.date)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for date '%s', got nil", tc.date)
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for date '%s': %s", tc.date, err.Message)
				}
			}
		})
	}
}

func TestValidateFamily(t *testing.T) {
	testCases := []struct {
		name        string
		family      string
		expectError bool
		errorCode   string
	}{
		{"valid GROCERY I", "GROCERY I", false, ""},
		{"valid GROCERY II", "GROCERY II", false, ""},
		{"valid AUTOMOTIVE", "AUTOMOTIVE", false, ""},
		{"valid BABY CARE", "BABY CARE", false, ""},
		{"valid BEVERAGES", "BEVERAGES", false, ""},
		{"valid LIQUOR,WINE,BEER", "LIQUOR,WINE,BEER", false, ""},
		{"valid SCHOOL AND OFFICE SUPPLIES", "SCHOOL AND OFFICE SUPPLIES", false, ""},
		{"empty family", "", true, "MISSING_FAMILY"},
		{"invalid lowercase", "grocery i", true, "INVALID_FAMILY"},
		{"invalid family", "INVALID FAMILY", true, "INVALID_FAMILY"},
		{"partial match", "GROCERY", true, "INVALID_FAMILY"},
		{"extra spaces", " GROCERY I ", true, "INVALID_FAMILY"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateFamily(tc.family)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for family '%s', got nil", tc.family)
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for family '%s': %s", tc.family, err.Message)
				}
			}
		})
	}
}

func TestValidateFamilyAllFamilies(t *testing.T) {
	// Test all 33 valid families
	families := []string{
		"AUTOMOTIVE", "BABY CARE", "BEAUTY", "BEVERAGES", "BOOKS",
		"BREAD/BAKERY", "CELEBRATION", "CLEANING", "DAIRY", "DELI",
		"EGGS", "FROZEN FOODS", "GROCERY I", "GROCERY II", "HARDWARE",
		"HOME AND KITCHEN I", "HOME AND KITCHEN II", "HOME APPLIANCES",
		"HOME CARE", "LADIESWEAR", "LAWN AND GARDEN", "LINGERIE",
		"LIQUOR,WINE,BEER", "MAGAZINES", "MEATS", "PERSONAL CARE",
		"PET SUPPLIES", "PLAYERS AND ELECTRONICS", "POULTRY",
		"PREPARED FOODS", "PRODUCE", "SCHOOL AND OFFICE SUPPLIES", "SEAFOOD",
	}

	if len(families) != 33 {
		t.Errorf("expected 33 families, got %d", len(families))
	}

	for _, family := range families {
		err := ValidateFamily(family)
		if err != nil {
			t.Errorf("valid family '%s' returned error: %s", family, err.Message)
		}
	}
}

func TestValidateStoreNbr(t *testing.T) {
	testCases := []struct {
		name        string
		storeNbr    int
		expectError bool
		errorCode   string
	}{
		{"valid store 1", 1, false, ""},
		{"valid store 54", 54, false, ""},
		{"valid store 100", 100, false, ""},
		{"zero store", 0, true, "INVALID_STORE"},
		{"negative store", -1, true, "INVALID_STORE"},
		{"negative large", -100, true, "INVALID_STORE"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateStoreNbr(tc.storeNbr)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for store_nbr %d, got nil", tc.storeNbr)
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for store_nbr %d: %s", tc.storeNbr, err.Message)
				}
			}
		})
	}
}

func TestValidateHorizon(t *testing.T) {
	testCases := []struct {
		name        string
		horizon     int
		expectError bool
		errorCode   string
	}{
		{"valid 15", 15, false, ""},
		{"valid 30", 30, false, ""},
		{"valid 60", 60, false, ""},
		{"valid 90", 90, false, ""},
		{"invalid 0", 0, true, "INVALID_HORIZON"},
		{"invalid 7", 7, true, "INVALID_HORIZON"},
		{"invalid 45", 45, true, "INVALID_HORIZON"},
		{"invalid 100", 100, true, "INVALID_HORIZON"},
		{"invalid negative", -15, true, "INVALID_HORIZON"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateHorizon(tc.horizon)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for horizon %d, got nil", tc.horizon)
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for horizon %d: %s", tc.horizon, err.Message)
				}
			}
		})
	}
}

func TestValidateFeatures(t *testing.T) {
	testCases := []struct {
		name        string
		features    []float32
		expectError bool
		errorCode   string
	}{
		{"valid 27 features", make([]float32, 27), false, ""},
		{"valid 27 with values", []float32{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27}, false, ""},
		{"empty features", []float32{}, true, "MISSING_FEATURES"},
		{"nil features", nil, true, "MISSING_FEATURES"},
		{"too few features", make([]float32, 26), true, "INVALID_FEATURES"},
		{"too many features", make([]float32, 28), true, "INVALID_FEATURES"},
		{"single feature", []float32{1.0}, true, "INVALID_FEATURES"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateFeatures(tc.features)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for %d features, got nil", len(tc.features))
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for %d features: %s", len(tc.features), err.Message)
				}
			}
		})
	}
}

func TestValidateBatchSize(t *testing.T) {
	testCases := []struct {
		name        string
		size        int
		expectError bool
		errorCode   string
	}{
		{"valid single", 1, false, ""},
		{"valid multiple", 50, false, ""},
		{"valid max", 100, false, ""},
		{"empty batch", 0, true, "EMPTY_BATCH"},
		{"exceeds max", 101, true, "BATCH_TOO_LARGE"},
		{"way over max", 1000, true, "BATCH_TOO_LARGE"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateBatchSize(tc.size)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for batch size %d, got nil", tc.size)
				} else if err.Code != tc.errorCode {
					t.Errorf("expected error code '%s', got '%s'", tc.errorCode, err.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for batch size %d: %s", tc.size, err.Message)
				}
			}
		})
	}
}

// Handler-level validation tests

func TestPredict_InvalidDate(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	testCases := []struct {
		name        string
		date        string
		expectedMsg string
	}{
		{"wrong format", "08/01/2017", "date must be in 2006-01-02 format"},
		{"invalid month", "2017-13-01", "date must be in 2006-01-02 format"},
		{"invalid day", "2017-08-32", "date must be in 2006-01-02 format"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"store_nbr": 1,
				"family":    "GROCERY I",
				"date":      tc.date,
				"features":  make([]float64, 27),
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader(body))
			w := httptest.NewRecorder()

			h.Predict(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("INVALID_DATE")) {
				t.Errorf("expected INVALID_DATE error code, got %s", w.Body.String())
			}
		})
	}
}

func TestPredict_InvalidFamily(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	testCases := []struct {
		name   string
		family string
	}{
		{"invalid family", "INVALID FAMILY"},
		{"lowercase", "grocery i"},
		{"partial", "GROCERY"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"store_nbr": 1,
				"family":    tc.family,
				"date":      "2017-08-01",
				"features":  make([]float64, 27),
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader(body))
			w := httptest.NewRecorder()

			h.Predict(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("INVALID_FAMILY")) {
				t.Errorf("expected INVALID_FAMILY error code, got %s", w.Body.String())
			}
		})
	}
}

func TestPredict_InvalidFeatureLength(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	testCases := []struct {
		name     string
		features []float64
	}{
		{"too few", make([]float64, 26)},
		{"too many", make([]float64, 28)},
		{"single", []float64{1.0}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"store_nbr": 1,
				"family":    "GROCERY I",
				"date":      "2017-08-01",
				"features":  tc.features,
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader(body))
			w := httptest.NewRecorder()

			h.Predict(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("INVALID_FEATURES")) {
				t.Errorf("expected INVALID_FEATURES error code, got %s", w.Body.String())
			}
		})
	}
}

func TestPredictBatch_ExceedsMaxSize(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	// Create 101 predictions (exceeds max of 100)
	predictions := make([]map[string]interface{}, 101)
	for i := 0; i < 101; i++ {
		predictions[i] = map[string]interface{}{
			"store_nbr": 1,
			"family":    "GROCERY I",
			"date":      "2017-08-01",
			"features":  make([]float64, 27),
		}
	}

	payload := map[string]interface{}{
		"predictions": predictions,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/predict/batch", bytes.NewReader(body))
	w := httptest.NewRecorder()

	h.PredictBatch(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	if !bytes.Contains(w.Body.Bytes(), []byte("BATCH_TOO_LARGE")) {
		t.Errorf("expected BATCH_TOO_LARGE error code, got %s", w.Body.String())
	}
}

func TestPredictBatch_ValidMaxSize(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	// Create exactly 100 predictions (at the limit)
	predictions := make([]map[string]interface{}, 100)
	for i := 0; i < 100; i++ {
		predictions[i] = map[string]interface{}{
			"store_nbr": 1,
			"family":    "GROCERY I",
			"date":      "2017-08-01",
			"features":  make([]float64, 27),
		}
	}

	payload := map[string]interface{}{
		"predictions": predictions,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/predict/batch", bytes.NewReader(body))
	w := httptest.NewRecorder()

	h.PredictBatch(w, req)

	// Should not get 400 for batch size - will get 503 because no model loaded
	if w.Code == http.StatusBadRequest && bytes.Contains(w.Body.Bytes(), []byte("BATCH_TOO_LARGE")) {
		t.Errorf("100 predictions should be valid, got batch too large error")
	}
}

func TestPredictBatch_InvalidPredictionInBatch(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	// Create batch with one invalid prediction in the middle
	predictions := []map[string]interface{}{
		{
			"store_nbr": 1,
			"family":    "GROCERY I",
			"date":      "2017-08-01",
			"features":  make([]float64, 27),
		},
		{
			"store_nbr": 1,
			"family":    "INVALID FAMILY", // Invalid
			"date":      "2017-08-01",
			"features":  make([]float64, 27),
		},
		{
			"store_nbr": 1,
			"family":    "GROCERY I",
			"date":      "2017-08-01",
			"features":  make([]float64, 27),
		},
	}

	payload := map[string]interface{}{
		"predictions": predictions,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/predict/batch", bytes.NewReader(body))
	w := httptest.NewRecorder()

	h.PredictBatch(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	if !bytes.Contains(w.Body.Bytes(), []byte("prediction[1]")) {
		t.Errorf("expected error message to include 'prediction[1]', got %s", w.Body.String())
	}
}

func TestPredictSimple_InvalidDate(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	testCases := []struct {
		name string
		date string
	}{
		{"wrong format", "08/01/2017"},
		{"invalid month", "2017-13-01"},
		{"random string", "not-a-date"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"store_nbr": 1,
				"family":    "GROCERY I",
				"date":      tc.date,
				"horizon":   30,
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader(body))
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("INVALID_DATE")) {
				t.Errorf("expected INVALID_DATE error code, got %s", w.Body.String())
			}
		})
	}
}

func TestPredictSimple_InvalidFamily(t *testing.T) {
	h := NewHandlers(nil, nil, nil, nil)

	payload := map[string]interface{}{
		"store_nbr": 1,
		"family":    "INVALID FAMILY",
		"date":      "2017-08-01",
		"horizon":   30,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader(body))
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	if !bytes.Contains(w.Body.Bytes(), []byte("INVALID_FAMILY")) {
		t.Errorf("expected INVALID_FAMILY error code, got %s", w.Body.String())
	}
}
