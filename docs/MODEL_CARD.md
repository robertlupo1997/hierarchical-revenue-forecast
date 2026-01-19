# MLRF Model Card

## Model Overview

| Property | Value |
|----------|-------|
| **Model Name** | MLRF Revenue Forecasting Model |
| **Model Type** | LightGBM Gradient Boosting |
| **Version** | 1.0.0 |
| **Framework** | LightGBM 4.3.0, ONNX Runtime 1.18.0 |
| **Training Date** | 2026-01-18 |
| **License** | Apache 2.0 |

---

## Intended Use

### Primary Use Cases
- **Multi-LOB Revenue Forecasting**: Predict daily sales revenue across multiple stores and product categories
- **Demand Planning**: Support inventory and staffing decisions with 15-90 day forecasts
- **Business Analytics**: Enable trend analysis and performance comparison across stores

### Intended Users
- Business analysts and demand planners
- Store managers and operations teams
- Data science teams requiring baseline forecasts

### Out of Scope
- Real-time pricing optimization (predictions are not instantaneous enough)
- Individual customer-level predictions (model operates at store-family level)
- Causal inference (model identifies correlations, not causation)
- Predictions beyond 90-day horizon (accuracy degrades significantly)

---

## Training Data

### Data Source
**Kaggle Store Sales - Time Series Forecasting** competition dataset

### Data Characteristics

| Property | Value |
|----------|-------|
| **Date Range** | 2013-01-01 to 2017-08-15 |
| **Total Rows** | ~2.8 million |
| **Stores** | 54 |
| **Product Families** | 33 |
| **Time Series** | 1,782 (54 stores × 33 families) |
| **Country** | Ecuador |
| **Currency** | USD (converted from local currency) |

### Product Families
AUTOMOTIVE, BABY CARE, BEAUTY, BEVERAGES, BOOKS, BREAD/BAKERY, CELEBRATION, CLEANING, DAIRY, DELI, EGGS, FROZEN FOODS, GROCERY I, GROCERY II, HARDWARE, HOME AND KITCHEN, HOME APPLIANCES, HOME CARE, LADIESWEAR, LAWN AND GARDEN, LINGERIE, LIQUOR/WINE/BEER, MAGAZINES, MEATS, PERSONAL CARE, PET SUPPLIES, PLAYERS AND ELECTRONICS, POULTRY, PREPARED FOODS, PRODUCE, SCHOOL AND OFFICE SUPPLIES, SEAFOOD

### Feature Engineering

**27 Total Features** (25 numeric + 2 categorical):

| Category | Features |
|----------|----------|
| **Date Features** | year, month, day, dayofweek, dayofyear, is_mid_month, is_leap_year |
| **External** | oil_price, is_holiday, onpromotion, promo_rolling_7 |
| **Store Metadata** | cluster |
| **Lag Features** | sales_lag_1, sales_lag_7, sales_lag_14, sales_lag_28, sales_lag_90 |
| **Rolling Statistics** | sales_rolling_mean_7, sales_rolling_mean_14, sales_rolling_mean_28, sales_rolling_mean_90, sales_rolling_std_7, sales_rolling_std_14, sales_rolling_std_28, sales_rolling_std_90 |
| **Categorical** | family, type |

### Data Preprocessing
1. **Forward fill** for missing oil prices after temporal join
2. **Min-Max scaling** for numeric features in ONNX export
3. **Label encoding** for categorical features (family, store type)
4. **Null handling**: Rows with >1% nulls excluded

---

## Model Architecture

### Algorithm
**LightGBM (Light Gradient Boosting Machine)**
- Gradient boosting decision tree ensemble
- Leaf-wise tree growth for faster convergence
- Native categorical feature handling

### Hyperparameters

| Parameter | Value |
|-----------|-------|
| Objective | regression |
| Boosting Type | gbdt |
| Num Leaves | 63 |
| Learning Rate | 0.05 |
| Feature Fraction | 0.8 |
| Bagging Fraction | 0.8 |
| Bagging Frequency | 5 |
| Random Seed | 42 |

### Training Configuration
- **Validation Strategy**: Walk-forward cross-validation with 90-day gaps
- **Early Stopping**: Not used (fixed iterations based on validation)
- **Target Transformation**: Log1p transformation for RMSLE optimization

---

## Performance Metrics

### Final Model Performance

| Metric | Value | Quality Gate |
|--------|-------|--------------|
| **RMSLE** | 0.477 | < 0.50 |
| **RMSE** | 214.58 | - |
| **MAE** | 58.04 | - |

### Cross-Validation Results (Walk-Forward)

| Fold | RMSLE | RMSE | MAE | Samples |
|------|-------|------|-----|---------|
| 1 | 0.652 | 223.49 | 59.89 | 162,162 |

