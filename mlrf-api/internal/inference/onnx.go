// Package inference provides ONNX Runtime inference for ML models.
package inference

import (
	"fmt"
	"os"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
)

// NumFeatures is the expected number of input features for the model.
// This must match the ML training pipeline (25 numeric + 2 categorical encoded).
const NumFeatures = 27

// ONNXSession wraps ONNX Runtime for thread-safe inference.
type ONNXSession struct {
	session      *ort.AdvancedSession
	inputShape   ort.Shape
	outputShape  ort.Shape
	inputTensor  *ort.Tensor[float32]
	outputTensor *ort.Tensor[float32]
	mu           sync.Mutex
}

// NewONNXSession creates a new ONNX inference session.
func NewONNXSession(modelPath string) (*ONNXSession, error) {
	// Check if model file exists
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("model file not found: %s", modelPath)
	}

	// Set shared library path based on environment or default
	libPath := os.Getenv("ONNX_LIB_PATH")
	if libPath == "" {
		libPath = "libonnxruntime.so"
	}
	ort.SetSharedLibraryPath(libPath)

	// Initialize ONNX Runtime environment
	if err := ort.InitializeEnvironment(); err != nil {
		return nil, fmt.Errorf("failed to init onnxruntime: %w", err)
	}

	// Define shapes (batch=1, features=NumFeatures)
	inputShape := ort.NewShape(1, int64(NumFeatures))
	outputShape := ort.NewShape(1, 1)

	// Pre-allocate input tensor with zero values
	inputData := make([]float32, NumFeatures)
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("failed to create input tensor: %w", err)
	}

	// Pre-allocate output tensor
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		inputTensor.Destroy()
		return nil, fmt.Errorf("failed to create output tensor: %w", err)
	}

	// Create session with pre-allocated tensors for performance
	session, err := ort.NewAdvancedSession(
		modelPath,
		[]string{"input"},
		[]string{"output"},
		[]ort.Value{inputTensor},
		[]ort.Value{outputTensor},
		nil,
	)
	if err != nil {
		inputTensor.Destroy()
		outputTensor.Destroy()
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	return &ONNXSession{
		session:      session,
		inputShape:   inputShape,
		outputShape:  outputShape,
		inputTensor:  inputTensor,
		outputTensor: outputTensor,
	}, nil
}

// Predict runs inference on input features.
// Thread-safe - can be called from multiple goroutines.
func (s *ONNXSession) Predict(features []float32) (float32, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(features) != NumFeatures {
		return 0, fmt.Errorf("expected %d features, got %d", NumFeatures, len(features))
	}

	// Copy features to input tensor
	inputData := s.inputTensor.GetData()
	copy(inputData, features)

	// Run inference
	if err := s.session.Run(); err != nil {
		return 0, fmt.Errorf("inference failed: %w", err)
	}

	// Get output
	outputData := s.outputTensor.GetData()
	return outputData[0], nil
}

// PredictBatch runs inference on multiple inputs.
// More efficient than calling Predict multiple times.
func (s *ONNXSession) PredictBatch(featureBatch [][]float32) ([]float32, error) {
	results := make([]float32, len(featureBatch))
	for i, features := range featureBatch {
		pred, err := s.Predict(features)
		if err != nil {
			return nil, fmt.Errorf("batch item %d: %w", i, err)
		}
		results[i] = pred
	}
	return results, nil
}

// Close releases all ONNX Runtime resources.
func (s *ONNXSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.session != nil {
		s.session.Destroy()
	}
	if s.inputTensor != nil {
		s.inputTensor.Destroy()
	}
	if s.outputTensor != nil {
		s.outputTensor.Destroy()
	}
	ort.DestroyEnvironment()
}

// FeatureNames returns the expected feature names in order.
func FeatureNames() []string {
	return []string{
		// Date features
		"year",
		"month",
		"day",
		"dayofweek",
		"dayofyear",
		"is_mid_month",
		"is_leap_year",
		// External features
		"oil_price",
		"is_holiday",
		"onpromotion",
		"promo_rolling_7",
		// Store metadata
		"cluster",
		// Lag features
		"sales_lag_1",
		"sales_lag_7",
		"sales_lag_14",
		"sales_lag_28",
		"sales_lag_90",
		// Rolling features
		"sales_rolling_mean_7",
		"sales_rolling_mean_14",
		"sales_rolling_mean_28",
		"sales_rolling_mean_90",
		"sales_rolling_std_7",
		"sales_rolling_std_14",
		"sales_rolling_std_28",
		"sales_rolling_std_90",
		// Categorical (encoded)
		"family_encoded",
		"type_encoded",
	}
}
