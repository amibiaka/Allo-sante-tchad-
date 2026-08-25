from PIL import Image, ImageDraw
import os
OUT = "public/icons"
os.makedirs(OUT, exist_ok=True)
BLEU  = (11, 76, 140, 255)
BLANC = (255, 255, 255, 255)
JAUNE = (255, 216, 77, 255)

def icone(size, maskable=False):
    S = size * 4  # supersampling
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=BLEU)          # zone pleine pour le masque
        pad = int(S * 0.22)
    else:
        r = int(S * 0.22)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=BLEU)
        pad = int(S * 0.24)
    # croix blanche
    inner = S - 2 * pad
    bras = int(inner * 0.30)
    cx = cy = S // 2
    d.rounded_rectangle([cx - bras // 2, pad, cx + bras // 2, S - pad],
                        radius=bras // 4, fill=BLANC)
    d.rounded_rectangle([pad, cy - bras // 2, S - pad, cy + bras // 2],
                        radius=bras // 4, fill=BLANC)
    # point jaune (accent) en bas a droite, hors zone de masque
    if not maskable:
        r2 = int(S * 0.085)
        d.ellipse([S - pad - r2, S - pad - r2, S - pad + r2, S - pad + r2], fill=JAUNE)
    return img.resize((size, size), Image.LANCZOS)

for s in (16, 32, 180, 192, 512):
    icone(s).save(f"{OUT}/icon-{s}.png", optimize=True)
icone(512, maskable=True).save(f"{OUT}/icon-maskable-512.png", optimize=True)
icone(32).save("public/favicon.ico", sizes=[(16, 16), (32, 32)])
print("icones generees")
