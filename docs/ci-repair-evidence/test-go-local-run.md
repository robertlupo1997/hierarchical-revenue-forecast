# test-go local reproduction and fix — 2026-08-23T19:04:44Z

## Before fix (reproduction on 856f697, unmodified worktree)
```
--- FAIL: TestFeatureNames (0.00s)
    onnx_test.go:32: expected to find feature "family_encoded"
FAIL
FAIL	github.com/mlrf/mlrf-api/internal/inference	0.013s
```
(all other packages passed; only internal/inference failed)

## After fix: go build ./cmd/server && go vet ./... && go test ./... -count=1 -race
```
?   	github.com/mlrf/mlrf-api/cmd/server	[no test files]
ok  	github.com/mlrf/mlrf-api/internal/cache	1.024s
ok  	github.com/mlrf/mlrf-api/internal/features	1.018s
ok  	github.com/mlrf/mlrf-api/internal/handlers	1.072s
ok  	github.com/mlrf/mlrf-api/internal/inference	1.027s
ok  	github.com/mlrf/mlrf-api/internal/metrics	1.027s
ok  	github.com/mlrf/mlrf-api/internal/middleware	1.045s
ok  	github.com/mlrf/mlrf-api/internal/shapclient	1.032s
ok  	github.com/mlrf/mlrf-api/internal/tracing	1.026s
```
