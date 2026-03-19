import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np

# --- IMPORTANT: Change this line ---
# --- IMPORTANT: Change this line ---
AUDIO_FILE_PATH = r"C:\Users\Chaya\Downloads\384689__dobroide__20170318gunshotparadiso.wav"

try:
    # 1. Load the audio file
    y, sr = librosa.load(AUDIO_FILE_PATH)
    print("Audio file loaded successfully!")

    # 2. Create a Mel spectrogram
    S = librosa.feature.melspectrogram(y=y, sr=sr)
    S_dB = librosa.power_to_db(S, ref=np.max)

    # 3. Display the spectrogram
    plt.figure(figsize=(10, 4))
    librosa.display.specshow(S_dB, sr=sr, x_axis='time', y_axis='mel')
    plt.colorbar(format='%+2.0f dB')
    plt.title('Mel-frequency Spectrogram')
    plt.tight_layout()
    plt.show()
    print("Spectrogram displayed successfully!")

except Exception as e:
    print(f"An error occurred: {e}")