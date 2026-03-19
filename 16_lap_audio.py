import numpy as np
import sounddevice as sd
import tensorflow as tf
import tensorflow_hub as hub
import csv
import queue
import collections
import time as time_module
import sys
from scipy.io import wavfile
import resampy

# ─────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────
FS = 16000
CHUNK_SIZE = 512
DEVICE = 1
YAMNET_SAMPLES = 15600      # 0.975s at 16kHz
COOLDOWN_SECONDS = 2.0
VOLUME_THRESHOLD = 0.015    # ignore near-silence

# ─────────────────────────────────────────
# LOAD YAMNET
# ─────────────────────────────────────────
print("🔄 Loading YAMNet from TensorFlow Hub...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

# Load class names from model asset
class_map_path = yamnet_model.class_map_path().numpy().decode('utf-8')
class_names = []
with tf.io.gfile.GFile(class_map_path) as f:
    reader = csv.DictReader(f)
    for row in reader:
        class_names.append(row['display_name'])

print(f"✅ Loaded {len(class_names)} AudioSet classes")

# Dynamically find all gunshot-related class indices
GUNSHOT_CLASSES = {
    i: name for i, name in enumerate(class_names)
    if any(word in name.lower() for word in
           ['gun', 'shot', 'firearm', 'explosion', 'bang',
            'artillery', 'cannon', 'rifle', 'pistol', 'fusillade'])
}
print(f"🔫 Gunshot classes: {GUNSHOT_CLASSES}\n")


# ─────────────────────────────────────────
# AUDIO HELPERS
# ─────────────────────────────────────────
def load_wav(path, target_sr=16000):
    """Load any WAV file → mono float32 at 16kHz."""
    sr, data = wavfile.read(path)

    # Convert bit depth to float32
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648.0
    else:
        data = data.astype(np.float32)

    # Stereo → mono
    if len(data.shape) == 2:
        data = np.mean(data, axis=1)

    # Resample if needed (e.g. 44100 → 16000)
    if sr != target_sr:
        print(f"  Resampling {sr}Hz → {target_sr}Hz...")
        data = resampy.resample(data, sr, target_sr)

    # Normalize peak to 0.9
    peak = np.max(np.abs(data))
    if peak > 0.0:
        data = data * (0.9 / peak)

    print(f"  Duration: {len(data)/target_sr:.2f}s | Peak: {np.max(np.abs(data)):.4f}")
    return data


def normalize_window(window, target=0.7):
    """Boost quiet mic audio to match YAMNet training distribution."""
    peak = np.max(np.abs(window))
    if peak < 0.01:
        return None  # too quiet, skip
    return window * (target / peak)


def run_yamnet(waveform):
    """Run YAMNet inference. Returns (mean_scores, top_class_idx, gunshot_score)."""
    waveform_tf = tf.constant(waveform, dtype=tf.float32)
    scores, embeddings, spectrogram = yamnet_model(waveform_tf)
    mean_scores = tf.reduce_mean(scores, axis=0).numpy()
    top_idx = int(np.argmax(mean_scores))
    gunshot_score = max((mean_scores[i] for i in GUNSHOT_CLASSES), default=0.0)
    return mean_scores, top_idx, gunshot_score


# ─────────────────────────────────────────
# TEST MODE — run on a WAV file directly
# Usage: python script.py your_gunshot.wav
# ─────────────────────────────────────────
if len(sys.argv) > 1 and sys.argv[1].endswith('.wav'):
    wav_path = sys.argv[1]
    print(f"🧪 TEST MODE: {wav_path}")
    audio = load_wav(wav_path)

    # Slide a 0.975s window across the whole file and find peak gunshot score
    best_score = 0.0
    best_offset = 0
    all_scores = []

    for offset in range(0, len(audio) - YAMNET_SAMPLES, YAMNET_SAMPLES // 2):
        window = audio[offset: offset + YAMNET_SAMPLES]
        mean_scores, top_idx, gunshot_score = run_yamnet(window)
        all_scores.append((offset / FS, gunshot_score, top_idx, mean_scores))
        if gunshot_score > best_score:
            best_score = gunshot_score
            best_offset = offset

    print(f"\n📊 Results per window:")
    for t, gs, ti, ms in all_scores:
        top3 = np.argsort(ms)[-3:][::-1]
        flag = " 🔫 <<<" if gs == best_score else ""
        print(f"  t={t:5.2f}s | Gunshot:{gs:.4f} | Top: {class_names[top3[0]]} ({ms[top3[0]]:.3f}){flag}")

    print(f"\n🏆 Best gunshot score: {best_score:.4f} at t={best_offset/FS:.2f}s")
    if best_score > 0.3:
        print("✅ YAMNet CAN detect this gunshot. Mic/speaker path is the issue.")
    elif best_score > 0.1:
        print("⚠️  Weak detection. Try lowering threshold to 0.10 in live mode.")
    else:
        print("❌ YAMNet cannot detect this audio as a gunshot even directly.")
    sys.exit(0)


# ─────────────────────────────────────────
# LIVE MIC MODE
# ─────────────────────────────────────────
print("🌲 Aranyadhwani Live | Mic gunshot detection active")
print(f"   Device: {DEVICE} | Sample rate: {FS}Hz | Window: {YAMNET_SAMPLES} samples")
print(f"   Volume threshold: {VOLUME_THRESHOLD} | Cooldown: {COOLDOWN_SECONDS}s")
print("💡 TIP: Test on a file first: python script.py gunshot.wav\n")

audio_queue = queue.Queue()
audio_buf = np.zeros(0, dtype=np.float32)
gunshot_history = collections.deque(maxlen=6)
last_detection_time = 0


def audio_callback(indata, frames, timestamp, status):
    if status:
        print(status, flush=True)
    audio_queue.put(indata.copy())


try:
    with sd.InputStream(device=DEVICE, samplerate=FS, channels=1,
                        dtype='float32', blocksize=CHUNK_SIZE,
                        callback=audio_callback):
        while True:
            chunk = np.squeeze(audio_queue.get())
            audio_buf = np.concatenate([audio_buf, chunk])

            if len(audio_buf) < YAMNET_SAMPLES:
                volume = np.max(np.abs(chunk))
                print(f"👂 Vol:{volume:.4f} | Buffering {len(audio_buf)}/{YAMNET_SAMPLES}", end='\r')
                continue

            # Grab window with 50% overlap for better temporal resolution
            window = audio_buf[:YAMNET_SAMPLES]
            audio_buf = audio_buf[YAMNET_SAMPLES // 2:]

            volume = np.max(np.abs(window))
            print(f"👂 Vol:{volume:.4f}", end='\r')

            if volume < VOLUME_THRESHOLD:
                continue

            # Normalize before inference (critical for mic input)
            norm_window = normalize_window(window)
            if norm_window is None:
                continue

            mean_scores, top_idx, gunshot_score = run_yamnet(norm_window)
            gunshot_history.append(gunshot_score)
            avg_gunshot = sum(gunshot_history) / len(gunshot_history)

            top3 = np.argsort(mean_scores)[-3:][::-1]
            print(f"\n👀 Vol:{volume:.4f} | GunScore:{gunshot_score:.4f} | Avg:{avg_gunshot:.4f}")
            print(f"   Top: {[(class_names[i], f'{mean_scores[i]:.3f}') for i in top3]}")

            current_time = time_module.time()

            if (avg_gunshot > 0.25 and
                    (current_time - last_detection_time) > COOLDOWN_SECONDS):
                print("\n" + "🔥" * 25)
                print(f"🚨 GUNSHOT DETECTED!")
                print(f"🎯 Score: {gunshot_score:.4f} | Avg: {avg_gunshot:.4f}")
                print(f"🔊 Volume: {volume:.4f}")
                print("🔥" * 25 + "\n")
                last_detection_time = current_time
                gunshot_history.clear()
            else:
                print(f"   🌲 No gunshot (score {avg_gunshot:.4f} < 0.25 threshold)")

except KeyboardInterrupt:
    print("\nSystem Offline.")