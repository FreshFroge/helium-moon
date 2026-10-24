#!/usr/bin/env python3
"""
HELIUM MOON - map layout builder.

Takes the two reference map images supplied by the user:
  * ref_topdown.png  - top-down satellite view of Stinchcomb Wildlife Refuge (north up)
  * ref_oblique.png  - oblique 3D view with the main trail highlighted in green

A homography between the two images (found with SIFT + RANSAC, verified by
overlay) moves the green trail, which is only drawn on the oblique view, into the
metric top-down frame. Every feature is stored in top-down image pixels ("TD");
the game converts TD -> metres with MAP_SCALE from shared/config.js.

Outputs:
  shared/mapData.js            traced features for the game + server
  progress_map_layout.png      overlay preview for checking the trace
"""
import json, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'tools', 'ref')
TD_IMG = os.path.join(REF, 'ref_topdown.png')
OB_IMG = os.path.join(REF, 'ref_oblique.png')


# Verified top-down -> oblique homography (SIFT + RANSAC, checked by overlay). SIFT results vary across
# OpenCV builds, so the verified matrix is stored; pass --refit to recompute it.
H_VERIFIED = np.array([[4.10914336e-01, -6.45219831e-01, 1.46002418e+02],
                       [1.90301663e-01, 2.06898492e-01, 4.43522512e+01],
                       [-8.95955295e-04, -1.12129954e-03, 1.00000000e+00]])


