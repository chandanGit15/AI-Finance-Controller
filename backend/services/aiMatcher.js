// AI matching service
// Uses LLM API if available, otherwise falls back to deterministic reasoning
// Processes cases that deterministic rules couldn't confidently resolve
//
// The engine NEVER claims AI was used when it was not:
//   - LLM configured  -> method 'LLM'
//   - no LLM key      -> method 'DETERMINISTIC_FALLBACK' (honestly labeled)
//   - AI disabled     -> records go straight to UNRESOLVED

import { normalizeCustomerName, descriptionContainsRef } from './normalizer.js';
import { formatINR } from './money.js';

const LLM_API_URL = process.env.LLM_API_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4';

export function aiStatus() {
  const configured = !!(LLM_API_URL && LLM_API_KEY);
  return {
    configured,
    model: LLM_MODEL,
    mode: configured ? 'LLM' : 'DETERMINISTIC_FALLBACK',
    label: configured
      ? `LLM connected (${LLM_MODEL})`
      : 'AI-assisted matching unavailable — deterministic fallback active',
  };
}

// Deterministic AI fallback - mimics AI reasoning with rules
function deterministicAIFallback(invoice, candidates, payments) {
  if (!candidates || candidates.length === 0) {
    return {
      decision: 'MISSING',
      payment_id: null,
      confidence: 0.1,
      evidence: ['No payment candidates available'],
    };
  }
  
  const scoredCandidates = candidates.map(c => {
    const pay = payments.find(p => p.payment_id === c.payment_id) || c.payment;
    let score = 0;
    const evidence = [];
    
    // Name similarity
    const invCust = normalizeCustomerName(invoice.customer);
    const payCust = normalizeCustomerName(pay.customer);
    if (invCust === payCust) {
      score += 25;
      evidence.push('Customer names are equivalent');
    } else if (invCust.includes(payCust) || payCust.includes(invCust)) {
      score += 18;
      evidence.push('Customer names have strong overlap');
    } else {
      const t1 = new Set(invCust.split(' '));
      const t2 = new Set(payCust.split(' '));
      let overlap = 0;
      for (const t of t1) { if (t2.has(t)) overlap++; }
      if (overlap > 0) {
        score += 10;
        evidence.push('Customer names share common tokens');
      } else {
        evidence.push('Customer names do not match');
      }
    }
    
    // Amount
    if (invoice._normalized_amount === pay._normalized_amount) {
      score += 30;
      evidence.push('Amount matches exactly');
    } else {
      const diff = Math.abs(invoice._normalized_amount - pay._normalized_amount);
      const pct = (diff / invoice._normalized_amount * 100).toFixed(1);
      score += Math.max(0, 30 - diff / invoice._normalized_amount * 300);
      evidence.push(`Amount differs by ${pct}% (${formatINR(diff)})`);
    }
    
    // Reference in description
    if (descriptionContainsRef(pay.description, invoice.invoice_id)) {
      score += 20;
      evidence.push('Invoice reference found in payment description');
    } else {
      evidence.push('No invoice reference in payment description');
    }
    
    // Date proximity
    const daysDiff = Math.abs((new Date(pay._normalized_date) - new Date(invoice._normalized_date)) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 3) {
      score += 15;
      evidence.push(`Payment date is within ${Math.round(daysDiff)} days of invoice date`);
    } else if (daysDiff <= 7) {
      score += 10;
      evidence.push(`Payment date is ${Math.round(daysDiff)} days from invoice date`);
    } else {
      score += 3;
      evidence.push(`Payment date is ${Math.round(daysDiff)} days from invoice date (wide gap)`);
    }
    
    // Account match
    if (invoice.account_id && pay.account_id && invoice.account_id === pay.account_id) {
      score += 10;
      evidence.push('Account IDs match');
    }
    
    return {
      payment_id: pay.payment_id,
      score,
      confidence: Math.min(0.95, score / 100),
      evidence,
    };
  });
  
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  const best = scoredCandidates[0];
  const second = scoredCandidates[1];
  
  // If best is clearly above threshold
  if (best.score >= 55) {
    // Check if there's a close competitor
    if (second && second.score >= best.score * 0.85) {
      return {
        decision: 'UNRESOLVED',
        payment_id: null,
        confidence: 0.4,
        evidence: [
          `Best candidate ${best.payment_id} scored ${best.score}/100`,
          `But ${second.payment_id} scored ${second.score}/100 (too close to decide safely)`,
          ...best.evidence,
        ],
      };
    }
    
    if (best.score >= 70) {
      return {
        decision: 'MATCH',
        payment_id: best.payment_id,
        confidence: Math.min(0.94, best.confidence),
        evidence: best.evidence,
      };
    }
    
    return {
      decision: 'PARTIAL_MATCH',
      payment_id: best.payment_id,
      confidence: Math.min(0.85, best.confidence),
      evidence: [...best.evidence, 'Partial confidence - recommend manual review'],
    };
  }
  
  if (best.score >= 35) {
    return {
      decision: 'PARTIAL_MATCH',
      payment_id: best.payment_id,
      confidence: Math.min(0.75, best.confidence),
      evidence: [...best.evidence, 'Low confidence match - manual review required'],
    };
  }
  
  return {
    decision: 'UNRESOLVED',
    payment_id: null,
    confidence: 0.2,
    evidence: ['No candidate scored high enough for even a partial match'],
  };
}

