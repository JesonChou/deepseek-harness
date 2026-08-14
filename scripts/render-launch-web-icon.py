"""Render scripts/launch-web.ico from apps/web/public/favicon.svg.

The desktop shortcut icon: the whale recolored to the DeepSeek brand blue on a
transparent background, packed as multi-size 32bpp DIB entries. DIB entries are
used deliberately - PNG-compressed ICO entries decode with broken alpha through
Windows' System.Drawing path, which shows the icon with an opaque background.

Requires Python with Pillow and a checkout whose pnpm store contains sharp
(`pnpm install` provides it). Run:

    python scripts/render-launch-web-icon.py
"""
import struct
import subprocess
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SVG = REPO / 'apps/web/public/favicon.svg'
OUT = REPO / 'scripts/launch-web.ico'
TMP = REPO / 'tmp'
BRAND_BLUE = '#4D6BFE'
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def find_sharp() -> Path:
    """Locate sharp's entry point in the pnpm store of this checkout."""
    store = REPO / 'node_modules/.pnpm'
    candidates = sorted(store.glob('sharp@*/node_modules/sharp/dist/index.cjs'))
    if not candidates:
        raise SystemExit('sharp not found in node_modules/.pnpm; run pnpm install first')
    return candidates[-1]


def render_png(svg: Path, png: Path) -> None:
    renderer = TMP / 'render-launch-web-icon.mjs'
    renderer.write_text(
        "import { writeFileSync } from 'node:fs';\n"
        "const { default: sharp } = await import(process.argv[3]);\n"
        "const png = await sharp(process.argv[2], { density: 600 })\n"
        "  .resize(256, 256).png().toBuffer();\n"
        "writeFileSync(process.argv[4], png);\n",
        encoding='utf-8',
    )
    subprocess.run(
        ['node', str(renderer), str(svg), str(find_sharp().as_uri()), str(png)],
        check=True,
    )
    renderer.unlink()


def dib_entry(img: Image.Image) -> bytes:
    """One ICO image entry: BITMAPINFOHEADER + bottom-up BGRA + zero AND mask."""
    w, h = img.size
    rgba = img.convert('RGBA')
    xor = b''.join(
        bytes((b, g, r, a))
        for y in range(h - 1, -1, -1)
        for x in range(w)
        for (r, g, b, a) in [rgba.getpixel((x, y))]
    )
    mask_stride = ((w + 31) // 32) * 4
    mask = b'\x00' * (mask_stride * h)
    header = struct.pack(
        '<IiiHHIIiiII',
        40, w, h * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0,
    )
    return header + xor + mask


def main() -> None:
    TMP.mkdir(exist_ok=True)
    svg_text = SVG.read_text(encoding='utf-8')
    svg_text = svg_text.replace('fill="#000"', f'fill="{BRAND_BLUE}"')
    recolored = TMP / 'favicon-blue.svg'
    recolored.write_text(svg_text, encoding='utf-8')
    png = TMP / 'icon-256.png'
    render_png(recolored, png)

    src = Image.open(png).convert('RGBA')
    frames = []
    for size in SIZES:
        frame = src.copy()
        frame.thumbnail(size, Image.Resampling.LANCZOS)
        frames.append((size, dib_entry(frame)))

    header = struct.pack('<HHH', 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b''
    blobs = []
    for (w, h), data in frames:
        entries += struct.pack(
            '<BBBBHHII',
            w if w < 256 else 0, h if h < 256 else 0, 0, 0, 1, 32, len(data), offset,
        )
        blobs.append(data)
        offset += len(data)

    OUT.write_bytes(header + entries + b''.join(blobs))
    # The Electron shell window icon: the same 256px render as a PNG.
    shell_icon = REPO / 'apps/desktop/build/icon.png'
    shell_icon.parent.mkdir(parents=True, exist_ok=True)
    src.save(shell_icon)
    for leftover in (recolored, png):
        leftover.unlink()
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes, {len(frames)} DIB frames)')
    print(f'wrote {shell_icon} ({shell_icon.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
