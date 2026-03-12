import sys
import os
sys.path.append(os.path.abspath("."))

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import torch
import numpy as np
import pandas as pd
import joblib
import sqlite3
from datetime import datetime
from werkzeug.utils import secure_filename
import io
import traceback

from models.autoencoder import Autoencoder
from models.graphsage_model import GraphSAGE
from graph.graph_builder import build_graph

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Load models
scaler = joblib.load("saved_models/scaler.pkl")
threshold = joblib.load("saved_models/threshold.pkl")

autoencoder = Autoencoder(32)
autoencoder.load_state_dict(torch.load("saved_models/autoencoder_model.pth", map_location=torch.device('cpu')))
autoencoder.eval()

embedding_layer = torch.nn.Linear(30,32)

# Load GraphSAGE model for batch processing
graphsage = GraphSAGE(input_dim=30)
graphsage.load_state_dict(torch.load("saved_models/graphsage_model.pth", map_location=torch.device('cpu')))
graphsage.eval()


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


# ---------------- HOME ----------------

@app.route('/')
def home():

    conn = sqlite3.connect("results.db")
    c = conn.cursor()

    # last predictions
    c.execute("SELECT * FROM results ORDER BY id DESC LIMIT 10")
    rows = c.fetchall()

    # fraud count
    c.execute("SELECT COUNT(*) FROM results WHERE prediction='Fraudulent'")
    fraud_count = c.fetchone()[0]

    # genuine count
    c.execute("SELECT COUNT(*) FROM results WHERE prediction='Genuine'")
    genuine_count = c.fetchone()[0]

    # error values
    c.execute("SELECT error FROM results ORDER BY id DESC LIMIT 10")
    error_data = [row[0] for row in c.fetchall()]

    # amount values
    c.execute("SELECT amount FROM results ORDER BY id DESC LIMIT 10")
    amount_data = [row[0] for row in c.fetchall()]

    conn.close()

    return render_template(
        "index.html",
        results=rows,
        fraud_count=fraud_count,
        genuine_count=genuine_count,
        error_data=error_data,
        amount_data=amount_data
    )


# ---------------- PREDICT ----------------

