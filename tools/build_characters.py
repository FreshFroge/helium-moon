#!/usr/bin/env python3
"""
HELIUM MOON - character builder.

Helium Voice
  * Body: MakeHuman CC0 base mesh morphed to a 6'3" (1.905 m), ~220 lb young adult male
    with a soft, heavy build (macro + regional targets), rigged with the MakeHuman CC0
    default skeleton reduced to an animation-friendly bone set.
  * Clothing: red T-shirt, black athletic shorts and green / white high-top sneakers,
    built as offset shells of the body clipped along smooth fields (clean hems).
  * Face: the frontal reference photo (tools/ref/ref_face_front.png) is fitted to the
    head with PnP on hand-picked landmarks; the head geometry is warped so the eyes,
    nose, mouth and chin land on the photo, then the photo is projected into the body
    texture with facing-angle weights. The yellow swim cap and dark rectangular glasses
    come from the first (webcam) reference photo.

Sulfur Hexafluoride
  * Skunk-like creature built from a signed distance field (smooth unions),
    polygonised with marching cubes and auto-skinned to a quadruped rig.

Output: assets/models/{helium.json,helium.bin,helium_skin.jpg,sf6.json,sf6.bin}
"""
import json, os, sys, math
import numpy as np, cv2
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MH = os.environ.get('MH_DATA', os.path.join(os.path.dirname(ROOT), 'vendor', 'mh', 'makehuman', 'data'))
OUT = os.path.join(ROOT, 'assets', 'models')
os.makedirs(OUT, exist_ok=True)
DEBUG = os.path.join(ROOT, 'tools', 'debug'); os.makedirs(DEBUG, exist_ok=True)

TARGET_HEIGHT = 1.905            # 6'3"
SKIN_TARGET = np.array([226, 186, 170], np.float32)   # fair, slightly pink skin (reference photos, lightened)
CAP = np.array([226, 204, 92], np.float32)            # yellow silicone swim cap


def load_obj(path):
    V, VT, F = [], [], []
    g = None
    for line in open(path):
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '): g = line.split()[1].strip()
        elif line.startswith('f '):
            parts = [p.split('/') for p in line.split()[1:]]
            F.append(([int(p[0]) - 1 for p in parts], [int(p[1]) - 1 for p in parts], g))
    return np.array(V, np.float64), np.array(VT, np.float64), F


def apply_target(V, rel, w):
    for line in open(os.path.join(MH, 'targets', rel)):
        if not line.strip() or line.startswith('#'): continue
        s = line.split()
        V[int(s[0])] += w * np.array([float(s[1]), float(s[2]), float(s[3])])


KEEP_BONES = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head', 'jaw',
              'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'upperarm01.L', 'upperarm01.R', 'upperarm02.L', 'upperarm02.R',
              'lowerarm01.L', 'lowerarm01.R', 'lowerarm02.L', 'lowerarm02.R', 'wrist.L', 'wrist.R',
              'pelvis.L', 'pelvis.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R',
              'lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R', 'foot.L', 'foot.R']


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def bilinear(img, u, v):
    h, w = img.shape[:2]
    u = np.clip(u, 0, w - 1.001); v = np.clip(v, 0, h - 1.001)
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int); tx = (u - x0)[:, None]; ty = (v - y0)[:, None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


# ----------------------------------------------------------------- multi-view face fitting
# Hand-picked landmarks on the reference photos (pixel coords, x right / y down).
VIEW_DEFS = [
    {'file': 'ref_face_front.png', 'weight': 1.0, 'f': [3400, 4000, 4600, 5300, 6200],
     'lm': {'pupilR': (1544, 1075), 'pupilL': (1794, 1085), 'eyeInR': (1594, 1081), 'eyeOutR': (1487, 1075), 'eyeInL': (1750, 1087),
            'eyeOutL': (1835, 1081), 'nose': (1675, 1262), 'subnasale': (1675, 1300), 'mouthR': (1562, 1375), 'mouthL': (1737, 1365),
            'mouthC': (1656, 1375), 'chin': (1645, 1500), 'browR': (1525, 1012), 'browL': (1787, 1025)},
     'skinPatch': (1610, 1180, 1660, 1230),
     'mask': [(1230, 980), (1222, 1100), (1255, 1230), (1300, 1320), (1360, 1430), (1450, 1530), (1560, 1590), (1660, 1600), (1760, 1560),
              (1840, 1480), (1885, 1380), (1895, 1270), (1882, 1150), (1870, 1050), (1860, 950), (1750, 905), (1500, 885), (1300, 920)]},
]


def surface_at(V, verts, x, y, r=0.006, zmin=0.05):
    P = V[verts]
    m = (np.abs(P[:, 0] - x) < r) & (np.abs(P[:, 1] - y) < r) & (P[:, 2] > zmin)
    if not m.any(): return np.array([x, y, P[:, 2].max()])
    q = P[m]; return q[np.argmax(q[:, 2])].copy()


def mh_landmarks(V, bodyv, eyeR3, eyeL3):
    P = V[bodyv]
    eyeY = (eyeL3[1] + eyeR3[1]) / 2
    mid = P[(np.abs(P[:, 0]) < 0.004) & (P[:, 2] > 0.03) & (P[:, 1] > eyeY - 0.2) & (P[:, 1] < eyeY + 0.1)]
    m1 = mid[(mid[:, 1] < eyeY - 0.01) & (mid[:, 1] > eyeY - 0.07)]
    nose = m1[np.argmax(m1[:, 2])].copy()
    m2 = mid[(mid[:, 1] < nose[1] - 0.015) & (mid[:, 1] > nose[1] - 0.05) & (mid[:, 2] > nose[2] - 0.035)]
    mouth = m2[np.argmin(m2[:, 2])].copy()
    m3 = mid[(mid[:, 1] < mouth[1] - 0.015) & (mid[:, 1] > mouth[1] - 0.09)]
    cmax = m3[np.argmax(m3[:, 2])]
    under = m3[(m3[:, 1] < cmax[1]) & (m3[:, 2] > cmax[2] - 0.035)]
    chin = under[np.argmin(under[:, 1])].copy() if len(under) else cmax.copy()
    subn = surface_at(V, bodyv, 0.0, nose[1] - 0.016, zmin=nose[2] - 0.04)
    lm = {'nose': nose, 'mouthC': mouth, 'chin': chin, 'subnasale': subn}
    for side, c in (('R', eyeR3), ('L', eyeL3)):
        sx = 1 if side == 'L' else -1
        lm['pupil' + side] = c + np.array([0, 0, 0.0115])
        lm['eyeIn' + side] = c + np.array([-sx * 0.013, -0.001, 0.006])
        lm['eyeOut' + side] = c + np.array([sx * 0.016, 0.001, 0.002])
        lm['brow' + side] = surface_at(V, bodyv, c[0], c[1] + 0.022, zmin=c[2] - 0.01)
        lm['mouth' + side] = surface_at(V, bodyv, sx * 0.025, mouth[1] + 0.002, zmin=mouth[2] - 0.03)
    return lm


def load_views():
    views = []
    for d in VIEW_DEFS:
        img = np.array(Image.open(os.path.join(ROOT, 'tools', 'ref', d['file'])).convert('RGB')).astype(np.float32)
        x0, y0, x1, y1 = d['skinPatch']
        skin = np.median(img[y0:y1, x0:x1].reshape(-1, 3), axis=0)
        # colour-correct toward the requested fair skin tone; soft shoulder keeps highlights from clipping
        k = 1.2
        xt = -np.log(1 - (SKIN_TARGET / 255.0) * (1 - np.exp(-k))) / k      # pre-curve value that maps to the target
        gain = xt * 255.0 / np.maximum(skin, 1)
        x = img * gain[None, None, :] / 255.0
        img = np.clip(255 * (1 - np.exp(-1.2 * x)) / (1 - np.exp(-1.2)), 0, 255)
        x0, y0, x1, y1 = d['skinPatch']
        skin = np.median(img[y0:y1, x0:x1].reshape(-1, 3), axis=0)
        m = None
        if d.get('mask'):
            m = np.zeros(img.shape[:2], np.uint8); cv2.fillPoly(m, [np.array(d['mask'], np.int32)], 255)
            m = cv2.GaussianBlur(m, (0, 0), 6).astype(np.float32) / 255.0
        views.append({**d, 'img': img.astype(np.float32), 'skin': skin, 'maskImg': m})
        print('view', d['file'], 'corrected skin', skin.round())
    return views


def solve_view(view, mh):
    names = [n for n in view['lm'] if n in mh]
    obj = np.array([mh[n] for n in names], np.float64)
    imgp = np.array([view['lm'][n] for n in names], np.float64)
    h, w = view['img'].shape[:2]
    best = None
    for f in view['f']:
        K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], np.float64)
        ok, rv, tv = cv2.solvePnP(obj, imgp, K, None, flags=cv2.SOLVEPNP_SQPNP)
        if not ok: continue
        ok, rv, tv = cv2.solvePnP(obj, imgp, K, None, rv, tv, True, cv2.SOLVEPNP_ITERATIVE)
        proj, _ = cv2.projectPoints(obj, rv, tv, K, None)
        err = np.sqrt(np.mean(np.sum((proj.reshape(-1, 2) - imgp) ** 2, 1)))
        R, _ = cv2.Rodrigues(rv)
        if (R @ np.array([0, 0, 1.0]))[2] > 0: continue
        if best is None or err < best['err']: best = {'K': K, 'rv': rv, 'tv': tv, 'R': R, 'err': err, 'f': f, 'names': names}
    print('  pnp', view['file'], 'f', best['f'], 'rms px', round(best['err'], 1))
    return best


