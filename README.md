<div align="center">

# FraudGuard Backend

### Graph-Based Credit Card Fraud Detection API

Flask + GraphSAGE + Autoencoder pipeline for single and batch fraud inference.

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.5-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)
[![PyG](https://img.shields.io/badge/PyTorch%20Geometric-GNN-orange?style=for-the-badge)](https://pytorch-geometric.readthedocs.io/)

</div>

---

## Overview

This backend detects structural transaction anomalies using a two-stage pipeline:

```text
Input Features (30) -> Graph Construction (KNN) -> GraphSAGE Embeddings (32D)
-> Autoencoder Reconstruction -> MSE Scoring -> Fraud / Genuine
```

## Quick Start

```bash
pip install -r requirements.txt
python models/train_model.py  # run once if model files are missing
python app.py
```

Local API base URL:

```text
http://127.0.0.1:5000
```

## API Endpoints

- `POST /api/predict`: single transaction inference.
- `POST /api/batch-predict`: CSV batch inference.
- `GET /api/stats`: dashboard summary metrics.
- `GET /api/transactions?limit=10`: recent predictions.

### Single Prediction Example

Request:

```json
{
  "Time": 0.0,
  "V1": -1.35980713,
  "V2": -0.07278117,
  "...": "...",
  "V28": -0.02105305,
  "Amount": 149.62
}
```

Response:

```json
{
  "prediction": "Genuine",
  "anomalyScore": 0.012345,
  "threshold": 0.023456,
  "time": 0.0,
  "amount": 149.62,
  "isFraud": false
}
```

### Batch CSV Example

Requirements:
- Content type: `multipart/form-data`
- Columns: `Time,V1,...,V28,Amount`

```bash
curl -X POST http://localhost:5000/api/batch-predict -F "file=@sample_batch.csv"
```

Optional endpoint test:

```bash
python test_batch_endpoint.py
```

## Pipeline Notes

- Single prediction uses scaled input + embedding + autoencoder scoring.
- Batch prediction builds a KNN graph (`k=5`) and uses GraphSAGE context.
- Decision rule uses statistical thresholding (`mu + 3*sigma`).

## Model Artifacts

- `saved_models/autoencoder_model.pth`
- `saved_models/graphsage_model.pth`
- `saved_models/scaler.pkl`
- `saved_models/threshold.pkl`

## Sample Data

- `sample_batch.csv`: minimal CSV for batch endpoint checks.
