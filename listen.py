"""
╔══════════════════════════════════════════════════════════════════╗
║         ARANYADHWANI — Edge AI Forest Threat Detection           ║
║         Raspberry Pi Zero 2 W + ReSpeaker 2-Mic HAT             ║
║         Final Production Edition  •  v5.0                       ║
╠══════════════════════════════════════════════════════════════════╣
║  DSP      : scipy sosfilt Butterworth bandpass (80–8 kHz)        ║
║             Chunk-level filtering with persistent zi state       ║
║             Dual buffer: raw (evidence WAV) + filtered (AI)      ║
║  Inference: YAMNet TFLite, top-10 multi-label + family expand    ║
║             O(1) class lookup dict • peak-RMS window selection   ║
║  Accuracy : Spectral fingerprint (ZCR + HF energy) +15% boost   ║
║  Cloud    : Dual-path routing — local monitor vs Firebase        ║
║             to_python() serializer — zero np.bool_ crashes       ║
║  Modes    : HACKATHON_DEMO_MODE=True  (transient gate on)        ║
║             HACKATHON_DEMO_MODE=False (forest deployment)        ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import re
import wave
import csv
import queue
import threading
import time as _time
from collections import deque
from datetime import datetime, timezone

import numpy as np
import scipy.signal as signal
import pyaudio
import firebase_admin
from firebase_admin import credentials, firestore
from ai_edge_litert.interpreter import Interpreter

# ══════════════════════════════════════════════════════════════════
# SECTION 1 — CONFIGURATION
# ══════════════════════════════════════════════════════════════════

MODEL_PATH          = 'yamnet.tflite'
CLASS_MAP_PATH      = 'yamnet_class_map.csv'
SERVICE_ACCOUNT_KEY = 'serviceAccountKey.json'
EVIDENCE_DIR        = 'threat_evidence'
DEVICE_ID           = 'aranya_pi_01'

SAMPLE_RATE           = 16000
CHANNELS              = 2               # ReSpeaker HAT — mix to mono in software
FORMAT                = pyaudio.paInt16
MIC_DEVICE_INDEX      = 0

WINDOW_SIZE           = 15600           # YAMNet exact input (0.975 s)
CHUNK_DUR_SEC         = 0.025           # 25 ms reads → 400 samples per chunk
CHUNK_SAMPLES         = int(SAMPLE_RATE * CHUNK_DUR_SEC)
INFERENCE_STEP_CHUNKS = 8               # Infer every 8 chunks = 0.2 s (80% overlap)

RMS_WAKE_THRESHOLD    = 0.004           # Skip inference if too quiet
HEARTBEAT_INTERVAL    = 60             # Seconds between Firebase keep-alives

# ─── Mode ────────────────────────────────────────────────────────
# True  → hackathon room: transient gate isolates phone speaker sounds
# False → forest: gentle normalization only, nothing zeroed out
HACKATHON_DEMO_MODE = True

# ══════════════════════════════════════════════════════════════════
# SECTION 2 — THREAT MATRICES
# ══════════════════════════════════════════════════════════════════

# Local detection matrix — everything that triggers a terminal log
THREAT_MATRIX = {
    # Poaching / human threats
    'Chainsaw':                     40.0,
    'Power tool':                   40.0,
    'Sawing':                       40.0,
    'Wood':                         40.0,
    'Gunshot, gunfire':             40.0,
    'Gunshot':                      40.0,
    'Cap gun':                      40.0,
    'Explosion':                    40.0,
    'Burst, pop':                   40.0,
    'Bang':                         40.0,
    'Speech':                       30.0,
    'Conversation':                 30.0,
    # Wildlife / ecosystem
    'Roar':                         40.0,
    'Roaring cats (lions, tigers)': 40.0,
    'Elephant':                     40.0,
    'Dog':                          40.0,
    'Bark':                         40.0,
    'Wild animals':                 40.0,
}

# Cloud firewall — only these classes reach Firebase
TARGET_CLOUD_THREATS = {
    'Chainsaw', 'Power tool', 'Sawing',
    'Gunshot, gunfire', 'Gunshot', 'Explosion', 'Bang',
}

# Minimum confidence (after spectral boost) to push to Firebase
CLOUD_MIN_CONFIDENCE = 65.0

# ══════════════════════════════════════════════════════════════════
# SECTION 3 — SPECTRAL FINGERPRINTS
#
# Physical acoustic signatures used to verify AI predictions:
#   zcr_min/max : zero-crossing rate range (sign changes per sample)
#   hf_min      : minimum fraction of energy above 4 kHz
#
# Chainsaw → high ZCR (continuous buzz), lots of high-freq energy
# Gunshot  → near-zero ZCR (single transient), energy in low-mid
# ══════════════════════════════════════════════════════════════════
SPECTRAL_FINGERPRINTS = {
    #                        zcr_min  zcr_max  hf_min
    'Chainsaw':             (0.15,    0.45,    0.30),
    'Sawing':               (0.12,    0.45,    0.25),
    'Power tool':           (0.10,    0.40,    0.20),
    'Gunshot, gunfire':     (0.00,    0.08,    0.00),
    'Gunshot':              (0.00,    0.08,    0.00),
    'Explosion':            (0.00,    0.10,    0.00),
    'Burst, pop':           (0.00,    0.12,    0.00),
    'Bang':                 (0.00,    0.12,    0.00),
    'Cap gun':              (0.00,    0.12,    0.00),
}

SPECTRAL_CONFIDENCE_BOOST = 15.0     # % added when fingerprint matches

# ══════════════════════════════════════════════════════════════════
# SECTION 4 — COOLDOWN & FAMILY EXPANSION
# ══════════════════════════════════════════════════════════════════

COOLDOWN_BY_SEVERITY = {
    'CRITICAL': 30,     # Short cooldown — don't miss a second shot
    'HIGH':     60,
    'MEDIUM':   90,
}
last_alert_times: dict = {}

# If YAMNet fires a parent class in its top-10, also inspect
# these child classes directly (catches aliased predictions)
THREAT_FAMILY_PARENTS = {
    'Mechanical sound': ['Chainsaw', 'Power tool', 'Sawing'],
    'Loud bang':        ['Gunshot, gunfire', 'Explosion', 'Burst, pop'],
    'Domestic animals': ['Dog', 'Bark'],
    'Animal':           ['Roar', 'Wild animals', 'Elephant',
                         'Roaring cats (lions, tigers)'],
}

# ══════════════════════════════════════════════════════════════════
# SECTION 5 — FIREBASE & MODEL INITIALISATION
# ══════════════════════════════════════════════════════════════════

os.makedirs(EVIDENCE_DIR, exist_ok=True)

print('[System] Connecting to Firebase...')
try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print('[System] Firebase connected ✓')
except Exception as e:
    print(f'[System] Firebase init failed: {e}')
    exit()

print('[System] Loading class map...')
class_names: list[str] = []
try:
    with open(CLASS_MAP_PATH) as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            class_names.append(row[2])
except FileNotFoundError:
    print(f'Error: {CLASS_MAP_PATH} not found.')
    exit()

# O(1) lookup dict — avoids linear list.index() scan (521 items × 30×/s)
class_index: dict[str, int] = {name: i for i, name in enumerate(class_names)}

print('[System] Initializing YAMNet...')
try:
    interpreter = Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    input_details  = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
except Exception as e:
    print(f'Error loading model: {e}')
    exit()

# ══════════════════════════════════════════════════════════════════
# SECTION 6 — DSP: SCIPY IIR BANDPASS (Vectorized + Stateful)
#
# Design: 2nd-order Butterworth bandpass 80 Hz – 8 kHz
#   • SOS (Second-Order Sections) format — numerically stable
#   • sosfilt() runs in compiled C: ~0.05 ms vs ~6 ms Python loop
#   • filter_zi persists across every 25 ms chunk — zero boundary
#     click artifacts, no transient at window edges
#
# Two buffers:
#   buffer_raw      → unfiltered audio → saved to evidence WAV
#   buffer_filtered → bandpass-cleaned audio → fed to YAMNet
# ══════════════════════════════════════════════════════════════════

sos_bandpass = signal.butter(
    N=2,
    Wn=[80.0, 7999.0],
    btype='bandpass',
    fs=SAMPLE_RATE,
    output='sos'
)

# Persistent filter state — shape (n_sections, 2)
# Initialised to steady-state zeros (valid cold-start condition)
filter_zi = signal.sosfilt_zi(sos_bandpass) * 0.0

# ══════════════════════════════════════════════════════════════════
# SECTION 7 — SPECTRAL FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════════════

def compute_spectral_features(audio: np.ndarray) -> tuple[float, float]:
    """Return (zero_crossing_rate, high_freq_energy_ratio)."""
    zcr      = float(np.mean(np.abs(np.diff(np.sign(audio)))) / 2.0)
    spectrum = np.abs(np.fft.rfft(audio)) ** 2
    freqs    = np.fft.rfftfreq(len(audio), d=1.0 / SAMPLE_RATE)
    total    = float(np.sum(spectrum)) + 1e-10
    hf       = float(np.sum(spectrum[freqs >= 4000.0]))
    return zcr, hf / total

def check_spectral_fingerprint(class_name: str, audio: np.ndarray) -> bool:
    """Return True if audio's ZCR and HF energy match the expected fingerprint."""
    fp = SPECTRAL_FINGERPRINTS.get(class_name)
    if fp is None:
        return False
    zcr_min, zcr_max, hf_min = fp
    zcr, hf_ratio = compute_spectral_features(audio)
    return (zcr_min <= zcr <= zcr_max) and (hf_ratio >= hf_min)

