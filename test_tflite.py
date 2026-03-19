import numpy as np
import tensorflow as tf
from scipy.io import wavfile
import resampy

MODEL_PATH = "yamnet.tflite"
YAMNET_SAMPLES = 15600
GUNSHOT_INDICES = [161, 420, 421, 422, 423, 424, 425, 460]

# Load TFLite model
interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details  = interpreter.get_input_details()
output_details = interpreter.get_output_details()
print(f"✅ TFLite model loaded")
print(f"   Input : {input_details[0]['shape']}")
print(f"   Output: {output_details[0]['shape']}")

# Load gunshot WAV
sr, data = wavfile.read("384689__dobroide__20170318gunshotparadiso.wav")
data = data.astype(np.float32) / 32768.0
data = np.mean(data, axis=1)
data = resampy.resample(data, sr, 16000)
data = data * (0.9 / np.max(np.abs(data)))
print(f"✅ WAV loaded: {len(data)/16000:.2f}s")

best_score = 0.0
best_t = 0

for offset in range(0, len(data) - YAMNET_SAMPLES, YAMNET_SAMPLES // 2):
    # Shape is now [15600] not [1, 15600]
    window = data[offset:offset + YAMNET_SAMPLES].astype(np.float32)

    interpreter.set_tensor(input_details[0]['index'], window)
    interpreter.invoke()
    scores = interpreter.get_tensor(output_details[0]['index'])[0]  # [521]

    gunshot_score = max(scores[i] for i in GUNSHOT_INDICES)
    t = offset / 16000

    if gunshot_score > 0.1:
        print(f"  t={t:.2f}s | Gunshot score: {gunshot_score:.4f} 🔫")

    if gunshot_score > best_score:
        best_score = gunshot_score
        best_t = t

print(f"\n🏆 Best score: {best_score:.4f} at t={best_t:.2f}s")
if best_score > 0.3:
    print("✅ yamnet.tflite is verified and ready for the Pi!")
else:
    print("⚠️  Low score — check gunshot indices")