### Forecast Horizons

The model supports four forecast horizons:

| Horizon | Use Case | Expected Accuracy |
|---------|----------|-------------------|
| 15 days | Short-term planning | Best |
| 30 days | Monthly forecasts | Good |
| 60 days | Quarterly planning | Moderate |
| 90 days | Strategic planning | Lower |

### Hierarchical Reconciliation
- **Method**: MinTrace shrinkage (via hierarchicalforecast)
- **Tolerance**: 1% hierarchy sum tolerance
- **Structure**: Total → Store (54) → Family (33)

---

## Explainability

### SHAP Integration
The model includes SHAP (SHapley Additive exPlanations) for prediction interpretability:
- **Explainer Type**: TreeExplainer (optimized for gradient boosting)
- **Visualization**: Waterfall charts showing feature contributions
- **API Endpoint**: `/explain` returns SHAP values for any prediction

### Top Feature Importance (Typical)
1. `sales_lag_1` - Previous day sales (strongest predictor)
2. `sales_rolling_mean_7` - Weekly average trend
3. `dayofweek` - Day-of-week seasonality
4. `onpromotion` - Promotional status
5. `oil_price` - Economic indicator

---

## Limitations

### Known Limitations
1. **Geographic Scope**: Trained exclusively on Ecuador retail data; performance on other regions unknown
2. **Temporal Scope**: Data ends August 2017; does not capture post-2017 trends or disruptions
3. **External Shocks**: Cannot predict impacts of unprecedented events (pandemics, natural disasters, policy changes)
4. **Historical Data Requirement**: Requires 90+ days of historical data for accurate lag features
5. **Zero Sales**: Model may underperform for product families with many zero-sales days
6. **New Stores/Families**: Cannot make predictions for stores or families not in training data

### Performance Degradation
- Accuracy decreases with longer forecast horizons
- Predictions during holidays may be less accurate if holiday patterns differ from training
- Rapid market changes (new competitors, economic shifts) not reflected until retrained

---

## Ethical Considerations

### Data Privacy
- **No PII**: Training data contains no personally identifiable information
- **Aggregated Data**: All data is at store-family-day level, not individual transactions

### Fairness
- Model treats all stores equally; no demographic or socioeconomic features used
- Store "cluster" feature is based on sales patterns, not location demographics

### Responsible Use
- Predictions should **not** be the sole basis for staffing reductions
- Human oversight recommended for decisions affecting employment
- Model outputs are estimates, not guarantees
- Consider prediction intervals (80% and 95% CI) for decision-making

### Environmental Impact
- Training compute: Single machine, ~10 minutes
- Inference: Sub-10ms per prediction (efficient for production use)

---

## Deployment

### Inference Environment
- **Runtime**: Go with ONNX Runtime 1.18.0
- **Latency Target**: P95 < 100ms, P99 < 200ms
- **Caching**: Redis with local LRU for hot predictions
- **Batch Support**: Up to 100 predictions per request

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/predict/simple` | POST | Single prediction with simplified input |
| `/predict` | POST | Single prediction with full features |
| `/predict/batch` | POST | Batch predictions (max 100) |
| `/explain` | POST | SHAP waterfall data |
| `/hierarchy` | GET | Full hierarchy with predictions |
| `/whatif` | POST | What-if parameter sensitivity |

### Monitoring
- Prometheus metrics at `/metrics/prometheus`
- Grafana dashboards for latency, error rate, cache hit ratio
- Alerting for SLO violations (error rate >1%, P99 >100ms)

---

## Maintenance

### Retraining Recommendations
- **Frequency**: Monthly or when RMSLE exceeds 0.55 on recent data
- **Data Window**: Include most recent 4 years of data
- **Triggers**: New stores added, product family changes, significant accuracy drift

### Version History

| Version | Date | Changes | RMSLE |
|---------|------|---------|-------|
| 1.0.0 | 2026-01-18 | Initial release | 0.477 |

---

## References

### Data Source
- Kaggle Store Sales Competition: https://www.kaggle.com/competitions/store-sales-time-series-forecasting

### Libraries
- LightGBM: https://lightgbm.readthedocs.io/
- ONNX Runtime: https://onnxruntime.ai/
- SHAP: https://shap.readthedocs.io/
- hierarchicalforecast: https://nixtla.github.io/hierarchicalforecast/

### Model Cards Framework
- Mitchell et al. (2019). "Model Cards for Model Reporting"
- Google Model Cards: https://modelcards.withgoogle.com/

---

## Contact

For questions about this model:
- **Repository**: MLRF Multi-LOB Revenue Forecasting System
- **Documentation**: See `/docs/` directory
- **Issues**: Report via repository issue tracker