# ══════════════════════════════════════════════════════════════════
# SECTION 8 — MULTI-LABEL DETECTION
#
# Why top-10 instead of argmax:
#   YAMNet outputs soft probabilities. 'Gunshot, gunfire' might
#   score 0.38 (rank 2) while 'Explosion' scores 0.41 (rank 1).
#   argmax silently discards the gunshot. top-10 catches both.
#
# Family expansion:
#   If YAMNet fires a parent category (e.g. 'Mechanical sound'),
#   we also look up its child threat classes directly in the score
#   vector — catching aliased predictions that rank outside top-10.
# ══════════════════════════════════════════════════════════════════

def get_all_threat_detections(scores: np.ndarray) -> list[tuple[str, float]]:
    top_indices = np.argsort(scores)[::-1][:10]
    detections: list[tuple[str, float]] = []
    seen: set[str] = set()

    for idx in top_indices:
        name = class_names[idx]
        conf = float(scores[idx]) * 100.0
        seen.add(name)

        if name in THREAT_MATRIX and conf >= THREAT_MATRIX[name]:
            detections.append((name, conf))

        if name in THREAT_FAMILY_PARENTS:
            for child in THREAT_FAMILY_PARENTS[name]:
                if child in seen:
                    continue
                c_idx = class_index.get(child)   # O(1) lookup
                if c_idx is None:
                    continue
                c_conf = float(scores[c_idx]) * 100.0
                if child in THREAT_MATRIX and c_conf >= THREAT_MATRIX[child]:
                    detections.append((child, c_conf))
                    seen.add(child)

    return detections

