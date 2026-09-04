// Central INR / Indian Rupee money helpers for the whole application.
// All displayed financial values use Indian number grouping (₹1,00,000),
// created through a single formatter so nothing drifts.

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrFmtWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

export function formatINR(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return inrFmt.format(amount);
}

export function formatINRWhole(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return inrFmtWhole.format(amount);
}

// Parse a human amount token like "₹1,25,400.00", "Rs. 48,900", "1,25,400",
// "INR 125400", "-1,000", "(1,000)" into a number. Returns null on failure.
export function parseAmount(token) {
  if (token === null || token === undefined) return null;
  let t = String(token).trim();
  // Remove currency symbols / words (kept later for currency detection)
  t = t.replace(/[₹$€£¥]/g, '');
  t = t.replace(/\b(rs|inr|usd|eur|gbp|jpy|rupees?|dollars?|euros?|pounds?)\b\.?/gi, '');
  // Drop anything left that is not a number (OCR junk, stray letters)
  t = t.replace(/[^\d,.\-+()\s]/g, ' ');
  // Parenthesised negatives
  const neg = /^\((.*)\)$/.test(t.trim());
  t = t.replace(/^\((.*)\)$/, '$1');
  t = t.replace(/,/g, ''); // 1,25,400 -> 125400
  t = t.replace(/\s+/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  let n = parseFloat(t);
  if (neg) n = -n;
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// Detect the currency a document/record text refers to.
// Returns { code, name, isForeign } — INR is home currency; any other code is
// flagged and NEVER silently converted.
export function detectCurrency(text) {
  const t = String(text || '').toLowerCase();
  const hit = (re) => re.test(t);
  if (hit(/\b(us\s?dollars?|\$|usd)\b/)) return { code: 'USD', name: 'US Dollar', isForeign: true };
  if (hit(/\b(euros?|€|eur)\b/)) return { code: 'EUR', name: 'Euro', isForeign: true };
  if (hit(/\b(gbp|british\s*pound|pounds?\s*sterling|£)\b/)) return { code: 'GBP', name: 'Pound Sterling', isForeign: true };
  if (hit(/\b(jpy|japanese\s*yen|¥)\b/)) return { code: 'JPY', name: 'Japanese Yen', isForeign: true };
  if (hit(/\b(usd|dollars?)\b/)) return { code: 'USD', name: 'US Dollar', isForeign: true };
  if (hit(/[₹]|\brs\.?|\binr\b|\brupees?\b|\bindian\s*rupees?\b/)) return { code: 'INR', name: 'Indian Rupee', isForeign: false };
  return { code: 'INR', name: 'Indian Rupee', isForeign: false };
}

// Format an amount for reasons/evidence messages, e.g.
// "expected ₹48,900.00, received ₹45,000.00"
export function moneyPair(amount) {
  return formatINR(amount);
}