def landmark_displacements(views, sols, mh):
    disp = {}
    for n in mh:
        A, b = [], []
        for v, s in zip(views, sols):
            if n not in v['lm']: continue
            p = mh[n]
            pc = s['R'] @ p + s['tv'].ravel()
            f = s['K'][0, 0]
            proj = s['K'] @ pc; proj = proj[:2] / proj[2]
            A.append((f / pc[2]) * s['R'][:2, :] * v['weight']); b.append((np.array(v['lm'][n]) - proj) * v['weight'])
        if not A: continue
        A = np.vstack(A); b = np.concatenate(b)
        disp[n] = np.clip(np.linalg.solve(A.T @ A + 4.0e3 * np.eye(3), A.T @ b), -0.02, 0.02)
    return disp


def warp_head(V, mh, disp, head_w):
    names = list(disp.keys())
    C = np.array([mh[n] for n in names]); D = np.array([disp[n] for n in names])
    sig = 0.045
    K = np.exp(-np.sum((C[:, None] - C[None]) ** 2, -1) / (2 * sig * sig))
    Wr = np.linalg.solve(K + np.eye(len(K)) * 0.05, D)
    sel = np.nonzero(head_w > 0.05)[0]
    kk = np.exp(-np.sum((V[sel][:, None] - C[None]) ** 2, -1) / (2 * sig * sig))
    d = kk @ Wr
    mag = np.linalg.norm(d, axis=1, keepdims=True); d *= np.minimum(1, 0.02 / np.maximum(mag, 1e-9))
    V[sel] += d * np.clip(head_w[sel], 0, 1)[:, None]
    for n in mh:
        k = np.exp(-np.sum((mh[n] - C) ** 2, -1) / (2 * sig * sig)); dd = k @ Wr
        dd *= min(1, 0.02 / max(np.linalg.norm(dd), 1e-9)); mh[n] = mh[n] + dd


def project_views(views, sols, P, N):
    """Blend colours of the photos onto 3D points, weighted by facing angle and the face mask."""
    acc = np.zeros((len(P), 3)); wsum = np.zeros(len(P))
    for v, s in zip(views, sols):
        img = v['img']; h, w = img.shape[:2]
        cam = (-s['R'].T @ s['tv']).ravel()
        vd = cam[None, :] - P; vd /= np.linalg.norm(vd, axis=1, keepdims=True)
        facing = np.clip((N * vd).sum(1), 0, 1)
        pc = (s['R'] @ P.T).T + s['tv'].ravel()
        uv = (s['K'] @ pc.T).T; uv = uv[:, :2] / uv[:, 2:3]
        inside = (uv[:, 0] > 2) & (uv[:, 1] > 2) & (uv[:, 0] < w - 3) & (uv[:, 1] < h - 3)
        wt = smoothstep(0.25, 0.75, facing) * inside * v['weight']
        if v.get('maskImg') is not None:
            wt = wt * bilinear(v['maskImg'][..., None], uv[:, 0], uv[:, 1])[:, 0]
        acc += bilinear(img, uv[:, 0], uv[:, 1]) * wt[:, None]; wsum += wt
    return acc / np.maximum(wsum, 1e-6)[:, None], np.clip(wsum, 0, 1)


