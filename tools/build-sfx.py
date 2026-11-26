"""Build public/sfx from the local asset library (C:\\Projects\\assets).

Run:  python -I tools/build-sfx.py

Kenney clips (CC0, OGG) are copied as-is. Clips from paid packs are converted into game
assets: mono, 22.05 kHz, 16-bit WAV, leading silence trimmed, length capped, faded out and
peak-normalized to about -1 dBFS. Also writes public/sfx/CREDITS.md.
Table columns: output file, source (relative to ASSETS, glob ok), max seconds, gain dB, license.
"""
import array
import glob
import os
import shutil
import struct
import sys
import wave

ASSETS = r"C:\Projects\assets"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "sfx")
RATE = 22050
PEAK = 10 ** (-1 / 20)

K = "CC0 public domain (Kenney)"
EPIC = "Purchased, royalty-free (Epic Stock Media); converted and trimmed"
FUSE = "Purchased, royalty-free (Fusehive); converted and trimmed"

KI, KU, KP, KJ = "kenney_interface-sounds/Audio", "kenney_ui-audio/Audio", "kenney_impact-sounds/Audio", "kenney_music-jingles/Audio"
FG = "fantasygame/Fantasy_Game_16bit/Fantasy_Game_16Bit"
AG = "ancientgame/Ancient Game/Ancient_Game_16bit"
MB = "monsterbeastdinosauranddragonsoundeffectslibrary/Creatures, Monsters, Beasts, Dragons & Dinosaurs - Fusehive [SD WAV]/FANTASY (Elemental) CREATURES"

# Kenney (.ogg) entries ignore max seconds / gain (copied as-is).
CLIPS = [
    # UI / run flow
    ("ui-click-a.ogg", f"{KI}/click_002.ogg", 0, 0, K),
    ("ui-click-b.ogg", f"{KI}/click_004.ogg", 0, 0, K),
    ("ui-hover.ogg", f"{KU}/rollover2.ogg", 0, 0, K),
    ("ui-confirm.ogg", f"{KI}/confirmation_001.ogg", 0, 0, K),
    ("ui-back.ogg", f"{KI}/back_002.ogg", 0, 0, K),
    ("ui-error.ogg", f"{KI}/error_004.ogg", 0, 0, K),
    ("reward-select.ogg", f"{KI}/select_003.ogg", 0, 0, K),
    ("reward-take.ogg", f"{KI}/maximize_006.ogg", 0, 0, K),
    ("floor-clear.ogg", f"{KJ}/Steel jingles/jingles_STEEL01.ogg", 0, 0, K),
    ("run-victory.ogg", f"{KJ}/Steel jingles/jingles_STEEL07.ogg", 0, 0, K),
    ("run-defeat.ogg", f"{KJ}/Hit jingles/jingles_HIT15.ogg", 0, 0, K),
    # editor
    ("rune-pick.ogg", f"{KI}/select_005.ogg", 0, 0, K),
    ("rune-place.ogg", f"{KI}/drop_002.ogg", 0, 0, K),
    ("rune-remove.ogg", f"{KI}/close_002.ogg", 0, 0, K),
    ("undo.ogg", f"{KI}/back_003.ogg", 0, 0, K),
    # battle: cast + shots (paid packs, converted)
    ("cast-charged.ogg", f"{KI}/tick_002.ogg", 0, 0, K),
    ("cast-fire.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Arcane_Missile_2_Dry.wav", 0.5, -3, EPIC),
    ("shot-fire-a.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Fire_Instant_Cast_Spell_B.wav", 0.55, 0, EPIC),
    ("shot-fire-b.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Fire_Instant_Cast_Spell_D.wav", 0.55, 0, EPIC),
    ("shot-frost-a.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Ice_Instant_Cast_Spell_A.wav", 0.55, 0, EPIC),
    ("shot-frost-b.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Ice_Instant_Cast_Spell_C.wav", 0.55, 0, EPIC),
    ("shot-nature.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Earth_Instant_Cast_Spell_C.wav", 0.55, 0, EPIC),
    ("shot-lightning-a.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Lightning_Instant_Cast_Spell_A.wav", 0.55, 0, EPIC),
    ("shot-lightning-b.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Lightning_Instant_Cast_Spell_D.wav", 0.55, 0, EPIC),
    ("shot-arcane.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Arcane_Missile_1_Dry.wav", 0.55, 0, EPIC),
    ("shot-storm.wav", f"{FG}/Elemental_Magic/Fantasy_Game_Magic_Lightning_Instant_Cast_Spell_C.wav", 0.6, 0, EPIC),
    ("shot-pure.wav", f"{FG}/Attacks_and_Creatures/Fantasy_Game_Attack_Magic_Arrow_A.wav", 0.55, 0, EPIC),
    # battle: hits (Kenney)
    ("hit-fire.ogg", f"{KP}/impactSoft_medium_001.ogg", 0, 0, K),
    ("hit-frost.ogg", f"{KP}/impactGlass_light_001.ogg", 0, 0, K),
    ("hit-nature.ogg", f"{KP}/impactWood_light_001.ogg", 0, 0, K),
    ("hit-lightning.ogg", f"{KI}/glitch_002.ogg", 0, 0, K),
    ("hit-arcane.ogg", f"{KI}/glass_003.ogg", 0, 0, K),
    ("hit-storm.ogg", f"{KP}/impactMetal_medium_001.ogg", 0, 0, K),
    ("hit-pure.ogg", f"{KP}/impactPunch_medium_001.ogg", 0, 0, K),
    ("ward-hit.ogg", f"{KP}/impactPlate_medium_002.ogg", 0, 0, K),
    ("wave-start.ogg", f"{KP}/impactBell_heavy_001.ogg", 0, 0, K),
    # battle: big effects and creatures (paid packs, converted)
    ("explosion.wav", f"{AG}/Magic/Ancient_Game_Magic_Bomb_Explosion_2_Short.wav", 0.8, 0, EPIC),
    ("freeze.wav", f"{AG}/Magic/Ancient_Game_Ceramic_or_Ice_Bomb_Explosion_1.wav", 0.8, -2, EPIC),
    ("enemy-die.wav", f"{MB}/Fantasy FIRE or LAVA Life Form Voice - BURNING DIE HURT - Creatures, Monsters, Beasts, Dragons & Dinosaurs - 03.wav", 0.8, -3, FUSE),
    ("boss-die.wav", f"{FG}/Attacks_and_Creatures/Fantasy_Game_Creature_Growl_Loud_Gritty.wav", 2.2, 0, EPIC),
    ("enemy-shoot.wav", f"{FG}/Attacks_and_Creatures/Fantasy_Game_Attack_Shadow_Arrow.wav", 0.6, -2, EPIC),
]


