// Package features provides feature lookup from preprocessed feature matrix.
package features

import (
	"encoding/binary"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/parquet-go/parquet-go"
	"github.com/rs/zerolog/log"
)

// NumFeatures is the number of features expected by the model.
const NumFeatures = 27

// DefaultStalenessThreshold is the default max age before features are considered stale.
var DefaultStalenessThreshold = 24 * time.Hour

// Metadata tracks feature store freshness and provenance.
type Metadata struct {
	LoadedAt    time.Time `json:"loaded_at"`
	FileModTime time.Time `json:"file_mod_time"`
	FilePath    string    `json:"file_path"`
	RowCount    int       `json:"row_count"`
	DataDateMin string    `json:"data_date_min"`
	DataDateMax string    `json:"data_date_max"`
	Version     string    `json:"version"`
}

// Store provides fast feature lookup by (store_nbr, family, date).
type Store struct {
	// index maps "storeNbr_family_date" -> feature vector
	index map[string][]float32

	// aggregated maps "storeNbr_family" -> average feature vector (fallback)
	aggregated map[string][]float32

	// metadata tracks freshness information
	metadata Metadata

	// stalenessThreshold defines how old data can be before considered stale
	stalenessThreshold time.Duration

	mu     sync.RWMutex
	loaded bool
}

// FeatureRow represents a row from the feature matrix parquet file.
type FeatureRow struct {
	StoreNbr int32     `parquet:"store_nbr"`
	Family   string    `parquet:"family"`
	Date     time.Time `parquet:"date"`

	// Numeric features
	Year           int32   `parquet:"year"`
	Month          int32   `parquet:"month"`
	Day            int32   `parquet:"day"`
	DayOfWeek      int32   `parquet:"dayofweek"`
	DayOfYear      int32   `parquet:"dayofyear"`
	IsMidMonth     int32   `parquet:"is_mid_month"`
	IsLeapYear     int32   `parquet:"is_leap_year"`
	OilPrice       float64 `parquet:"oil_price"`
	IsHoliday      int32   `parquet:"is_holiday"`
	OnPromotion    int32   `parquet:"onpromotion"`
	PromoRolling7  float64 `parquet:"promo_rolling_7"`
	Cluster        int32   `parquet:"cluster"`
	SalesLag1      float64 `parquet:"sales_lag_1"`
	SalesLag7      float64 `parquet:"sales_lag_7"`
	SalesLag14     float64 `parquet:"sales_lag_14"`
	SalesLag28     float64 `parquet:"sales_lag_28"`
	SalesLag90     float64 `parquet:"sales_lag_90"`
	SalesRolMean7  float64 `parquet:"sales_rolling_mean_7"`
	SalesRolMean14 float64 `parquet:"sales_rolling_mean_14"`
	SalesRolMean28 float64 `parquet:"sales_rolling_mean_28"`
	SalesRolMean90 float64 `parquet:"sales_rolling_mean_90"`
	SalesRolStd7   float64 `parquet:"sales_rolling_std_7"`
	SalesRolStd14  float64 `parquet:"sales_rolling_std_14"`
	SalesRolStd28  float64 `parquet:"sales_rolling_std_28"`
	SalesRolStd90  float64 `parquet:"sales_rolling_std_90"`

	// Categorical features (encoded as int for model)
	FamilyEncoded int32 `parquet:"family_encoded,optional"`
	TypeEncoded   int32 `parquet:"type_encoded,optional"`
}

// NewStore creates a new feature store from a parquet file.
func NewStore(parquetPath string) (*Store, error) {
	s := &Store{
		index:              make(map[string][]float32),
		aggregated:         make(map[string][]float32),
		stalenessThreshold: DefaultStalenessThreshold,
	}

	if err := s.Load(parquetPath); err != nil {
		return nil, err
	}
	return s, nil
}

// SetStalenessThreshold sets a custom staleness threshold.
func (s *Store) SetStalenessThreshold(d time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stalenessThreshold = d
}

// Load reads the parquet file and builds the in-memory index.
func (s *Store) Load(parquetPath string) error {
	start := time.Now()

	// Check if file exists
	if _, err := os.Stat(parquetPath); os.IsNotExist(err) {
		return fmt.Errorf("feature file not found: %s", parquetPath)
	}

	// Open parquet file
	file, err := os.Open(parquetPath)
	if err != nil {
		return fmt.Errorf("failed to open parquet file: %w", err)
	}
	defer file.Close()

	// Get file info for logging and metadata
	stat, err := file.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}

	// Create parquet reader (schema inferred from FeatureRow struct tags)
	reader := parquet.NewReader(file)
	defer reader.Close()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear existing data for reload
	s.index = make(map[string][]float32)
	s.aggregated = make(map[string][]float32)

	// Track aggregation data for fallback
	aggSum := make(map[string][]float64)
	aggCount := make(map[string]int)

	// Track date range for metadata
	var minDate, maxDate time.Time
	firstRow := true

	rowCount := 0
	for {
		var row FeatureRow
		err := reader.Read(&row)
		if err != nil {
			break // End of file or error
		}

		// Track date range
		if firstRow {
			minDate = row.Date
			maxDate = row.Date
			firstRow = false
		} else {
			if row.Date.Before(minDate) {
				minDate = row.Date
			}
			if row.Date.After(maxDate) {
				maxDate = row.Date
			}
		}

		// Build key (format date as YYYY-MM-DD)
		dateStr := row.Date.Format("2006-01-02")
		key := fmt.Sprintf("%d_%s_%s", row.StoreNbr, row.Family, dateStr)
		aggKey := fmt.Sprintf("%d_%s", row.StoreNbr, row.Family)

		// Extract features as float32 array
		features := rowToFeatures(&row)
		s.index[key] = features

		// Accumulate for aggregated fallback
		if _, ok := aggSum[aggKey]; !ok {
			aggSum[aggKey] = make([]float64, NumFeatures)
		}
		for i, f := range features {
			aggSum[aggKey][i] += float64(f)
		}
		aggCount[aggKey]++

		rowCount++
		if rowCount%500000 == 0 {
			log.Debug().Int("rows", rowCount).Msg("Loading features...")
		}
	}

	// Compute aggregated averages
	for key, sum := range aggSum {
		count := float64(aggCount[key])
		avg := make([]float32, NumFeatures)
		for i, v := range sum {
			avg[i] = float32(v / count)
		}
		s.aggregated[key] = avg
	}

	// Update metadata
	s.metadata = Metadata{
		LoadedAt:    time.Now(),
		FileModTime: stat.ModTime(),
		FilePath:    parquetPath,
		RowCount:    rowCount,
		DataDateMin: minDate.Format("2006-01-02"),
		DataDateMax: maxDate.Format("2006-01-02"),
		Version:     fmt.Sprintf("%d", stat.ModTime().Unix()),
	}

	s.loaded = true
	log.Info().
		Int("rows", rowCount).
		Int("indexed", len(s.index)).
		Int("aggregated", len(s.aggregated)).
		Int64("file_size_mb", stat.Size()/(1024*1024)).
		Str("data_range", fmt.Sprintf("%s to %s", s.metadata.DataDateMin, s.metadata.DataDateMax)).
		Dur("duration", time.Since(start)).
		Msg("Feature store loaded")

	return nil
}