def build_sneaker(V, W8, bidx, J, Jt, side, colors=None):
    """High-top basketball sneaker (white leather base, green overlays, white midsole, green outsole)."""
    from skimage.measure import marching_cubes
    A = J('foot.' + side); T = Jt('foot.' + side)
    fwd = T - A; fwd[1] = 0; fwd /= np.linalg.norm(fwd)
    lat = np.cross([0, 1.0, 0], fwd); lat /= np.linalg.norm(lat)
    fv = np.nonzero((W8[:, bidx['foot.' + side]] > 0.5) & (V[:, 1] < A[1] + 0.02))[0]
    rel = V[fv] - A
    al = rel @ fwd; la = rel @ lat
    heel, toe = al.min() - 0.014, al.max() + 0.018
    L = toe - heel
    wid = (np.percentile(la, 98) - np.percentile(la, 2)) * 0.5 + 0.014
    cl = (np.percentile(la, 98) + np.percentile(la, 2)) * 0.5
    def frame(P):
        r = P - A
        return r @ fwd - heel, r @ lat - cl, P[:, 1]  # along from heel, lateral, height
    def sd_ell(x, y, z, cx, cy, cz, rx, ry, rz):
        q = np.stack([(x - cx) / rx, (y - cy) / ry, (z - cz) / rz], -1)
        k0 = np.linalg.norm(q, axis=-1)
        k1 = np.linalg.norm(q / np.array([rx, ry, rz]), axis=-1)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
    def smin(a, b, k):
        h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
        return b * (1 - h) + a * h - k * h * (1 - h)
    def field(x, lt, y):
        # 2D sole outline: rounded heel + wider forefoot
        w_at = wid * (0.82 + 0.25 * smoothstep(0.15 * L, 0.65 * L, x) - 0.2 * smoothstep(0.82 * L, L, x))
        outline = np.maximum(np.abs(lt) - w_at, np.maximum(-x, x - L))
        outline = np.maximum(outline, np.hypot(np.maximum(0.06 * L - x, 0), lt) - w_at * 0.95)
        sole = np.maximum(outline, np.maximum(-y, y - 0.034))
        upper = sd_ell(x, lt, y, 0.48 * L, 0.0, 0.035, 0.56 * L, wid * 1.02, 0.072)
        toebox = sd_ell(x, lt, y, 0.8 * L, 0.0, 0.035, 0.24 * L, wid * 1.0, 0.045)
        collar = sd_ell(x, lt, y, 0.2 * L, 0.0, A[1] + 0.03, 0.075, wid * 0.95, 0.105)
        d = smin(sole, upper, 0.02)
        d = smin(d, toebox, 0.02)
        d = smin(d, collar, 0.03)
        d = np.maximum(d, -y)                         # flat bottom
        d = np.maximum(d, y - (A[1] + 0.115))         # cut collar top
        return d
    res = 0.0058
    xs = np.arange(-0.02, L + 0.02, res); ls = np.arange(-wid - 0.02, wid + 0.02, res); ys = np.arange(-0.004, A[1] + 0.13, res)
    X, Lt, Y = np.meshgrid(xs, ls, ys, indexing='ij')
    vals = field(X, Lt, Y)
    verts, faces, normals, _ = marching_cubes(vals, 0.0, spacing=(res, res, res))
    verts += np.array([xs[0], ls[0], ys[0]])
    x, lt, y = verts[:, 0], verts[:, 1], verts[:, 2]
    P = A[None, :] * np.array([1, 0, 1]) + (x + heel)[:, None] * fwd[None, :] + (lt + cl)[:, None] * lat[None, :]
    P[:, 1] = y
    # normals from marching cubes are in (along, lateral, up) frame -> world
    Nw = normals[:, 0:1] * fwd[None, :] + normals[:, 1:2] * lat[None, :] + normals[:, 2:3] * np.array([0, 1.0, 0])[None, :]
    Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-9)
    if np.mean(np.sum(Nw * (P - P.mean(0)), 1)) < 0: Nw = -Nw
    fa = faces[:, [0, 2, 1]]
    tn = np.cross(P[fa[:, 1]] - P[fa[:, 0]], P[fa[:, 2]] - P[fa[:, 0]])
    if np.mean(np.sum(tn * Nw[fa[:, 0]], 1)) < 0: fa = fa[:, [0, 2, 1]]
    colors = colors or {}
    white = np.array(colors.get('base', [0.88, 0.88, 0.86])); green = np.array(colors.get('accent', [0.035, 0.30, 0.16])); dark = np.array(colors.get('sole', [0.03, 0.2, 0.11]))
    f = x / L
    C = np.tile(white, (len(P), 1))
    C[y < 0.012] = dark                                                         # outsole
    up = (y >= 0.034)
    C[up & (f > 0.66) & (y < 0.075)] = green                                   # toe cap
    C[up & (f < 0.16)] = green                                                 # heel counter
    C[up & (y > A[1] + 0.035)] = green                                         # ankle collar
    C[up & (np.abs(lt) < wid * 0.42) & (y > 0.075) & (f > 0.28) & (f < 0.7)] = green   # eyestay
    lace = up & (np.abs(lt) < wid * 0.18) & (y > 0.08) & (f > 0.3) & (f < 0.68)
    C[lace] = white * (0.85 + 0.15 * (np.sin(x[lace] * 260) > 0))[:, None]      # laces
    C[up & (y > A[1] + 0.105)] = np.array([0.04, 0.04, 0.045])                 # collar lining
    # skin: foot bone, blending into the shin above the ankle
    wl = smoothstep(A[1] + 0.02, A[1] + 0.11, y)
    SI = np.tile(np.array([bidx['foot.' + side], bidx['lowerleg02.' + side], 0, 0], np.uint16), (len(P), 1))
    SW = np.stack([1 - wl, wl, np.zeros_like(wl), np.zeros_like(wl)], 1).astype(np.float32)
    return {'name': 'shoes', 'P': P.astype(np.float32), 'N': Nw.astype(np.float32), 'UV': np.zeros((len(P), 2), np.float32),
            'C': C.astype(np.float32), 'SI': SI, 'SW': SW, 'I': fa.astype(np.uint32)}


# ----------------------------------------------------------------- Helium Voice
HELIUM_CFG = {
    'name': 'helium', 'photo': True, 'height': TARGET_HEIGHT, 'glasses': True,
    'cap': CAP, 'capLift': 0.030, 'sleeve': 0.47, 'leg': 0.74, 'shirt': [0.55, 0.055, 0.05], 'pants': [0.028, 0.028, 0.032],
    'shoes': None,
    'macro': [('universal-male-young-averagemuscle-averageweight', 0.2), ('universal-male-young-averagemuscle-maxweight', 0.55),
              ('universal-male-young-minmuscle-maxweight', 0.25), ('caucasian-male-young', 1.0),
              ('height/male-young-averagemuscle-averageweight-maxheight', 0.6), ('proportions/male-young-averagemuscle-averageweight-idealproportions', 0.4)],
    'targets': [('stomach/stomach-pregnant-incr', 0.22), ('stomach/stomach-tone-decr', 0.5), ('torso/torso-vshape-decr', 0.4),
                ('torso/torso-scale-depth-incr', 0.2), ('hip/hip-scale-horiz-incr', 0.15), ('buttocks/buttocks-volume-incr', 0.2),
                ('head/head-round', 0.4), ('head/head-fat-incr', 0.28), ('head/head-scale-horiz-incr', 0.18), ('head/head-scale-vert-decr', 0.1),
                ('cheek/l-cheek-volume-incr', 0.35), ('cheek/r-cheek-volume-incr', 0.35), ('cheek/l-cheek-bones-decr', 0.2), ('cheek/r-cheek-bones-decr', 0.2),
                ('chin/chin-width-incr', 0.4), ('chin/chin-prominent-decr', 0.2),
                ('neck/neck-double-incr', 0.7), ('neck/neck-scale-horiz-incr', 0.35),
                ('nose/nose-scale-vert-decr', 0.3), ('nose/nose-point-width-incr', 0.15), ('nose/nose-hump-decr', 0.4), ('nose/nose-scale-horiz-decr', 0.15),
                ('mouth/mouth-angles-up', 0.6), ('mouth/mouth-lowerlip-ext-up', 0.3), ('mouth/mouth-lowerlip-volume-decr', 0.5),
                ('mouth/mouth-upperlip-volume-decr', 0.3), ('mouth/mouth-scale-depth-decr', 0.3),
                ('eyes/l-eye-height2-incr', 0.6), ('eyes/r-eye-height2-incr', 0.6), ('eyes/l-eye-bag-decr', 0.5), ('eyes/r-eye-bag-decr', 0.5),
                ('eyes/l-eye-eyefold-up', 0.3), ('eyes/r-eye-eyefold-up', 0.3),
                ('eyebrows/eyebrows-trans-down', 0.2), ('forehead/forehead-scale-vert-decr', 0.15)],
}

# Player avatar: an ordinary night hiker (beanie, light jacket tinted per player, jeans, boots).
HIKER_CFG = {
    'name': 'hiker', 'photo': False, 'height': 1.78, 'glasses': False, 'skin': np.array([212, 172, 150], np.float32),
    'cap': np.array([52, 54, 58], np.float32), 'capLift': 0.055, 'sleeve': 1.92, 'leg': 1.93, 'shirt': [0.82, 0.82, 0.8], 'pants': [0.11, 0.14, 0.21],
    'shoes': {'base': [0.33, 0.22, 0.13], 'accent': [0.2, 0.13, 0.08], 'sole': [0.06, 0.05, 0.05]},
    'macro': [('universal-male-young-averagemuscle-averageweight', 1.0), ('caucasian-male-young', 1.0)],
    'targets': [],
}


