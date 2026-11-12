import cv2, numpy as np
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

def comps(name):
    im = cv2.imread(f'/home/claude/launch-page-v.1/public/{name}.png', cv2.IMREAD_UNCHANGED)
    b, g, r, a = [im[:, :, i].astype(int) for i in range(4)]
    teal = ((a > 128) & (g > 180) & (r < 120)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(teal, 8)
    ids = sorted([i for i in range(1, n) if stats[i][4] > 40], key=lambda i: stats[i][0])
    return lab, stats, ids

# One shape per character: the first time it appears (logo first, then KNOWLEDGE!B4SE for the rest).
SRC = {
  'launchpage-logo': ['L', '4', 'U', 'N', 'C', 'H', '!', '!.', 'P', '4b', 'G', 'E'],
  'knowledge-b4se': ['K', 'Nb', 'O', 'W', 'Lb', 'Eb', 'D', 'Gb', 'Ec', '!b', '!b.', 'B', '4c', 'S', 'Ed'],
}
KEEP = set('L4UNCH!PGEKOWDBS')
CAP = 700  # cap height in font units
glyphs = {}
for name, labels in SRC.items():
    lab, stats, ids = comps(name)
    assert len(ids) == len(labels), (name, len(ids))
    heights = [stats[i][3] for i, l in zip(ids, labels) if l in KEEP and l != '!']
    scale = CAP / float(np.median(heights))
    parts = {}
    for i, l in zip(ids, labels):
        key = l.rstrip('.')
        parts.setdefault(key, []).append(i)
    for key, idx in parts.items():
        if key not in KEEP or key in glyphs:
            continue
        mask = np.isin(lab, idx).astype(np.uint8) * 255
        ys, xs = np.nonzero(mask)
        x0, x1, y1 = xs.min(), xs.max(), ys.max()
        cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        contours = []
        for c in cs:
            if cv2.contourArea(c) < 12:
                continue
            c = cv2.approxPolyDP(c, 0.9, True)[:, 0, :]
            pts = [(round((x - x0) * scale) + 50, round((y1 - y) * scale)) for x, y in c]
            contours.append(pts)
        glyphs[key] = (contours, round((x1 - x0) * scale) + 100)


# ---- V0.2 stand-ins: the characters Dan hasn't drawn yet, drawn as thick strokes in the same boxy style
# (same stroke weight and cap height as his letters, a little wobble). Replaced one by one as he draws them.
H = 200            # px cap height to draw at (his logo letters are ~200 px)
STROKE = 25        # px, his stroke weight at that size
rng = np.random.default_rng(26)
SK = {  # strokes as point lists, x and y in cap heights (y down from the top)
  'A': [[(0.02, 1), (0.04, 0.03), (0.6, 0), (0.62, 1)], [(0.04, 0.5), (0.6, 0.5)]],
  'F': [[(0.05, 1), (0.05, 0.03), (0.56, 0)], [(0.05, 0.48), (0.44, 0.47)]],
  'I': [[(0.08, 0), (0.09, 1)]],
  'J': [[(0.52, 0), (0.54, 0.97), (0.05, 1), (0.03, 0.72)]],
  'M': [[(0.02, 1), (0.03, 0.03), (0.74, 0), (0.76, 1)], [(0.39, 0.02), (0.4, 0.8)]],
  'Q': [[(0.03, 0.03), (0.6, 0), (0.62, 0.97), (0.04, 1), (0.03, 0.03)], [(0.4, 0.72), (0.74, 1.04)]],
  'R': [[(0.05, 1), (0.05, 0.03), (0.56, 0), (0.58, 0.5), (0.05, 0.52)], [(0.25, 0.52), (0.62, 1)]],
  'T': [[(0.0, 0.03), (0.64, 0)], [(0.32, 0.01), (0.33, 1)]],
  'V': [[(0.0, 0.0), (0.31, 1), (0.62, 0.0)]],
  'X': [[(0.02, 0.0), (0.62, 1)], [(0.62, 0.0), (0.0, 1)]],
  'Y': [[(0.0, 0.0), (0.31, 0.5), (0.62, 0.0)], [(0.31, 0.5), (0.32, 1)]],
  'Z': [[(0.02, 0.03), (0.6, 0), (0.02, 1), (0.63, 0.98)]],
  '0': [[(0.03, 0.03), (0.56, 0), (0.58, 0.97), (0.04, 1), (0.03, 0.03)]],
  '1': [[(0.04, 0.16), (0.2, 0.0), (0.21, 1)]],
  '2': [[(0.02, 0.05), (0.54, 0), (0.55, 0.5), (0.03, 0.54), (0.03, 1), (0.6, 0.98)]],
  '3': [[(0.02, 0.03), (0.54, 0), (0.56, 0.97), (0.02, 1)], [(0.12, 0.5), (0.55, 0.49)]],
  '5': [[(0.58, 0.0), (0.03, 0.02), (0.04, 0.5), (0.55, 0.48), (0.57, 0.97), (0.02, 1)]],
  '6': [[(0.54, 0.0), (0.03, 0.03), (0.04, 1), (0.56, 0.98), (0.55, 0.5), (0.04, 0.52)]],
  '7': [[(0.0, 0.03), (0.6, 0), (0.26, 1)]],
  '8': [[(0.03, 0.03), (0.56, 0), (0.58, 0.97), (0.04, 1), (0.03, 0.03)], [(0.04, 0.5), (0.57, 0.49)]],
  '9': [[(0.56, 0.5), (0.03, 0.52), (0.03, 0.02), (0.55, 0), (0.56, 1), (0.04, 0.99)]],
  '.': [[(0.04, 0.95), (0.05, 1.0)]],
  ',': [[(0.07, 0.9), (0.02, 1.12)]],
  ':': [[(0.04, 0.32), (0.05, 0.37)], [(0.04, 0.95), (0.05, 1.0)]],
  "'": [[(0.05, 0.0), (0.05, 0.26)]],
  '-': [[(0.0, 0.52), (0.4, 0.5)]],
  '?': [[(0.0, 0.08), (0.03, 0.0), (0.5, 0.0), (0.52, 0.44), (0.25, 0.48), (0.26, 0.7)], [(0.26, 0.95), (0.27, 1.0)]],
  '/': [[(0.48, 0.0), (0.0, 1.0)]],
  '(': [[(0.26, 0.0), (0.05, 0.25), (0.04, 0.75), (0.26, 1.0)]],
  ')': [[(0.02, 0.0), (0.23, 0.25), (0.24, 0.75), (0.02, 1.0)]],
  '&': [[(0.62, 1.0), (0.08, 0.38), (0.12, 0.02), (0.42, 0.0), (0.44, 0.3), (0.03, 0.62), (0.04, 1.0), (0.48, 0.98), (0.62, 0.6)]],
  '+': [[(0.0, 0.55), (0.5, 0.54)], [(0.25, 0.3), (0.26, 0.8)]],
  '#': [[(0.15, 0.1), (0.12, 1.0)], [(0.45, 0.1), (0.42, 1.0)], [(0.0, 0.38), (0.6, 0.37)], [(0.0, 0.72), (0.58, 0.71)]],
  '@': [[(0.42, 0.62), (0.42, 0.32), (0.2, 0.33), (0.2, 0.62), (0.62, 0.63), (0.62, 0.05), (0.02, 0.04), (0.03, 1.0), (0.6, 0.98)]],
}
def draw(strokes):
    pad = 40
    xs = [x for st in strokes for x, _ in st]
    w = int(max(xs) * H) + 2 * pad + STROKE
    m = np.zeros((int(H * 1.2) + 2 * pad, w), np.uint8)
    for st in strokes:
        pts = [(int(pad + STROKE / 2 + x * H + rng.uniform(-2.5, 2.5)), int(pad + y * H + rng.uniform(-2.5, 2.5))) for x, y in st]
        for a_, b_ in zip(pts, pts[1:]):
            cv2.line(m, a_, b_, 255, int(STROKE + rng.uniform(-2, 3)), cv2.LINE_AA)
        for q in pts:
            cv2.circle(m, q, int(STROKE / 2), 255, -1, cv2.LINE_AA)
    m = (cv2.GaussianBlur(m, (5, 5), 0) > 127).astype(np.uint8) * 255
    return m, pad
def trace(mask, scale, base_px):
    ys, xs = np.nonzero(mask)
    x0, x1 = xs.min(), xs.max()
    cs, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < 12:
            continue
        c = cv2.approxPolyDP(c, 0.9, True)[:, 0, :]
        out.append([(round((x - x0) * scale) + 50, round((base_px - y) * scale)) for x, y in c])
    return out, round((x1 - x0) * scale) + 100
STAND_INS = []
for ch, strokes in SK.items():
    if ch in glyphs:
        continue
    m, pad = draw(strokes)
    # Baseline = the bottom of a full-height letter (y = 1), plus half the stroke, like his letters sit.
    glyphs[ch] = trace(m, CAP / (H + STROKE), pad + H + STROKE / 2)
    STAND_INS.append(ch)

def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2

import unicodedata
names = {}
for k in glyphs:
    names[k] = k if k.isalpha() else 'uni%04X' % ord(k)
order = ['.notdef', 'space'] + [names.get(k, k) for k in sorted(glyphs)]
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
cmap = {32: 'space'}
for k in glyphs:
    gn = names.get(k, k)
    cmap[ord(k)] = gn
    if k.isalpha():
        cmap[ord(k.lower())] = gn
fb.setupCharacterMap(cmap)
pen_glyphs, metrics = {}, {}
p = TTGlyphPen(None)
for c in [[(50, 0), (50, CAP), (450, CAP), (450, 0)], [(100, 50), (400, 50), (400, CAP - 50), (100, CAP - 50)]]:
    p.moveTo(c[0]); [p.lineTo(q) for q in c[1:]]; p.closePath()
pen_glyphs['.notdef'] = p.glyph(); metrics['.notdef'] = (500, 50)
pen_glyphs['space'] = TTGlyphPen(None).glyph(); metrics['space'] = (300, 0)
# TrueType: outer contours clockwise, holes counter-clockwise. Outer = the biggest-area contour that contains others.
for k, (contours, adv) in glyphs.items():
    p = TTGlyphPen(None)
    polys = [np.array(c, np.float32) for c in contours]
    for ci, c in enumerate(contours):
        inside = sum(1 for oi, o in enumerate(polys) if oi != ci and cv2.pointPolygonTest(o, (float(c[0][0]), float(c[0][1])), False) > 0)
        want_cw = inside % 2 == 0
        if (area(c) < 0) != want_cw:
            c = c[::-1]
        p.moveTo(c[0]); [p.lineTo(q) for q in c[1:]]; p.closePath()
    gn = names.get(k, k)
    pen_glyphs[gn] = p.glyph(); metrics[gn] = (adv, 50)
fb.setupGlyf(pen_glyphs)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=900, descent=-200)
fb.setupNameTable({'familyName': 'L4UNCH P4GE Hand', 'styleName': 'Regular', 'uniqueFontIdentifier': 'L4UNCHP4GEHand-Placeholder-0.1', 'fullName': 'L4UNCH P4GE Hand Regular', 'psName': 'L4UNCHP4GEHand-Regular', 'version': 'Version 0.2 (16 drawn by Dan, the rest stand-ins)'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=950, usWinDescent=250, sCapHeight=CAP, sxHeight=CAP)
fb.setupPost()
fb.save('L4UNCHP4GE-Hand.ttf')
fb.font.flavor = 'woff'
fb.font.save('L4UNCHP4GE-Hand.woff')
print('drawn', sorted(set(glyphs) - set(STAND_INS))); print('stand-ins', ''.join(STAND_INS))
