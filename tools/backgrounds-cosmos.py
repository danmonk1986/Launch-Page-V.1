import random, sys
W,H=1920,1200
TEAL='#06f9c2'; PEACH='#f4b9a4'; LIL='#c9b8ff'
def build(mode):
    r=random.Random(31); dark = mode=='dark'
    if dark: BL=['#173a78','#1d4f96','#2b6cb8','#5a9fe0','#0b1d44']; NAVY='#050d26'
    else:    BL=['#cfe9f7','#a8d8f0','#7cc4e8','#4fa8d8','#2d7fc0']; NAVY='#14305c'
    out=[]
    def poly(pts, fill, op=1): out.append(f'<polygon points="{" ".join(f"{x:.0f},{y:.0f}" for x,y in pts)}" fill="{fill}" opacity="{op}"/>')
    # stars (dark: many and bright; light: a few navy sparkles)
    if dark:
        for _ in range(800):
            out.append(f'<circle cx="{r.uniform(0,W):.0f}" cy="{r.uniform(0,H):.0f}" r="{r.choice([0.4,0.6,0.8,1,1.3])}" fill="{r.choice(["#fff","#cfe6ff","#9fd4ff"])}" opacity="{r.uniform(0.25,1):.2f}"/>')
        for _ in range(18):
            x=r.uniform(0,W); y=r.uniform(0,H*0.8)
            out.append(f'<g transform="translate({x:.0f} {y:.0f})"><circle r="16" fill="url(#sg)"/><circle r="2.2" fill="#fff"/><path d="M-22 0H22M0 -22V22" stroke="#cfe6ff" stroke-width="0.8" opacity="0.7"/></g>')
    # textured planets (shared layout)
    def planet(cx, cy, R, seed, base, rim, lx=-0.55, ly=-0.45):
        shade_dark = '#01030c' if dark else '#2d5f96'
        top = '#ffffff'
        out.append(f'''<radialGradient id="halo{seed}" cx="0.5" cy="0.5" r="0.5"><stop offset="0.82" stop-color="{rim}" stop-opacity="0"/><stop offset="0.9" stop-color="{rim}" stop-opacity="{0.35 if dark else 0.5}"/><stop offset="1" stop-color="{rim}" stop-opacity="0"/></radialGradient>
<circle cx="{cx}" cy="{cy}" r="{R*1.12}" fill="url(#halo{seed})"/>
<clipPath id="pc{seed}"><circle cx="{cx}" cy="{cy}" r="{R}"/></clipPath>
<filter id="surf{seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="{3.2/R:.4f}" numOctaves="5" seed="{seed}"/><feColorMatrix type="matrix" values="0 0 0 0 {0.75 if dark else 0.95}  0 0 0 0 {0.85 if dark else 0.98}  0 0 0 0 1  0 0 0 1.4 -0.45"/></filter>
<radialGradient id="shade{seed}" cx="{0.5+lx*0.5:.2f}" cy="{0.5+ly*0.5:.2f}" r="1"><stop offset="0" stop-color="{top}" stop-opacity="{0.18 if dark else 0.45}"/><stop offset="0.38" stop-color="#000" stop-opacity="0"/><stop offset="0.66" stop-color="{shade_dark}" stop-opacity="{0.82 if dark else 0.55}"/><stop offset="1" stop-color="{shade_dark}" stop-opacity="{0.97 if dark else 0.75}"/></radialGradient>
<g clip-path="url(#pc{seed})"><circle cx="{cx}" cy="{cy}" r="{R}" fill="{base}"/><rect x="{cx-R}" y="{cy-R}" width="{2*R}" height="{2*R}" filter="url(#surf{seed})" opacity="0.55"/><circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#shade{seed})"/></g>''')
    if dark:
        planet(1560,260,200,3,'#2b3f6e','#8fc4ff'); planet(1330,480,110,7,'#3a4560','#a9d2ff'); planet(420,180,50,4,'#4d4f75',LIL,)
    else:
        planet(1560,260,200,3,'#8ec9ec','#ffffff'); planet(1330,480,110,7,'#b7c8f2','#ffffff'); planet(420,180,50,4,LIL,'#ffffff')
    # cut-paper peaks from the poster, both bottom corners (behind them on the left, a big planet rising)
    planet(240,1040,300,9,('#1f2f58' if dark else '#a8d8f0'),('#6fb3ff' if dark else '#ffffff'),0.6,-0.5)
    poly([(0,1200),(0,700),(200,840),(360,640),(560,960),(700,1200)], BL[1], 0.92)
    poly([(0,1200),(0,900),(170,1010),(330,860),(480,1200)], BL[3])
    poly([(120,1200),(300,960),(430,1090),(560,1200)], NAVY, 0.9)
    poly([(1920,1200),(1920,620),(1730,800),(1560,640),(1380,950),(1240,1200)], BL[1], 0.92)
    poly([(1920,1200),(1920,860),(1760,990),(1620,870),(1480,1200)], BL[3])
    poly([(1600,1200),(1700,1030),(1820,1130),(1920,1060),(1920,1200)], NAVY, 0.9)
    # a peach shard and teal zigzags (the poster's accents)
    poly([(1500,1200),(1560,1060),(1640,1200)], PEACH, 0.9)
    poly([(620,1200),(680,1100),(760,1200)], PEACH, 0.75)
    def zig(x,y,dx,dy,n,col,w):
        pts=[(x,y)]
        for i in range(n): pts.append((pts[-1][0]+dx, pts[-1][1]+(dy if i%2==0 else -dy*0.6)))
        out.append(f'<polyline points="{" ".join(f"{a:.0f},{b:.0f}" for a,b in pts)}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linejoin="miter"/>')
    zig(560,150,46,50,8,TEAL,7); zig(1170,1000,40,-44,7,(LIL if dark else NAVY),6); zig(70,520,36,40,5,BL[3],5)
    # dot grids, outlined triangle and square
    for gx,gy,c,R2 in [(660,880,BL[3],7),(1280,170,TEAL,6),(80,130,BL[2],5)]:
        for i in range(R2):
            for j in range(4):
                out.append(f'<circle cx="{gx+i*22}" cy="{gy+j*22}" r="3" fill="{c}" opacity="0.7"/>')
    out.append(f'<polygon points="800,1080 880,960 960,1080" fill="none" stroke="{TEAL if dark else BL[4]}" stroke-width="5"/>')
    out.append(f'<rect x="1710" y="640" width="64" height="64" fill="none" stroke="{LIL if dark else NAVY}" stroke-width="5" transform="rotate(14 1742 672)"/>')
    out.append(f'<polygon points="1010,140 1080,40 1150,140" fill="{TEAL}" opacity="0.85"/>')
    bg = ('<radialGradient id="bg" cx="0.55" cy="0.35" r="0.9"><stop offset="0" stop-color="#0d2a66"/><stop offset="0.45" stop-color="#071640"/><stop offset="1" stop-color="#01030d"/></radialGradient>' if dark
          else '<radialGradient id="bg" cx="0.5" cy="0.4" r="0.85"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcecf8"/></radialGradient>')
    neb = (f'<rect width="{W}" height="{H}" filter="url(#neb)" opacity="0.75"/>' if dark else f'<rect width="{W}" height="{H}" filter="url(#neb)" opacity="0.35"/>')
    nebm = ('0 0 0 0 0.25  0 0 0 0 0.55  0 0 0 0 1  0 0 0 2.4 -1.1' if dark else '0 0 0 0 0.5  0 0 0 0 0.8  0 0 0 0 0.95  0 0 0 2.2 -1.1')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">
<defs>{bg}<radialGradient id="sg"><stop offset="0" stop-color="#bfe0ff" stop-opacity="0.9"/><stop offset="1" stop-color="#bfe0ff" stop-opacity="0"/></radialGradient>
<filter id="neb" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0018 0.0026" numOctaves="5" seed="12"/><feColorMatrix type="matrix" values="{nebm}"/></filter></defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>{neb}
{''.join(out)}
</svg>'''
open(sys.argv[1]+'/planets.svg','w').write(build('dark'))
open(sys.argv[1]+'/starship.svg','w').write(build('light'))