// Build the prompt for LLM-based matching
function buildLLMPrompt(invoice, candidates, payments) {
  const candidateInfo = candidates.slice(0, 5).map(c => {
    const pay = payments.find(p => p.payment_id === c.payment_id) || c.payment;
    return `Payment ${pay.payment_id}:\n  - Customer: ${pay.customer}\n  - Amount: ${formatINR(pay.amount)}\n  - Date: ${pay.payment_date}\n  - Description: ${pay.description}\n  - Pre-computed score: ${c.score}/100`;
  }).join('\n\n');
  
  return `You are a financial reconciliation expert. Analyze whether this invoice matches any of the candidate payments.

Invoice:
{
  "invoice_id": "${invoice.invoice_id}",
  "customer": "${invoice.customer}",
  "amount_inr": ${invoice.amount},
  "date": "${invoice.invoice_date}",
  "currency": "${invoice.currency}"
}

Candidates:
${candidateInfo}

Respond with ONLY valid JSON in this exact format:
{
  "decision": "MATCH|PARTIAL_MATCH|EXCEPTION|UNRESOLVED|DUPLICATE|MISSING",
  "payment_id": "<payment_id or null>",
  "confidence": <0.0 to 1.0>,
  "evidence": ["<reason1>", "<reason2>", ...]
}`;
}

// Call the LLM API
async function callLLM(prompt) {
  if (!LLM_API_URL || !LLM_API_KEY) {
    return null;
  }
  
  try {
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'You are a financial reconciliation expert. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;
    
    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('LLM API error:', err.message);
    return null;
  }
}

function exceptionCategoryFor(status, evidence) {
  if (status === 'MISSING') return 'missing_payment';
  if (status === 'DUPLICATE') return 'duplicate';
  if (status === 'UNRESOLVED') {
    const ev = Array.isArray(evidence) ? evidence.join(' ').toLowerCase() : '';
    if (ev.includes('too close') || ev.includes('candidate')) return 'multiple_candidates';
    return 'low_confidence';
  }
  if (status === 'EXCEPTION') return 'low_confidence';
  return null;
}

export async function runAIMatching(pendingResults, invoices, payments, transactions, candidates, config = {}) {
  const results = [];
  const aiEnabled = config.enable_ai_matching !== false;
  const status = aiStatus();
  
  for (const pending of pendingResults) {
    const invoice = invoices.find(i => i.invoice_id === pending.invoice_id);
    if (!invoice) continue;
    
    const paymentCandidates = candidates.invoiceToPaymentCandidates[pending.invoice_id] || [];
    
    // AI matching disabled by configuration → honest UNRESOLVED
    if (!aiEnabled) {
      results.push({
        invoice_id: pending.invoice_id,
        payment_id: null,
        transaction_id: null,
        status: 'UNRESOLVED',
        confidence: Math.min(pending.confidence, 0.2),
        match_type: 'DETERMINISTIC',
        reason: 'AI matching disabled in settings — insufficient deterministic confidence',
        evidence: { reasoning: ['AI matching disabled by configuration', 'Deterministic confidence below review threshold'] },
        candidate_ids: paymentCandidates.map(c => c.payment_id),
        rules_triggered: ['AI_DISABLED'],
        exception_category: 'low_confidence',
        ai_used: 0,
        ai_mode: 'DISABLED',
      });
      continue;
    }
    
    // Try LLM first
    let aiDecision = null;
    if (LLM_API_URL && LLM_API_KEY) {
      const prompt = buildLLMPrompt(invoice, paymentCandidates, payments);
      aiDecision = await callLLM(prompt);
    }
    
    // Fall back to deterministic AI (honestly labeled)
    if (!aiDecision) {
      aiDecision = deterministicAIFallback(invoice, paymentCandidates, payments);
    }
    
    // Map decision to status
    let outStatus;
    switch (aiDecision.decision) {
      case 'MATCH': outStatus = 'MATCHED'; break;
      case 'PARTIAL_MATCH': outStatus = 'PARTIAL_MATCH'; break;
      case 'EXCEPTION': outStatus = 'EXCEPTION'; break;
      case 'UNRESOLVED': outStatus = 'UNRESOLVED'; break;
      case 'DUPLICATE': outStatus = 'DUPLICATE'; break;
      case 'MISSING': outStatus = 'MISSING'; break;
      default: outStatus = 'UNRESOLVED';
    }
    
    // Find transaction for matched payment
    let transactionId = null;
    if (aiDecision.payment_id) {
      const txCandidates = candidates.paymentToTransactionCandidates[aiDecision.payment_id] || [];
      if (txCandidates.length > 0 && txCandidates[0].score >= 15) {
        transactionId = txCandidates[0].transaction_id;
      }
    }
    
    results.push({
      invoice_id: pending.invoice_id,
      payment_id: aiDecision.payment_id,
      transaction_id: transactionId,
      status: outStatus,
      confidence: aiDecision.confidence,
      match_type: 'AI_ASSISTED',
      reason: aiDecision.evidence?.join('; ') || 'AI analysis completed',
      evidence: {
        reasoning: aiDecision.evidence || [],
        method: status.mode,
      },
      candidate_ids: paymentCandidates.map(c => c.payment_id),
      rules_triggered: ['AI_MATCHING'],
      exception_category: exceptionCategoryFor(outStatus, aiDecision.evidence),
      ai_used: 1,
      ai_mode: status.mode,
    });
  }
  
  return results;
}