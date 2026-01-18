package cache

import (
	"testing"
)

func TestGenerateCacheKey(t *testing.T) {
	tests := []struct {
		storeNbr int
		family   string
		date     string
		horizon  int
		expected string
	}{
		{1, "GROCERY I", "2017-08-01", 90, "pred:v1:1:GROCERY I:2017-08-01:90"},
		{54, "BEVERAGES", "2017-12-31", 15, "pred:v1:54:BEVERAGES:2017-12-31:15"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := GenerateCacheKey(tt.storeNbr, tt.family, tt.date, tt.horizon)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.URL == "" {
		t.Error("expected default URL")
	}

	if cfg.MaxLocal <= 0 {
		t.Error("expected positive MaxLocal")
	}

	if cfg.TTL <= 0 {
		t.Error("expected positive TTL")
	}
}
