# Project: Fraud Guard (A Hybrid Gradient Boosting Framework for Interpretable Credit Card Fraud Detection)

## 1. Project Overview
This repository contains an end-to-end credit card fraud detection system. The project trains on the Kaggle European Credit Card Fraud dataset (284,807 transactions, ~0.17% fraud rate). It serves a two-part goal: 
1. Build a robust, real-time deployed detection system.
2. Rigorously evaluate design alternatives (specifically comparing tabular gradient boosting to a graph-based approach).

## 2. Project History / Evolution
The repository preserves the evolution of this project through a series of notebooks (found in `training/archive/` and `training/`):
- **V3 to V6**: Initially conceptualized as "FraudGuard," the system attempted a hybrid GraphSAGE + Autoencoder architecture. The rationale was to capture relational patterns between transactions using k-NN graphs. 
- **The Pivot**: Ablation testing (see Section 5) revealed that the GraphSAGE component actually degraded precision-recall performance. This was attributed to graph heterophily—fraudsters deliberately camouflaging their connections to appear similar to genuine nodes.
- **V7 (Final)**: Following these results, the system was pivoted to a supervised gradient-boosting ensemble (XGBoost, LightGBM, CatBoost) which significantly outperformed the graph approach on tabular financial data.
- **Notable Bug Fixes**: Throughout the deployment phase, the project resolved critical decoupling bugs—most notably fixing `BatchAnalysis.tsx` which was discarding valid API batch-prediction results due to unhandled Firestore persistence errors.

## 3. Final System Architecture
The deployed system precisely mirrors the `V7` pipeline.

### Data Pipeline & Feature Engineering
Transactions are routed through `engineer_features()` in `backend/app.py`. The model evaluates exactly 33 features defined in `model_config.json["feature_names"]`:
- **Core**: 28 principal components (`V1`...`V28`), `Time`, `Amount`.
- **Engineered**: `hour_sin`, `hour_cos` (temporal cyclicity), and `log1p_Amount` (magnitude scaling).
All 33 features are scaled using a standard scaler fitted only on the training folds.

### CV / Tuning Protocol
- **Folds**: 5-fold cross-validation (`cv_seed: 42`).
- **Hyperparameter Optimization (Optuna)**: 76 trials for XGBoost, 55 trials for LightGBM, and 33 trials for CatBoost (traced to `experiment_summary.json`).

### Ensemble Method
- **Method**: Unweighted simple average of predicted probabilities from the three tuned models.
- **Threshold**: `0.772547` (traced to `model_config.json["thresholds"]["ensemble_avg"]`).

### Backend API (`app.py`)
- `/` (Root health check)
- `/api/stats` (Dashboard monitoring stats)
- `/api/transactions` (Retrieves recent processed transactions)
- `/api/predict` (Real-time single-transaction evaluation + SHAP values)
- `/api/batch-predict` (Bulk CSV processing endpoint)
- `/api/model-info` (Returns thresholds, metrics, and best hyperparameters)

### Frontend
A React/Vite application located in `/frontend/`. Core pages include:
- `Landing.tsx`, `SignIn.tsx`
- `Dashboard.tsx` (Overall stats and real-time monitoring)
- `BatchAnalysis.tsx` (Bulk CSV upload and visualization)
- `Simulator.tsx` (Live stream simulation testing)

## 4. Results Summary
All metrics are verified from `experiment_summary.json`:
- **Ensemble Performance**: PR-AUC of **0.8481**, ROC-AUC of **0.9799**, and F1-Score of **0.8600** (using the default threshold).
- **Best Single Model**: Tuned XGBoost achieved a mean PR-AUC of **0.8525** (95% CI: 0.8346 - 0.8704). The ensemble performs comparably to the best single model, trading marginal additive accuracy for variance reduction against single-model edge cases.
- **Interpretability (SHAP)**: The top 5 features driving predictions by mean absolute SHAP value are `V14`, `V4`, `V12`, `V10`, and `V8`.

## 5. Graph Ablation (Design Alternative)
A rigorous split-robustness test compared the base Autoencoder (AE) against the FraudGuard GraphSAGE approach (`split_robustness_summary.csv`):
- **PR-AUC**: GraphSAGE degraded PR-AUC by a mean delta of **-0.0594** (Cohen's d: -1.345, Verdict: "tends to degrade").
- **ROC-AUC**: GraphSAGE degraded ROC-AUC by a mean delta of **-0.0196** (Cohen's d: -1.147, Verdict: "tends to degrade").
- **F1-Score**: Inconclusive (delta of +0.0112, wilcoxon p=0.8125).
Because fraudsters in transaction graphs lack homophily, standard message-passing algorithms over-smooth embeddings, blurring the boundary between genuine and fraudulent nodes. 

## 6. Deployment Validation
The final deployment was validated using `sanity_check.py`, which routes the same transactions through the offline `joblib` models and the live `/api/predict` endpoint.
- **Results**: 10/10 exact class matches for 5 genuine and 5 fraudulent sample rows.
- **Precision**: The absolute difference between the offline `joblib` ensemble average and the online `anomalyScore` was strictly bounded under $10^{-5}$ (typically $\approx 10^{-7}$), confirming deployment fidelity. 

## 7. Known Limitations
As detailed in the `main.tex` discussion section:
1. **CV/HPO Fold Overlap**: Hyperparameters were selected by maximizing performance on the exact same 5 CV folds later used to report final model metrics. This introduces a mild optimistic bias. A fully independent nested-CV or held-out test set is required for an unbiased generalization estimate.
2. **SHAP Proxy Limitation**: To meet real-time latency constraints, the API calculates SHAP values using only the XGBoost `TreeExplainer` as a proxy for the entire ensemble. While boosting decision boundaries are generally homologous, edge-cases driven uniquely by CatBoost or LightGBM will result in misaligned explanations.

## 8. Repository Structure
- `/paper/`: The academic write-up (`main.tex`, references, and generated `main.pdf`) along with used figures.
- `/backend/`: The Flask API (`app.py`) and `/saved_models/` containing the exact `.pkl` and `.json` artifacts loaded in production.
- `/frontend/`: The React web application.
- `/training/`: The final `FraudGuard_v7.ipynb` notebook and `/data_artifacts/` (containing `engineered.parquet`, `cv_results_summary.csv`, and ablation logs). 
- `/training/archive/`: Historical V3-V6 notebooks preserved for provenance.
- `/scripts/`: Debugging and verification scripts (e.g., `sanity_check.py`).

## 9. How to Reproduce
1. **Run the Backend**: 
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
2. **Run the Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. **Validate Deployment**: With the backend running on port 5000, open a new terminal:
   ```bash
   cd scripts
   python sanity_check.py
   ```
   This will compare the deployed API against offline model predictions.

## 10. Paper
The compiled PDF at `paper/main.pdf` ("A Hybrid Gradient Boosting Framework for Interpretable Credit Card Fraud Detection") is the academic write-up of this work. `PROJECT.md` serves strictly as the engineering-level technical companion document and repository map.