# ══════════════════════════════════════════════════════════════════
# SECTION 9 — FIRESTORE SERIALIZER
#
# Firestore SDK rejects np.bool_, np.float32, np.int64 etc.
# to_python() recursively converts the entire alert dict to
# native Python types before it touches the SDK — guaranteed
# zero type-mismatch crashes.
# ══════════════════════════════════════════════════════════════════

def to_python(obj):
    if isinstance(obj, dict):
        return {k: to_python(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_python(v) for v in obj]
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

# ══════════════════════════════════════════════════════════════════
# SECTION 10 — FIREBASE HELPERS
# ══════════════════════════════════════════════════════════════════

report_queue: queue.Queue = queue.Queue()

def push_detection_to_firestore(data: dict):
    try:
        db.collection('detections').add(data)
        print(f"☁️  [Firebase] Pushed: {data['threat']} ({data['confidence']}%)")
    except Exception as e:
        print(f'🔥 [Firebase] Write failed: {e}')

def update_device_heartbeat():
    try:
        db.collection('devices').document(DEVICE_ID).set({
            'device_id':      DEVICE_ID,
            'status':         'ACTIVE',
            'last_heartbeat': firestore.SERVER_TIMESTAMP,
            'model':          'YAMNet TFLite v5',
            'sample_rate':    SAMPLE_RATE,
        }, merge=True)
    except Exception as e:
        print(f'🔥 [Firebase] Heartbeat failed: {e}')

def reporting_worker():
    while True:
        payload = report_queue.get()
        if payload is None:
            break
        push_detection_to_firestore(payload)
        report_queue.task_done()

def heartbeat_worker():
    while True:
        update_device_heartbeat()
        _time.sleep(HEARTBEAT_INTERVAL)

# ══════════════════════════════════════════════════════════════════
# SECTION 11 — EVIDENCE WRITER
# ══════════════════════════════════════════════════════════════════

def calculate_rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio))))

