# save as download_yamnet_v2.py
import tensorflow as tf
import tensorflow_hub as hub
import numpy as np

print("🔄 Converting YAMNet with correct input signature...")

# Load from hub
yamnet = hub.load('https://tfhub.dev/google/yamnet/1')

# Wrap it in a concrete function with fixed input shape
@tf.function(input_signature=[tf.TensorSpec(shape=[15600], dtype=tf.float32)])
def yamnet_fixed(waveform):
    scores, embeddings, spectrogram = yamnet(waveform)
    return scores

# Convert the concrete function
converter = tf.lite.TFLiteConverter.from_concrete_functions(
    [yamnet_fixed.get_concrete_function()]
)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS,
    tf.lite.OpsSet.SELECT_TF_OPS  # needed for YAMNet ops
]

tflite_model = converter.convert()

with open("yamnet.tflite", "wb") as f:
    f.write(tflite_model)

print(f"✅ yamnet.tflite saved! Size: {len(tflite_model)/1024/1024:.1f} MB")

# Quick verify
interpreter = tf.lite.Interpreter(model_path="yamnet.tflite")
interpreter.allocate_tensors()
inp = interpreter.get_input_details()
out = interpreter.get_output_details()
print(f"   Input  shape: {inp[0]['shape']}")
print(f"   Output shape: {out[0]['shape']}")
print("✅ Shape looks correct if input is [15600] and output is [N, 521]")