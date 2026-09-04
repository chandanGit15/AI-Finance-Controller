// Deterministic matching rules
// Handles obvious matches and flags clear exceptions
// Returns PENDING_AI for cases needing AI reasoning
//
// Thresholds come from the Settings store (config table) and are applied
// here — changing them in Settings changes how the engine decides.

import { normalizeCustomerName, descriptionContainsRef } from './normalizer.js';
import { formatINR } from './money.js';

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs((d2 - d1) / (1000 * 60 * 60 * 24));
}

function computeMatchConfidence(invoice, payment, matchEvidence) {
  let confidence = 0;
  
  // Amount match (up to 35 points)
  const amountDiff = Math.abs(invoice._normalized_amount - payment._normalized_amount);
  if (amountDiff === 0) {
    confidence += 35;
  } else {
    const pctDiff = amountDiff / invoice._normalized_amount * 100;
    confidence += Math.max(0, 35 - pctDiff * 7);
  }
  
  // Customer match (up to 25 points)
  const cust1 = normalizeCustomerName(invoice.customer);
  const cust2 = normalizeCustomerName(payment.customer);
  if (cust1 === cust2) {
    confidence += 25;
  } else if (cust1.includes(cust2) || cust2.includes(cust1)) {
    confidence += 18;
  } else {
    // Token overlap
    const t1 = new Set(cust1.split(' '));
    const t2 = new Set(cust2.split(' '));
    let overlap = 0;
    for (const t of t1) { if (t2.has(t)) overlap++; }
    confidence += Math.min(12, overlap * 6);
  }
  
  // Date proximity (up to 20 points)
  const daysDiff = daysBetween(invoice._normalized_date, payment._normalized_date);
  if (daysDiff <= 3) confidence += 20;
  else if (daysDiff <= 7) confidence += 15;
  else if (daysDiff <= 14) confidence += 10;
  else confidence += 5;
  
  // Invoice reference in description (up to 15 points)
  if (descriptionContainsRef(payment.description, invoice.invoice_id)) {
    confidence += 15;
  }
  
  // Account match (up to 5 points)
  if (invoice.account_id && payment.account_id && invoice.account_id === payment.account_id) {
    confidence += 5;
  }
  
  return Math.min(100, Math.round(confidence));
}

