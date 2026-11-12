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

def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2

names = {'!': 'exclam', '4': 'four'}
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
fb.setupNameTable({'familyName': 'L4UNCH P4GE Hand', 'styleName': 'Regular', 'uniqueFontIdentifier': 'L4UNCHP4GEHand-Placeholder-0.1', 'fullName': 'L4UNCH P4GE Hand Regular', 'psName': 'L4UNCHP4GEHand-Regular', 'version': 'Version 0.1 (placeholder: 16 characters)'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=950, usWinDescent=250, sCapHeight=CAP, sxHeight=CAP)
fb.setupPost()
fb.save('L4UNCHP4GE-Hand.ttf')
fb.font.flavor = 'woff'
fb.font.save('L4UNCHP4GE-Hand.woff')
print('glyphs', sorted(glyphs))
