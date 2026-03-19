import requests
import json

url = "https://processaudioevent-rhc4bcayya-uc.a.run.app"

test_data = {
    "sensor_id": "pi_node_001_python_test",
    "audio_file_location": "gs://your-bucket/test.wav"
}

try:
    response = requests.post(url, json=test_data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"An error occurred: {e}")