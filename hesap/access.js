// Erişim hesabı (saf fonksiyonlar; testlerde Node'da çalışır).
import { SECTIONS } from './plans.js';

const DAY = 864e5;

// my_access() yanıtından: hangi bölümler, ne zamana kadar açık
export function computeAccess(a, now = Date.now()) {
  const trialEnd = Date.parse(a?.trial_ends_at || '') || 0;
  const onTrial = trialEnd > now;
  const until = {};   // bölüm → bitiş zamanı (ms)
  const subs = [];
  for (const s of a?.subscriptions || []) {
    const exp = Date.parse(s.expires_at || '') || 0;
    if (exp <= now) continue;
    subs.push({ product_id: s.product_id, plan: s.plan, sections: (s.sections || []).filter((b) => SECTIONS.includes(b)), expires: exp, auto_renewing: !!s.auto_renewing, state: s.state });
    for (const b of s.sections || []) if (SECTIONS.includes(b)) until[b] = Math.max(until[b] || 0, exp);
  }
  if (onTrial) for (const b of SECTIONS) until[b] = Math.max(until[b] || 0, trialEnd);
  return {
    onTrial,
    trialEnd,
    trialDaysLeft: onTrial ? Math.ceil((trialEnd - now) / DAY) : 0,
    sections: SECTIONS.filter((b) => until[b] > now),
    until,
    subs,
  };
}

// Önbellekteki erişim bu bölümü şimdi açar mı? İnternetsiz kullanım: son kontrolden en çok offlineDays gün.
export function cacheAllows(cache, bolum, now = Date.now(), offlineDays = 7) {
  if (!cache || !cache.until) return false;
  const exp = cache.until[bolum] || 0;
  if (exp <= now) return false;
  if (!(cache.checkedAt > 0) || cache.checkedAt > now + DAY) return false;   // saat geri alınmış
  return now - cache.checkedAt <= offlineDays * DAY;
}
