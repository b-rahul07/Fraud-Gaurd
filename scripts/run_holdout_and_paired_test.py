"""
run_holdout_and_paired_test.py
==============================
Two additions to the Fraud Guard pipeline:
  1. Held-out test set evaluation (15% stratified holdout)
  2. Paired Wilcoxon signed-rank test: ensemble vs. XGBoost tuned (per-fold PR-AUC)

Updates experiment_summary.json in both locations.
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_recall_curve, auc, f1_score, roc_auc_score,
    confusion_matrix, precision_score, recall_score, accuracy_score,
)
from scipy.stats import wilcoxon

warnings.filterwarnings("ignore", category=UserWarning)

# ── Paths ───────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR     = os.path.join(PROJECT_ROOT, "training", "data_artifacts")
CV_DIR       = os.path.join(DATA_DIR, "cv_folds")
ENS_DIR      = os.path.join(DATA_DIR, "ensemble")
HOLDOUT_DIR  = os.path.join(DATA_DIR, "holdout")
ARTIFACTS_DIR = os.path.join(DATA_DIR, "artifacts")

EXP_SUMMARY_PATHS = [
    os.path.join(PROJECT_ROOT, "backend", "saved_models", "experiment_summary.json"),
    os.path.join(ARTIFACTS_DIR, "experiment_summary.json"),
]

FEATURE_NAMES = [
    "Time", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9",
    "V10", "V11", "V12", "V13", "V14", "V15", "V16", "V17", "V18", "V19",
    "V20", "V21", "V22", "V23", "V24", "V25", "V26", "V27", "V28",
    "Amount", "hour_sin", "hour_cos", "log1p_Amount",
]

HOLDOUT_SEED = 42
HOLDOUT_FRAC = 0.15
ENSEMBLE_THRESHOLD = 0.7725474768870858

MODEL_NAMES = ["xgboost", "lightgbm", "catboost"]


# ── Reusable statistical helpers (from V7 notebook) ────────────────────────
def cohens_d_paired(d_arr):
    """Cohen's d for paired differences."""
    return d_arr.mean() / (d_arr.std(ddof=1) + 1e-8)


def graduated_verdict(D, d, p, n):
    same_dir = int((D > 0).all()) if D.mean() > 0 else int((D < 0).all())
    majority = (D > 0).sum() > n / 2 if D.mean() > 0 else (D < 0).sum() > n / 2
    abs_d = abs(d)

    if D.mean() > 0:
        if same_dir and abs_d >= 0.8:
            return "consistent improvement"
        elif majority or abs_d >= 0.5:
            return "tends to improve"
        else:
            return "inconclusive"
    elif D.mean() < 0:
        if same_dir and abs_d >= 0.8:
            return "consistent degradation"
        elif majority or abs_d >= 0.5:
            return "tends to degrade"
        else:
            return "inconclusive"
    else:
        return "inconclusive"


