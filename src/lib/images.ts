/**
 * Reads an image from the computer and shrinks it in the browser, so it's small enough to keep
 * with your settings and sync to every device. Returns a data URL.
 */
export async function shrinkImage(file: File, opts: { maxW: number; maxH: number; type: 'image/jpeg' | 'image/png'; quality?: number }): Promise<string> {
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
    const scale = Math.min(1, opts.maxW / img.naturalWidth, opts.maxH / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) throw new Error('This browser cannot resize images.');
    if (opts.type === 'image/jpeg') {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL(opts.type, opts.quality ?? 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
