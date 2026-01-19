package handlers

import (
	"fmt"
	"time"
)

const (
	// MaxBatchSize is the maximum number of predictions allowed in a batch request.
	MaxBatchSize = 100

	// RequiredFeatureCount is the expected number of features for ONNX inference.
	RequiredFeatureCount = 27

	// DateFormat is the expected date format for prediction requests.
	DateFormat = "2006-01-02"
)

// ValidFamilies contains all valid product family names from the Kaggle Store Sales dataset.
// There are 33 product families in total.
var ValidFamilies = map[string]bool{
	"AUTOMOTIVE":                   true,
	"BABY CARE":                    true,
	"BEAUTY":                       true,
	"BEVERAGES":                    true,
	"BOOKS":                        true,
	"BREAD/BAKERY":                 true,
	"CELEBRATION":                  true,
	"CLEANING":                     true,
	"DAIRY":                        true,
	"DELI":                         true,
	"EGGS":                         true,
	"FROZEN FOODS":                 true,
	"GROCERY I":                    true,
	"GROCERY II":                   true,
	"HARDWARE":                     true,
	"HOME AND KITCHEN I":           true,
	"HOME AND KITCHEN II":          true,
	"HOME APPLIANCES":              true,
	"HOME CARE":                    true,
	"LADIESWEAR":                   true,
	"LAWN AND GARDEN":              true,
	"LINGERIE":                     true,
	"LIQUOR,WINE,BEER":             true,
	"MAGAZINES":                    true,
	"MEATS":                        true,
	"PERSONAL CARE":                true,
	"PET SUPPLIES":                 true,
	"PLAYERS AND ELECTRONICS":      true,
	"POULTRY":                      true,
	"PREPARED FOODS":               true,
	"PRODUCE":                      true,
	"SCHOOL AND OFFICE SUPPLIES":   true,
	"SEAFOOD":                      true,
}

// ValidHorizons contains the allowed forecast horizons in days.
var ValidHorizons = map[int]bool{
	15: true,
	30: true,
	60: true,
	90: true,
}

// ValidationError represents a validation error with a code for structured responses.
type ValidationError struct {
	Message string
	Code    string
}

func (e *ValidationError) Error() string {
	return e.Message
}

// ValidateDate checks if the date string is in YYYY-MM-DD format.
func ValidateDate(date string) *ValidationError {
	if date == "" {
		return &ValidationError{
			Message: "date is required",
			Code:    "MISSING_DATE",
		}
	}
	if _, err := time.Parse(DateFormat, date); err != nil {
		return &ValidationError{
			Message: fmt.Sprintf("date must be in %s format", DateFormat),
			Code:    "INVALID_DATE",
		}
	}
	return nil
}

// ValidateFamily checks if the family name is in the valid families list.
func ValidateFamily(family string) *ValidationError {
	if family == "" {
		return &ValidationError{
			Message: "family is required",
			Code:    "MISSING_FAMILY",
		}
	}
	if !ValidFamilies[family] {
		return &ValidationError{
			Message: fmt.Sprintf("invalid family name: %s", family),
			Code:    "INVALID_FAMILY",
		}
	}
	return nil
}

// ValidateStoreNbr checks if the store number is positive.
func ValidateStoreNbr(storeNbr int) *ValidationError {
	if storeNbr <= 0 {
		return &ValidationError{
			Message: "store_nbr must be positive",
			Code:    "INVALID_STORE",
		}
	}
	return nil
}

// ValidateHorizon checks if the horizon is one of the allowed values (15, 30, 60, 90).
func ValidateHorizon(horizon int) *ValidationError {
	if !ValidHorizons[horizon] {
		return &ValidationError{
			Message: "horizon must be 15, 30, 60, or 90",
			Code:    "INVALID_HORIZON",
		}
	}
	return nil
}

// ValidateFeatures checks if the features array has the correct length.
func ValidateFeatures(features []float32) *ValidationError {
	if len(features) == 0 {
		return &ValidationError{
			Message: "features are required",
			Code:    "MISSING_FEATURES",
		}
	}
	if len(features) != RequiredFeatureCount {
		return &ValidationError{
			Message: fmt.Sprintf("features must have exactly %d elements, got %d", RequiredFeatureCount, len(features)),
			Code:    "INVALID_FEATURES",
		}
	}
	return nil
}

// ValidateBatchSize checks if the batch size is within the allowed limit.
func ValidateBatchSize(size int) *ValidationError {
	if size == 0 {
		return &ValidationError{
			Message: "predictions array is empty",
			Code:    "EMPTY_BATCH",
		}
	}
	if size > MaxBatchSize {
		return &ValidationError{
			Message: fmt.Sprintf("batch size exceeds maximum of %d", MaxBatchSize),
			Code:    "BATCH_TOO_LARGE",
		}
	}
	return nil
}
