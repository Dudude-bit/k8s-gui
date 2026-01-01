#!/usr/bin/env python3
import math
import struct
import zlib
from pathlib import Path


WIDTH = 1024
HEIGHT = 1024

GLYPHS = {
    "K": [
        "1...1",
        "1..1.",
        "1.1..",
        "11...",
        "1.1..",
        "1..1.",
        "1...1",
    ],
    "8": [
        ".111.",
        "1...1",
        "1...1",
        ".111.",
        "1...1",
        "1...1",
        ".111.",
    ],
}


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, width: int, height: int, pixel_bytes: bytes) -> None:
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(pixel_bytes, level=9)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", compressed)
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def generate_icon(width: int, height: int) -> bytes:
    data = bytearray((width * 4 + 1) * height)
    cx = width / 2.0
    cy = height / 2.0
    radius = min(width, height) * 0.38

    def clamp(value: float) -> int:
        return max(0, min(255, int(value)))

    for y in range(height):
        row = y * (width * 4 + 1)
        data[row] = 0
        for x in range(width):
            t = (x + y) / (width + height)
            r = 14 + t * 24
            g = 28 + t * 90
            b = 72 + t * 120

            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)
            if dist < radius:
                k = 1.0 - (dist / radius)
                r = r * (1 - 0.35 * k) + 80 * k
                g = g * (1 - 0.35 * k) + 200 * k
                b = b * (1 - 0.35 * k) + 255 * k

            idx = row + 1 + x * 4
            data[idx : idx + 4] = bytes(
                (
                    clamp(r),
                    clamp(g),
                    clamp(b),
                    255,
                )
            )

    total_cells = 11
    cell = min(int(width * 0.7 / total_cells), int(height * 0.5 / 7))
    glyph_w = 5 * cell
    glyph_h = 7 * cell
    start_x = int((width - (glyph_w * 2 + cell)) / 2)
    start_y = int((height - glyph_h) / 2)

    def draw_glyph(x0: int, y0: int, glyph: list[str]) -> None:
        for gy, row in enumerate(glyph):
            for gx, ch in enumerate(row):
                if ch != "1":
                    continue
                x_start = x0 + gx * cell
                y_start = y0 + gy * cell
                for yy in range(y_start, y_start + cell):
                    row_offset = yy * (width * 4 + 1) + 1
                    for xx in range(x_start, x_start + cell):
                        idx = row_offset + xx * 4
                        data[idx : idx + 4] = bytes((245, 250, 255, 255))

    draw_glyph(start_x, start_y, GLYPHS["K"])
    draw_glyph(start_x + glyph_w + cell, start_y, GLYPHS["8"])

    return bytes(data)


def main() -> None:
    base_path = Path("src-tauri/icons/base.png")
    base_path.parent.mkdir(parents=True, exist_ok=True)
    pixels = generate_icon(WIDTH, HEIGHT)
    write_png(base_path, WIDTH, HEIGHT, pixels)
    print(f"Wrote {base_path}")


if __name__ == "__main__":
    main()