@app.route('/predict', methods=['POST'])
def predict():

    values = []

    for x in request.form.values():

        if x.strip()=="":
            values.append(0.0)
        else:
            values.append(float(x))

    values = np.array(values)

    time_val = values[0]
    amount_val = values[-1]

    scaled = scaler.transform([[time_val, amount_val]])

    values[0] = scaled[0][0]
    values[-1] = scaled[0][1]

    features = values.reshape(1,-1)

    features = torch.tensor(features, dtype=torch.float)

    embedding = embedding_layer(features)

    recon = autoencoder(embedding)

    error = torch.mean((embedding-recon)**2).item()

    if error > threshold:
        prediction = "Fraudulent"
    else:
        prediction = "Genuine"


    # -------- SAVE RESULT --------

    conn = sqlite3.connect("results.db")
    c = conn.cursor()

    c.execute("""
    INSERT INTO results(time,amount,error,prediction)
    VALUES(?,?,?,?)
    """,(time_val,amount_val,error,prediction))

    conn.commit()
    conn.close()


    return render_template(
        "result.html",
        prediction=prediction,
        error=round(error,6),
        threshold=round(threshold,6),
        time=time_val,
        amount=amount_val
    )


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
    """API endpoint for fraud prediction"""
    try:
        data = request.get_json()
        
        # Extract features - expecting V1-V28, Time, Amount (30 features total)
        features = []
        features.append(float(data.get('Time', 0)))
        
        for i in range(1, 29):
            features.append(float(data.get(f'V{i}', 0)))
        
        features.append(float(data.get('Amount', 0)))
        
        # Store original values
        time_val = features[0]
        amount_val = features[-1]
        
        # Scale Time and Amount
        scaled = scaler.transform([[time_val, amount_val]])
        features[0] = scaled[0][0]
        features[-1] = scaled[0][1]
        
        # Convert to tensor
        features_tensor = torch.tensor(features, dtype=torch.float).reshape(1, -1)
        
        # Get embedding
        embedding = embedding_layer(features_tensor)
        
        # Get reconstruction
        recon = autoencoder(embedding)
        
        # Calculate error
        error = torch.mean((embedding - recon)**2).item()
        
        # Make prediction
        prediction = "Fraudulent" if error > threshold else "Genuine"
        
        # Save to database
        conn = sqlite3.connect("results.db")
        c = conn.cursor()
        c.execute("""
        INSERT INTO results(time, amount, error, prediction)
        VALUES(?,?,?,?)
        """, (time_val, amount_val, error, prediction))
        conn.commit()
        conn.close()
        
        return jsonify({
            "prediction": prediction,
            "anomalyScore": round(error, 6),
            "threshold": round(float(threshold), 6),
            "time": time_val,
            "amount": amount_val,
            "isFraud": prediction == "Fraudulent"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/batch-predict', methods=['POST'])
def batch_predict():
    """
    Batch prediction endpoint for CSV file uploads.
    Processes transactions through GraphSAGE -> Autoencoder pipeline.
    """
    try:
        # Check if file is present in request
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({"error": "File must be a CSV"}), 400
        
        # Read CSV into pandas DataFrame
        csv_data = file.read()
        df = pd.read_csv(io.BytesIO(csv_data))
        
        # Validate required columns
        required_cols = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            return jsonify({"error": f"Missing columns: {', '.join(missing_cols)}"}), 400
        
        # Extract features in correct order: Time, V1-V28, Amount
        feature_data = df[required_cols].values
        
        # Store original Time and Amount values
        original_times = feature_data[:, 0].copy()
        original_amounts = feature_data[:, -1].copy()
        
        # Scale Time and Amount for each transaction
        scaled_values = scaler.transform(feature_data[:, [0, -1]])
        feature_data[:, 0] = scaled_values[:, 0]
        feature_data[:, -1] = scaled_values[:, 1]
        
        # Build graph structure using k-nearest neighbors
        x, edge_index = build_graph(feature_data)
        
        # Pass through GraphSAGE to get embeddings (30 -> 32 dimensions)
        with torch.no_grad():
            embeddings = graphsage(x, edge_index)
        
        # Pass embeddings through Autoencoder to get reconstructions
        with torch.no_grad():
            reconstructions = autoencoder(embeddings)
        
        # Calculate MSE (Reconstruction Error) for each transaction
        mse_errors = torch.mean((embeddings - reconstructions) ** 2, dim=1).numpy()
        
        # Calculate Structural Confidence (cosine similarity between embedding and reconstruction)
        embeddings_np = embeddings.numpy()
        reconstructions_np = reconstructions.numpy()
        
        # Normalize vectors for cosine similarity
        embeddings_norm = embeddings_np / (np.linalg.norm(embeddings_np, axis=1, keepdims=True) + 1e-8)
        reconstructions_norm = reconstructions_np / (np.linalg.norm(reconstructions_np, axis=1, keepdims=True) + 1e-8)
        
        # Cosine similarity
        structural_confidence = np.sum(embeddings_norm * reconstructions_norm, axis=1)
        
        # Make predictions based on threshold
        predictions = mse_errors > threshold
        
        # Build results array
        results = []
        for idx in range(len(df)):
            transaction_result = {
                "transactionId": f"TXN-{idx+1:06d}",
                "time": float(original_times[idx]),
                "amount": float(original_amounts[idx]),
                "reconstructionError": float(mse_errors[idx]),
                "structuralConfidence": float(structural_confidence[idx]),
                "threshold": float(threshold),
                "isFraud": bool(predictions[idx]),
                "prediction": "Fraudulent" if predictions[idx] else "Genuine"
            }
            results.append(transaction_result)
        
        # Optionally save batch results to database
        conn = sqlite3.connect("results.db")
        c = conn.cursor()
        
        for idx in range(len(df)):
            c.execute("""
            INSERT INTO results(time, amount, error, prediction)
            VALUES(?,?,?,?)
            """, (
                float(original_times[idx]),
                float(original_amounts[idx]),
                float(mse_errors[idx]),
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
        
    except pd.errors.EmptyDataError:
        print("\n=== CSV EMPTY ERROR ===")
        traceback.print_exc()
        return jsonify({"error": "CSV file is empty"}), 400
    except pd.errors.ParserError as e:
        print("\n=== CSV PARSING ERROR ===")
        traceback.print_exc()
        return jsonify({"error": f"CSV parsing error: {str(e)}"}), 400
    except Exception as e:
        print("\n=== BATCH PREDICTION ERROR ===")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        print("=== END ERROR ===")
        return jsonify({
            "error": f"Processing error: {str(e)}",
            "errorType": type(e).__name__,
            "details": traceback.format_exc()
        }), 500


if __name__ == "__main__":
    # Render assigns a dynamic port. Use environment variable or default to 5000.
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)