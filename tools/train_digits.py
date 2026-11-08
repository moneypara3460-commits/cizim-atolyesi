import numpy as np, math, random, json
from sklearn.datasets import load_digits
from sklearn.neural_network import MLPClassifier
from PIL import Image, ImageDraw, ImageFont, ImageFilter
rng = np.random.default_rng(1); random.seed(1)
S = 16
def norm_glyph(a):
    # a: 2D float [0,1] mürekkep. bbox kırp, en-boy oranını koruyarak 14x14'e sığdır, 16x16 ortala
    ys, xs = np.where(a > 0.25)
    if len(xs) == 0: return np.zeros((S, S), np.float32)
    a = a[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = a.shape; k = 14 / max(h, w)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    im = Image.fromarray((a * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR)
    out = np.zeros((S, S), np.float32)
    ox, oy = (S - nw) // 2, (S - nh) // 2
    out[oy:oy+nh, ox:ox+nw] = np.asarray(im, np.float32) / 255
    m = out.max()
    return out / m if m > 0 else out
def augment(img):  # img PIL L 64x64, mürekkep beyaz
    ang = random.uniform(-14, 14); sh = random.uniform(-0.25, 0.25)
    img = img.rotate(ang, resample=Image.BILINEAR)
    img = img.transform(img.size, Image.AFFINE, (1, sh, -sh * 32, 0, random.uniform(0.85, 1.15), 0), resample=Image.BILINEAR)
    r = random.random()
    if r < 0.3: img = img.filter(ImageFilter.MaxFilter(3))
    elif r < 0.45: img = img.filter(ImageFilter.MinFilter(3)) if np.asarray(img).sum() > 40000 else img
    a = np.asarray(img, np.float32) / 255
    a = np.clip(a * random.uniform(0.8, 1.2), 0, 1)
    return a
X, Y = [], []
# 1) UCI el yazısı rakamlar (8x8) -> 64x64'e büyüt
d = load_digits()
idx = np.arange(len(d.target)); rng.shuffle(idx)
test_idx, train_idx = idx[:300], idx[300:]
def uci_img(i):
    a = (d.images[i] / 16 * 255).astype(np.uint8)
    return Image.fromarray(a).resize((64, 64), Image.BICUBIC)
for i in train_idx:
    for _ in range(6):
        X.append(norm_glyph(augment(uci_img(i))).ravel()); Y.append(d.target[i])
# 2) kalem darbeli sentetik rakamlar (elle yazıya benzer)
STROKES = {
 0: [[(.5,0),(.15,.2),(.1,.5),(.2,.85),(.5,1),(.8,.85),(.9,.5),(.85,.2),(.5,0)]],
 1: [[(.3,.2),(.55,0),(.55,1)], [(.55,0),(.55,1)]],
 2: [[(.15,.25),(.35,.03),(.65,0),(.85,.2),(.8,.45),(.15,1),(.9,1)]],
 3: [[(.15,.1),(.5,0),(.85,.15),(.8,.4),(.45,.5),(.85,.6),(.9,.85),(.5,1),(.12,.9)]],
 4: [[(.65,1),(.65,0),(.1,.7),(.95,.7)]],
 5: [[(.85,0),(.2,0),(.15,.45),(.55,.38),(.85,.55),(.85,.85),(.5,1),(.12,.9)]],
 6: [[(.75,.02),(.35,.15),(.15,.5),(.18,.85),(.5,1),(.82,.85),(.82,.6),(.5,.45),(.18,.6)]],
 7: [[(.1,0),(.9,0),(.45,1)], [(.1,0),(.9,0),(.6,.5),(.4,1)]],
 8: [[(.5,.48),(.2,.3),(.25,.08),(.5,0),(.75,.08),(.8,.3),(.5,.48),(.15,.7),(.2,.92),(.5,1),(.8,.92),(.85,.7),(.5,.48)]],
 9: [[(.82,.4),(.5,.55),(.2,.42),(.2,.12),(.5,0),(.8,.12),(.82,.4),(.75,1)]],
}
def smooth(pts, n=40):
    pts = np.array(pts); out = []
    for i in range(len(pts)-1):
        for t in np.linspace(0, 1, 8, endpoint=False): out.append(pts[i]*(1-t)+pts[i+1]*t)
    out.append(pts[-1]); out = np.array(out)
    k = np.ones(3)/3
    if len(out) > 3: out = np.stack([np.convolve(out[:,0], k, 'same'), np.convolve(out[:,1], k, 'same')], 1); out[0]=pts[0]; out[-1]=pts[-1]
    return out
def stroke_img(dg):
    tpl = random.choice(STROKES[dg])
    pts = [(x + random.uniform(-.07,.07), y + random.uniform(-.05,.05)) for x, y in tpl]
    p = smooth(pts)
    wsc = random.uniform(0.55, 1.0)
    im = Image.new('L', (64, 64), 0); dr = ImageDraw.Draw(im)
    xy = [(12 + (x - .5) * 40 * wsc + 20, 8 + y * 48) for x, y in p]
    dr.line(xy, fill=255, width=random.randint(3, 7), joint='curve')
    return im
for dg in range(10):
    for _ in range(900):
        X.append(norm_glyph(augment(stroke_img(dg))).ravel()); Y.append(dg)
# 3) yazı tipleri
fonts = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf','/usr/share/fonts/truetype/freefont/FreeSans.ttf',
         '/usr/share/fonts/truetype/freefont/FreeMono.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf','/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf']
for f in fonts:
    F = ImageFont.truetype(f, 48)
    for dg in range(10):
        for _ in range(60):
            im = Image.new('L', (64, 64), 0); ImageDraw.Draw(im).text((14, 0), str(dg), fill=255, font=F)
            X.append(norm_glyph(augment(im)).ravel()); Y.append(dg)
X = np.array(X, np.float32); Y = np.array(Y)
print('train', X.shape)
clf = MLPClassifier(hidden_layer_sizes=(96,), alpha=1e-3, max_iter=60, random_state=0, early_stopping=True, validation_fraction=0.08)
clf.fit(X, Y)
Xt = np.array([norm_glyph(np.asarray(uci_img(i), np.float32)/255).ravel() for i in test_idx]); Yt = d.target[test_idx]
print('UCI test acc', (clf.predict(Xt) == Yt).mean())
St = []; Sy = []
for dg in range(10):
    for _ in range(100): St.append(norm_glyph(augment(stroke_img(dg))).ravel()); Sy.append(dg)
print('stroke test acc', (clf.predict(np.array(St)) == np.array(Sy)).mean())
W1, b1 = clf.coefs_[0], clf.intercepts_[0]; W2, b2 = clf.coefs_[1], clf.intercepts_[1]
r = lambda a: [round(float(v), 4) for v in np.asarray(a).ravel()]
js = '// El yazısı rakam tanıyıcı (16x16 girdi, 96 gizli, ReLU, 10 çıktı). tools/train_digits.py ile eğitildi:\n// UCI el yazısı rakamlar (sklearn) + kalem darbeli sentetik rakamlar + yazı tipleri, büyütmeli.\n'
js += 'export const DIGIT_NET = ' + json.dumps({'n_in': 256, 'n_h': 96, 'W1': r(W1), 'b1': r(b1), 'W2': r(W2), 'b2': r(b2)}, separators=(',', ':')) + ';\n'
open('/home/claude/cizim-atolyesi/digits-model.js', 'w').write(js)
print('js KB', len(js) // 1024)