def build_human(cfg):
    V, VT, F = load_obj(os.path.join(MH, '3dobjs', 'base.obj'))
    for t, w in cfg['macro']:
        apply_target(V, 'macrodetails/' + t + '.target', w)
    for t, w in cfg['targets']:
        apply_target(V, t + '.target', w)
    V *= 0.1  # decimetres -> metres
    sk = json.load(open(os.path.join(MH, 'rigs', 'default.mhskel')))
    bones = sk['bones']
    keep = [f for f in F if f[2] in ('body', 'helper-l-eye', 'helper-r-eye')]
    used = np.unique(np.concatenate([f[0] for f in keep]))
    ymin, ymax = V[used, 1].min(), V[used, 1].max()
    s = cfg['height'] / (ymax - ymin)
    V = (V + np.array([0, -ymin, 0])) * s
    weights = json.load(open(os.path.join(MH, 'rigs', 'default_weights.mhw')))['weights']

    def kept(b):
        while b not in KEEP_BONES: b = bones[b]['parent']
        return b
    bidx = {b: i for i, b in enumerate(KEEP_BONES)}
    nV = len(V)
    W8 = np.zeros((nV, len(KEEP_BONES)), np.float32)
    for b, lst in weights.items():
        kb = bidx[kept(b)]
        for vi, w in lst: W8[vi, kb] += w
    for f in keep:
        if f[2] != 'body':
            for vi in f[0]: W8[vi] = 0; W8[vi, bidx['head']] = 1
    rowsum = W8.sum(1, keepdims=True); rowsum[rowsum == 0] = 1; W8 /= rowsum
    head_w = W8[:, bidx['head']] + W8[:, bidx['jaw']] + W8[:, bidx['neck03']] * 0.5

    def sphere_center(g):
        Pq = V[np.unique(np.concatenate([f[0] for f in F if f[2] == g]))]
        A = np.hstack([2 * Pq, np.ones((len(Pq), 1))]); bq = (Pq ** 2).sum(1)
        return np.linalg.lstsq(A, bq, rcond=None)[0][:3]

    # ------------------------------------------------ face fitting (PnP + RBF warp, iterated)
    eyeR3 = sphere_center('helper-r-eye'); eyeL3 = sphere_center('helper-l-eye')
    bodyv = np.unique(np.concatenate([f[0] for f in F if f[2] == 'body']))
    mh = mh_landmarks(V, bodyv, eyeR3, eyeL3)
    views = load_views() if cfg['photo'] else []
    sols = []
    for it in range(4 if views else 0):
        sols = [solve_view(v, mh) for v in views]
        if it == 3: break
        warp_head(V, mh, landmark_displacements(views, sols, mh), head_w)
    eyeR3 = sphere_center('helper-r-eye'); eyeL3 = sphere_center('helper-l-eye')
    # joints after all deformation
    joints = {k: V[np.array(idx)].mean(0) for k, idx in sk['joints'].items()}

    # ------------------------------------------------ triangles with per-(v,vt) data
    tris_v, tris_t, tris_g = [], [], []
    for (vi, ti, g) in keep:
        for k in range(1, len(vi) - 1):
            tris_v.append((vi[0], vi[k], vi[k + 1])); tris_t.append((ti[0], ti[k], ti[k + 1])); tris_g.append(g)
    tris_v = np.array(tris_v); tris_t = np.array(tris_t); tris_g = np.array(tris_g)
    VT = VT.copy()
    for g, (u0, u1) in (('helper-l-eye', (0.82, 0.898)), ('helper-r-eye', (0.904, 0.982))):
        t_ids = np.unique(tris_t[tris_g == g])
        uv_ = VT[t_ids]; mn = uv_.min(0); mx = uv_.max(0)
        VT[t_ids, 0] = u0 + (uv_[:, 0] - mn[0]) / (mx[0] - mn[0]) * (u1 - u0)
        VT[t_ids, 1] = 0.86 + (uv_[:, 1] - mn[1]) / (mx[1] - mn[1]) * 0.12
    vn = np.zeros((nV, 3))
    a, b, c = V[tris_v[:, 0]], V[tris_v[:, 1]], V[tris_v[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(vn, tris_v[:, k], fn)
    chest = np.argmax((np.abs(V[:, 0]) < 0.02) * (np.abs(V[:, 1] - joints['spine02____head'][1]) < 0.03) * V[:, 2])
    if vn[chest, 2] < 0:
        tris_v = tris_v[:, [0, 2, 1]]; tris_t = tris_t[:, [0, 2, 1]]; vn = -vn
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)

    J = lambda n: joints[n + '____head']
    Jt = lambda n: joints[n + '____tail']
    pelvisY = J('upperleg01.L')[1]
    waistY = pelvisY + 0.13
    neckBaseY = J('neck01')[1]
    torsoBones = [bidx[b] for b in ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'neck01', 'root']]
    armBones = [bidx[b] for b in ['upperarm01.L', 'upperarm01.R', 'upperarm02.L', 'upperarm02.R']]
    legBones = [bidx[b] for b in ['pelvis.L', 'pelvis.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R']]
    armW = W8[:, armBones].sum(1); legW = W8[:, legBones].sum(1)

    # ------------------------------------------------ skin texture bake (MakeHuman UV layout)
    TEX = 2048
    uvt = VT[tris_t]
    pix = np.zeros((TEX, TEX), np.int32) - 1
    for ti in range(len(tris_v)):
        poly = (uvt[ti] * [TEX, TEX]).copy(); poly[:, 1] = TEX - poly[:, 1]
        cv2.fillConvexPoly(pix, np.round(poly * 4).astype(np.int32), int(ti), lineType=cv2.LINE_8, shift=2)
    ys, xs = np.nonzero(pix >= 0)
    tid = pix[ys, xs]
    p0 = uvt[tid, 0] * TEX; p1 = uvt[tid, 1] * TEX; p2 = uvt[tid, 2] * TEX
    for q in (p0, p1, p2): q[:, 1] = TEX - q[:, 1]
    px = np.stack([xs + 0.5, ys + 0.5], 1)
    v0 = p1 - p0; v1 = p2 - p0; v2 = px - p0
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01; den[den == 0] = 1e-9
    bv = (d11 * d20 - d01 * d21) / den; bw = (d00 * d21 - d01 * d20) / den; bu = 1 - bv - bw
    tv = tris_v[tid]
    pos = V[tv[:, 0]] * bu[:, None] + V[tv[:, 1]] * bv[:, None] + V[tv[:, 2]] * bw[:, None]
    nor = vn[tv[:, 0]] * bu[:, None] + vn[tv[:, 1]] * bv[:, None] + vn[tv[:, 2]] * bw[:, None]
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
    hw = W8[tv[:, 0], bidx['head']] + W8[tv[:, 0], bidx['jaw']]
    rng = np.random.default_rng(3)
    noise = cv2.GaussianBlur(rng.normal(0, 1, (TEX, TEX)).astype(np.float32), (0, 0), 3)[ys, xs]
    coarse = cv2.GaussianBlur(rng.normal(0, 1, (TEX, TEX)).astype(np.float32), (0, 0), 24)[ys, xs]
    skinRef = views[0]['skin'] if views else cfg['skin']
    col = skinRef[None, :] * (1 + noise[:, None] * 0.04 + coarse[:, None] * 0.12)
    # light freckling + warmer knees / elbows / knuckles
    col *= (1 - 0.06 * (noise[:, None] > 1.6))
    isHead = hw > 0.3
    hp = pos[isHead]; hn = nor[isHead]
    if views: pc, pw = project_views(views, sols, hp, hn)
    else:
        # no photo: plain features painted from the landmarks (brows, lips, light stubble)
        pc = np.tile(skinRef, (len(hp), 1)).astype(np.float64); pw = np.zeros(len(hp))
        for side in ('L', 'R'):
            b = mh['brow' + side]
            dd = ((hp[:, 0] - b[0]) / 0.024) ** 2 + ((hp[:, 1] - b[1] + 0.002) / 0.0055) ** 2
            w_ = np.exp(-dd ** 2) * (hp[:, 2] > b[2] - 0.03)
            pc = pc * (1 - w_[:, None]) + np.array([70, 52, 40.]) * w_[:, None]; pw = np.maximum(pw, w_)
        mc = mh['mouthC']
        dd = ((hp[:, 0] - mc[0]) / 0.024) ** 2 + ((hp[:, 1] - mc[1]) / 0.006) ** 2
        w_ = np.exp(-dd ** 2) * 0.6 * (hp[:, 2] > mc[2] - 0.02)
        pc = pc * (1 - w_[:, None]) + np.array([170, 100, 95.]) * w_[:, None]; pw = np.maximum(pw, w_)
    # crisp procedural eyeballs (sclera / blue-grey iris / pupil), coloured by direction from each fitted centre
    gHead = tris_g[tid][isHead]
    for gname, cE in (('helper-l-eye', eyeL3), ('helper-r-eye', eyeR3)):
        on = gHead == gname
        if not on.any(): continue
        d = hp[on] - cE
        dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        th = np.arccos(np.clip(dn[:, 2], -1, 1)); ang = np.arctan2(dn[:, 1], dn[:, 0])
        sclera = np.array([212, 204, 196.]) * (1 - 0.18 * smoothstep(0.7, 1.5, th))[:, None]
        sclera = sclera * (1 - 0.06 * (np.sin(ang * 31) > 0.95)[:, None])
        iris = np.array([92, 120, 140.])[None, :] * (0.82 + 0.18 * np.sin(ang * 23 + th * 40))[:, None] * (0.7 + 0.4 * smoothstep(0.08, 0.42, th))[:, None]
        e = sclera * smoothstep(0.44, 0.5, th)[:, None] + iris * (1 - smoothstep(0.44, 0.5, th))[:, None]
        e *= (1 - 0.6 * np.exp(-((th - 0.47) / 0.03) ** 2))[:, None]
        e = e * smoothstep(0.15, 0.18, th)[:, None] + np.array([8, 8, 10.]) * (1 - smoothstep(0.15, 0.18, th))[:, None]
        e += np.array([255, 255, 255.]) * np.exp(-(((dn[:, 0] - 0.16) ** 2 + (dn[:, 1] - 0.18) ** 2) / 0.0012))[:, None] * 0.55
        idx_on = np.nonzero(on)[0]
        pc[idx_on] = e; pw[idx_on] = 1.0
    eyeY = (eyeL3[1] + eyeR3[1]) / 2
    capFrontY = eyeY + cfg['capLift']
    zt = smoothstep(eyeL3[2] - 0.15, eyeL3[2] - 0.02, hp[:, 2])
    capY = capFrontY * zt + (eyeY - 0.018) * (1 - zt)
    wav = 0.003 * np.sin(hp[:, 0] * 90) + 0.002 * np.sin(hp[:, 2] * 70)
    capW = smoothstep(capY - 0.0025, capY + 0.0025, hp[:, 1] + wav)
    capCol = cfg['cap'][None, :] * (0.86 + 0.12 * noise[isHead][:, None] + 0.08 * coarse[isHead][:, None])
    capCol *= (1 - 0.12 * smoothstep(0.012, 0.0, hp[:, 1] - capY)[:, None] * (0.5 + 0.5 * np.sin(hp[:, 0] * 400 + hp[:, 2] * 300))[:, None])
    face = col[isHead] * (1 - pw[:, None]) + pc * pw[:, None]
    col[isHead] = face * (1 - capW[:, None]) + capCol * capW[:, None]
    tex = np.zeros((TEX, TEX, 3), np.float32)
    tex[ys, xs] = col
    mask = np.zeros((TEX, TEX), np.uint8); mask[ys, xs] = 255
    tex8 = np.clip(tex, 0, 255).astype(np.uint8)
    for _ in range(6):
        dil = cv2.dilate(tex8, np.ones((3, 3), np.uint8)); m2 = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        newm = (m2 > 0) & (mask == 0); tex8[newm] = dil[newm]; mask = m2
    Image.fromarray(tex8).save(os.path.join(OUT, cfg['name'] + '_skin.jpg'), quality=90)
    print('skin texture baked')

    # ------------------------------------------------ clothing: smooth scalar fields clipped at f = 0 (clean hems)
    parts = []
    sideL = V[:, 0] > 0
    def segt(P_, A_L, B_L, A_R, B_R):
        A_ = np.where(sideL[:, None], A_L, A_R); B_ = np.where(sideL[:, None], B_L, B_R)
        ab = B_ - A_; return ((P_ - A_) * ab).sum(1) / (ab * ab).sum(1)
    tArm = segt(V, J('upperarm01.L'), J('lowerarm01.L'), J('upperarm01.R'), J('lowerarm01.R'))
    tLeg = segt(V, J('upperleg01.L'), J('lowerleg01.L'), J('upperleg01.R'), J('lowerleg01.R'))
    handW = W8[:, [bidx[n] for n in ['lowerarm01.L', 'lowerarm01.R', 'lowerarm02.L', 'lowerarm02.R', 'wrist.L', 'wrist.R']]].sum(1)
    lowW = W8[:, [bidx['root'], bidx['spine05']]].sum(1)
    headW = W8[:, [bidx['head'], bidx['jaw'], bidx['neck02'], bidx['neck03']]].sum(1)
    neckZ = J('neck01')[2]
    big = 1.0
    f_collar = (neckBaseY - 0.006 - 0.035 * np.clip((V[:, 2] - neckZ) / 0.07, 0, 1)) - V[:, 1]
    f_shirt = np.minimum(f_collar, V[:, 1] - (pelvisY - 0.035))
    wristW = W8[:, [bidx['wrist.L'], bidx['wrist.R']]].sum(1)
    if cfg['sleeve'] > 1:   # long sleeves down to the wrist
        f_shirt = np.minimum(f_shirt, np.where(armW + handW > 0.4, (cfg['sleeve'] - tArm) * 0.3, big))
        f_shirt = np.minimum(f_shirt, np.minimum((0.92 - legW) * 0.3, np.minimum((0.4 - wristW) * 0.3, (0.4 - headW) * 0.3)))
    else:
        f_shirt = np.minimum(f_shirt, np.where(armW > 0.45, (cfg['sleeve'] - tArm) * 0.3, big))
        f_shirt = np.minimum(f_shirt, np.minimum((0.92 - legW) * 0.3, np.minimum((0.35 - handW) * 0.3, (0.4 - headW) * 0.3)))
    legLower = W8[:, [bidx[n] for n in ['lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R']]].sum(1)
    f_shorts = np.minimum((pelvisY + 0.105) - V[:, 1], np.where(legW + (legLower if cfg['leg'] > 1 else 0) > 0.45, (cfg['leg'] - tLeg) * 0.45, big))
    f_shorts = np.minimum(f_shorts, np.minimum(((legW + lowW + (legLower if cfg['leg'] > 1 else 0)) - 0.4) * 0.3, (0.25 - (handW + armW)) * 0.3))
    footW = W8[:, [bidx[n] for n in ['foot.L', 'foot.R', 'lowerleg02.L', 'lowerleg02.R', 'lowerleg01.L', 'lowerleg01.R']]].sum(1)
    ankY = J('foot.L')[1]
    # skin hidden inside the separately modelled high-top sneakers
    f_shoe = np.where(footW > 0.3, (ankY + 0.075) - V[:, 1], -big)

    def clip(f):
        recipes, keyidx, tris = [], {}, []
        def vid(a_, b_, s_, ta, tb):
            if s_ <= 1e-6 or a_ == b_: k = (a_, a_, 0.0, ta, ta); b_, s_, tb = a_, 0.0, ta
            elif s_ >= 1 - 1e-6: k = (b_, b_, 0.0, tb, tb); a_, s_, ta = b_, 0.0, tb
            else:
                if a_ > b_: a_, b_, s_, ta, tb = b_, a_, 1 - s_, tb, ta
                k = (a_, b_, round(s_, 5), ta, tb)
            if k not in keyidx: keyidx[k] = len(recipes); recipes.append(k)
            return keyidx[k]
        for tv_, tt_ in zip(tris_v, tris_t):
            fv = f[tv_]
            if (fv <= 0).all(): continue
            if (fv > 0).all():
                tris.append([vid(tv_[i], tv_[i], 0, tt_[i], tt_[i]) for i in range(3)]); continue
            poly = []
            for i in range(3):
                j = (i + 1) % 3
                a_, b_ = tv_[i], tv_[j]; fa, fb = fv[i], fv[j]
                if fa > 0: poly.append(vid(a_, a_, 0, tt_[i], tt_[i]))
                if (fa > 0) != (fb > 0): poly.append(vid(a_, b_, fa / (fa - fb), tt_[i], tt_[j]))
            for k in range(1, len(poly) - 1): tris.append([poly[0], poly[k], poly[k + 1]])
        return recipes, np.array(tris, np.int64)

    def build(name, recipes, tris, offset_fn=None, color=None, rim=False):
        R_ = np.array(recipes, dtype=object)
        a_ = R_[:, 0].astype(int); b_ = R_[:, 1].astype(int); s_ = R_[:, 2].astype(float)[:, None]
        ta = R_[:, 3].astype(int); tb = R_[:, 4].astype(int)
        P0 = V[a_] * (1 - s_) + V[b_] * s_
        N0 = vn[a_] * (1 - s_) + vn[b_] * s_; N0 /= np.maximum(np.linalg.norm(N0, axis=1, keepdims=True), 1e-9)
        UV = VT[ta] * (1 - s_) + VT[tb] * s_
        Wt = W8[a_] * (1 - s_) + W8[b_] * s_
        P = P0 + (offset_fn(P0, N0, Wt) if offset_fn else 0)
        q = np.round(P * 2000).astype(np.int64)
        keys = q[:, 0] * 73856093 ^ q[:, 1] * 19349663 ^ q[:, 2] * 83492791
        uk, inv = np.unique(keys, return_inverse=True)
        acc = np.zeros((len(uk), 3))
        fa_ = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
        for k in range(3): np.add.at(acc, inv[tris[:, k]], fa_)
        N = acc[inv]; N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        C = None if color is None else (color(P0) if callable(color) else np.tile(np.array(color, np.float64), (len(P), 1)))
        Pl, Nl, UVl, Wl, I = [P], [N], [UV], [Wt], [tris]
        Cl = [C] if C is not None else None
        if rim:
            edges = {}
            for t in tris:
                for e0, e1 in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                    edges.setdefault((min(e0, e1), max(e0, e1)), []).append((e0, e1))
            bnd = [v_[0] for v_ in edges.values() if len(v_) == 1]
            n0 = len(P)
            Pl.append(P0 + N0 * 0.0015); Nl.append(-N); UVl.append(UV); Wl.append(Wt)
            if Cl is not None: Cl.append(C * 0.55)
            I.append(np.array([[e1, e0, n0 + e0] for e0, e1 in bnd] + [[e1, n0 + e0, n0 + e1] for e0, e1 in bnd], np.int64).reshape(-1, 3))
        P = np.vstack(Pl); N = np.vstack(Nl); UV = np.vstack(UVl); Wt = np.vstack(Wl); I = np.vstack(I)
        C = np.vstack(Cl) if Cl is not None else None
        top = np.argsort(-Wt, axis=1)[:, :4]
        tw = np.take_along_axis(Wt, top, 1); tw /= np.maximum(tw.sum(1, keepdims=True), 1e-9)
        part = {'name': name, 'P': P.astype(np.float32), 'N': N.astype(np.float32), 'UV': UV.astype(np.float32),
                'C': None if C is None else C.astype(np.float32), 'SI': top.astype(np.uint16), 'SW': tw.astype(np.float32), 'I': I.astype(np.uint32)}
        parts.append(part)
        return part

    covered = np.zeros(len(tris_v), bool)
    for f in (f_shirt, f_shorts, f_shoe):
        covered |= (f[tris_v] > 0.006).all(1)
    sk_rec, sk_key, sk_tris = [], {}, []
    for tv_, tt_ in zip(tris_v[~covered], tris_t[~covered]):
        row = []
        for i in range(3):
            k = (tv_[i], tt_[i])
            if k not in sk_key: sk_key[k] = len(sk_rec); sk_rec.append((tv_[i], tv_[i], 0.0, tt_[i], tt_[i]))
            row.append(sk_key[k])
        sk_tris.append(row)
    skin_part = build('skin', sk_rec, np.array(sk_tris, np.int64))

    belly = J('spine04')
    def shirt_off(P_, N_, W_):
        t = 0.012 + 0.014 * smoothstep(waistY + 0.15, pelvisY, P_[:, 1]) + 0.008 * smoothstep(0.0, 0.1, P_[:, 2] - belly[2] + 0.05)
        t = t + W_[:, armBones].sum(1) * 0.009
        o = N_ * t[:, None]
        o[:, 1] -= 0.018 * smoothstep(pelvisY + 0.06, pelvisY - 0.03, P_[:, 1])
        return o
    rec, tr = clip(f_shirt); build('shirt', rec, tr, shirt_off, cfg['shirt'], rim=True)
    def shorts_off(P_, N_, W_):
        hipY, kneeY = J('upperleg01.L')[1], J('lowerleg01.L')[1]
        return N_ * (0.016 + 0.032 * smoothstep(hipY - 0.05, kneeY + 0.14, P_[:, 1]))[:, None]
    rec, tr = clip(f_shorts); build('shorts', rec, tr, shorts_off, cfg['pants'], rim=True)
    for side in ('L', 'R'):
        parts.append(build_sneaker(V, W8, bidx, J, Jt, side, cfg['shoes']))

    # ------------------------------------------------ 3D glasses (dark rectangular frames), rigid to head
    gP, gN, gI, gC = [], [], [], []
    def tube(points, r, closed, color):
        n = len(points); seg = 6
        base = len(gP)
        for i in range(n):
            a_ = points[(i - 1) % n] if closed else points[max(0, i - 1)]; b_ = points[(i + 1) % n] if closed else points[min(n - 1, i + 1)]
            t = b_ - a_; t /= np.linalg.norm(t) + 1e-9
            u = np.cross(t, [0, 0, 1.0])
            if np.linalg.norm(u) < 1e-3: u = np.cross(t, [0, 1.0, 0])
            u /= np.linalg.norm(u); w = np.cross(t, u)
            for j in range(seg):
                ang = 2 * math.pi * j / seg; d = u * math.cos(ang) + w * math.sin(ang)
                gP.append(points[i] + d * r); gN.append(d); gC.append(color)
        m = n if closed else n - 1
        for i in range(m):
            for j in range(seg):
                a_ = base + i * seg + j; b_ = base + ((i + 1) % n) * seg + j; c_ = base + i * seg + (j + 1) % seg; d_ = base + ((i + 1) % n) * seg + (j + 1) % seg
                gI.extend([[a_, b_, c_], [c_, b_, d_]])
    zf = max(eyeL3[2], eyeR3[2]) + 0.026
    LW, LH = 0.054, 0.038
    def lens_loop(cx, cy, cz, outward):
        pts = []
        for k in range(32):
            a_ = 2 * math.pi * k / 32; ca, sa = math.cos(a_), math.sin(a_)
            u = cx + LW / 2 * np.sign(ca) * abs(ca) ** 0.42; v = cy + LH / 2 * np.sign(sa) * abs(sa) ** 0.42
            pts.append(np.array([u, v, cz - 0.006 * ((u - cx) * outward / (LW / 2) + 1) ** 2 * 0.25]))
        return pts
    ey = eyeY - 0.002
    cxL = eyeL3[0] + 0.004; cxR = eyeR3[0] - 0.004
    frame = [0.018, 0.018, 0.02]
    lensL = lens_loop(cxL, ey, zf, 1); lensR = lens_loop(cxR, ey, zf, -1)
    tube(lensL, 0.0026, True, frame); tube(lensR, 0.0026, True, frame)
    tube([np.array([cxR + LW / 2 - 0.002, ey + 0.010, zf]), np.array([0, ey + 0.012, zf + 0.003]), np.array([cxL - LW / 2 + 0.002, ey + 0.010, zf])], 0.0022, False, frame)
    earZ = eyeL3[2] - 0.088
    for side, cx in ((1, cxL), (-1, cxR)):
        hinge = np.array([cx + side * LW / 2, ey + 0.012, zf - 0.006])
        mid_ = np.array([cx + side * (LW / 2 + 0.012), ey + 0.009, (zf + earZ) / 2])
        ear = np.array([cx + side * (LW / 2 + 0.016), ey + 0.002, earZ])
        tube([hinge, mid_, ear], 0.0022, False, frame)
    lP, lN, lI = [], [], []
    for pts in (lensR, lensL):
        c = np.mean(pts, 0); b0 = len(lP); lP.append(c); lN.append([0, 0, 1])
        for p_ in pts: lP.append(p_ - [0, 0, 0.001]); lN.append([0, 0, 1])
        for k in range(len(pts)): lI.append([b0, b0 + 1 + k, b0 + 1 + (k + 1) % len(pts)])
    hb = bidx['head']
    def rigid(P_, N_, I_, C_, name):
        n = len(P_)
        parts.append({'name': name, 'P': np.array(P_, np.float32), 'N': np.array(N_, np.float32), 'UV': np.zeros((n, 2), np.float32),
                      'C': None if C_ is None else np.array(C_, np.float32), 'SI': np.tile(np.array([hb, 0, 0, 0], np.uint16), (n, 1)),
                      'SW': np.tile(np.array([1, 0, 0, 0], np.float32), (n, 1)), 'I': np.array(I_, np.uint32)})
    if cfg['glasses']:
        rigid(gP, gN, gI, gC, 'glasses')
        rigid(lP, lN, lI, None, 'lenses')
    crown = skin_part['P'][:, 1].max()
    bones_out = []
    for b in KEEP_BONES:
        par = bones[b]['parent']
        while par and par not in KEEP_BONES: par = bones[par]['parent']
        bones_out.append({'name': b, 'parent': par, 'head': [round(float(x), 5) for x in joints[b + '____head']], 'tail': [round(float(x), 5) for x in joints[b + '____tail']]})
    landmarks = {k: [round(float(x), 4) for x in v] for k, v in mh.items()}
    landmarks['eyeL'] = [round(float(x), 4) for x in eyeL3]; landmarks['eyeR'] = [round(float(x), 4) for x in eyeR3]
    landmarks['top'] = [0, float(crown), 0]
    write_model(cfg['name'], parts, bones_out, {'skin': cfg['name'] + '_skin.jpg'}, landmarks)