export function runDeterministicMatching(invoices, payments, transactions, candidates, config = {}) {
  const AUTO_RECONCILE_THRESHOLD = config.auto_reconcile_threshold ?? 0.95;
  const REVIEW_THRESHOLD = Math.min(config.review_threshold ?? 0.80, AUTO_RECONCILE_THRESHOLD - 0.01);
  const DATE_TOLERANCE_DAYS = config.date_tolerance_days ?? 3;
  const AMOUNT_TOLERANCE_PERCENT = config.amount_tolerance_percent ?? 2.0;

  const results = [];
  const usedPayments = new Set();
  const usedTransactions = new Set();
  
  for (const inv of invoices) {
    const paymentCandidates = candidates.invoiceToPaymentCandidates[inv.invoice_id] || [];
    
    // No candidates at all → MISSING
    if (paymentCandidates.length === 0) {
      results.push({
        invoice_id: inv.invoice_id,
        payment_id: null,
        transaction_id: null,
        status: 'MISSING',
        confidence: 0.1,
        match_type: 'DETERMINISTIC',
        reason: 'No matching payment candidate found',
        evidence: { customer: 'none', amount: 'none', date: 'none', invoice_reference: 'not_found' },
        candidate_ids: [],
        rules_triggered: ['NO_CANDIDATES'],
        exception_category: 'missing_payment',
      });
      continue;
    }
    
    const topCandidate = paymentCandidates[0];
    const payment = topCandidate.payment;
    
    // Compute confidence
    const confidence = computeMatchConfidence(inv, payment, topCandidate.reasons) / 100;
    
    // Build evidence
    const evidence = {};
    const rulesTriggered = [];
    
    // Amount check
    const amountDiff = Math.abs(inv._normalized_amount - payment._normalized_amount);
    if (amountDiff === 0) {
      evidence.amount = 'exact';
      rulesTriggered.push('EXACT_AMOUNT');
    } else {
      const pctDiff = (amountDiff / inv._normalized_amount * 100).toFixed(1);
      evidence.amount = `mismatch: ${pctDiff}% difference`;
      rulesTriggered.push('AMOUNT_MISMATCH');
    }
    
    // Customer check
    const cust1 = normalizeCustomerName(inv.customer);
    const cust2 = normalizeCustomerName(payment.customer);
    if (cust1 === cust2) {
      evidence.customer = 'exact match';
      rulesTriggered.push('EXACT_CUSTOMER');
    } else if (cust1.includes(cust2) || cust2.includes(cust1)) {
      evidence.customer = 'strong similarity';
      rulesTriggered.push('FUZZY_CUSTOMER');
    } else {
      const t1 = new Set(cust1.split(' '));
      const t2 = new Set(cust2.split(' '));
      let overlap = 0;
      for (const t of t1) { if (t2.has(t)) overlap++; }
      if (overlap > 0) {
        evidence.customer = 'partial token match';
        rulesTriggered.push('TOKEN_CUSTOMER');
      } else {
        evidence.customer = 'no match';
      }
    }
    
    // Date check
    const daysDiff = daysBetween(inv._normalized_date, payment._normalized_date);
    evidence.date = daysDiff <= 3 ? 'within 3 days' : 
                    daysDiff <= 7 ? `within ${Math.round(daysDiff)} days` :
                    daysDiff <= 14 ? `within ${Math.round(daysDiff)} days (wide)` :
                    `${Math.round(daysDiff)} days apart`;
    
    if (daysDiff <= DATE_TOLERANCE_DAYS) {
      rulesTriggered.push('DATE_WITHIN_TOLERANCE');
    } else {
      rulesTriggered.push('DATE_OUTSIDE_TOLERANCE');
    }
    
    // Reference check
    const hasRef = descriptionContainsRef(payment.description, inv.invoice_id);
    evidence.invoice_reference = hasRef ? 'found in description' : 'not found';
    if (hasRef) rulesTriggered.push('INVOICE_REF_FOUND');
    
    // Amount mismatch → EXCEPTION (amount_mismatch)
    if (amountDiff > 0 && amountDiff / inv._normalized_amount > AMOUNT_TOLERANCE_PERCENT / 100) {
      results.push({
        invoice_id: inv.invoice_id,
        payment_id: payment.payment_id,
        transaction_id: null,
        status: 'EXCEPTION',
        confidence,
        match_type: 'DETERMINISTIC',
        reason: `Amount mismatch: expected ${formatINR(inv.amount)}, received ${formatINR(payment.amount)} (difference: ${formatINR(amountDiff)})`,
        evidence,
        candidate_ids: paymentCandidates.map(c => c.payment_id),
        rules_triggered: rulesTriggered,
        exception_category: 'amount_mismatch',
      });
      usedPayments.add(payment.payment_id);
      continue;
    }

    // Date outside tolerance with otherwise strong match → EXCEPTION (date_mismatch)
    if (daysDiff > DATE_TOLERANCE_DAYS && amountDiff === 0 && cust1 === cust2) {
      results.push({
        invoice_id: inv.invoice_id,
        payment_id: payment.payment_id,
        transaction_id: null,
        status: 'EXCEPTION',
        confidence,
        match_type: 'DETERMINISTIC',
        reason: `Date mismatch: invoice ${inv.invoice_date}, payment ${payment.payment_date} (${Math.round(daysDiff)} days apart, tolerance ${DATE_TOLERANCE_DAYS} days)`,
        evidence,
        candidate_ids: paymentCandidates.map(c => c.payment_id),
        rules_triggered: [...rulesTriggered, 'DATE_MISMATCH_EXCEPTION'],
        exception_category: 'date_mismatch',
      });
      usedPayments.add(payment.payment_id);
      continue;
    }
    
    // Duplicate payments — two or more payments with the exact same amount,
    // same customer, and dates within tolerance are flagged DUPLICATE.
    // (Checked before ambiguity: identical twins are duplicates, not ambiguity.)
    if (paymentCandidates.length > 1 && 
        paymentCandidates.some(c => c.payment._normalized_amount === inv._normalized_amount)) {
      const dupPayments = paymentCandidates.filter(c => 
        c.payment._normalized_amount === inv._normalized_amount &&
        daysBetween(c.payment._normalized_date, inv._normalized_date) <= DATE_TOLERANCE_DAYS &&
        normalizeCustomerName(c.payment.customer) === cust1
      );
      
      if (dupPayments.length > 1) {
        results.push({
          invoice_id: inv.invoice_id,
          payment_id: dupPayments[0].payment.payment_id,
          transaction_id: null,
          status: 'DUPLICATE',
          confidence: 0.85,
          match_type: 'DETERMINISTIC',
          reason: `Duplicate payment detected: ${dupPayments.map(c => c.payment.payment_id).join(', ')}`,
          evidence: { ...evidence, duplicates: dupPayments.map(c => c.payment.payment_id) },
          candidate_ids: paymentCandidates.map(c => c.payment_id),
          rules_triggered: [...rulesTriggered, 'DUPLICATE_DETECTED'],
          exception_category: 'duplicate',
        });
        for (const dp of dupPayments) usedPayments.add(dp.payment.payment_id);
        continue;
      }
    }
    
    // Multiple strong candidates → AMBIGUOUS
    if (paymentCandidates.length >= 2) {
      const secondScore = paymentCandidates[1].score;
      const firstScore = topCandidate.score;
      if (secondScore > firstScore * 0.85) {
        results.push({
          invoice_id: inv.invoice_id,
          payment_id: null,
          transaction_id: null,
          status: 'UNRESOLVED',
          confidence: 0.5,
          match_type: 'DETERMINISTIC',
          reason: `Multiple plausible candidates: ${paymentCandidates.map(c => c.payment_id).join(', ')}`,
          evidence: { ...evidence, candidates: paymentCandidates.map(c => ({ id: c.payment_id, score: c.score, reasons: c.reasons })) },
          candidate_ids: paymentCandidates.map(c => c.payment_id),
          rules_triggered: [...rulesTriggered, 'AMBIGUOUS_CANDIDATES'],
          exception_category: 'multiple_candidates',
        });
        continue;
      }
    }
    
    // Auto-reconcile reached
    if (confidence >= AUTO_RECONCILE_THRESHOLD) {
      const txCandidates = candidates.paymentToTransactionCandidates[payment.payment_id] || [];
      let matchedTxId = null;
      
      if (txCandidates.length > 0 && txCandidates[0].score >= 20) {
        matchedTxId = txCandidates[0].transaction_id;
        usedTransactions.add(matchedTxId);
      }
      
      results.push({
        invoice_id: inv.invoice_id,
        payment_id: payment.payment_id,
        transaction_id: matchedTxId,
        status: 'MATCHED',
        confidence,
        match_type: 'DETERMINISTIC',
        reason: matchedTxId 
          ? `Three-way match: Invoice, Payment ${payment.payment_id}, and Transaction ${matchedTxId} all consistent`
          : `Two-way match: Invoice and Payment ${payment.payment_id} consistent`,
        evidence,
        candidate_ids: paymentCandidates.map(c => c.payment_id),
        rules_triggered: rulesTriggered,
      });
      usedPayments.add(payment.payment_id);
      continue;
    }
    
    // Between review and auto-reconcile → matched but flagged for review
    if (confidence >= REVIEW_THRESHOLD) {
      const txCandidates = candidates.paymentToTransactionCandidates[payment.payment_id] || [];
      let matchedTxId = null;
      
      if (txCandidates.length > 0 && txCandidates[0].score >= 15) {
        matchedTxId = txCandidates[0].transaction_id;
        usedTransactions.add(txCandidates[0].transaction_id);
      }
      
      results.push({
        invoice_id: inv.invoice_id,
        payment_id: payment.payment_id,
        transaction_id: matchedTxId,
        status: 'MATCHED',
        confidence,
        match_type: 'DETERMINISTIC',
        reason: `Matched with confidence ${(confidence * 100).toFixed(0)}% - flagged for human review`,
        evidence,
        candidate_ids: paymentCandidates.map(c => c.payment_id),
        rules_triggered: [...rulesTriggered, 'FLAGGED_FOR_REVIEW'],
      });
      usedPayments.add(payment.payment_id);
      continue;
    }
    
    // Low confidence → send to AI
    results.push({
      invoice_id: inv.invoice_id,
      payment_id: null,
      transaction_id: null,
      status: 'PENDING_AI',
      confidence,
      match_type: 'PENDING',
      reason: 'Deterministic rules insufficient - AI analysis needed',
      evidence,
      candidate_ids: paymentCandidates.map(c => c.payment_id),
      rules_triggered: [...rulesTriggered, 'SENT_TO_AI'],
    });
  }
  
  return results;
}