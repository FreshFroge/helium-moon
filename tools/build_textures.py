#!/usr/bin/env python3
"""
HELIUM MOON - texture builder.

Inputs (CC0 / MIT, see CREDITS.md):
  vendor/ez-tree/src/app/public/textures/bark/*   ambientCG bark sets (CC0)
  vendor/ez-tree/src/app/public/textures/leaves/* EZ-Tree leaf sprigs (MIT)
  vendor/ez-tree/src/app/public/textures/ground/* EZ-Tree ground textures (MIT)
Everything else (leaf litter, trail loam, red clay cutbanks, mud, silt, grass cards,
reeds, moon, water normals, frost, props) is generated procedurally here, with
colours sampled from the user's Stinchcomb reference photos.

Output: assets/tex/*
"""
import os, sys, math
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EZ = os.environ.get('EZTREE_TEX', os.path.join(os.path.dirname(ROOT), 'vendor', 'ez-tree', 'src', 'app', 'public', 'textures'))
OUT = os.path.join(ROOT, 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1337)


def save_jpg(arr, name, q=86):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, optimize=True)


def save_png(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), optimize=True)


def periodic_noise(n, power=2.0, seed=0):
    """Tileable fractal noise via spectral synthesis, normalised 0..1."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.normal(size=(n, n)))
    ky = np.fft.fftfreq(n)[:, None]; kx = np.fft.fftfreq(n)[None, :]
    k = np.sqrt(kx * kx + ky * ky); k[0, 0] = 1
    f *= 1.0 / (k ** power); f[0, 0] = 0
    out = np.real(np.fft.ifft2(f))
    return (out - out.min()) / (out.max() - out.min())


def normal_from_height(h, strength):
    """Tileable normal map (OpenGL convention) from a height field."""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nx, ny, nz = -gx, gy, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return (np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5) * 255


def dilate_rgba(rgba, iters=24):
    """Bleed colour into transparent texels so mipmaps / alpha-test don't get dark fringes."""
    rgb = rgba[..., :3].astype(np.float32); a = rgba[..., 3].astype(np.float32)
    m = (a > 8).astype(np.float32)
    acc = rgb * m[..., None]; w = m.copy()
    for _ in range(iters):
        acc2 = cv2.blur(acc, (3, 3)); w2 = cv2.blur(w, (3, 3))
        fill = (w <= 0) & (w2 > 0)
        acc[fill] = acc2[fill]; w[fill] = w2[fill]
    col = np.where(w[..., None] > 0, acc / np.maximum(w[..., None], 1e-6), rgb)
    out = rgba.copy().astype(np.float32); out[..., :3] = np.where(m[..., None] > 0, rgb, col)
    return out


def load_rgba(path):
    return np.array(Image.open(path).convert('RGBA')).astype(np.float32)


# ------------------------------------------------------------------ bark
def build_bark():
    sets = {'oak': 'Bark001', 'sycamore': 'Bark006', 'cottonwood': 'Bark004', 'elm': 'Bark014', 'hackberry': 'Bark012'}
    for name, sid in sets.items():
        d = os.path.join(EZ, 'bark', f'{sid}_1K-JPG')
        col = np.array(Image.open(os.path.join(d, f'{sid}_1K-JPG_Color.jpg')).convert('RGB')).astype(np.float32)
        nor = np.array(Image.open(os.path.join(d, f'{sid}_1K-JPG_NormalGL.jpg')).convert('RGB'))
        rou = np.array(Image.open(os.path.join(d, f'{sid}_1K-JPG_Roughness.jpg')).convert('L'))
        lum = col.mean(-1, keepdims=True)
        col = (lum + (col - lum) * 0.75) * 0.72
        save_jpg(col, f'bark_{name}_c.jpg'); save_jpg(nor, f'bark_{name}_n.jpg', 90); save_jpg(np.stack([rou] * 3, -1), f'bark_{name}_r.jpg', 80)
    # eastern red cedar: shaggy reddish bark derived from Bark014
    d = os.path.join(EZ, 'bark', 'Bark014_1K-JPG')
    c = np.array(Image.open(os.path.join(d, 'Bark014_1K-JPG_Color.jpg')).convert('RGB')).astype(float) * np.array([1.05, 0.82, 0.7]) * 0.75
    Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).resize((512, 1024)).save(os.path.join(OUT, 'bark_cedar_c.jpg'), quality=86)
    Image.open(os.path.join(d, 'Bark014_1K-JPG_NormalGL.jpg')).resize((512, 1024)).save(os.path.join(OUT, 'bark_cedar_n.jpg'), quality=88)
    Image.open(os.path.join(d, 'Bark014_1K-JPG_Roughness.jpg')).convert('RGB').resize((512, 1024)).save(os.path.join(OUT, 'bark_cedar_r.jpg'), quality=80)
    print('bark done')


