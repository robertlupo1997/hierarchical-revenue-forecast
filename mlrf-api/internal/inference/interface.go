// Package inference provides ONNX Runtime inference for ML models.
package inference

// Inferencer defines the interface for running model inference.
// This interface allows for mocking in tests.
type Inferencer interface {
	// Predict runs inference on input features and returns a single prediction.
	// features must have exactly NumFeatures (27) elements.
	Predict(features []float32) (float32, error)

	// PredictBatch runs inference on multiple inputs.
	// More efficient than calling Predict multiple times for large batches.
	PredictBatch(featureBatch [][]float32) ([]float32, error)
}

// Verify ONNXSession implements Inferencer
var _ Inferencer = (*ONNXSession)(nil)
