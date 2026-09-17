import sys
import os
sys.path.append(os.path.abspath("."))

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import joblib
import sqlite3
import json
import traceback
import shap

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Load configuration and models
with open("saved_models/model_config.json", "r") as f:
    model_config = json.load(f)

with open("saved_models/experiment_summary.json", "r") as f:
    experiment_summary = json.load(f)

feature_names = model_config["feature_names"]
threshold = model_config["thresholds"]["ensemble_avg"]

scaler = joblib.load("saved_models/scaler.pkl")
xgboost_model = joblib.load("saved_models/xgboost_model.pkl")
lightgbm_model = joblib.load("saved_models/lightgbm_model.pkl")
catboost_model = joblib.load("saved_models/catboost_model.pkl")

# Initialize SHAP explainer for XGBoost (fastest for single predictions)
explainer = shap.TreeExplainer(xgboost_model)

# ---------------- DATABASE ----------------

def init_db():
    conn = sqlite3.connect("results.db")
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS results(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time REAL,
        amount REAL,
        error REAL,
        prediction TEXT
    )
    """)

    conn.commit()
    conn.close()

init_db()

# ---------------- HELPERS ----------------

def engineer_features(df):
    """Adds engineered features to dataframe if they don't exist"""
    # Assuming 'Time' is in seconds
    if 'hour_sin' not in df.columns or 'hour_cos' not in df.columns:
        hours = (df['Time'] / 3600) % 24
        df['hour_sin'] = np.sin(2 * np.pi * hours / 24)
        df['hour_cos'] = np.cos(2 * np.pi * hours / 24)
    
    if 'log1p_Amount' not in df.columns:
        df['log1p_Amount'] = np.log1p(df['Amount'])
        
    return df

def predict_ensemble(features_df):
    """Predicts probabilities using the ensemble models"""
    # Ensure columns match training order exactly
    features_df = features_df[feature_names]
    
    # Get probabilities (class 1)
    xgb_prob = xgboost_model.predict_proba(features_df)[:, 1]
    lgb_prob = lightgbm_model.predict_proba(features_df)[:, 1]
    cat_prob = catboost_model.predict_proba(features_df)[:, 1]
    
    # Simple average
    avg_prob = (xgb_prob + lgb_prob + cat_prob) / 3.0
    return avg_prob

# ---------------- HOME ----------------

@app.route('/')
def home():
    try:
        conn = sqlite3.connect("results.db")
        c = conn.cursor()

        c.execute("SELECT * FROM results ORDER BY id DESC LIMIT 10")
        rows = c.fetchall()

        c.execute("SELECT COUNT(*) FROM results WHERE prediction='Fraudulent'")
        fraud_count = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM results WHERE prediction='Genuine'")
        genuine_count = c.fetchone()[0]

        conn.close()

        return jsonify({
            "status": "online",
            "service": "Fraud Guard API (V7 Ensemble)",
            "stats": {
                "fraud_count": fraud_count,
                "genuine_count": genuine_count,
                "total_predictions": fraud_count + genuine_count,
                "recent_predictions": len(rows)
            }
        })
    except Exception as e:
        return jsonify({
            "status": "online",
            "service": "Fraud Guard API",
            "stats": {
                "fraud_count": 0,
                "genuine_count": 0,
                "total_predictions": 0,
                "recent_predictions": 0
            }
        })


