// Three-way matcher
// Links Invoice → Payment → Bank Transaction
// Strengthens confidence for three-way matches

import { normalizeCustomerName, descriptionContainsRef } from './normalizer.js';

export function buildThreeWayMatches(results, payments, transactions) {
  return results.map(result => {
    if (!result.payment_id) {
      return { ...result };
    }
    
    const payment = payments.find(p => p.payment_id === result.payment_id);
    if (!payment) {
      return { ...result };
    }
    
    // If we already have a transaction from deterministic/AI matching
    if (result.transaction_id) {
      const tx = transactions.find(t => t.transaction_id === result.transaction_id);
      if (tx) {
        // Verify the three-way match is valid
        const txValidation = validateThreeWay(result, payment, tx);
        return {
          ...result,
          ...txValidation,
        };
      }
    }
    
    // Try to find the best transaction match
    let bestTx = null;
    let bestTxScore = 0;
    
    for (const tx of transactions) {
      if (tx._normalized_currency && payment._normalized_currency && 
          tx._normalized_currency !== payment._normalized_currency) continue;
      
      let score = 0;
      
      // Amount match
      if (payment._normalized_amount === tx._normalized_amount) score += 30;
      else if (Math.abs(payment._normalized_amount - tx._normalized_amount) / payment._normalized_amount < 0.05) score += 15;
      
      // Date proximity
      const daysDiff = Math.abs((new Date(tx._normalized_date || tx.transaction_date) - new Date(payment._normalized_date || payment.payment_date)) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 2) score += 20;
      else if (daysDiff <= 5) score += 10;
      
      // Description overlap
      const payDesc = (payment.description || '').toUpperCase();
      const txDesc = (tx.description || '').toUpperCase();
      const payTokens = new Set(payDesc.split(' ').filter(t => t.length > 2));
      const txTokens = new Set(txDesc.split(' ').filter(t => t.length > 2));
      let shared = 0;
      for (const t of payTokens) { if (txTokens.has(t)) shared++; }
      if (shared >= 3) score += 20;
      else if (shared >= 2) score += 10;
      
      // Account match
      if (payment.account_id && tx.account_id && payment.account_id === tx.account_id) score += 10;
      
      if (score > bestTxScore) {
        bestTxScore = score;
        bestTx = tx;
      }
    }
    
    if (bestTx && bestTxScore >= 20) {
      const evidence = typeof result.evidence === 'object' && result.evidence !== null ? { ...result.evidence } : {};
      evidence.bank_transaction = bestTxScore >= 40 ? 'confirmed' : 'weakly confirmed';
      evidence.bank_transaction_id = bestTx.transaction_id;
      
      // Boost confidence for three-way match
      let confidence = result.confidence;
      if (bestTxScore >= 40) {
        confidence = Math.min(0.99, confidence + 0.05);
      } else if (bestTxScore >= 20) {
        confidence = Math.min(0.99, confidence + 0.02);
      }
      
      return {
        ...result,
        transaction_id: bestTx.transaction_id,
        confidence,
        match_type: result.status === 'MATCHED' ? 'THREE_WAY_DETERMINISTIC' : result.match_type,
        evidence,
        reason: result.status === 'MATCHED' 
          ? `Three-way match: Invoice → Payment ${result.payment_id} → Transaction ${bestTx.transaction_id}`
          : result.reason,
      };
    }
    
    // No transaction found, still a valid two-way match
    return {
      ...result,
      evidence: {
        ...(typeof result.evidence === 'object' ? result.evidence : {}),
        bank_transaction: 'not found',
      },
    };
  });
}

function validateThreeWay(result, payment, tx) {
  const evidence = typeof result.evidence === 'object' && result.evidence !== null ? { ...result.evidence } : {};
  
  // Verify amount consistency
  const invAmount = result.invoice_amount || payment.amount;
  if (Math.abs(payment.amount - tx.amount) < 0.01) {
    evidence.bank_transaction = 'confirmed - amount matches';
  } else if (Math.abs(payment.amount - tx.amount) / payment.amount < 0.05) {
    evidence.bank_transaction = 'weakly confirmed - small amount difference';
  } else {
    evidence.bank_transaction = 'mismatch - amount differs significantly';
  }
  
  return {
    confidence: Math.min(0.99, result.confidence + 0.03),
    evidence,
  };
}
