package features

import (
	"testing"
)

func TestGetFeaturesWithNoData(t *testing.T) {
	// Create empty store (without loading from file)
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     true,
	}

	// Should return zeros when no data
	features, found := s.GetFeatures(1, "GROCERY I", "2017-08-01")

	if found {
		t.Error("expected found=false for empty store")
	}

	if len(features) != NumFeatures {
		t.Errorf("expected %d features, got %d", NumFeatures, len(features))
	}

	// All features should be zero
	for i, f := range features {
		if f != 0 {
			t.Errorf("expected feature[%d] = 0, got %f", i, f)
		}
	}
}

func TestGetFeaturesWithExactMatch(t *testing.T) {
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     true,
	}

	// Add test data
	testFeatures := make([]float32, NumFeatures)
	testFeatures[0] = 2017 // year
	testFeatures[1] = 8    // month
	testFeatures[2] = 1    // day
	s.index["1_GROCERY I_2017-08-01"] = testFeatures

	// Should find exact match
	features, found := s.GetFeatures(1, "GROCERY I", "2017-08-01")

	if !found {
		t.Error("expected found=true for exact match")
	}

	if features[0] != 2017 {
		t.Errorf("expected year=2017, got %f", features[0])
	}

	if features[1] != 8 {
		t.Errorf("expected month=8, got %f", features[1])
	}
}

func TestGetFeaturesWithAggregatedFallback(t *testing.T) {
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     true,
	}

	// Add aggregated data only (no exact match)
	aggFeatures := make([]float32, NumFeatures)
	aggFeatures[0] = 2016.5 // average year
	s.aggregated["1_GROCERY I"] = aggFeatures

	// Should fall back to aggregated features
	features, found := s.GetFeatures(1, "GROCERY I", "2017-08-01")

	if !found {
		t.Error("expected found=true for aggregated fallback")
	}

	if features[0] != 2016.5 {
		t.Errorf("expected year=2016.5, got %f", features[0])
	}
}

func TestIsLoaded(t *testing.T) {
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     false,
	}

	if s.IsLoaded() {
		t.Error("expected IsLoaded()=false")
	}

	s.loaded = true

	if !s.IsLoaded() {
		t.Error("expected IsLoaded()=true")
	}
}

func TestCacheKey(t *testing.T) {
	key1 := CacheKey(1, "GROCERY I", "2017-08-01")
	key2 := CacheKey(1, "GROCERY I", "2017-08-02")
	key3 := CacheKey(2, "GROCERY I", "2017-08-01")

	if key1 == key2 {
		t.Error("different dates should have different cache keys")
	}

	if key1 == key3 {
		t.Error("different stores should have different cache keys")
	}

	// Same inputs should produce same key
	key1b := CacheKey(1, "GROCERY I", "2017-08-01")
	if key1 != key1b {
		t.Error("same inputs should produce same cache key")
	}
}

func TestRowToFeatures(t *testing.T) {
	row := &FeatureRow{
		StoreNbr:       1,
		Family:         "GROCERY I",
		Date:           "2017-08-01",
		Year:           2017,
		Month:          8,
		Day:            1,
		DayOfWeek:      1,
		DayOfYear:      213,
		IsMidMonth:     0,
		IsLeapYear:     0,
		OilPrice:       46.57,
		IsHoliday:      0,
		OnPromotion:    5,
		PromoRolling7:  3.5,
		Cluster:        14,
		SalesLag1:      100.5,
		SalesLag7:      95.3,
		SalesLag14:     88.2,
		SalesLag28:     102.1,
		SalesLag90:     110.5,
		SalesRolMean7:  98.5,
		SalesRolMean14: 92.1,
		SalesRolMean28: 95.5,
		SalesRolMean90: 100.2,
		SalesRolStd7:   12.3,
		SalesRolStd14:  14.5,
		SalesRolStd28:  11.2,
		SalesRolStd90:  10.8,
		FamilyEncoded:  5,
		TypeEncoded:    2,
	}

	features := rowToFeatures(row)

	if len(features) != NumFeatures {
		t.Errorf("expected %d features, got %d", NumFeatures, len(features))
	}

	// Check a few key features
	if features[0] != 2017 {
		t.Errorf("expected year=2017, got %f", features[0])
	}

	if features[7] != 46.57 {
		t.Errorf("expected oil_price=46.57, got %f", features[7])
	}

	if features[25] != 5 {
		t.Errorf("expected family_encoded=5, got %f", features[25])
	}

	if features[26] != 2 {
		t.Errorf("expected type_encoded=2, got %f", features[26])
	}
}

func TestSize(t *testing.T) {
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     true,
	}

	if s.Size() != 0 {
		t.Errorf("expected size=0, got %d", s.Size())
	}

	s.index["key1"] = make([]float32, NumFeatures)
	s.index["key2"] = make([]float32, NumFeatures)

	if s.Size() != 2 {
		t.Errorf("expected size=2, got %d", s.Size())
	}
}

func TestAggregatedSize(t *testing.T) {
	s := &Store{
		index:      make(map[string][]float32),
		aggregated: make(map[string][]float32),
		loaded:     true,
	}

	if s.AggregatedSize() != 0 {
		t.Errorf("expected aggregated size=0, got %d", s.AggregatedSize())
	}

	s.aggregated["key1"] = make([]float32, NumFeatures)

	if s.AggregatedSize() != 1 {
		t.Errorf("expected aggregated size=1, got %d", s.AggregatedSize())
	}
}
