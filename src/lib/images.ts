/**
 * Reads an image from the computer and shrinks it in the browser, so it's small enough to keep
 * with your settings and sync to every device. Returns a data URL.
 */
export async function shrinkImage(file: File, opts: { maxW: number; maxH: number; type: 'image/jpeg' | 'image/png'; quality?: number; trim?: boolean }): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    throw new Error('Pick a JPEG or PNG image.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That image could not be opened. Try a JPEG or PNG.'));
      i.src = url;
    });
    // V20-127: a logo is cut to what's actually drawn (see-through edges trimmed), so it fills its box.
    const crop = opts.trim ? drawnArea(img) : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    // Never bigger than maxW × maxH, keeping its shape.
    const scale = Math.min(1, opts.maxW / crop.w, opts.maxH / crop.h);
    const w = Math.max(1, Math.round(crop.w * scale));
    const h = Math.max(1, Math.round(crop.h * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) throw new Error('This browser cannot resize images.');
    if (opts.type === 'image/jpeg') {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    return c.toDataURL(opts.type, opts.quality ?? 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The box around everything that isn't see-through (or the whole image when nothing is). */
function drawnArea(img: HTMLImageElement) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return { x: 0, y: 0, w: W, h: H };
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (a[(y * W + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
