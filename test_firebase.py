# save as test_firebase.py on the Pi
import firebase_admin
from firebase_admin import credentials, firestore
import datetime

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

db.collection("detections").add({
    "test": True,
    "message": "Pi is alive!",
    "timestamp": datetime.datetime.utcnow().isoformat()
})

print("✅ Firestore write successful!")