def write_model(name, parts, bones_out, textures, landmarks):
    blob = bytearray(); meta = []
    def push(arr):
        nonlocal blob
        while len(blob) % 4: blob += b'\0'
        off = len(blob); blob += arr.tobytes(); return off
    for p in parts:
        m = {'name': p['name'], 'count': int(len(p['P'])), 'index': [push(p['I'].astype(np.uint32)), int(p['I'].size)]}
        m['position'] = push(p['P'].astype(np.float32)); m['normal'] = push(p['N'].astype(np.float32)); m['uv'] = push(p['UV'].astype(np.float32))
        if p.get('C') is not None: m['color'] = push(p['C'].astype(np.float32))
        m['skinIndex'] = push(p['SI'].astype(np.uint16)); m['skinWeight'] = push(p['SW'].astype(np.float32))
        meta.append(m)
        print(f"  part {p['name']}: {len(p['P'])} verts {p['I'].size // 3} tris")
    open(os.path.join(OUT, name + '.bin'), 'wb').write(bytes(blob))
    json.dump({'parts': meta, 'bones': bones_out, 'textures': textures, 'landmarks': landmarks, 'bin': name + '.bin'}, open(os.path.join(OUT, name + '.json'), 'w'))
    print('wrote', name, len(blob) // 1024, 'KB')


# ----------------------------------------------------------------- Sulfur Hexafluoride (SDF skunk creature)
def build_sf6():
    from skimage.measure import marching_cubes
    def sdf_capsule(p, a, b, r):
        pa = p - a; ba = b - a
        h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
        return np.linalg.norm(pa - h[:, None] * ba, axis=1) - r
    def sdf_ell(p, c, r):
        q = (p - c) / r
        k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
    def smin(a, b, k):
        h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
        return b * (1 - h) + a * h - k * h * (1 - h)
    bones = {'root': [0, 0.42, 0], 'spine1': [0, 0.46, 0.22], 'spine2': [0, 0.47, 0.44], 'neck': [0, 0.43, 0.62], 'head': [0, 0.36, 0.76], 'jaw': [0, 0.30, 0.82],
             'tail1': [0, 0.52, -0.3], 'tail2': [0, 0.85, -0.55], 'tail3': [0, 1.15, -0.45]}
    for side, sx in (('L', 1), ('R', -1)):
        bones[f'fl1.{side}'] = [sx * 0.14, 0.36, 0.5]; bones[f'fl2.{side}'] = [sx * 0.18, 0.18, 0.56]; bones[f'fl3.{side}'] = [sx * 0.17, 0.02, 0.6]
        bones[f'bl1.{side}'] = [sx * 0.15, 0.38, -0.08]; bones[f'bl2.{side}'] = [sx * 0.19, 0.2, -0.16]; bones[f'bl3.{side}'] = [sx * 0.18, 0.02, -0.1]
    B = {k: np.array(v, np.float64) for k, v in bones.items()}
    def field(p):
        d = sdf_ell(p, np.array([0, 0.45, 0.18]), np.array([0.26, 0.24, 0.48]))
        d = smin(d, sdf_ell(p, np.array([0, 0.5, -0.12]), np.array([0.28, 0.25, 0.3])), 0.12)
        d = smin(d, sdf_capsule(p, B['spine2'], B['neck'], 0.13), 0.08)
        d = smin(d, sdf_ell(p, B['head'], np.array([0.13, 0.12, 0.17])), 0.06)
        d = smin(d, sdf_ell(p, np.array([0, 0.3, 0.9]), np.array([0.065, 0.06, 0.13])), 0.05)
        d = smin(d, sdf_ell(p, np.array([0, 0.25, 0.86]), np.array([0.075, 0.035, 0.1])), 0.03)
        d = smin(d, sdf_capsule(p, np.array([0, 0.55, -0.3]), B['tail2'], 0.15), 0.12)
        d = smin(d, sdf_ell(p, np.array([0, 0.95, -0.55]), np.array([0.3, 0.32, 0.26])), 0.15)
        d = smin(d, sdf_ell(p, np.array([0, 1.18, -0.42]), np.array([0.2, 0.18, 0.22])), 0.12)
        for side, sx in (('L', 1), ('R', -1)):
            d = smin(d, sdf_capsule(p, B[f'fl1.{side}'], B[f'fl2.{side}'], 0.06), 0.05)
            d = smin(d, sdf_capsule(p, B[f'fl2.{side}'], B[f'fl3.{side}'], 0.04), 0.03)
            d = smin(d, sdf_ell(p, B[f'fl3.{side}'] + [0, 0.01, 0.05], np.array([0.05, 0.025, 0.09])), 0.02)
            d = smin(d, sdf_capsule(p, B[f'bl1.{side}'], B[f'bl2.{side}'], 0.08), 0.06)
            d = smin(d, sdf_capsule(p, B[f'bl2.{side}'], B[f'bl3.{side}'], 0.045), 0.03)
            d = smin(d, sdf_ell(p, B[f'bl3.{side}'] + [0, 0.01, 0.06], np.array([0.055, 0.025, 0.1])), 0.02)
            d = smin(d, sdf_ell(p, B['head'] + [sx * 0.08, 0.1, -0.04], np.array([0.03, 0.05, 0.02])), 0.02)
        return d
    res = 0.012
    xs = np.arange(-0.45, 0.45, res); ys = np.arange(-0.05, 1.5, res); zs = np.arange(-0.95, 1.12, res)
    Gd = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1).reshape(-1, 3)
    vals = field(Gd).reshape(len(xs), len(ys), len(zs))
    verts, faces, normals, _ = marching_cubes(vals, 0.0, spacing=(res, res, res))
    verts = verts + np.array([xs[0], ys[0], zs[0]])
    segs = [('root', 'root', 'spine1'), ('spine1', 'spine1', 'spine2'), ('spine2', 'spine2', 'neck'), ('neck', 'neck', 'head'), ('head', 'head', 'jaw'),
            ('jaw', 'jaw', 'jaw'), ('tail1', 'tail1', 'tail2'), ('tail2', 'tail2', 'tail3'), ('tail3', 'tail3', 'tail3')]
    for side in ('L', 'R'):
        segs += [(f'fl1.{side}', f'fl1.{side}', f'fl2.{side}'), (f'fl2.{side}', f'fl2.{side}', f'fl3.{side}'), (f'fl3.{side}', f'fl3.{side}', f'fl3.{side}'),
                 (f'bl1.{side}', f'bl1.{side}', f'bl2.{side}'), (f'bl2.{side}', f'bl2.{side}', f'bl3.{side}'), (f'bl3.{side}', f'bl3.{side}', f'bl3.{side}')]
    names = [s[0] for s in segs]
    D = np.zeros((len(verts), len(segs)))
    for i, (n, a, b) in enumerate(segs):
        A = B[a]; Bb = B[b] if a != b else B[a] + [0, 0, 0.001]
        if n == 'jaw': A, Bb = np.array([0, 0.27, 0.8]), np.array([0, 0.25, 0.97])
        if n.startswith('fl3') or n.startswith('bl3'): Bb = B[a] + [0, 0, 0.12]
        if n == 'tail3': Bb = B[a] + [0, 0.15, 0.1]
        pa = verts - A; ba = Bb - A
        h = np.clip((pa @ ba) / max(ba @ ba, 1e-9), 0, 1)
        D[:, i] = np.linalg.norm(pa - h[:, None] * ba, axis=1)
    Wt = np.exp(-(D / 0.07) ** 2)
    ji = names.index('jaw')
    below = verts[:, 1] < 0.29
    Wt[~below, ji] = 0
    Wt[(verts[:, 2] > 0.8) & below, ji] *= 4
    Wt = Wt / np.maximum(Wt.sum(1, keepdims=True), 1e-9)
    top = np.argsort(-Wt, axis=1)[:, :4]
    tw = np.take_along_axis(Wt, top, 1); tw /= tw.sum(1, keepdims=True)
    P = verts
    col = np.tile(np.array([0.018, 0.018, 0.02]), (len(P), 1))
    stripe = np.exp(-((P[:, 0] / 0.025) ** 2)) * ((P[:, 2] > 0.66) & (P[:, 2] < 0.95) & (P[:, 1] > 0.33))
    zz = P[:, 2]; split = np.clip((0.6 - zz) / 0.9, 0, 1) * 0.16 + 0.02
    top_ = P[:, 1] > 0.5 - (np.clip(0.6 - zz, 0, 1) * 0.05)
    stripe = stripe + np.exp(-(((np.abs(P[:, 0]) - split) / 0.035) ** 2)) * top_ * (zz < 0.66) * (zz > -0.4)
    stripe = stripe + (P[:, 1] > 0.75) * 0.9 * np.exp(-((np.abs(P[:, 0]) / 0.18) ** 2))
    stripe = np.clip(stripe, 0, 1)
    col = col * (1 - stripe[:, None]) + np.array([0.82, 0.82, 0.78]) * stripe[:, None]
    fa = faces
    tri_n = np.cross(P[fa[:, 1]] - P[fa[:, 0]], P[fa[:, 2]] - P[fa[:, 0]])
    if (np.sum(tri_n * (P[fa[:, 0]] - P[fa].mean(1).mean(0)), axis=1) < 0).mean() > 0.5: fa = fa[:, [0, 2, 1]]
    nn = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    # marching-cubes normals point toward increasing field (inside -> outside is +), flip if needed
    if np.mean(np.sum(nn * (P - P.mean(0)), 1)) < 0: nn = -nn
    part = {'name': 'body', 'P': P.astype(np.float32), 'N': nn.astype(np.float32), 'UV': np.zeros((len(P), 2), np.float32), 'C': col.astype(np.float32),
            'SI': top.astype(np.uint16), 'SW': tw.astype(np.float32), 'I': fa.astype(np.uint32)}
    eP, eN, eI, eC = [], [], [], []
    for (ex, ey, ez, r) in [(0.075, 0.4, 0.86, 0.018), (-0.075, 0.4, 0.86, 0.018), (0.05, 0.43, 0.9, 0.01), (-0.05, 0.43, 0.9, 0.01), (0.095, 0.37, 0.8, 0.008), (-0.095, 0.37, 0.8, 0.008)]:
        b0 = len(eP)
        for i in range(7):
            th = math.pi * i / 6
            for j in range(8):
                ph = 2 * math.pi * j / 8
                n = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
                eP.append(np.array([ex, ey, ez]) + n * r); eN.append(n); eC.append([0.9, 0.88, 0.7])
        for i in range(6):
            for j in range(8):
                a = b0 + i * 8 + j; b = b0 + (i + 1) * 8 + j; c = b0 + i * 8 + (j + 1) % 8; d = b0 + (i + 1) * 8 + (j + 1) % 8
                eI += [[a, b, c], [c, b, d]]
    hb = names.index('head')
    eyes = {'name': 'eyes', 'P': np.array(eP, np.float32), 'N': np.array(eN, np.float32), 'UV': np.zeros((len(eP), 2), np.float32), 'C': np.array(eC, np.float32),
            'SI': np.tile(np.array([hb, 0, 0, 0], np.uint16), (len(eP), 1)), 'SW': np.tile(np.array([1, 0, 0, 0], np.float32), (len(eP), 1)), 'I': np.array(eI, np.uint32)}
    parent = {'root': None, 'spine1': 'root', 'spine2': 'spine1', 'neck': 'spine2', 'head': 'neck', 'jaw': 'head', 'tail1': 'root', 'tail2': 'tail1', 'tail3': 'tail2'}
    for side in ('L', 'R'):
        parent.update({f'fl1.{side}': 'spine2', f'fl2.{side}': f'fl1.{side}', f'fl3.{side}': f'fl2.{side}', f'bl1.{side}': 'root', f'bl2.{side}': f'bl1.{side}', f'bl3.{side}': f'bl2.{side}'})
    # tails of bones = head of first child (for aim constraints)
    child = {}
    for n in names:
        if parent[n] and parent[n] not in child: child[parent[n]] = n
    tails = {n: (B[child[n]] if n in child else B[n] + np.array([0, 0, 0.1])) for n in names}
    tails['jaw'] = np.array([0, 0.25, 0.97]); tails['tail3'] = B['tail3'] + np.array([0, 0.15, 0.1])
    for s_ in ('L', 'R'):
        tails[f'fl3.{s_}'] = B[f'fl3.{s_}'] + np.array([0, 0, 0.1]); tails[f'bl3.{s_}'] = B[f'bl3.{s_}'] + np.array([0, 0, 0.1])
    bones_out = [{'name': n, 'parent': parent[n], 'head': [float(x) for x in B[n]], 'tail': [float(x) for x in tails[n]]} for n in names]
    write_model('sf6', [part, eyes], bones_out, {}, {'head': [float(x) for x in B['head']], 'mouth': [0, 0.27, 0.95], 'tailTip': [0, 1.3, -0.4]})


if __name__ == '__main__':
    which = sys.argv[1:] or ['helium', 'hiker', 'sf6']
    if 'helium' in which: build_human(HELIUM_CFG)
    if 'hiker' in which: build_human(HIKER_CFG)
    if 'sf6' in which: build_sf6()
