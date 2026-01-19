# MLRF Kubernetes Deployment Guide

This guide covers deploying the Multi-LOB Revenue Forecasting System (MLRF) to Kubernetes.

## Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured to access your cluster
- Docker images built and pushed to a registry
- NGINX Ingress Controller installed
- Storage class supporting ReadWriteOnce (for Redis) and ReadOnlyMany (for models/data)

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │           Ingress (NGINX)           │
                    │  mlrf.local / api.mlrf.local        │
                    └─────────────┬───────────────────────┘
                                  │
                    ┌─────────────┴───────────────────────┐
                    │                                     │
           ┌────────▼────────┐               ┌───────────▼───────────┐
           │   Dashboard     │               │        API            │
           │   (2 replicas)  │               │     (3 replicas)      │
           │   Port 80       │               │     Port 8081         │
           └─────────────────┘               └───────────┬───────────┘
                                                         │
                                             ┌───────────▼───────────┐
                                             │       Redis           │
                                             │   (StatefulSet)       │
                                             │     Port 6379         │
                                             └───────────────────────┘
```

## Quick Start

### 1. Build and Push Docker Images

```bash
# Build images
docker build -t your-registry/mlrf-api:latest ./mlrf-api
docker build -t your-registry/mlrf-dashboard:latest ./mlrf-dashboard

# Push to registry
docker push your-registry/mlrf-api:latest
docker push your-registry/mlrf-dashboard:latest
```

### 2. Create Namespace and Secrets

```bash
# Create the namespace
kubectl apply -f deploy/kubernetes/namespace.yaml

# Create secrets (copy template first)
cp deploy/kubernetes/secrets.yaml.template deploy/kubernetes/secrets.yaml

# Generate and encode API key
API_KEY=$(openssl rand -base64 32)
echo "Generated API key: $API_KEY"
API_KEY_B64=$(echo -n "$API_KEY" | base64)
sed -i "s/Y2hhbmdlLW1lLWluLXByb2R1Y3Rpb24=/$API_KEY_B64/" deploy/kubernetes/secrets.yaml

# Apply secrets
kubectl apply -f deploy/kubernetes/secrets.yaml
```

### 3. Prepare Data Volumes

Before deploying, you need to provision PersistentVolumes with your model and data files:

```bash
# Option A: Use a ReadWriteMany storage class (NFS, EFS, etc.)
# Edit pvc.yaml to set your storage class, then apply:
kubectl apply -f deploy/kubernetes/pvc.yaml

# Option B: Create ConfigMaps for small files (not recommended for large datasets)
kubectl create configmap mlrf-model \
  --from-file=lightgbm_model.onnx=models/lightgbm_model.onnx \
  --namespace=mlrf

# Option C: Use init containers to download from S3/GCS (production recommended)
# See "Production Data Loading" section below
```

### 4. Update Image References

Edit the kustomization.yaml or use kubectl to specify your registry:

```bash
# Option A: Edit kustomization.yaml
# images:
# - name: mlrf-api
#   newName: your-registry/mlrf-api
#   newTag: v1.0.0

# Option B: Use kubectl set image after deployment
kubectl set image deployment/mlrf-api api=your-registry/mlrf-api:v1.0.0 -n mlrf
```

### 5. Deploy All Resources

Using Kustomize (recommended):

```bash
kubectl apply -k deploy/kubernetes/
```

Or apply files individually:

```bash
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/pvc.yaml
kubectl apply -f deploy/kubernetes/redis-statefulset.yaml
kubectl apply -f deploy/kubernetes/api-deployment.yaml
kubectl apply -f deploy/kubernetes/api-service.yaml
kubectl apply -f deploy/kubernetes/dashboard-deployment.yaml
kubectl apply -f deploy/kubernetes/dashboard-service.yaml
kubectl apply -f deploy/kubernetes/ingress.yaml
```

### 6. Configure DNS/Hosts

For local testing, add to /etc/hosts:

```
<INGRESS_IP>  mlrf.local api.mlrf.local
```

Get the ingress IP:

```bash
kubectl get ingress -n mlrf
```

### 7. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n mlrf

# Check services
kubectl get svc -n mlrf

# Test API health
curl http://api.mlrf.local/health

# Test dashboard
curl http://mlrf.local/
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | (none) | API authentication key |
| `CORS_ORIGINS` | `http://mlrf.local` | Allowed CORS origins |
| `RATE_LIMIT_RPS` | `100` | Rate limit requests per second |
| `RATE_LIMIT_BURST` | `200` | Rate limit burst size |
| `REDIS_URL` | `redis://mlrf-redis:6379` | Redis connection URL |
| `MODEL_PATH` | `/app/models/lightgbm_model.onnx` | Path to ONNX model |
| `FEATURE_PATH` | `/app/data/features/feature_matrix.parquet` | Path to feature data |

