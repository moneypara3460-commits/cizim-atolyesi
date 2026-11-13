// Parmakla kontrol — yapay işaretçi. Motorun (gestures.js) olaylarını gerçek fare gibi sayfaya verir:
// pointermove / pointerdown / pointerup / pointercancel + click + wheel. Uygulamanın kendi işleyicileri (3B sahne, kroki,
// 2B çizim, tekstil tuvalleri, düğmeler) hiçbir değişiklik olmadan bu olayları alır; çizim motoru yeniden yazılmadı.
// Tarayıcı, betikle üretilen işaretçi için setPointerCapture çağrısını reddeder (NotFoundError). Tuvaller bunu çağırdığı
// için, yalnız bu işaretçi kimliğine özel küçük bir yakalama öykünmesi kurulur; kontrol kapanınca geri alınır.

export const HAND_POINTER_ID = 7341;

export class SyntheticPointer {
  constructor(doc = document) {
    this.doc = doc; this.win = doc.defaultView;
    this.down = false; this.captured = null; this.downTarget = null; this.downAt = null; this.x = 0; this.y = 0;
    this.installed = false; this.ignore = null;   // ignore(el) → true: bu öğe hedef olamaz
  }

  /* ---- yakalama öykünmesi ---- */
  install() {
    if (this.installed) return;
    const P = this.win.Element.prototype, self = this;
    this.orig = { set: P.setPointerCapture, rel: P.releasePointerCapture, has: P.hasPointerCapture };
    this.patch = {
      set(id) { if (id === HAND_POINTER_ID) { if (self.down) self.captured = this; return; } return self.orig.set.call(this, id); },
      rel(id) { if (id === HAND_POINTER_ID) { if (self.captured === this) self.captured = null; return; } return self.orig.rel.call(this, id); },
      has(id) { if (id === HAND_POINTER_ID) return self.captured === this; return self.orig.has.call(this, id); },
    };
    P.setPointerCapture = this.patch.set; P.releasePointerCapture = this.patch.rel; P.hasPointerCapture = this.patch.has;
    this.installed = true;
  }
  uninstall() {
    if (!this.installed) return;
    this.cancel();
    const P = this.win.Element.prototype;
    // başka bir kod aynı işlevleri sonradan değiştirdiyse ona dokunma
    if (P.setPointerCapture === this.patch.set) P.setPointerCapture = this.orig.set;
    if (P.releasePointerCapture === this.patch.rel) P.releasePointerCapture = this.orig.rel;
    if (P.hasPointerCapture === this.patch.has) P.hasPointerCapture = this.orig.has;
    this.installed = false;
  }

  /* ---- hedef ve olay ---- */
  hit(x, y) {
    const w = this.win, cx = Math.max(0, Math.min(w.innerWidth - 1, x)), cy = Math.max(0, Math.min(w.innerHeight - 1, y));
    let el = this.doc.elementFromPoint(cx, cy);
    if (el && this.ignore && this.ignore(el)) el = null;
    return el || this.doc.body;
  }
  fire(type, target, x, y, extra = {}) {
    if (!target || !target.isConnected) target = this.doc.body;
    const init = {
      bubbles: true, cancelable: type !== 'pointercancel', composed: true, view: this.win,
      clientX: x, clientY: y, screenX: x + (this.win.screenX || 0), screenY: y + (this.win.screenY || 0),
      pointerId: HAND_POINTER_ID, pointerType: 'mouse', isPrimary: true, width: 1, height: 1,
      button: -1, buttons: this.down ? 1 : 0, pressure: this.down ? 0.5 : 0, ...extra,
    };
    const E = type === 'click' ? this.win.MouseEvent : type === 'wheel' ? this.win.WheelEvent : this.win.PointerEvent;
    const ev = new E(type, init);
    try { target.dispatchEvent(ev); } catch (e) { /* uygulama işleyicisindeki hata kontrol döngüsünü durdurmasın */ console.error(e); }
    return ev;
  }

  move(x, y) {
    this.x = x; this.y = y;
    this.fire('pointermove', this.captured || this.hit(x, y), x, y);
  }
  press(x, y) {
    if (this.down) return;
    this.x = x; this.y = y;
    const target = this.hit(x, y);
    this.down = true; this.downTarget = target; this.downAt = [x, y]; this.captured = null;
    this.fire('pointerdown', target, x, y, { button: 0, buttons: 1 });
  }
  release(x, y) {
    if (!this.down) return;
    this.x = x; this.y = y;
    const over = this.hit(x, y), target = this.captured || over, dt = this.downTarget, at = this.downAt;
    this.down = false;
    this.fire('pointerup', target, x, y, { button: 0, buttons: 0 });
    this.captured = null; this.downTarget = null; this.downAt = null;
    // dokunma: aynı öğede basılıp bırakıldıysa gerçek farede olduğu gibi click de gider (düğmeler, sekmeler)
    if (dt && dt.isConnected && Math.hypot(x - at[0], y - at[1]) <= 10) {
      const c = dt === over ? dt : dt.contains(over) ? dt : over.contains(dt) ? over : null;
      if (c) {
        const f = c.closest ? c.closest('input, select, textarea, button, [tabindex]') : null;
        if (f && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (e) { /* */ } }
        this.fire('click', c, x, y, { button: 0, buttons: 0, detail: 1 });
      }
    }
  }
  cancel() {
    if (!this.down) return;
    const target = this.captured || this.downTarget;
    this.down = false;
    this.fire('pointercancel', target, this.x, this.y, { button: 0, buttons: 0 });
    this.captured = null; this.downTarget = null; this.downAt = null;
  }
  // dir: +1 aşağı / uzaklaş, −1 yukarı / yakınlaş. Tuval kendi işlemezse en yakın kaydırılabilir öğe kaydırılır.
  scroll(x, y, dir) {
    const target = this.hit(x, y);
    const ev = this.fire('wheel', target, x, y, { deltaY: dir * 100, deltaMode: 0, buttons: 0 });
    if (ev.defaultPrevented) return;
    for (let el = target; el && el !== this.doc.documentElement; el = el.parentElement) {
      const st = this.win.getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) { el.scrollTop += dir * 60; return; }
    }
    this.win.scrollBy(0, dir * 60);
  }
}