# ------------------------------------------------------------------ leaves
def build_leaf_clusters():
    """Composite several real leaf sprigs into one dense cluster card per species."""
    for name, n_sprigs, tint in [('oak', 7, (0.82, 0.9, 0.72)), ('ash', 8, (0.85, 0.92, 0.75)), ('aspen', 7, (0.95, 0.9, 0.7)),
                                 ('bush', 9, (0.7, 0.85, 0.62)), ('cedar', 9, (0.55, 0.7, 0.6))]:
        src = {'bush': 'ash', 'cedar': 'pine'}.get(name, name)
        rgba = load_rgba(os.path.join(EZ, 'leaves', f'{src}.png'))
        N = 1024
        acc = np.zeros((N, N, 4), np.float32)
        r = np.random.default_rng(abs(hash(name)) & 0xffff if False else sum(map(ord, name)))
        for k in range(n_sprigs):
            M = cv2.getRotationMatrix2D((512, 512), r.uniform(0, 360), r.uniform(0.55, 0.85))
            M[0, 2] += r.uniform(-170, 170); M[1, 2] += r.uniform(-170, 170)
            w = cv2.warpAffine(rgba, M, (N, N), flags=cv2.INTER_LINEAR)
            a = w[..., 3:4] / 255.0
            col = w[..., :3] * r.uniform(0.7, 1.05) * np.array(tint)
            acc[..., :3] = acc[..., :3] * (1 - a) + col * a
            acc[..., 3] = np.maximum(acc[..., 3], w[..., 3])
        yy, xx = np.mgrid[0:N, 0:N]; rr = np.hypot(xx - N / 2, yy - N / 2) / (N / 2)
        acc[..., 3] *= np.clip((1.02 - rr) * 4, 0, 1)
        acc = dilate_rgba(acc, 30)
        Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'leafc_{name}.png'), optimize=True)
    print('leaf clusters done')


def leaf_pieces():
    """Cut individual leaves out of the sprig textures for the litter generator."""
    pieces = []
    for name in ['oak', 'ash', 'aspen']:
        rgba = load_rgba(os.path.join(EZ, 'leaves', f'{name}.png'))
        a = rgba[..., 3] > 100
        a2 = ndimage.binary_opening(a, structure=np.ones((7, 7)))
        lab, n = ndimage.label(a2)
        for i, sl in enumerate(ndimage.find_objects(lab)):
            m = lab[sl] == (i + 1)
            if m.sum() < 600 or m.sum() > 40000: continue
            m = ndimage.binary_dilation(m, iterations=3) & a[sl]
            pieces.append((m.astype(np.float32), rgba[sl][..., :3].mean(-1) / 255.0))
    return pieces


