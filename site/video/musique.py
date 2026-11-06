"""Nappe d'ambiance de la vidéo (générée, libre de droits) : accords doux, souffles aux changements de scène."""
import numpy as np, wave
SR = 48000; D = 56.0; n = int(SR * D); t = np.arange(n) / SR
accords = [[87.31, 174.61, 220.00, 261.63, 329.63], [110.0, 220.00, 261.63, 329.63, 392.00],
           [73.42, 146.83, 220.00, 261.63, 349.23], [116.54, 233.08, 293.66, 349.23, 440.00]]
L = 7.0  # durée d'un accord
son = np.zeros(n)
for k in range(int(D / L) + 2):
    debut = k * L - 1.5; ch = accords[k % 4]
    env = np.clip((t - debut) / 2.5, 0, 1) * np.clip((debut + L + 3.0 - t) / 2.5, 0, 1)
    env = env ** 1.5
    for j, f in enumerate(ch):
        for det in (-0.6, 0.6):
            son += env * (0.55 if j == 0 else 0.32) * np.sin(2 * np.pi * (f + det) * t + j)
# douceur : passe-bas à un pôle
def passe_bas(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y
son = passe_bas(son, 1400)
# souffles aux transitions
rng = np.random.default_rng(3)
bruit = passe_bas(rng.standard_normal(n), 900)
for c in [4.0, 9.6, 23.8, 32.0, 38.8, 43.8, 49.6]:
    e = np.exp(-((t - c) / 0.45) ** 2) * (t < c + 0.6)
    son += bruit * e * 2.2
# espace : quelques échos
sortie = son.copy()
for retard, g in [(0.19, .35), (0.31, .25), (0.47, .18)]:
    d = int(retard * SR); sortie[d:] += g * son[:-d]
# fondus et niveau
sortie *= np.clip(t / 2.0, 0, 1) * np.clip((D - t) / 3.0, 0, 1)
sortie = sortie / np.max(np.abs(sortie)) * 0.32
st = np.stack([sortie, np.roll(sortie, int(0.012 * SR))], axis=1)
with wave.open('video/musique.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok')