// rowToFeatures converts a FeatureRow to a float32 array for model input.
func rowToFeatures(row *FeatureRow) []float32 {
	return []float32{
		// Date features
		float32(row.Year),
		float32(row.Month),
		float32(row.Day),
		float32(row.DayOfWeek),
		float32(row.DayOfYear),
		float32(row.IsMidMonth),
		float32(row.IsLeapYear),
		// External features
		float32(row.OilPrice),
		float32(row.IsHoliday),
		float32(row.OnPromotion),
		float32(row.PromoRolling7),
		// Store metadata
		float32(row.Cluster),
		// Lag features
		float32(row.SalesLag1),
		float32(row.SalesLag7),
		float32(row.SalesLag14),
		float32(row.SalesLag28),
		float32(row.SalesLag90),
		// Rolling features
		float32(row.SalesRolMean7),
		float32(row.SalesRolMean14),
		float32(row.SalesRolMean28),
		float32(row.SalesRolMean90),
		float32(row.SalesRolStd7),
		float32(row.SalesRolStd14),
		float32(row.SalesRolStd28),
		float32(row.SalesRolStd90),
		// Categorical features (encoded)
		float32(row.FamilyEncoded),
		float32(row.TypeEncoded),
	}
}

// GetFeatures returns features for a specific (store, family, date) combination.
// Falls back to aggregated features if exact date not found, then to zeros.
func (s *Store) GetFeatures(storeNbr int, family, date string) ([]float32, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Try exact match first
	key := fmt.Sprintf("%d_%s_%s", storeNbr, family, date)
	if features, ok := s.index[key]; ok {
		return features, true
	}

	// Try aggregated features (average for store+family)
	aggKey := fmt.Sprintf("%d_%s", storeNbr, family)
	if features, ok := s.aggregated[aggKey]; ok {
		log.Debug().
			Int("store", storeNbr).
			Str("family", family).
			Str("date", date).
			Msg("Using aggregated features")
		return features, true
	}

	// Return zeros as last resort
	log.Debug().
		Int("store", storeNbr).
		Str("family", family).
		Str("date", date).
		Msg("No features found, using zeros")
	return make([]float32, NumFeatures), false
}

// IsLoaded returns whether the feature store has been loaded.
func (s *Store) IsLoaded() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loaded
}

// Size returns the number of indexed feature vectors.
func (s *Store) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.index)
}

// AggregatedSize returns the number of aggregated feature vectors.
func (s *Store) AggregatedSize() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.aggregated)
}

// hash64 computes a simple hash for cache key generation.
func hash64(s string) uint64 {
	h := uint64(0)
	for i := 0; i < len(s); i++ {
		h = h*31 + uint64(s[i])
	}
	return h
}

// CacheKey generates a cache key for feature lookup.
func CacheKey(storeNbr int, family, date string) string {
	key := fmt.Sprintf("%d_%s_%s", storeNbr, family, date)
	h := hash64(key)
	b := make([]byte, 8)
	binary.LittleEndian.PutUint64(b, h)
	return fmt.Sprintf("feat:%x", b)
}

// GetMetadata returns the current metadata for the feature store.
func (s *Store) GetMetadata() Metadata {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.metadata
}

// IsFresh returns true if features were loaded within the staleness threshold.
func (s *Store) IsFresh() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded {
		return false
	}
	return time.Since(s.metadata.LoadedAt) < s.stalenessThreshold
}

// Age returns how long ago features were loaded.
func (s *Store) Age() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded {
		return 0
	}
	return time.Since(s.metadata.LoadedAt)
}

// DataAge returns how old the newest data point is.
func (s *Store) DataAge() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded || s.metadata.DataDateMax == "" {
		return 0
	}
	maxDate, err := time.Parse("2006-01-02", s.metadata.DataDateMax)
	if err != nil {
		return 0
	}
	return time.Since(maxDate)
}

// FilePath returns the path to the loaded feature file.
func (s *Store) FilePath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.metadata.FilePath
}