def save_evidence(audio: np.ndarray, threat_name: str, confidence: float) -> str:
    """Save unfiltered (raw) audio as evidence WAV."""
    ts        = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', threat_name)
    filepath  = os.path.join(EVIDENCE_DIR,
                             f'{ts}_{safe_name}_{int(confidence)}.wav')
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(filepath, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(pyaudio.get_sample_size(FORMAT))
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    return filepath

# ══════════════════════════════════════════════════════════════════
# SECTION 12 — BACKGROUND THREADS
# ══════════════════════════════════════════════════════════════════

threading.Thread(target=reporting_worker, daemon=True).start()
threading.Thread(target=heartbeat_worker,  daemon=True).start()

# ══════════════════════════════════════════════════════════════════
# SECTION 13 — MAIN AUDIO LOOP
# ══════════════════════════════════════════════════════════════════

def main():
    p = pyaudio.PyAudio()
    try:
        stream = p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            input=True,
            input_device_index=MIC_DEVICE_INDEX,
            frames_per_buffer=CHUNK_SAMPLES,
        )
    except Exception as e:
        print(f'Error opening audio stream: {e}')
        return

    update_device_heartbeat()
    print(f'🔥 [Firebase] Initial heartbeat sent for {DEVICE_ID}')

    # ── Dual buffers ──────────────────────────────────────────────
    # buffer_raw      : unfiltered — saved to evidence WAV so recordings
    #                   contain the full natural sound, not the filtered copy
    # buffer_filtered : bandpass-cleaned — what YAMNet actually sees
    buffer_raw      = deque(maxlen=WINDOW_SIZE)
    buffer_filtered = deque(maxlen=WINDOW_SIZE)
    buffer_raw.extend(np.zeros(WINDOW_SIZE,      dtype=np.float32))
    buffer_filtered.extend(np.zeros(WINDOW_SIZE, dtype=np.float32))

    # Shared state
    global filter_zi
    chunk_counter = 0
    peak_rms      = 0.0

    print('\n🌲 ARANYADHWANI SENSOR ACTIVE 🌲')
    print('=' * 62)
    print(f'  Device ID       : {DEVICE_ID}')
    print(f'  Mode            : {"HACKATHON DEMO" if HACKATHON_DEMO_MODE else "FOREST DEPLOYMENT"}')
    print(f'  Bandpass        : scipy sosfilt  80–8000 Hz  (~0.05 ms/call)')
    print(f'  Filter state    : persistent zi across every 25 ms chunk')
    print(f'  Dual buffer     : raw (evidence) + filtered (AI)')
    print(f'  Inference rate  : every {CHUNK_DUR_SEC * INFERENCE_STEP_CHUNKS * 1000:.0f} ms  (80% window overlap)')
    print(f'  Multi-label     : top-10 + family expansion')
    print(f'  Spectral boost  : +{SPECTRAL_CONFIDENCE_BOOST:.0f}% on fingerprint match')
    print(f'  Local matrix    : {len(THREAT_MATRIX)} classes')
    print(f'  Cloud firewall  : {len(TARGET_CLOUD_THREATS)} classes  >{CLOUD_MIN_CONFIDENCE}% threshold')
    print('=' * 62 + '\n')

    try:
        while True:
            # ── 1. Read 25 ms chunk ───────────────────────────────
            try:
                pcm_data = stream.read(CHUNK_SAMPLES, exception_on_overflow=False)
            except IOError:
                continue

            audio_chunk = (np.frombuffer(pcm_data, dtype=np.int16)
                           .astype(np.float32) / 32768.0)

            # Mix stereo → mono (average both ReSpeaker channels)
            if CHANNELS == 2:
                audio_chunk = audio_chunk.reshape(-1, 2).mean(axis=1)

            # ── 2. Filter chunk + persist state ───────────────────
            # Filtering the small 400-sample chunk (not the full 15,600-sample
            # window) means sosfilt() never resets zi — the filter behaves as a
            # true continuous-time system with no boundary transients.
            filtered_chunk, filter_zi = signal.sosfilt(
                sos_bandpass, audio_chunk, zi=filter_zi
            )

            # ── 3. Feed both buffers ──────────────────────────────
            buffer_raw.extend(audio_chunk)
            buffer_filtered.extend(filtered_chunk.astype(np.float32))

            chunk_counter += 1

            # Track peak RMS across the accumulation window
            chunk_rms = calculate_rms(audio_chunk)
            if chunk_rms > peak_rms:
                peak_rms = chunk_rms

            # ── 4. Only infer every INFERENCE_STEP_CHUNKS chunks ──
            if chunk_counter % INFERENCE_STEP_CHUNKS != 0:
                continue

            rms      = peak_rms
            peak_rms = 0.0

            if rms < RMS_WAKE_THRESHOLD:
                continue

            # ── 5. Build inference window from filtered buffer ────
            current_window = np.array(buffer_filtered, dtype=np.float32)

            if HACKATHON_DEMO_MODE:
                # Transient gate: zero out steady-state room noise,
                # keep only sudden spikes (gunshots, chainsaw bursts)
                noise_floor = np.median(np.abs(current_window))
                transients  = np.where(
                    np.abs(current_window) > noise_floor * 1.5,
                    current_window, 0.0
                )
                max_val = np.max(np.abs(transients))
                if 0.001 < max_val < 0.95:
                    inference_data = (transients * (0.90 / max_val)).astype(np.float32)
                else:
                    inference_data = transients.astype(np.float32)
            else:
                # Forest mode: gentle peak normalisation, nothing zeroed
                max_val = np.max(np.abs(current_window))
                inference_data = (
                    (current_window * (0.90 / max_val)) if max_val > 0.001
                    else current_window
                ).astype(np.float32)

            inference_data = inference_data[:WINDOW_SIZE]

            # ── 6. YAMNet inference ───────────────────────────────
            interpreter.set_tensor(input_details[0]['index'], inference_data)
            interpreter.invoke()
            scores = interpreter.get_tensor(output_details[0]['index'])[0]

            # ── PATH 1: TERMINAL MONITOR ──────────────────────────
            top_idx  = int(np.argmax(scores))
            top_conf = float(scores[top_idx]) * 100.0
            top_cls  = class_names[top_idx]

            if top_conf > 15.0:
                ts    = datetime.now().strftime('%H:%M:%S')
                color = '\033[91m' if top_cls in THREAT_MATRIX else '\033[90m'
                print(f'[{ts}] {color}{top_cls:<34}\033[0m  {top_conf:05.1f}%  RMS:{rms:.4f}')

            # ── PATH 2: CLOUD FIREWALL ────────────────────────────
            detections = get_all_threat_detections(scores)

            for detected_class, base_conf in detections:
                # Spectral fingerprint check + conditional boost
                spectral_match = check_spectral_fingerprint(
                    detected_class, inference_data
                )
                final_conf = (
                    min(base_conf + SPECTRAL_CONFIDENCE_BOOST, 99.9)
                    if spectral_match else base_conf
                )

                # Firewall gate 1: must be a critical target class
                if detected_class not in TARGET_CLOUD_THREATS:
                    continue

                # Firewall gate 2: must clear the confidence threshold
                if final_conf < CLOUD_MIN_CONFIDENCE:
                    continue

                severity = 'CRITICAL' if final_conf >= 85 else 'HIGH'
                cooldown = COOLDOWN_BY_SEVERITY[severity]
                now_sec  = _time.time()

                if (now_sec - last_alert_times.get(detected_class, 0)) < cooldown:
                    time_left = int(
                        cooldown - (now_sec - last_alert_times[detected_class])
                    )
                    print(f'⏳ [{severity}] {detected_class} '
                          f'{final_conf:.1f}% — cooldown {time_left}s')
                    continue

                # ── Alert fires ───────────────────────────────────
                last_alert_times[detected_class] = now_sec
                spectral_tag = ' [SPECTRAL ✓]' if spectral_match else ''

                print('\n' + '═' * 58)
                print(f'  🚨  CLOUD ALERT: {detected_class.upper()}')
                print(f'      Confidence : {final_conf:.1f}%{spectral_tag}')
                print(f'      Severity   : {severity}')
                print(f'      RMS        : {rms:.4f}')
                print('═' * 58 + '\n')

                # Save RAW (unfiltered) audio as evidence
                raw_window = np.array(buffer_raw, dtype=np.float32)
                filepath   = save_evidence(raw_window, detected_class, final_conf)

                zcr, hf_ratio = compute_spectral_features(inference_data)

                # Build Firestore document — to_python() ensures zero
                # NumPy scalar types reach the SDK
                alert_doc = to_python({
                    'device_id':       DEVICE_ID,
                    'timestamp':       firestore.SERVER_TIMESTAMP,
                    'threat':          detected_class,
                    'confidence':      round(final_conf, 2),
                    'rms_loudness':    round(rms, 5),
                    'evidence_file':   filepath,
                    'status':          'NEW',
                    'severity':        severity,
                    'spectral_match':  spectral_match,
                    'zcr':             round(zcr, 4),
                    'hf_energy_ratio': round(hf_ratio, 4),
                })
                report_queue.put(alert_doc)
                print(f'  💾 Evidence : {filepath}\n')

    except KeyboardInterrupt:
        print('\n[System] Shutting down gracefully...')
        try:
            db.collection('devices').document(DEVICE_ID).set({
                'status':         'OFFLINE',
                'last_heartbeat': firestore.SERVER_TIMESTAMP,
            }, merge=True)
            print(f'🔥 [Firebase] {DEVICE_ID} marked OFFLINE.')
        except Exception:
            pass
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()
        print('[System] Audio stream closed.')


if __name__ == '__main__':
    main()