def compute_metrics(y_true, y_proba, threshold):
    """Compute standard classification metrics at a given threshold."""
    precision_arr, recall_arr, _ = precision_recall_curve(y_true, y_proba)
    pr_auc_val = auc(recall_arr, precision_arr)
    roc_auc_val = roc_auc_score(y_true, y_proba)

    y_pred = (y_proba >= threshold).astype(int)
    f1_val = f1_score(y_true, y_pred)
    prec_val = precision_score(y_true, y_pred, zero_division=0)
    rec_val = recall_score(y_true, y_pred, zero_division=0)
    acc_val = accuracy_score(y_true, y_pred)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    return {
        "threshold": threshold,
        "roc_auc": float(roc_auc_val),
        "pr_auc": float(pr_auc_val),
        "f1": float(f1_val),
        "precision": float(prec_val),
        "recall": float(rec_val),
        "accuracy": float(acc_val),
        "tp": int(tp),
        "fp": int(fp),
        "tn": int(tn),
        "fn": int(fn),
    }


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: Held-out test set
# ═══════════════════════════════════════════════════════════════════════════
def run_holdout():
    print("=" * 70)
    print("PHASE 1: Held-Out Test Set Evaluation")
    print("=" * 70)

    # 1. Load engineered data
    df = pd.read_parquet(os.path.join(DATA_DIR, "data", "engineered.parquet"))
    X = df[FEATURE_NAMES].values
    y = df["Class"].values
    print(f"Loaded engineered dataset: {X.shape[0]} rows, {X.shape[1]} features")
    print(f"Class distribution: {int((y == 0).sum())} genuine, {int((y == 1).sum())} fraud")

    # 2. Stratified 85/15 split
    dev_idx, holdout_idx = train_test_split(
        np.arange(len(y)), test_size=HOLDOUT_FRAC, random_state=HOLDOUT_SEED,
        stratify=y,
    )
    dev_idx = np.sort(dev_idx)
    holdout_idx = np.sort(holdout_idx)

    X_dev, y_dev = X[dev_idx], y[dev_idx]
    X_holdout, y_holdout = X[holdout_idx], y[holdout_idx]

    print(f"\nDev set:     {len(dev_idx)} rows  "
          f"({int((y_dev == 0).sum())} genuine, {int((y_dev == 1).sum())} fraud)")
    print(f"Holdout set: {len(holdout_idx)} rows  "
          f"({int((y_holdout == 0).sum())} genuine, {int((y_holdout == 1).sum())} fraud)")

    # 3. Save holdout indices
    os.makedirs(HOLDOUT_DIR, exist_ok=True)
    joblib.dump({"dev_idx": dev_idx, "holdout_idx": holdout_idx,
                 "seed": HOLDOUT_SEED, "test_size": HOLDOUT_FRAC},
                os.path.join(HOLDOUT_DIR, "holdout_idx.pkl"))
    print(f"Saved holdout indices to {HOLDOUT_DIR}/holdout_idx.pkl")

    # 4. Load best hyperparameters from experiment_summary.json
    with open(EXP_SUMMARY_PATHS[0], "r") as f:
        exp_summary = json.load(f)
    optuna_params = exp_summary["optuna"]

    # 5. Fit scaler on full dev set
    scaler = StandardScaler()
    X_dev_scaled = scaler.fit_transform(X_dev)
    X_holdout_scaled = scaler.transform(X_holdout)

    # 6. Retrain each model on the full dev set with tuned hyperparameters
    holdout_probas = {}

    # --- XGBoost ---
    from xgboost import XGBClassifier
    xgb_params = optuna_params["xgboost"]["best_params"].copy()
    xgb_params["eval_metric"] = "aucpr"
    xgb_params["enable_categorical"] = True
    xgb_params["n_jobs"] = -1
    xgb_params["random_state"] = 42
    xgb_params["use_label_encoder"] = False
    scale_pos = int((y_dev == 0).sum()) / max(int((y_dev == 1).sum()), 1)
    xgb_params["scale_pos_weight"] = scale_pos

    print("\nTraining XGBoost on full dev set...")
    xgb_model = XGBClassifier(**xgb_params)
    xgb_model.fit(X_dev_scaled, y_dev)
    holdout_probas["xgboost"] = xgb_model.predict_proba(X_holdout_scaled)[:, 1]
    print(f"  XGBoost holdout proba range: "
          f"[{holdout_probas['xgboost'].min():.6f}, {holdout_probas['xgboost'].max():.6f}]")

    # --- LightGBM ---
    from lightgbm import LGBMClassifier
    lgb_params = optuna_params["lightgbm"]["best_params"].copy()
    lgb_params["objective"] = "binary"
    lgb_params["metric"] = "average_precision"
    lgb_params["n_jobs"] = -1
    lgb_params["random_state"] = 42
    lgb_params["verbose"] = -1
    lgb_params["is_unbalance"] = True

    print("Training LightGBM on full dev set...")
    lgb_model = LGBMClassifier(**lgb_params)
    lgb_model.fit(X_dev_scaled, y_dev)
    holdout_probas["lightgbm"] = lgb_model.predict_proba(X_holdout_scaled)[:, 1]
    print(f"  LightGBM holdout proba range: "
          f"[{holdout_probas['lightgbm'].min():.6f}, {holdout_probas['lightgbm'].max():.6f}]")

    # --- CatBoost ---
    from catboost import CatBoostClassifier
    cat_params = optuna_params["catboost"]["best_params"].copy()
    cat_params["random_seed"] = 42
    cat_params["verbose"] = 0
    cat_params["auto_class_weights"] = "Balanced"
    cat_params["eval_metric"] = "PRAUC"

    print("Training CatBoost on full dev set...")
    cat_model = CatBoostClassifier(**cat_params)
    cat_model.fit(X_dev_scaled, y_dev)
    holdout_probas["catboost"] = cat_model.predict_proba(X_holdout_scaled)[:, 1]
    print(f"  CatBoost holdout proba range: "
          f"[{holdout_probas['catboost'].min():.6f}, {holdout_probas['catboost'].max():.6f}]")

    # 7. Ensemble average
    ensemble_proba = (
        holdout_probas["xgboost"]
        + holdout_probas["lightgbm"]
        + holdout_probas["catboost"]
    ) / 3.0

    # 8. Compute holdout metrics
    holdout_metrics = compute_metrics(y_holdout, ensemble_proba, ENSEMBLE_THRESHOLD)
    holdout_metrics["holdout_size"] = int(len(holdout_idx))
    holdout_metrics["dev_size"] = int(len(dev_idx))
    holdout_metrics["holdout_seed"] = HOLDOUT_SEED

    print("\n" + "-" * 50)
    print("HOLDOUT RESULTS (ensemble, threshold=0.7725):")
    print("-" * 50)
    print(f"  PR-AUC:    {holdout_metrics['pr_auc']:.4f}")
    print(f"  F1:        {holdout_metrics['f1']:.4f}")
    print(f"  ROC-AUC:   {holdout_metrics['roc_auc']:.4f}")
    print(f"  Precision: {holdout_metrics['precision']:.4f}")
    print(f"  Recall:    {holdout_metrics['recall']:.4f}")
    print(f"  TP={holdout_metrics['tp']}  FP={holdout_metrics['fp']}  "
          f"TN={holdout_metrics['tn']}  FN={holdout_metrics['fn']}")

    # Save holdout models
    joblib.dump(xgb_model, os.path.join(HOLDOUT_DIR, "xgboost_holdout.pkl"))
    joblib.dump(lgb_model, os.path.join(HOLDOUT_DIR, "lightgbm_holdout.pkl"))
    joblib.dump(cat_model, os.path.join(HOLDOUT_DIR, "catboost_holdout.pkl"))
    joblib.dump(scaler, os.path.join(HOLDOUT_DIR, "scaler_holdout.pkl"))
    print(f"\nSaved holdout models and scaler to {HOLDOUT_DIR}/")

    return holdout_metrics


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: Paired Wilcoxon test — ensemble vs. XGBoost tuned
# ═══════════════════════════════════════════════════════════════════════════
def run_paired_test():
    print("\n" + "=" * 70)
    print("PHASE 2: Paired Wilcoxon Test — Ensemble vs. XGBoost Tuned")
    print("=" * 70)

    # Load data
    df = pd.read_parquet(os.path.join(DATA_DIR, "data", "engineered.parquet"))
    y_all = df["Class"].values

    # Load fold indices
    fold_indices = joblib.load(os.path.join(CV_DIR, "fold_indices.pkl"))

    # Load ensemble OOF matrix
    ens_data = joblib.load(os.path.join(ENS_DIR, "ensemble.pkl"))
    oof_matrix = ens_data["oof_matrix"]       # (283726, 3)
    model_names = ens_data["model_names"]     # ['xgboost', 'lightgbm', 'catboost']

    n_folds = len(fold_indices)
    ensemble_fold_pr_aucs = []
    xgb_fold_pr_aucs = []

    print(f"\nComputing per-fold PR-AUC for {n_folds} folds...\n")

    for fold_i in range(n_folds):
        val_idx = fold_indices[fold_i]["val"]
        y_val = y_all[val_idx]

        # Ensemble: average of all 3 models' OOF probabilities for this fold's val set
        ens_proba_fold = oof_matrix[val_idx].mean(axis=1)
        precision_arr, recall_arr, _ = precision_recall_curve(y_val, ens_proba_fold)
        ens_pr_auc = auc(recall_arr, precision_arr)
        ensemble_fold_pr_aucs.append(ens_pr_auc)

        # XGBoost tuned: load per-fold OOF predictions
        xgb_fold_data = joblib.load(os.path.join(CV_DIR, f"fold_{fold_i}_xgboost_tuned.pkl"))
        xgb_oof_proba = xgb_fold_data["oof_proba"]
        xgb_oof_indices = xgb_fold_data["oof_indices"]

        # Verify indices match
        assert np.array_equal(xgb_oof_indices, val_idx), \
            f"Fold {fold_i}: XGBoost OOF indices don't match fold val indices!"

        y_val_xgb = y_all[xgb_oof_indices]
        precision_arr, recall_arr, _ = precision_recall_curve(y_val_xgb, xgb_oof_proba)
        xgb_pr_auc = auc(recall_arr, precision_arr)
        xgb_fold_pr_aucs.append(xgb_pr_auc)

        print(f"  Fold {fold_i}: Ensemble PR-AUC={ens_pr_auc:.4f}  "
              f"XGBoost PR-AUC={xgb_pr_auc:.4f}  "
              f"delta={ens_pr_auc - xgb_pr_auc:+.4f}")

    ensemble_arr = np.array(ensemble_fold_pr_aucs)
    xgb_arr = np.array(xgb_fold_pr_aucs)
    D = ensemble_arr - xgb_arr  # positive = ensemble better
    n = len(D)

    d = cohens_d_paired(D)
    try:
        stat, p = wilcoxon(D)
    except Exception:
        stat, p = float("nan"), float("nan")

    same_dir = int((D > 0).sum()) if D.mean() > 0 else int((D < 0).sum())
    verdict = graduated_verdict(D, d, p, n)

    print(f"\n" + "-" * 50)
    print("PAIRED TEST RESULTS (Ensemble vs. XGBoost Tuned, PR-AUC):")
    print("-" * 50)
    print(f"  Ensemble mean PR-AUC: {ensemble_arr.mean():.4f} +/- {ensemble_arr.std(ddof=1):.4f}")
    print(f"  XGBoost mean PR-AUC:  {xgb_arr.mean():.4f} +/- {xgb_arr.std(ddof=1):.4f}")
    print(f"  Delta (ens - xgb):    {D.mean():+.4f} +/- {D.std(ddof=1):.4f}")
    print(f"  Cohen's d:            {d:+.4f}")
    print(f"  Wilcoxon p:           {p:.4f}")
    print(f"  Same direction:       {same_dir}/{n} folds")
    print(f"  Verdict:              {verdict}")
    print(f"\n  NOTE: n=5 gives Wilcoxon minimum p=0.0625 (low power).")

    paired_results = {
        "metric": "PR-AUC",
        "ensemble_mean": float(ensemble_arr.mean()),
        "ensemble_std": float(ensemble_arr.std(ddof=1)),
        "ensemble_per_fold": [float(x) for x in ensemble_arr],
        "xgb_mean": float(xgb_arr.mean()),
        "xgb_std": float(xgb_arr.std(ddof=1)),
        "xgb_per_fold": [float(x) for x in xgb_arr],
        "delta_mean": float(D.mean()),
        "delta_std": float(D.std(ddof=1)),
        "cohens_d": float(d),
        "wilcoxon_stat": float(stat) if not np.isnan(stat) else None,
        "wilcoxon_p": float(p) if not np.isnan(p) else None,
        "same_direction": same_dir,
        "n_folds": n,
        "verdict": verdict,
    }

    return paired_results


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3: Update experiment_summary.json
# ═══════════════════════════════════════════════════════════════════════════
def update_experiment_summary(holdout_metrics, paired_results):
    print("\n" + "=" * 70)
    print("PHASE 3: Updating experiment_summary.json")
    print("=" * 70)

    for path in EXP_SUMMARY_PATHS:
        if not os.path.exists(path):
            print(f"  WARNING: {path} does not exist, skipping.")
            continue

        with open(path, "r") as f:
            data = json.load(f)

        data["holdout_results"] = holdout_metrics
        data["ensemble_vs_best_single"] = paired_results

        with open(path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"  Updated: {path}")


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    holdout_metrics = run_holdout()
    paired_results = run_paired_test()
    update_experiment_summary(holdout_metrics, paired_results)

    print("\n" + "=" * 70)
    print("DONE. Both additions complete.")
    print("=" * 70)
