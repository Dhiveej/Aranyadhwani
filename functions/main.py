import os
import tempfile
import numpy as np
from google.cloud import aiplatform, storage
from firebase_functions import https_fn, options
from firebase_admin import initialize_app, firestore

# --- Configuration ---
PROJECT_ID = "forest-audio-ai"
REGION = "asia-south1"
ENDPOINT_ID = "7740381539636084736"
BUCKET_NAME = "forest-ai-dhiveej-2025"
CLASS_NAMES = sorted(['benign', 'chainsaw', 'gunshot', 'animal_tiger', 'vehicle_truck'])

# --- Global variables ---
yamnet_model = None
storage_client = None
aiplatform_endpoint = None
db = None

initialize_app()
options.set_global_options(region=REGION)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=300,
    min_instances=1
)
def on_anomaly_detected(request: https_fn.Request) -> https_fn.Response:
    global yamnet_model, storage_client, aiplatform_endpoint, db

    # 🔹 MOVE IMPORTS HERE: Inside the function, but OUTSIDE the 'if' block.
    # This prevents deployment timeouts AND fixes the "referenced before assignment" error on warm starts.
    import tensorflow as tf
    import tensorflow_hub as hub
    import librosa

    # 🔹 LAZY INITIALIZATION
    if yamnet_model is None:
        print("Performing one-time initialization of heavy models and clients...")
        yamnet_model_handle = 'https://tfhub.dev/google/yamnet/1'
        yamnet_model = hub.load(yamnet_model_handle)
        storage_client = storage.Client()
        aiplatform.init(project=PROJECT_ID, location=REGION)
        aiplatform_endpoint = aiplatform.Endpoint(endpoint_name=ENDPOINT_ID)
        db = firestore.client()
        print("Initialization complete.")

    print("Cloud Function triggered for anomaly detection.")

    # --- Handle request ---
    try:
        data = request.get_json(silent=True)
        audio_file_name = data["audio_path"]
        device_id = data["device_id"]
        timestamp = data["timestamp"]

        # 🔹 ADDED: Get GPS coordinates (Use defaults if missing)
        # Defaulting to Bannerghatta National Park for testing
        lat = data.get("latitude", 12.8005)
        lng = data.get("longitude", 77.5795)

    except Exception as e:
        print(f"Error parsing request JSON: {e}")
        return https_fn.Response("Bad Request: Missing or invalid JSON data.", status=400)

    try:
        _, temp_local_path = tempfile.mkstemp()
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(audio_file_name)
        blob.download_to_filename(temp_local_path)
        waveform, _ = librosa.load(temp_local_path, sr=16000, duration=3, mono=True)
        os.remove(temp_local_path)
    except Exception as e:
        print(f"Error downloading audio: {e}")
        return https_fn.Response("Error processing audio file.", status=500)

    try:
        _, embeddings, _ = yamnet_model(waveform)
        embedding = embeddings.numpy().mean(axis=0)
        prediction_response = aiplatform_endpoint.predict(instances=[embedding.tolist()])
        scores = prediction_response.predictions[0]
        predicted_index = np.argmax(scores)
        predicted_class = CLASS_NAMES[predicted_index]
        confidence = np.max(scores)
    except Exception as e:
        print(f"Error during prediction: {e}")
        return https_fn.Response("Error during AI prediction.", status=500)

    if predicted_class != 'benign' and confidence > 0.80:
        print(f"Confirmed threat: {predicted_class}. Saving to Firestore.")
        # 🔹 UPDATED: Saving GPS and Status to Firestore
        db.collection('alerts').add({
            'device_id': device_id,
            'timestamp': timestamp,
            'threat_type': predicted_class,
            'confidence': confidence,
            'audio_path': f"gs://{BUCKET_NAME}/{audio_file_name}",
            'latitude': lat,  # <--- Saved for Map
            'longitude': lng,  # <--- Saved for Map
            'status': 'new'  # <--- Saved for Alerts Page
        })
    else:
        print(f"Prediction '{predicted_class}' not flagged as a threat.")

    return https_fn.Response("Alert processed successfully.", status=200)


# --- HEARTBEAT FUNCTION ---
@https_fn.on_request(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60
)
def on_heartbeat(request: https_fn.Request) -> https_fn.Response:
    global db

    if db is None:
        db = firestore.client()

    print("Cloud Function triggered for heartbeat.")

    try:
        data = request.get_json(silent=True)
        device_id = data["device_id"]
        battery = data["battery"]
        signal = data["signal"]

        device_ref = db.collection('devices').document(device_id)
        device_ref.set({
            'last_heartbeat': firestore.SERVER_TIMESTAMP,
            'battery': int(battery),
            'signal': int(signal),
            'status': 'online'
        }, merge=True)

        return https_fn.Response("Heartbeat received.", status=200)

    except Exception as e:
        print(f"Error processing heartbeat: {e}")
        return https_fn.Response("Bad Request: Invalid heartbeat data.", status=400)