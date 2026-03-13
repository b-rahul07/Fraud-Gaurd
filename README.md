<div align="center">

# FraudGuard

### Structure-First Credit Card Fraud Detection Platform

Production-grade system for detecting coordinated fraud patterns using graph embeddings and anomaly detection.

[![React](https://img.shields.io/badge/React-18.3-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.5-ee4c2c?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Authentication-ffca28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

[Live Demo](https://fraud-gaurd-mu.vercel.app/) | [Report Bug](https://github.com/b-rahul07/Fraud-Gaurd/issues) | [Integration Guide](./INTEGRATION_GUIDE.md)

</div>

---

## Overview

FraudGuard focuses on structure rather than isolated transactions. In real card-fraud datasets, fraud can be below 1%, so plain accuracy is misleading. This project models transactions as a graph and flags anomalies based on structural behavior.

## How It Works

1. Graph construction and embedding:
- Build a KNN graph from transaction features.
- Use GraphSAGE to produce 32D structural embeddings.

2. Unsupervised anomaly detection:
- Train an autoencoder on normal transactions only.
- Score each embedding with reconstruction error.
- Mark high-error points as suspicious using a statistical threshold.

Core formulas:

```text
h_v = sigma(W * CONCAT(h_v, AGG({h_u | u in N(v)})))
MSE = (1/n) * sum((x_i - x_hat_i)^2)
threshold = mu + 3*sigma
```

## Why GraphSAGE

- Inductive: supports unseen transactions at inference time.
- Better fit for evolving transaction streams than fixed transductive embeddings.
- Captures neighborhood context that single-row models miss.

## Key Features

- Batch CSV fraud analysis endpoint.
- Single transaction prediction endpoint.
- React + TypeScript dashboard and simulator.
- Firebase auth with user-scoped data.
- Flask + PyTorch inference backend.

## Quick Start

Prerequisites:
- Node.js 18+
- Python 3.10+

Backend:

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
# source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

One-click Windows launch:

```bash
.\start.bat
```

## API

Base URL (local):

```text
http://localhost:5000
```

Main endpoints:
- `GET /api/stats`
- `GET /api/transactions?limit=10`
- `POST /api/predict`
- `POST /api/batch-predict`

Batch endpoint accepts `multipart/form-data` CSV with columns:

```text
Time,V1,V2,...,V28,Amount
```

## Project Layout

```text
backend/
  app.py
  models/
    train_model.py
    graphsage_model.py
    autoencoder.py
  graph/
    graph_builder.py
  preprocessing/
    preprocess.py
  saved_models/

frontend/
  src/
    pages/
    components/
    services/
  package.json

INTEGRATION_GUIDE.md
QUICK_START.txt
start.bat
stop.bat
```

## Notes and Trade-offs

- KNN graph building is expensive for large batches.
- Batch mode uses graph context; isolated single-row inference has less structural context.
- PCA-transformed features improve privacy but reduce feature-level interpretability.

## Documentation

- Full setup and integration: [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
- Backend details: [backend/README.md](./backend/README.md)
- Frontend details: [frontend/README.md](./frontend/README.md)

## License

MIT