# ------------------------------------------------------------------ ground
def build_ground():
    N = 1024
    dirt = np.array(Image.open(os.path.join(EZ, 'ground', 'dirt_color.jpg')).convert('RGB').resize((N, N))).astype(np.float32)
    dirt_n = np.array(Image.open(os.path.join(EZ, 'ground', 'dirt_normal.jpg')).convert('RGB').resize((N, N))).astype(np.float32)
    grass = np.array(Image.open(os.path.join(EZ, 'ground', 'grass.jpg')).convert('RGB').resize((N, N))).astype(np.float32)

    # trail: pale tan / orange sandy loam of the reference photos
    n1 = periodic_noise(N, 2.2, 3); n1b = periodic_noise(N, 1.5, 4)
    lum = dirt.mean(-1); lum = (lum - lum.mean()) / (lum.std() + 1e-6)
    target = np.array([176, 143, 104], np.float32)
    trail = target[None, None, :] * (1 + lum[..., None] * 0.16) * (0.9 + 0.2 * n1[..., None])
    trail *= 1 + (n1b[..., None] - 0.5) * np.array([0.10, 0.02, -0.08])
    crumbs = periodic_noise(N, 0.6, 14) > 0.83
    trail[crumbs] *= 0.8
    save_jpg(trail, 'ground_trail_c.jpg'); save_jpg(dirt_n, 'ground_trail_n.jpg', 90)

    # red clay cutbank with strata, rills and exposed roots
    c1 = periodic_noise(N, 2.0, 15); c2 = periodic_noise(N, 1.4, 16)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    strata = np.sin((yy / N) * 2 * np.pi * 9 + c1 * 6) * 0.5 + 0.5
    streaks = cv2.resize(cv2.resize(periodic_noise(N, 1.0, 17), (N, 32)), (N, N), interpolation=cv2.INTER_CUBIC)
    clay = np.array([150, 98, 66], np.float32)[None, None, :] * (0.78 + 0.22 * strata[..., None]) * (0.85 + 0.3 * c2[..., None]) * (0.85 + 0.3 * streaks[..., None])
    hcl = strata * 0.3 + streaks * 0.5 + c2 * 0.2
    for k in range(70):
        x = rng.uniform(0, N); y = rng.uniform(0, N); a = rng.uniform(0.6, 2.5); L = rng.uniform(60, 260); w = rng.uniform(1, 4)
        pts = np.array([(x + np.cos(a) * L * t + np.sin(t * 9 + k) * 8, y + np.sin(a) * L * t) for t in np.linspace(0, 1, 40)]).astype(np.int32)
        for dx in (-N, 0, N):
            for dy in (-N, 0, N):
                cv2.polylines(clay, [pts + np.array([dx, dy])], False, (62, 46, 34), int(w), cv2.LINE_AA)
                cv2.polylines(hcl, [pts + np.array([dx, dy])], False, 1.0, int(w) + 1, cv2.LINE_AA)
    save_jpg(clay, 'ground_clay_c.jpg'); save_jpg(normal_from_height(hcl, 12), 'ground_clay_n.jpg', 90)

    # mud: dark, smooth, wet
    n2 = periodic_noise(N, 2.6, 5)
    mud = dirt * 0.42 * np.array([0.95, 0.92, 0.86]) * (0.8 + 0.4 * n2[..., None])
    h = periodic_noise(N, 2.8, 6) * 0.6 + periodic_noise(N, 1.6, 7) * 0.08
    save_jpg(mud, 'ground_mud_c.jpg'); save_jpg(normal_from_height(h, 18), 'ground_mud_n.jpg', 90)

    # grass (field / clearing ground)
    hg = cv2.cvtColor(grass.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    save_jpg(grass * np.array([0.92, 0.9, 0.75]), 'ground_grass_c.jpg'); save_jpg(normal_from_height(hg, 6), 'ground_grass_n.jpg', 90)

    # silt / sand bars with dried-mud polygons (voronoi)
    s1 = periodic_noise(N, 2.4, 9); s2 = periodic_noise(N, 1.2, 10)
    silt = np.stack([170 + 36 * s1 + 12 * s2, 148 + 32 * s1 + 10 * s2, 108 + 26 * s1 + 8 * s2], -1) * 0.9
    pts = rng.uniform(0, N, (260, 2))
    tiled = np.concatenate([pts + np.array([dx, dy]) for dx in (-N, 0, N) for dy in (-N, 0, N)])
    q = np.stack([xx.ravel(), yy.ravel()], -1)
    q = q + (np.stack([periodic_noise(N, 2.0, 12), periodic_noise(N, 2.0, 13)], -1).reshape(-1, 2) - 0.5) * 18
    dd, _ = cKDTree(tiled).query(q, k=2)
    edge = (dd[:, 1] - dd[:, 0]).reshape(N, N)
    cracks = np.clip(1.0 - edge / 2.2, 0, 1)
    silt *= (1.0 - cracks[..., None] * 0.35)
    hs = s1 * 0.5 + s2 * 0.1 - cracks * 0.25 + np.clip(edge / 30, 0, 1) * 0.1
    save_jpg(silt, 'ground_silt_c.jpg'); save_jpg(normal_from_height(hs, 10), 'ground_silt_n.jpg', 90)

    # leaf litter (forest floor) - scatter recoloured real leaves over dark soil
    pieces = leaf_pieces()
    col = dirt * 0.55 * np.array([0.95, 0.85, 0.75]); height = periodic_noise(N, 2.5, 21) * 0.15
    palette = np.array([[118, 82, 48], [96, 64, 38], [140, 104, 62], [80, 56, 36], [126, 92, 52], [150, 120, 70],
                        [104, 72, 52], [70, 50, 34], [132, 84, 46], [112, 98, 60]], np.float32)
    count = 2600
    for k in range(count):
        m, lum2 = pieces[rng.integers(len(pieces))]
        mh_, mw = m.shape
        M = cv2.getRotationMatrix2D((mw / 2, mh_ / 2), rng.uniform(0, 360), rng.uniform(0.22, 0.42))
        cos, sin = abs(M[0, 0]), abs(M[0, 1])
        nw, nh = int(mh_ * sin + mw * cos) + 2, int(mh_ * cos + mw * sin) + 2
        M[0, 2] += nw / 2 - mw / 2; M[1, 2] += nh / 2 - mh_ / 2
        mm = cv2.warpAffine(m, M, (nw, nh), flags=cv2.INTER_LINEAR)
        ll = cv2.warpAffine(lum2, M, (nw, nh), flags=cv2.INTER_LINEAR)
        if mm.max() < 0.5: continue
        c = palette[rng.integers(len(palette))] * rng.uniform(0.75, 1.15)
        dist = ndimage.distance_transform_edt(mm > 0.5); curl = dist / (dist.max() + 1e-6)
        x0 = rng.integers(N); y0 = rng.integers(N)
        ys = (np.arange(nh) + y0) % N; xs = (np.arange(nw) + x0) % N
        sub_c = col[np.ix_(ys, xs)]; sub_h = height[np.ix_(ys, xs)]
        a = mm[..., None]
        sub_c = sub_c * (1 - a) + (c * (0.55 + 0.6 * ll[..., None])) * a
        sub_h = np.where(mm > 0.5, np.maximum(sub_h, 0.2 + 0.8 * k / count + 0.08 * curl), sub_h)
        col[np.ix_(ys, xs)] = sub_c; height[np.ix_(ys, xs)] = sub_h
    for k in range(140):
        L = rng.uniform(40, 160); ang = rng.uniform(0, math.pi)
        x0, y0 = rng.uniform(0, N), rng.uniform(0, N)
        t = np.linspace(0, 1, int(L))
        xs = (x0 + np.cos(ang) * L * t + np.sin(t * 6 + k) * 3).astype(int) % N
        ys = (y0 + np.sin(ang) * L * t).astype(int) % N
        for dx in (-1, 0, 1):
            col[ys, (xs + dx) % N] = col[ys, (xs + dx) % N] * 0.3 + np.array([70, 52, 36]) * 0.7
            height[ys, (xs + dx) % N] = 1.05
    blur = ndimage.gaussian_filter(height, 6, mode='wrap')
    col *= np.clip((height - blur) * 2.2 + 0.85, 0.45, 1.1)[..., None]
    save_jpg(col, 'ground_litter_c.jpg'); save_jpg(normal_from_height(height, 14), 'ground_litter_n.jpg', 90)
    print('ground done')


# ------------------------------------------------------------------ grass / reed cards
def build_grass_cards():
    W, H = 512, 512
    img = np.zeros((H, W, 4), np.float32)
    for i in range(170):
        x0 = rng.uniform(10, W - 10); h = rng.uniform(0.45, 0.98) * H
        lean = rng.uniform(-0.35, 0.35); w0 = rng.uniform(2.0, 4.5)
        col = np.array([rng.uniform(95, 140), rng.uniform(100, 135), rng.uniform(55, 80)])
        if rng.random() < 0.35: col = np.array([rng.uniform(130, 175), rng.uniform(115, 150), rng.uniform(70, 95)])
        steps = int(h)
        for s in range(steps):
            t = s / steps; y = H - 1 - s
            x = x0 + lean * (t ** 1.6) * h * 0.5
            w = w0 * (1 - t) ** 0.8 + 0.4
            for xi in range(max(0, int(x - w)), min(W, int(x + w) + 1)):
                cov = np.clip(w - abs(xi + 0.5 - x), 0, 1)
                if cov > img[y, xi, 3] * 0.5:
                    img[y, xi, :3] = col * (0.55 + 0.45 * t) * (0.85 + 0.3 * (xi - x) / (w + 1e-3) * 0.5)
                    img[y, xi, 3] = max(img[y, xi, 3], cov * 255)
        if rng.random() < 0.12:
            cv2.ellipse(img, (int(x0 + lean * h * 0.5), int(H - h + 14)), (2, 16), 0, 0, 360, (128, 110, 80, 255), -1)
    save_png(dilate_rgba(img), 'grass_card.png')
    W, H = 256, 512
    img = np.zeros((H, W, 4), np.float32)
    for i in range(46):
        x0 = rng.uniform(8, W - 8); h = rng.uniform(0.55, 0.98) * H; lean = rng.uniform(-0.12, 0.12)
        w0 = rng.uniform(2.5, 4.5)
        col = np.array([rng.uniform(80, 110), rng.uniform(90, 115), rng.uniform(50, 70)])
        for s in range(int(h)):
            t = s / h; y = H - 1 - s; x = x0 + lean * t * h * 0.4; w = w0 * (1 - t * 0.85)
            for xi in range(max(0, int(x - w)), min(W, int(x + w) + 1)):
                cov = np.clip(w - abs(xi + 0.5 - x), 0, 1)
                img[y, xi, :3] = col * (0.6 + 0.4 * t); img[y, xi, 3] = max(img[y, xi, 3], cov * 255)
        if rng.random() < 0.45:
            cv2.ellipse(img, (int(x0 + lean * h * 0.36), int(H - h * 0.86)), (5, 26), 0, 0, 360, (72, 48, 30, 255), -1)
    save_png(dilate_rgba(img), 'reed_card.png')
    print('grass cards done')


# ------------------------------------------------------------------ moon (near-side albedo)
def build_moon():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    u = (xx - N / 2) / (N / 2); v = (yy - N / 2) / (N / 2)
    r = np.sqrt(u * u + v * v)
    alb = np.full((N, N), 0.62, np.float32)
    alb += (periodic_noise(N, 2.0, 41) - 0.5) * 0.14 + (periodic_noise(N, 1.3, 42) - 0.5) * 0.08
    maria = [(-0.40, -0.42, 0.30, 0.24, 0.0), (-0.62, -0.05, 0.28, 0.48, 0.2), (0.20, -0.36, 0.16, 0.15, 0.0), (0.33, -0.10, 0.20, 0.17, 0.3),
             (0.68, -0.30, 0.10, 0.12, 0.0), (0.52, 0.18, 0.15, 0.13, 0.2), (0.40, 0.42, 0.10, 0.09, 0.0), (-0.30, 0.35, 0.22, 0.14, -0.2),
             (-0.55, 0.40, 0.12, 0.10, 0.0), (0.05, -0.62, 0.32, 0.07, 0.0), (0.0, 0.05, 0.10, 0.08, 0.0), (-0.08, -0.15, 0.10, 0.08, 0.0)]
    w1 = periodic_noise(N, 2.2, 43) - 0.5; w2 = periodic_noise(N, 2.2, 44) - 0.5
    uw = u + w1 * 0.32; vw = v + w2 * 0.32
    field = np.zeros_like(u)
    for cx, cy, rx, ry, rot in maria:
        c, s = math.cos(rot), math.sin(rot)
        du = (uw - cx) * c + (vw - cy) * s; dv = -(uw - cx) * s + (vw - cy) * c
        field = np.maximum(field, np.exp(-((du / (rx * 1.3)) ** 2 + (dv / (ry * 1.3)) ** 2) * 1.3))
    edge = periodic_noise(N, 1.4, 45) - 0.5
    mare = np.clip((field + edge * 0.3 - 0.22) / 0.42, 0, 1)
    mare = mare * mare * (3 - 2 * mare)
    alb -= mare * 0.26 * (0.75 + 0.5 * periodic_noise(N, 2.6, 46))
    for i in range(260):
        cx, cy = rng.uniform(-1, 1, 2); rad = rng.uniform(0.004, 0.022)
        if rng.random() < 0.08: rad *= 2.2
        d = np.sqrt((u - cx) ** 2 + (v - cy) ** 2) / rad
        fresh = rng.random() < 0.25
        alb += np.exp(-((d - 1.0) ** 2) / 0.05) * (0.02 if not fresh else 0.05)
        alb += np.exp(-(d / 0.8) ** 2) * (0.06 if fresh else -0.015)
    alb += np.clip(v, 0, 1) * 0.05
    for (cx, cy, rr, rays) in [(-0.12, 0.70, 0.035, 22), (-0.32, -0.12, 0.04, 12), (-0.62, -0.18, 0.02, 8)]:
        d = np.sqrt((u - cx) ** 2 + (v - cy) ** 2)
        alb += np.exp(-(d / rr) ** 2) * 0.18
        ang = np.arctan2(v - cy, u - cx)
        for k in range(rays):
            a0 = rng.uniform(-math.pi, math.pi); w = rng.uniform(0.01, 0.03); L = rng.uniform(0.3, 0.9)
            da = np.angle(np.exp(1j * (ang - a0)))
            alb += np.exp(-(da / w) ** 2) * np.clip(1 - d / L, 0, 1) * 0.05
    alb = np.clip(alb, 0.12, 1.0); alb[r > 1.0] = 0
    out = np.stack([alb * 255 * 0.98, alb * 255 * 0.98, alb * 255], -1)
    save_png(np.dstack([out, np.clip((1.0 - r) * N * 0.5, 0, 1) * 255]), 'moon.png')
    print('moon done')


# ------------------------------------------------------------------ water normals, frost
def build_misc():
    N = 512
    h = periodic_noise(N, 2.2, 61) * 0.6 + periodic_noise(N, 1.6, 62) * 0.2
    save_png(normal_from_height(h, 22), 'water_n.png')
    F = 512
    img = np.zeros((F, F), np.float32)
    for i in range(900):
        x, y = rng.uniform(0, F, 2); L = rng.uniform(8, 60); a = rng.uniform(0, math.pi)
        for k in range(6):
            aa = a + k * math.pi / 3
            x1, y1 = x + math.cos(aa) * L, y + math.sin(aa) * L
            cv2.line(img, (int(x), int(y)), (int(x1), int(y1)), rng.uniform(0.3, 1.0), 1, cv2.LINE_AA)
            for b in range(3):
                t = rng.uniform(0.3, 0.9); bx, by = x + (x1 - x) * t, y + (y1 - y) * t
                ba = aa + rng.choice([-1, 1]) * math.pi / 3; bl = L * rng.uniform(0.15, 0.35)
                cv2.line(img, (int(bx), int(by)), (int(bx + math.cos(ba) * bl), int(by + math.sin(ba) * bl)), 0.5, 1, cv2.LINE_AA)
    img = cv2.GaussianBlur(img, (0, 0), 0.6) + cv2.GaussianBlur(img, (0, 0), 3) * 0.6
    img = np.clip(img + periodic_noise(F, 1.8, 63) * 0.25, 0, 1)
    save_png(np.dstack([np.full((F, F, 3), 235), img * 255]), 'frost.png')
    print('misc done')


# ------------------------------------------------------------------ props
def build_props():
    N = 512
    g = periodic_noise(N, 1.2, 71); g2 = periodic_noise(N, 2.4, 72)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    board = (xx // 64).astype(int)
    grain = np.sin(xx * 0.9 + g * 40 + board * 3.1) * 0.5 + 0.5
    base = np.stack([128 + 0 * xx, 122 + 0 * xx, 110 + 0 * xx], -1)
    tone = (0.75 + 0.25 * g2)[..., None] * (0.85 + 0.15 * grain[..., None])
    for b in range(8): tone[board == b] *= rng.uniform(0.8, 1.1)
    seam = (xx % 64) < 2
    wood = base * tone; wood[seam] *= 0.35
    h = grain * 0.3 + g2 * 0.3 - seam * 0.8
    for b in range(8):
        for y in (40, 470): cv2.circle(wood, (b * 64 + 32, y), 3, (60, 58, 55), -1)
    save_jpg(wood, 'wood_c.jpg'); save_jpg(normal_from_height(h, 6), 'wood_n.jpg', 88)
    c = periodic_noise(N, 2.0, 73); c2 = periodic_noise(N, 0.8, 74)
    conc = np.stack([150 + 30 * c + 10 * c2] * 3, -1) * np.array([1.0, 0.98, 0.94])
    conc *= (0.65 + 0.35 * np.clip(periodic_noise(N, 2.5, 75) * 1.4, 0, 1))[..., None]
    save_jpg(conc, 'concrete_c.jpg'); save_jpg(normal_from_height(c * 0.4 + c2 * 0.3, 4), 'concrete_n.jpg', 88)
    corr = np.sin(xx / N * 2 * np.pi * 16) * 0.5 + 0.5
    save_jpg(normal_from_height(corr * 3.0, 3), 'corrugated_n.jpg', 88)
    rust = periodic_noise(N, 2.2, 76)
    mc = np.stack([120 + 0 * xx, 124 + 0 * xx, 126 + 0 * xx], -1) * (0.8 + 0.2 * periodic_noise(N, 1.0, 77))[..., None]
    rmask = np.clip((rust - 0.55) * 4, 0, 1)[..., None]
    save_jpg(mc * (1 - rmask) + np.array([110, 62, 34]) * rmask, 'metal_c.jpg')
    gr = periodic_noise(N, 0.3, 78); gr2 = periodic_noise(N, 1.5, 79)
    gran = np.stack([140 + 50 * gr + 20 * gr2] * 3, -1) * np.array([0.98, 0.98, 1.0])
    gran[periodic_noise(N, 0.05, 80) > 0.8] *= 0.45
    save_jpg(gran, 'granite_c.jpg')
    gv = np.zeros((N, N, 3), np.float32) + np.array([110, 104, 96])
    for i in range(5000):
        x, y = rng.integers(0, N, 2); r = rng.integers(2, 7); col = rng.uniform(80, 190)
        cv2.circle(gv, (int(x), int(y)), int(r), (col * 1.0, col * 0.96, col * 0.9), -1)
    gv = cv2.GaussianBlur(gv, (3, 3), 0.8)
    save_jpg(gv, 'gravel_c.jpg')
    save_jpg(normal_from_height(cv2.cvtColor(gv.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255, 8), 'gravel_n.jpg', 88)
    print('props done')


if __name__ == '__main__':
    which = sys.argv[1:] or ['bark', 'leaves', 'ground', 'cards', 'moon', 'misc', 'props']
    if 'bark' in which: build_bark()
    if 'leaves' in which: build_leaf_clusters()
    if 'ground' in which: build_ground()
    if 'cards' in which: build_grass_cards()
    if 'moon' in which: build_moon()
    if 'misc' in which: build_misc()
    if 'props' in which: build_props()