# ---------------- PREDICT ----------------

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Expecting raw features V1-V28, Time, Amount from form
        # This endpoint is mostly legacy, handled similarly to api_predict
        data = request.form.to_dict()
        
        # Build dataframe
        df = pd.DataFrame([data])
        
        # Convert all to float
        for col in df.columns:
            if df[col].iloc[0] == "":
                df[col] = 0.0
            else:
                df[col] = float(df[col].iloc[0])
                
        time_val = df['Time'].iloc[0] if 'Time' in df.columns else 0.0
        amount_val = df['Amount'].iloc[0] if 'Amount' in df.columns else 0.0
        
        # Engineer features
        df = engineer_features(df)
        
        # Ensure exact column order
        features_df = df[feature_names]
        
        # Scale all features
        scaled = scaler.transform(features_df)
        features_df = pd.DataFrame(scaled, columns=feature_names)
            
        # Predict
        avg_prob = predict_ensemble(features_df)[0]
        
        prediction = "Fraudulent" if avg_prob > threshold else "Genuine"
        
        # Save result
        conn = sqlite3.connect("results.db")
        c = conn.cursor()
        c.execute("""
        INSERT INTO results(time,amount,error,prediction)
        VALUES(?,?,?,?)
        """,(time_val, amount_val, float(avg_prob), prediction))
        conn.commit()
        conn.close()

        return jsonify({
            "prediction": prediction,
            "error": round(float(avg_prob), 6),
            "threshold": round(float(threshold), 6),
            "time": time_val,
            "amount": amount_val
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ---------------- API ENDPOINTS ----------------

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get dashboard statistics"""
    conn = sqlite3.connect("results.db")
    c = conn.cursor()

    # Total monitored
    c.execute("SELECT COUNT(*) FROM results")
    total_count = c.fetchone()[0]

    # Fraud count
    c.execute("SELECT COUNT(*) FROM results WHERE prediction='Fraudulent'")
    fraud_count = c.fetchone()[0]

    # Genuine count
    c.execute("SELECT COUNT(*) FROM results WHERE prediction='Genuine'")
    genuine_count = c.fetchone()[0]

    # Calculate rates
    fraud_rate = (fraud_count / total_count * 100) if total_count > 0 else 0
    
    # Get recent error trends for chart data
    c.execute("SELECT error FROM results ORDER BY id DESC LIMIT 100")
    errors = [row[0] for row in c.fetchall()]
    
    # Calculate average error
    avg_error = sum(errors) / len(errors) if errors else 0

    conn.close()

    return jsonify({
        "totalMonitored": total_count,
        "fraudCount": fraud_count,
        "genuineCount": genuine_count,
        "fraudRate": round(fraud_rate, 2),
        "avgError": round(avg_error, 4),
        "threshold": float(threshold)
    })


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get recent transactions"""
    limit = request.args.get('limit', 10, type=int)
    
    conn = sqlite3.connect("results.db")
    c = conn.cursor()

    c.execute("SELECT id, time, amount, error, prediction FROM results ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()

    conn.close()

    transactions = []
    for row in rows:
        transactions.append({
            "id": f"TXN-{row[0]:06d}",
            "time": row[1],
            "amount": round(row[2], 2),
            "anomalyScore": round(row[3], 4),
            "status": row[4]
        })

    return jsonify({"transactions": transactions})


@app.route('/api/predict', methods=['POST'])
def api_predict():
    """API endpoint for fraud prediction (V7 Ensemble)"""
    try:
        data = request.get_json()
        
        # Build dataframe from input data
        df = pd.DataFrame([data])
        
        # Ensure base features exist
        for col in ['Time', 'Amount'] + [f'V{i}' for i in range(1, 29)]:
            if col not in df.columns:
                df[col] = 0.0
            else:
                df[col] = float(df[col].iloc[0])
                
        time_val = float(df['Time'].iloc[0])
        amount_val = float(df['Amount'].iloc[0])
        
        # Engineer features
        df = engineer_features(df)
        
        # Ensure exact column order for SHAP and prediction
        features_df = df[feature_names]
        
        # Scale all features
        scaled = scaler.transform(features_df)
        features_df = pd.DataFrame(scaled, columns=feature_names)
        
        # Predict probability
        avg_prob = predict_ensemble(features_df)[0]
        
        # SHAP explainability (using XGBoost as proxy for the ensemble)
        shap_values = explainer(features_df)
        # For a single prediction, shap_values.values is 2D: (1, n_features)
        feature_contributions = shap_values.values[0]
        
        # Get top 5 by magnitude
        indices = np.argsort(np.abs(feature_contributions))[-5:][::-1]
        
        explain = []
        for idx in indices:
            val = float(feature_contributions[idx])
            explain.append({
                "feature": feature_names[idx],
                "shap_value": val,
                "direction": "toward fraud" if val > 0 else "toward genuine"
            })
            
        prediction = "Fraudulent" if avg_prob > threshold else "Genuine"
        
        # Save to database
        conn = sqlite3.connect("results.db")
        c = conn.cursor()
        c.execute("""
        INSERT INTO results(time, amount, error, prediction)
        VALUES(?,?,?,?)
        """, (time_val, amount_val, float(avg_prob), prediction))
        conn.commit()
        conn.close()
        
        return jsonify({
            "prediction": prediction,
            "anomalyScore": round(float(avg_prob), 6),
            "threshold": round(float(threshold), 6),
            "time": time_val,
            "amount": amount_val,
            "isFraud": prediction == "Fraudulent",
            "explain": explain
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


@app.route('/api/batch-predict', methods=['POST'])
def batch_predict():
    """Batch prediction endpoint (V7 Ensemble)"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({"error": "File must be a CSV"}), 400
        
        df = pd.read_csv(file)
        
        required_cols = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            return jsonify({"error": f"Missing columns: {', '.join(missing_cols)}"}), 400
        
        original_times = df['Time'].copy().values
        original_amounts = df['Amount'].copy().values
        
        # Engineer features
        df = engineer_features(df)
        
        # Ensure exact column order
        features_df = df[feature_names]
        
        # Scale all features
        scaled_values = scaler.transform(features_df)
        features_df = pd.DataFrame(scaled_values, columns=feature_names)
        
        # Predict using ensemble
        avg_probs = predict_ensemble(features_df)
        predictions = avg_probs > threshold
        
        results = []
        for idx in range(len(df)):
            transaction_result = {
                "transactionId": f"TXN-{idx+1:06d}",
                "time": float(original_times[idx]),
                "amount": float(original_amounts[idx]),
                "reconstructionError": float(avg_probs[idx]), # Mapping anomalyScore to reconstructionError to preserve frontend contract partially
                "structuralConfidence": float(avg_probs[idx]), # Provide probability here too so it displays somewhat meaningfully
                "threshold": float(threshold),
                "isFraud": bool(predictions[idx]),
                "prediction": "Fraudulent" if predictions[idx] else "Genuine"
            }
            results.append(transaction_result)
        
        conn = sqlite3.connect("results.db")
        c = conn.cursor()
        for idx in range(len(df)):
            c.execute("""
            INSERT INTO results(time, amount, error, prediction)
            VALUES(?,?,?,?)
            """, (
                float(original_times[idx]),
                float(original_amounts[idx]),
                float(avg_probs[idx]),
                "Fraudulent" if predictions[idx] else "Genuine"
            ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True,
            "totalTransactions": len(results),
            "fraudulentCount": int(np.sum(predictions)),
            "genuineCount": int(len(predictions) - np.sum(predictions)),
            "results": results
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "error": f"Processing error: {str(e)}",
            "errorType": type(e).__name__,
            "details": traceback.format_exc()
        }), 500


@app.route('/api/model-info', methods=['GET'])
def model_info():
    """Return model configuration and evaluation metrics"""
    # Extract best CV results from experiment summary
    cv_results = experiment_summary.get("ensemble", {}).get("avg_metrics", {})
    
    # Extract optuna best params
    optuna_params = {
        model: data.get("best_params", {})
        for model, data in experiment_summary.get("optuna", {}).items()
    }

    return jsonify({
        "version": model_config.get("version", "v7"),
        "models": model_config.get("models", []),
        "threshold": threshold,
        "features": feature_names,
        "metrics": cv_results,
        "hyperparameters": optuna_params
    })

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)