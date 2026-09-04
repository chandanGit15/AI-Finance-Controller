// Data normalization service
// Normalizes customer names, IDs, amounts, dates, and descriptions
// for consistent matching without relying on LLM

// Common corporate suffixes to strip
const CORPORATE_SUFFIXES = [
  /\b(private|pvt\.?|p\.?v\.?t\.?)\b/gi,
  /\b(incorporated|inc\.?|inc)\b/gi,
  /\b(corporation|corp\.?|corp)\b/gi,
  /\b(limited|ltd\.?|ltd)\b/gi,
  /\b(company|co\.?|co)\b/gi,
  /\b(group|grp\.?|grp)\b/gi,
  /\b(enterprises|ent\.?|ent)\b/gi,
  /\b(solutions|sol\.?|sol)\b/gi,
  /\b(systems|sys\.?|sys)\b/gi,
  /\b(industries|ind\.?|ind)\b/gi,
  /\b(consulting|cons\.?|cons)\b/gi,
  /\b(analytics|analytics)\b/gi,
  /\b(financial|fin\.?|fin)\b/gi,
  /\b(services|svc\.?|svc|svcs)\b/gi,
  /\b(logistics|log\.?|log|logistics)\b/gi,
  /\b(construction|const\.?|const)\b/gi,
  /\b(properties|prop\.?|prop|props)\b/gi,
  /\b(security|sec\.?|sec)\b/gi,
  /\b(research|res\.?|res)\b/gi,
  /\b(software|soft\.?|soft)\b/gi,
  /\b(retail|ret\.?|ret)\b/gi,
  /\b(media|media)\b/gi,
  /\b(digital|digital)\b/gi,
  /\b(communications|comm\.?|comm)\b/gi,
  /\b(health|hlth)\b/gi,
  /\b(energy|energy)\b/gi,
  /\b(aerospace|aero\.?|aero)\b/gi,
  /\b(capital|cap\.?|cap)\b/gi,
  /\b(data|data)\b/gi,
];

export function normalizeCustomerName(name) {
  if (!name) return '';
  let n = name.trim().toUpperCase();
  // Remove punctuation except spaces
  n = n.replace(/[^A-Z0-9\s]/g, '');
  // Remove corporate suffixes
  for (const suffix of CORPORATE_SUFFIXES) {
    n = n.replace(suffix, '');
  }
  // Collapse multiple spaces
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

export function normalizeId(id) {
  if (!id) return '';
  // Remove dashes, spaces, and convert to uppercase
  return id.replace(/[\s\-]/g, '').toUpperCase();
}

export function normalizeAmount(amount) {
  if (typeof amount === 'string') {
    // Remove currency symbols (incl. ₹/Rs.), commas, spaces
    amount = amount.replace(/₹/g, '').replace(/[$€£¥,\s]/g, '').replace(/^rs\.?/i, '');
    amount = parseFloat(amount);
  }
  return Math.round(amount * 100) / 100;
}

export function normalizeCurrency(currency) {
  if (!currency) return 'INR';
  const c = currency.trim().toUpperCase();
  if (['₹', 'RS', 'RS.', 'INR'].includes(c) || c === '₹') return 'INR';
  return c;
}

export function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // Handle various date formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

export function normalizeDescription(desc) {
  if (!desc) return '';
  return desc.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Compute similarity between two normalized customer names
// Returns a score from 0 to 1
export function customerSimilarity(name1, name2) {
  const n1 = normalizeCustomerName(name1);
  const n2 = normalizeCustomerName(name2);
  
  if (n1 === n2) return 1.0;
  
  // Check if one is a substring of the other
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length < n2.length ? n2 : n1;
    return 0.7 + 0.3 * (shorter.length / longer.length);
  }
  
  // Token-based similarity
  const tokens1 = new Set(n1.split(' ').filter(t => t.length > 1));
  const tokens2 = new Set(n2.split(' ').filter(t => t.length > 1));
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  
  const union = tokens1.size + tokens2.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  
  // Also check Levenshtein for short names
  const lev = 1 - levenshteinDistance(n1, n2) / Math.max(n1.length, n2.length, 1);
  
  return Math.max(jaccard, lev);
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

// Check if an invoice ID appears in a description
export function descriptionContainsRef(description, invoiceId) {
  const desc = normalizeDescription(description);
  const invNorm = normalizeId(invoiceId);
  
  // Check various formats: INV1001, INV-1001, INV 1001, 1001
  const numPart = invoiceId.replace(/\D/g, '');
  
  return desc.includes(invNorm) || desc.includes(numPart) || desc.includes(`INV${numPart}`);
}

// Normalize a complete dataset
export function normalizeDataset(invoices, payments, transactions) {
  const normalizedInvoices = invoices.map(inv => ({
    ...inv,
    _normalized_customer: normalizeCustomerName(inv.customer),
    _normalized_id: normalizeId(inv.invoice_id),
    _normalized_amount: normalizeAmount(inv.amount),
    _normalized_currency: normalizeCurrency(inv.currency),
    _normalized_date: normalizeDate(inv.invoice_date),
  }));
  
  const normalizedPayments = payments.map(pay => ({
    ...pay,
    _normalized_customer: normalizeCustomerName(pay.customer),
    _normalized_id: normalizeId(pay.payment_id),
    _normalized_amount: normalizeAmount(pay.amount),
    _normalized_currency: normalizeCurrency(pay.currency),
    _normalized_date: normalizeDate(pay.payment_date),
    _normalized_description: normalizeDescription(pay.description),
  }));
  
  const normalizedTransactions = transactions.map(tx => ({
    ...tx,
    _normalized_id: normalizeId(tx.transaction_id),
    _normalized_amount: normalizeAmount(tx.amount),
    _normalized_currency: normalizeCurrency(tx.currency),
    _normalized_date: normalizeDate(tx.transaction_date),
    _normalized_description: normalizeDescription(tx.description),
  }));
  
  return {
    invoices: normalizedInvoices,
    payments: normalizedPayments,
    transactions: normalizedTransactions,
  };
}
