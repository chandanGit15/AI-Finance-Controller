// Candidate finding service
// Uses deterministic filters to narrow down potential matches
// before sending to the matching engine

import { normalizeCustomerName, normalizeId, descriptionContainsRef } from './normalizer.js';

const AMOUNT_TOLERANCE_PERCENT = 15;
const DATE_TOLERANCE_DAYS = 21;

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs((d2 - d1) / (1000 * 60 * 60 * 24));
}

function amountWithinTolerance(amt1, amt2, tolerancePercent = AMOUNT_TOLERANCE_PERCENT) {
  if (amt1 === 0) return amt2 === 0;
  const diff = Math.abs(amt1 - amt2) / Math.abs(amt1);
  return diff <= tolerancePercent / 100;
}

export function findCandidates(invoices, payments, transactions) {
  const invoiceToPaymentCandidates = {};
  const paymentToTransactionCandidates = {};
  
  // For each invoice, find candidate payments
  for (const inv of invoices) {
    const candidates = [];
    
    for (const pay of payments) {
      let score = 0;
      const reasons = [];
      
      // Currency match (required)
      if (inv._normalized_currency !== pay._normalized_currency) continue;
      
      // Account match bonus
      if (inv.account_id && pay.account_id && inv.account_id === pay.account_id) {
        score += 20;
        reasons.push('account_match');
      }
      
      // Amount similarity
      if (inv._normalized_amount === pay._normalized_amount) {
        score += 30;
        reasons.push('exact_amount');
      } else if (amountWithinTolerance(inv._normalized_amount, pay._normalized_amount)) {
        score += 15;
        reasons.push('similar_amount');
      } else {
        continue; // Amount too different, skip
      }
      
      // Date window
      const daysDiff = daysBetween(inv._normalized_date, pay._normalized_date);
      if (daysDiff <= DATE_TOLERANCE_DAYS) {
        score += 15;
        reasons.push(`date_within_${Math.round(daysDiff)}_days`);
      } else {
        continue; // Too far apart
      }
      
      // Customer similarity
      const custNorm1 = normalizeCustomerName(inv.customer);
      const custNorm2 = normalizeCustomerName(pay.customer);
      if (custNorm1 === custNorm2) {
        score += 25;
        reasons.push('exact_customer');
      } else if (custNorm1.includes(custNorm2) || custNorm2.includes(custNorm1)) {
        score += 18;
        reasons.push('partial_customer_match');
      } else {
        // Check token overlap
        const t1 = new Set(custNorm1.split(' '));
        const t2 = new Set(custNorm2.split(' '));
        let overlap = 0;
        for (const t of t1) { if (t2.has(t)) overlap++; }
        if (overlap > 0) {
          score += 10;
          reasons.push('token_customer_match');
        } else {
          continue; // No customer match at all
        }
      }
      
      // Invoice reference in description
      if (descriptionContainsRef(pay.description, inv.invoice_id)) {
        score += 15;
        reasons.push('invoice_ref_in_description');
      }
      
      if (score >= 15) { // Minimum threshold to be a candidate
        candidates.push({
          payment_id: pay.payment_id,
          score,
          reasons,
          payment: pay,
        });
      }
    }
    
    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    invoiceToPaymentCandidates[inv.invoice_id] = candidates;
  }
  
  // For each payment, find candidate bank transactions
  for (const pay of payments) {
    const candidates = [];
    
    for (const tx of transactions) {
      let score = 0;
      const reasons = [];
      
      // Currency match
      if (pay._normalized_currency !== tx._normalized_currency) continue;
      
      // Account match
      if (pay.account_id && tx.account_id && pay.account_id === tx.account_id) {
        score += 20;
        reasons.push('account_match');
      }
      
      // Amount match
      if (pay._normalized_amount === tx._normalized_amount) {
        score += 30;
        reasons.push('exact_amount');
      } else if (amountWithinTolerance(pay._normalized_amount, tx._normalized_amount)) {
        score += 15;
        reasons.push('similar_amount');
      } else {
        continue;
      }
      
      // Date window
      const daysDiff = daysBetween(pay._normalized_date, tx._normalized_date);
      if (daysDiff <= 7) {
        score += 15;
        reasons.push(`date_within_${Math.round(daysDiff)}_days`);
      } else {
        continue;
      }
      
      // Description similarity (shared tokens)
      const payTokens = new Set(pay._normalized_description.split(' ').filter(t => t.length > 2));
      const txTokens = new Set(tx._normalized_description.split(' ').filter(t => t.length > 2));
      let sharedTokens = 0;
      for (const t of payTokens) { if (txTokens.has(t)) sharedTokens++; }
      if (sharedTokens >= 2) {
        score += 20;
        reasons.push('description_similarity');
      } else if (sharedTokens >= 1) {
        score += 10;
        reasons.push('partial_description_match');
      }
      
      // Payment reference in transaction description
      const payIdNorm = normalizeId(pay.payment_id);
      if (tx._normalized_description.includes(payIdNorm)) {
        score += 15;
        reasons.push('payment_ref_in_description');
      }
      
      if (score >= 15) {
        candidates.push({
          transaction_id: tx.transaction_id,
          score,
          reasons,
          transaction: tx,
        });
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    paymentToTransactionCandidates[pay.payment_id] = candidates;
  }
  
  return {
    invoiceToPaymentCandidates,
    paymentToTransactionCandidates,
  };
}