### Scaling

```bash
# Scale API pods
kubectl scale deployment mlrf-api --replicas=5 -n mlrf

# Scale dashboard pods
kubectl scale deployment mlrf-dashboard --replicas=3 -n mlrf
```

### Resource Limits

Default resource allocations:

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| API | 100m | 500m | 256Mi | 512Mi |
| Dashboard | 25m | 100m | 64Mi | 128Mi |
| Redis | 50m | 200m | 128Mi | 256Mi |

Adjust in the respective deployment YAML files based on your workload.

## Production Considerations

### 1. TLS/HTTPS

Uncomment the TLS section in ingress.yaml and create a TLS secret:

```bash
# Using cert-manager (recommended)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mlrf-tls
  namespace: mlrf
spec:
  secretName: mlrf-tls-secret
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - mlrf.example.com
  - api.mlrf.example.com
EOF

# Or create manually with existing certificates
kubectl create secret tls mlrf-tls-secret \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  --namespace=mlrf
```

### 2. Production Data Loading

For production, use init containers to load model and data files:

```yaml
# Add to api-deployment.yaml spec.template.spec
initContainers:
- name: init-model
  image: amazon/aws-cli
  command: ['sh', '-c', 'aws s3 cp s3://your-bucket/models/lightgbm_model.onnx /models/']
  volumeMounts:
  - name: models
    mountPath: /models
  env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: access-key-id
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: secret-access-key
```

### 3. High Availability

- **API**: 3+ replicas with pod anti-affinity (already configured)
- **Dashboard**: 2+ replicas with pod anti-affinity
- **Redis**: Consider Redis Sentinel or Redis Cluster for HA
- **PDB (Pod Disruption Budget)**:

```bash
kubectl apply -f - <<EOF
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: mlrf-api-pdb
  namespace: mlrf
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: mlrf-api
EOF
```

### 4. Monitoring

The API exposes Prometheus metrics at `/metrics/prometheus`. Add ServiceMonitor for Prometheus Operator:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mlrf-api
  namespace: mlrf
spec:
  selector:
    matchLabels:
      app: mlrf-api
  endpoints:
  - port: http
    path: /metrics/prometheus
    interval: 30s
```

### 5. Network Policies

Restrict traffic between pods:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mlrf-api-policy
  namespace: mlrf
spec:
  podSelector:
    matchLabels:
      app: mlrf-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - podSelector:
        matchLabels:
          app: mlrf-dashboard
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: mlrf-redis
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n mlrf

# Check logs
kubectl logs <pod-name> -n mlrf

# Check events
kubectl get events -n mlrf --sort-by='.lastTimestamp'
```

### API Not Responding

```bash
# Check if API pod is ready
kubectl get pods -n mlrf -l app=mlrf-api

# Test service directly
kubectl port-forward svc/mlrf-api 8081:8081 -n mlrf
curl localhost:8081/health

# Check Redis connectivity
kubectl exec -it deployment/mlrf-api -n mlrf -- redis-cli -h mlrf-redis ping
```

### Ingress Issues

```bash
# Check ingress status
kubectl describe ingress mlrf-ingress -n mlrf

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

### Volume Mount Issues

```bash
# Check PVC status
kubectl get pvc -n mlrf

# Check PV binding
kubectl describe pvc mlrf-models-pvc -n mlrf
```

## Cleanup

```bash
# Delete all MLRF resources
kubectl delete -k deploy/kubernetes/

# Or delete namespace (removes everything)
kubectl delete namespace mlrf
```

## File Reference

| File | Description |
|------|-------------|
| `namespace.yaml` | MLRF namespace definition |
| `configmap.yaml` | Non-sensitive configuration |
| `secrets.yaml.template` | Template for sensitive data |
| `pvc.yaml` | PersistentVolumeClaims for models and data |
| `redis-statefulset.yaml` | Redis StatefulSet and Service |
| `api-deployment.yaml` | API Deployment (3 replicas) |
| `api-service.yaml` | API ClusterIP Service |
| `dashboard-deployment.yaml` | Dashboard Deployment (2 replicas) |
| `dashboard-service.yaml` | Dashboard ClusterIP Service |
| `ingress.yaml` | NGINX Ingress for external access |
| `kustomization.yaml` | Kustomize configuration |