def homography():
    import sys
    if '--refit' not in sys.argv: return H_VERIFIED.copy()
    a = cv2.imread(TD_IMG); b = cv2.imread(OB_IMG)
    A = cv2.resize(a, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    B = cv2.resize(b, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    cl = cv2.createCLAHE(3.0, (8, 8))
    ga = cl.apply(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY)); gb = cl.apply(cv2.cvtColor(B, cv2.COLOR_BGR2GRAY))
    s = cv2.SIFT_create(nfeatures=6000)
    ka, da = s.detectAndCompute(ga, None); kb, db = s.detectAndCompute(gb, None)
    m = cv2.BFMatcher().knnMatch(da, db, k=2)
    good = [x for x, y in m if x.distance < 0.8 * y.distance]
    pa = np.float32([ka[g.queryIdx].pt for g in good]) / 3
    pb = np.float32([kb[g.trainIdx].pt for g in good]) / 3
    cv2.setRNGSeed(7)
    H, _ = cv2.findHomography(pa, pb, cv2.RANSAC, 4.0)
    return H


# --- the green trail, traced on the oblique image (pixel coords x4), south trailhead -> north end
TRAIL_OB = [(738,900),(745,870),(752,845),(758,815),(760,800),(755,790),(740,770),(720,750),(708,740),(690,715),(680,700),(682,685),(695,670),(712,650),(725,630),(740,610),(748,595),(760,588),(800,588),(856,585),(895,575),(920,568),(935,558),(950,530),(958,500),(957,470),(952,450),(943,430),(935,405),(925,380),(912,350),(900,325),(890,300),(880,290),(850,282),(820,272),(790,265),(760,260),(738,252),(745,235),(750,215),(755,190),(757,160),(752,135),(740,115),(728,105),(722,90),(716,75),(705,45),(700,35)]
SIDE_OB = [(708,640),(695,655),(680,672),(665,684),(655,690)]
RIVER_N_OB = [(171,7.5),(172.5,16.7),(175,26.7),(178.3,33.3),(180.8,40),(182.5,45.8),(181.7,50),(178.3,53.3),(175,57.5),(176.7,60)]

# --- features traced directly on the top-down image (TD px)
RIVER_TD = [(52,0),(80,30),(82,42),(83,62),(86,82),(89,100),(92,115),(89,130),(86,142),(90,152),(100,162),(112,166),(125,165),(130,159),(125,155),(112,150),(107,145),(106,137),(110,132),(120,130),(132,130),(139,126),(141,120),(136,114),(130,111),(129,107),(135,108),(145,110),(154,115),(159,122),(165,135),(170,145),(172,155),(174,165),(170,175),(162,185),(154,192),(150,200),(147,212),(146,225),(146,240),(145,250),(144,265),(144,280),(145,292),(149,302),(160,306),(175,306),(190,306),(207,306),(220,307)]
CREEK_TD = [(212,196),(206,214),(203,238),(200,260),(198,281),(201,298),(206,306)]
POND_CLEARING_TD = [(140,62),(152,58),(165,60),(178,63),(186,70),(189,82),(187,93),(180,99),(168,98),(158,92),(148,84),(141,74)]
POND_WATER_TD = {'c': (174, 82), 'rx': 10, 'ry': 8.5, 'rot': 0.35}
SAND_FLAT_TD = {'c': (151, 70), 'rx': 9, 'ry': 7, 'rot': 0.5}
SE_SWAMP_TD = [(158,188),(170,180),(185,183),(200,190),(212,200),(215,220),(212,250),(205,275),(195,295),(178,300),(162,292),(156,270),(155,240),(156,210)]
SE_PONDS_TD = [{'c': (181, 236), 'rx': 5.5, 'ry': 13, 'rot': 0.15}, {'c': (188, 258), 'rx': 4, 'ry': 6, 'rot': -0.3}]
SW_SWAMP_TD = [(78,195),(95,192),(112,205),(120,235),(118,265),(110,290),(92,292),(80,265),(76,230)]
SW_POND_TD = {'c': (109, 241), 'rx': 5, 'ry': 4.5, 'rot': 0}
W_MARSH_TD = [(10,60),(30,52),(55,55),(75,70),(78,100),(70,125),(60,145),(40,140),(20,120),(8,95)]


def ob_to_td(H, pts, scale4=True):
    p = np.float32(pts).reshape(-1, 1, 2)
    if scale4: p = p / 4.0
    return cv2.perspectiveTransform(p, np.linalg.inv(H)).reshape(-1, 2).tolist()


def chaikin(pts, it=2):
    pts = [tuple(p) for p in pts]
    for _ in range(it):
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out.append((0.75*a[0]+0.25*b[0], 0.75*a[1]+0.25*b[1]))
            out.append((0.25*a[0]+0.75*b[0], 0.25*a[1]+0.75*b[1]))
        out.append(pts[-1]); pts = out
    return pts


def poly_len(p):
    p = np.array(p); return float(np.sum(np.linalg.norm(np.diff(p, axis=0), axis=1)))


def main():
    H = homography()
    trail = ob_to_td(H, TRAIL_OB)
    side = ob_to_td(H, SIDE_OB)
    river_n = ob_to_td(H, RIVER_N_OB, scale4=False)
    river = river_n[:-1] + RIVER_TD
    trail_s = chaikin(trail, 2); river_s = chaikin(river, 2); side_s = chaikin(side, 2)
    poi = {
        'trailhead':  {'td': [trail[0][0]+4, trail[0][1]+3], 'name': 'South Trailhead Lot'},
        'overlook':   {'td': [172.5, 159.0], 'name': 'River Bend Overlook'},
        'pumphouse':  {'td': [184.5, 117.0], 'name': 'Old Pump House'},
        'blind':      {'td': [186.0, 84.0],  'name': 'Pond Wildlife Blind'},
        'shed':       {'td': [167.0, 37.0],  'name': 'Ranger Maintenance Shed'},
        'camp':       {'td': [138.0, 46.0],  'name': 'Abandoned Campsite'},
        'bridge':     {'td': [101.0, -3.5],  'name': 'Slough Footbridge'},
        'fishing':    {'td': [62.0, -9.0],   'name': 'Fishing Bank'},
        'mast':       {'td': [30.0, -55.0],  'name': 'Old Repeater Mast'},
        'highway':    {'td': [trail[-1][0]-2, trail[-1][1]-3], 'name': 'Highway Bridge'},
    }
    data = {
        'source': 'Traced from the user reference images (top-down satellite + oblique view with green trail). TD = top-down image pixels.',
        'trail': [[round(x, 2), round(y, 2)] for x, y in trail_s],
        'trailRaw': [[round(x, 2), round(y, 2)] for x, y in trail],
        'sidePath': [[round(x, 2), round(y, 2)] for x, y in side_s],
        'river': [[round(x, 2), round(y, 2)] for x, y in river_s],
        'creek': CREEK_TD,
        'pondClearing': POND_CLEARING_TD, 'pondWater': POND_WATER_TD, 'sandFlat': SAND_FLAT_TD,
        'seSwamp': SE_SWAMP_TD, 'sePonds': SE_PONDS_TD,
        'swSwamp': SW_SWAMP_TD, 'swPond': SW_POND_TD, 'wMarsh': W_MARSH_TD,
        'poi': poi,
        'trailLengthTD': round(poly_len(trail_s), 2),
    }
    out = os.path.join(ROOT, 'shared', 'mapData.js')
    with open(out, 'w') as f:
        f.write('// AUTO-GENERATED by tools/map_build.py - traced Stinchcomb layout (TD = top-down reference pixels)\n')
        f.write('export const MAP_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote', out, 'trail TD length', data['trailLengthTD'])

    # ---------------- preview overlay
    td = cv2.imread(TD_IMG); ob = cv2.imread(OB_IMG)
    X0, Y0, X1, Y1, S = -70, -135, 250, 312, 3
    W, Hh = (X1-X0)*S, (Y1-Y0)*S
    T = np.array([[1/S, 0, X0], [0, 1/S, Y0], [0, 0, 1]], float)
    ob_warp = cv2.warpPerspective(ob, H @ T, (W, Hh), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP)
    T2 = np.array([[S, 0, -X0*S], [0, S, -Y0*S], [0, 0, 1]], float)
    td_up = cv2.warpPerspective(td, T2, (W, Hh), flags=cv2.INTER_CUBIC)
    mask = cv2.warpPerspective(np.full(td.shape[:2], 255, np.uint8), T2, (W, Hh))
    canvas = np.where(mask[..., None] > 0, td_up, ob_warp)
    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)).convert('RGB')
    img = Image.eval(img, lambda v: int(v*0.7))
    d = ImageDraw.Draw(img, 'RGBA')
    P = lambda pts: [((x-X0)*S, (y-Y0)*S) for x, y in pts]
    def ell(e, **kw):
        cx, cy = e['c']; pts = [(cx + e['rx']*np.cos(a)*np.cos(e['rot']) - e['ry']*np.sin(a)*np.sin(e['rot']),
                                 cy + e['rx']*np.cos(a)*np.sin(e['rot']) + e['ry']*np.sin(a)*np.cos(e['rot'])) for a in np.linspace(0, 2*np.pi, 40)]
        d.polygon(P(pts), **kw)
    for poly in (SE_SWAMP_TD, SW_SWAMP_TD):
        d.polygon(P(poly), fill=(150, 120, 200, 60), outline=(190, 160, 255, 200))
    d.polygon(P(POND_CLEARING_TD), fill=(220, 220, 120, 50), outline=(240, 240, 140, 220))
    for e in [POND_WATER_TD, SW_POND_TD] + SE_PONDS_TD: ell(e, fill=(40, 90, 200, 170))
    d.line(P(river_s), fill=(90, 170, 255, 255), width=6)
    d.line(P(CREEK_TD), fill=(90, 170, 255, 200), width=3)
    d.line(P(side_s), fill=(255, 170, 60, 255), width=4)
    d.line(P(trail_s), fill=(120, 255, 90, 255), width=6)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
        fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    except Exception:
        f = fs = ImageFont.load_default()
    for k, v in poi.items():
        x, y = P([v['td']])[0]
        d.ellipse([x-7, y-7, x+7, y+7], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=2)
        tx = x + 11 if x < W - 230 else x - 11 - d.textlength(v['name'], font=fs)
        d.rectangle([tx-3, y-10, tx + d.textlength(v['name'], font=fs) + 3, y+9], fill=(0, 0, 0, 170))
        d.text((tx, y-9), v['name'], font=fs, fill=(255, 255, 255, 255))
    LY = Hh - 160
    d.rectangle([10, LY, 520, LY+140], fill=(0, 0, 0, 210))
    d.text((20, LY+6), 'HELIUM MOON  -  map layout traced from your images', font=f, fill=(255, 255, 255, 255))
    d.text((20, LY+34), 'green   = your highlighted trail (main route, 1:1 shape)', font=fs, fill=(120, 255, 90, 255))
    d.text((20, LY+54), 'blue    = North Canadian River + swamp creek', font=fs, fill=(90, 170, 255, 255))
    d.text((20, LY+74), 'orange  = riverbank side path (dotted mark on your map)', font=fs, fill=(255, 170, 60, 255))
    d.text((20, LY+94), 'purple  = swamps / flooded timber,  yellow = pond clearing', font=fs, fill=(200, 180, 255, 255))
    d.text((20, LY+114), 'white   = landmarks (objective/item locations rotate per game)', font=fs, fill=(255, 255, 255, 255))
    prev = os.path.join(ROOT, 'tools', 'debug', 'progress_map_layout.png')
    os.makedirs(os.path.dirname(prev), exist_ok=True)
    img.save(prev); print('wrote', prev)


if __name__ == '__main__':
    main()
