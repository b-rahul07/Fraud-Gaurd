import pandas as pd
import numpy as np
import joblib
import json
import requests

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)
pd.set_option('display.precision', 8)

# 1. Load data
print("Loading data...")
df = pd.read_parquet('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/training/data_artifacts/data/engineered.parquet')

# Sample 5 fraud and 5 legit
fraud_rows = df[df['Class'] == 1].sample(5, random_state=42)
legit_rows = df[df['Class'] == 0].sample(5, random_state=42)
test_rows = pd.concat([fraud_rows, legit_rows])

# 2. Offline Inference
print("Loading offline models...")
scaler = joblib.load('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/backend/saved_models/scaler.pkl')
xgb = joblib.load('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/backend/saved_models/xgboost_model.pkl')
lgb = joblib.load('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/backend/saved_models/lightgbm_model.pkl')
cat = joblib.load('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/backend/saved_models/catboost_model.pkl')

with open('c:/Users/rahul/OneDrive/Desktop/fraud-gaurd model/backend/saved_models/model_config.json', 'r') as f:
    config = json.load(f)
features = config['feature_names']
threshold = config['thresholds']['ensemble_avg']

# Prepare offline features
offline_df = test_rows.copy()

# Add missing features since parquet doesn't have hour_sin, etc.
hours = (offline_df['Time'] / 3600) % 24
offline_df['hour_sin'] = np.sin(2 * np.pi * hours / 24)
offline_df['hour_cos'] = np.cos(2 * np.pi * hours / 24)
offline_df['log1p_Amount'] = np.log1p(offline_df['Amount'])

offline_df = offline_df[features]
scaled = scaler.transform(offline_df)
offline_df_scaled = pd.DataFrame(scaled, columns=features)

xgb_preds = xgb.predict_proba(offline_df_scaled)[:, 1]
lgb_preds = lgb.predict_proba(offline_df_scaled)[:, 1]
cat_preds = cat.predict_proba(offline_df_scaled)[:, 1]
offline_scores = (xgb_preds + lgb_preds + cat_preds) / 3.0
offline_preds = ["Fraudulent" if s > threshold else "Genuine" for s in offline_scores]

# 3. Online Inference
print("Calling API...")
api_url = "http://localhost:5000/api/predict"

results = []
for i, (_, row) in enumerate(test_rows.iterrows()):
    # Prepare payload (raw features)
    payload = {
        'Time': row['Time'],
        'Amount': row['Amount']
    }
    for j in range(1, 29):
        payload[f'V{j}'] = row[f'V{j}']
        
    print(f"\n--- Row {i} ---")
    print(f"Ground Truth Label: {'Fraudulent' if row['Class'] == 1 else 'Genuine'}")
    print(f"Raw Features Sent to API:")
    print(json.dumps(payload, indent=2))
        
    try:
        resp = requests.post(api_url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        
        diff = abs(offline_scores[i] - data['anomalyScore'])
        match = diff < 1e-5
        
        results.append({
            'Index': i,
            'True Class': 'Fraudulent' if row['Class'] == 1 else 'Genuine',
            'Offline Score': offline_scores[i],
            'Online Score': data['anomalyScore'],
            'Difference': diff,
            'Offline Pred': offline_preds[i],
            'Online Pred': data['prediction'],
            'Match': match
        })
    except Exception as e:
        print(f"Error on row {i}: {e}")
        if resp:
            print(resp.text)

# 4. Report
res_df = pd.DataFrame(results)
print("\n=== SANITY CHECK RESULTS ===")
print(res_df.to_string())

exact_matches = res_df['Match'].sum()
print(f"\n{exact_matches}/{len(results)} exact matches found.")
