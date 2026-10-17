"""Codex 원본(art-src/gen/*.png) → 게임 그림(assets/) 다듬기 (Pillow).

    python tools/postprocess.py

- 지역 바닥 4장: 2:1 그대로 1200×600 webp
- 배경 4장(타이틀·퀴즈·포획·우승): 1280 폭 webp
- 사다리·미끄럼틀: 흰 배경 지우고 → 가운데에서 이어 붙일 수 있는 한 토막만 잘라 PNG (판에서 repeat-y 로 늘린다)
- 아이콘 묶음(칸 5 · 이벤트 12 · 로켓단 8): 칸마다 잘라 흰 배경 지우고 128px PNG
- 카드 틀 3장: 360×540 webp (이벤트 틀은 창이 투명하게 나와서 연한 민트로 채움)
- 앱 아이콘 180·512
"""
import pathlib
import sys

from PIL import Image, ImageDraw

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = ROOT / "art-src" / "gen"
A = ROOT / "assets"


def remove_white(im, tol=26):
    """가장자리와 이어진 흰색(근처)만 투명하게 — 그림 안쪽 흰색은 남긴다"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    white = lambda p: p[3] < 20 or (p[0] > 255 - tol and p[1] > 255 - tol and p[2] > 255 - tol)
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if not white(p):
            continue
        px[x, y] = (255, 255, 255, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    return im


def trim(im):
    b = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return im.crop(b) if b else im


def fit(im, side):
    im = im.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return out


def webp(src, dst, width, quality=84):
    im = Image.open(GEN / src).convert("RGB")
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)
    print(f"{src} → {dst.relative_to(ROOT)} {dst.stat().st_size // 1024}KB")


def grid_icons(src, cols, rows, names, side=128):
    im = Image.open(GEN / src).convert("RGB")
    cw, ch = im.width / cols, im.height / rows
    out = A / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for k, name in enumerate(names):
        c, r = k % cols, k // cols
        cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        ic = fit(trim(remove_white(cell)), side)
        ic.save(out / f"{name}.png", optimize=True)
    print(f"{src} → {len(names)}개 아이콘")


def row_icons(src, names, side=128):
    """한 줄에 늘어선 아이콘: 세로로 빈 열을 찾아 나눈다"""
    im = remove_white(Image.open(GEN / src))
    a = im.getchannel("A")
    w, h = im.size
    cols = [any(a.getpixel((x, y)) > 24 for y in range(0, h, 2)) for x in range(w)]
    spans, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None:
            start = x
        if not on and start is not None:
            if x - start > 20:
                spans.append((start, x))
            start = None
    assert len(spans) == len(names), f"{src}: 아이콘 {len(spans)}개 (기대 {len(names)})"
    for (x0, x1), name in zip(spans, names):
        ic = fit(trim(im.crop((x0, 0, x1, h))), side)
        ic.save(A / "icons" / f"{name}.png", optimize=True)
    print(f"{src} → {len(names)}개 아이콘")


def ladder_segment():
    """사다리: 가로대 사이 간격(주기)을 재서 정수 배 토막 → 위아래 이어 붙여도 이음새 없음"""
    im = Image.open(GEN / "ladder.png").convert("RGBA")
    # 가로대 사이 흰 칸은 가장자리와 안 이어져 있다 → 흰색은 전부 지운다
    im.putdata([(r, g, b_, 0) if r > 235 and g > 235 and b_ > 235 else (r, g, b_, a_) for r, g, b_, a_ in im.getdata()])
    im = trim(im)
    w, h = im.size
    a = im.getchannel("A")
    # 가운데 세로줄에서 불투명한 줄 = 가로대
    mid = w // 2
    rung = [a.getpixel((mid, y)) > 128 for y in range(h)]
    starts = [y for y in range(1, h) if rung[y] and not rung[y - 1]]
    gaps = [b - a_ for a_, b in zip(starts, starts[1:])]
    gaps.sort()
    period = gaps[len(gaps) // 2]
    y0 = starts[len(starts) // 2 - 2]
    seg = im.crop((0, y0, w, y0 + period * 2))
    # 판 위 폭 기준으로 줄이기 (도트 느낌 유지: 폭 48px)
    scale = 48 / w
    seg = seg.resize((48, max(8, round(seg.height * scale))), Image.LANCZOS)
    seg.save(A / "board" / "ladder.png", optimize=True)
    print(f"ladder 주기 {period}px → 토막 {seg.size}")


def slide_segment():
    im = trim(remove_white(Image.open(GEN / "slide.png")))
    w, h = im.size
    seg = im.crop((0, h // 2 - w, w, h // 2 + w))
    seg = seg.resize((40, 80), Image.LANCZOS)
    seg.save(A / "board" / "slide.png", optimize=True)
    print(f"slide 토막 {seg.size}")


def frames():
    out = A / "cards"
    out.mkdir(parents=True, exist_ok=True)
    fill = {"ability": None, "rocket": None, "event": (226, 246, 234)}
    for cat in ("ability", "rocket", "event"):
        im = Image.open(GEN / f"card-{cat}.png").convert("RGBA")
        if fill[cat]:
            bg = Image.new("RGBA", im.size, fill[cat] + (255,))
            bg.alpha_composite(im)
            im = bg
        im = im.convert("RGB").resize((360, 540), Image.LANCZOS)
        im.save(out / f"frame-{cat}.webp", "WEBP", quality=88, method=6)
    print("카드 틀 3장")


def app_icons():
    ui = A / "ui"
    trophy = Image.open(A / "icons" / "tile-goal.png").convert("RGBA")
    lad = Image.open(GEN / "ladder.png")
    lad = trim(remove_white(lad))
    for side in (180, 512):
        im = Image.new("RGBA", (side, side), (29, 43, 83, 255))
        d = ImageDraw.Draw(im)
        d.rectangle((0, side * 0.62, side, side), fill=(88, 175, 72, 255))
        l = lad.resize((round(side * 0.16), round(side * 0.16 * lad.height / lad.width)), Image.LANCZOS)
        l = l.crop((0, 0, l.width, round(side * 0.78)))
        im.alpha_composite(l, (round(side * 0.18), round(side * 0.12)))
        t = trophy.resize((round(side * 0.5), round(side * 0.5)), Image.LANCZOS)
        im.alpha_composite(t, (round(side * 0.42), round(side * 0.2)))
        im.convert("RGB").save(ui / f"icon-{side}.png", optimize=True)
    print("앱 아이콘")


def main():
    (A / "board").mkdir(parents=True, exist_ok=True)
    (A / "icons").mkdir(parents=True, exist_ok=True)
    for r in ("town", "forest", "ice", "champion"):
        webp(f"region-{r}.png", A / "board" / f"region-{r}.webp", 1200, 80)
    for b in ("title-bg", "quiz-bg", "capture-bg", "win-bg"):
        webp(f"{b}.png", A / "ui" / f"{b}.webp", 1280, 80)
    row_icons("tile-icons.png", ["tile-quiz", "tile-card", "tile-rocket", "tile-start", "tile-goal"])
    grid_icons("event-icons.png", 4, 3, [f"event-{k}" for k in range(12)])
    grid_icons("rocket-icons.png", 4, 2, [f"rocket-{k}" for k in range(8)])
    ladder_segment()
    slide_segment()
    frames()
    app_icons()


if __name__ == "__main__":
    main()