def read_wav(path):
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        vals = list(struct.unpack("<%dh" % (len(raw) // 2), raw))
        scale = 32768.0
    elif sw == 3:
        vals = []
        for i in range(0, len(raw) - 2, 3):
            v = raw[i] | (raw[i + 1] << 8) | (raw[i + 2] << 16)
            vals.append(v - (1 << 24) if v & 0x800000 else v)
        scale = 8388608.0
    else:
        raise ValueError("unsupported sample width %d in %s" % (sw, path))
    mono = [sum(vals[i:i + ch]) / (ch * scale) for i in range(0, len(vals) - ch + 1, ch)]
    return mono, sr


def process(mono, sr, max_s, gain_db):
    peak = max((abs(x) for x in mono), default=0) or 1.0
    thr = peak * 0.02
    start = next((i for i, x in enumerate(mono) if abs(x) > thr), 0)
    mono = mono[max(0, start - int(sr * 0.003)):]
    mono = mono[:int(max_s * sr)]
    n_out = int(len(mono) * RATE / sr)
    out = []
    for i in range(n_out):
        p = i * sr / RATE
        j = int(p)
        f = p - j
        a = mono[j]
        b = mono[j + 1] if j + 1 < len(mono) else a
        out.append(a + (b - a) * f)
    fade = min(len(out), max(int(RATE * 0.06), len(out) // 8))
    for i in range(fade):
        out[len(out) - fade + i] *= 1 - (i + 1) / fade
    pk = max((abs(x) for x in out), default=0) or 1.0
    g = PEAK / pk * 10 ** (gain_db / 20)
    return [max(-1.0, min(1.0, x * g)) for x in out]


def write_wav(path, samples):
    pcm = array.array("h", (int(round(x * 32767)) for x in samples))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith((".wav", ".ogg")):
            os.remove(os.path.join(OUT, f))
    credits = []
    total = 0
    for name, rel, max_s, gain, lic in CLIPS:
        src = os.path.join(ASSETS, rel)
        if not os.path.exists(src):
            hits = glob.glob(glob.escape(os.path.dirname(src)) + os.sep + "*")
            hits = [h for h in hits if os.path.basename(h) == os.path.basename(src)]
            if not hits:
                raise SystemExit("missing source: " + rel)
            src = hits[0]
        dst = os.path.join(OUT, name)
        if name.endswith(".ogg"):
            shutil.copyfile(src, dst)
        else:
            mono, sr = read_wav(src)
            write_wav(dst, process(mono, sr, max_s, gain))
        total += os.path.getsize(dst)
        credits.append((name, rel.split("/")[0], os.path.basename(src), lic))
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("# Sound credits\n\nGenerated by `tools/build-sfx.py`. Kenney clips are copied unchanged. "
                "Other clips are trimmed, downsampled (22.05 kHz mono) and re-normalized game assets "
                "from packs licensed to the project author; they are not a redistributable library.\n\n"
                "| File | Source pack | Original file | License |\n|---|---|---|---|\n")
        for c in credits:
            f.write("| %s | %s | %s | %s |\n" % c)
    print("wrote %d files, %.1f KB" % (len(credits), total / 1024))


main()
