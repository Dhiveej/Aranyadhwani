import sounddevice as sd
import numpy as np

# Change device=9 if device=1 doesn't work
def audio_callback(indata, frames, time, status):
    volume = np.max(np.abs(indata))
    # This will print a visual volume bar
    print(f"Mic Volume: {volume:.4f} | {'█' * int(volume * 50)}")

print("Test starting... Make some noise!")
with sd.InputStream(device=1, channels=1, samplerate=16000, callback=audio_callback):
    sd.sleep(5000) # Listens for 5 seconds