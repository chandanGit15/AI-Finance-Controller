// Ground truth evaluator
// Compares reconciliation results against hidden ground truth
// Calculates accuracy, precision, recall, F1, FPR, exception rate
//
// Definitions (all computed from the actual results, never hard-coded):
//   TP (correct_matches)   = we produced a match AND the matched payment equals ground truth
//   FP (false_positives)   = we produced a match but ground truth says no match / different payment
//   FN (false_negatives)   = ground truth expected a match but we did not produce the correct one
//   TN                    = ground truth expected no match and we did not match
//   Duplicate flagging     = counted as a correct decision (agent detected the duplicate)
//
//   precision = TP / (TP + FP)
//   recall    = TP / (TP + FN)
//   F1        = 2 * P * R / (P + R)   (0 when P + R = 0)
//   accuracy  = (TP + TN + correctlyFlagged) / total
//   match_rate = matched records / total processed

function safeDiv(num, den) {
  return den > 0 ? num / den : 0;
}

export function evaluateResults(results, groundTruth) {
  // Build ground truth lookup
  const gtMap = {};
  for (const gt of groundTruth) {
    gtMap[gt.invoice_id] = gt;
  }

  let totalRecords = results.length;

  // Status counts (single source of truth for every page)
  let matched = 0;
  let partialMatch = 0;
  let exceptions = 0;
  let unresolved = 0;
  let duplicates = 0;
  let missing = 0;
  let resolvedAmongQueue = 0; // exception-status items a human has already handled
  let evaluatedCount = 0; // results that have hidden ground-truth entries

  // Confusion matrix
  let TP = 0;
  let FP = 0;
  let FN = 0;
  let TN = 0;
  let correctlyFlagged = 0; // e.g. correctly detected duplicates

  // Match type counts
  let exactMatchCount = 0;
  let aiAssistedCount = 0;
  let threeWayCount = 0;
  let deterministicCount = 0;
  let manualCount = 0;

  // Exception categories
  const categoryCounts = {};

  for (const result of results) {
    const st = result.status;
    if (st === 'MATCHED') matched++;
    else if (st === 'PARTIAL_MATCH') partialMatch++;
    else if (st === 'EXCEPTION') exceptions++;
    else if (st === 'UNRESOLVED') unresolved++;
    else if (st === 'DUPLICATE') duplicates++;
    else if (st === 'MISSING') missing++;
    // Human-resolved queue items keep their decision status but leave the active queue
    if (result.resolved === 1 && ['EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'].includes(st)) {
      resolvedAmongQueue++;
    }

    const cat = result.exception_category || classifyException(result);
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    if (st === 'MATCHED') {
      if (result.match_type === 'AI_ASSISTED') aiAssistedCount++;
      else if (result.match_type === 'THREE_WAY_DETERMINISTIC') threeWayCount++;
      else if (result.match_type === 'MANUAL') manualCount++;
      else deterministicCount++;
    }

    const gt = gtMap[result.invoice_id];
    if (!gt) continue; // No ground truth available - cannot evaluate
    evaluatedCount++;

    const isDuplicateGT = gt.category === 'duplicate';
    const matchExpected = !isDuplicateGT && !!gt.payment_id && gt.match_type !== 'NO_MATCH';
    const weMatched = st === 'MATCHED' || st === 'PARTIAL_MATCH';
    const paymentCorrect = !!(result.payment_id && gt.payment_id && result.payment_id === gt.payment_id);

    if (isDuplicateGT) {
      // Expected outcome: agent flags the duplicate (or matches the primary payment)
      if (st === 'DUPLICATE') {
        correctlyFlagged++;
      } else if (weMatched && paymentCorrect) {
        TP++;
        correctlyFlagged++;
      } else if (weMatched) {
        FP++;
      } else {
        FN++;
      }
    } else if (matchExpected) {
      if (weMatched && paymentCorrect) TP++;
      else if (weMatched) FP++;
      else FN++;
    } else {
      if (weMatched) FP++;
      else TN++;
    }

    // Count exact-match successes
    if (gt.category === 'exact' && st === 'MATCHED' && result.payment_id === gt.payment_id) {
      exactMatchCount++;
    }
  }

  // Confusion-matrix derived metrics. These are only meaningful against hidden
  // ground truth — uploaded (non-demo) records have no ground truth, so the
  // values are exposed as null instead of a misleading 0%. Status/queue counts
  // above always remain real.
  const hasGroundTruth = evaluatedCount > 0;
  const trueMatches = TP + FN; // ground-truth matches (incl. correct duplicate-primary matches)
  const predictedMatches = TP + FP; // everything we called a match
  const precision = hasGroundTruth ? safeDiv(TP, TP + FP) : null;
  const recall = hasGroundTruth ? safeDiv(TP, TP + FN) : null;
  const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const falsePositiveRate = precision != null ? safeDiv(FP, TP + FP) : null;
  const correctDecisions = TP + TN + correctlyFlagged;
  const accuracy = hasGroundTruth ? safeDiv(correctDecisions, totalRecords) : null;

  // Review queue = records the engine flagged for human attention.
  // review_queue counts every flagged decision; active_queue excludes items a
  // human reviewer has already resolved (they keep their decision status but
  // are no longer awaiting action). Invariant: review_queue === active_queue + resolvedAmongQueue.
  const reviewQueue = exceptions + unresolved + duplicates + missing;
  const activeQueue = reviewQueue - resolvedAmongQueue;

  const matchRate = safeDiv(matched, totalRecords);
  const exceptionRate = safeDiv(reviewQueue, totalRecords);

  return {
    total_records: totalRecords,
    has_ground_truth: hasGroundTruth,
    evaluated_count: evaluatedCount,
    matched,
    partial_match: partialMatch,
    exceptions,
    unresolved,
    duplicates,
    missing,
    review_queue: reviewQueue,
    active_queue: activeQueue,
    resolved_queue_count: resolvedAmongQueue,
    match_rate: round4(matchRate),
    precision: round4(precision),
    recall: round4(recall),
    f1: round4(f1),
    false_positive_rate: round4(falsePositiveRate),
    exception_rate: round4(exceptionRate),
    accuracy: round4(accuracy),
    true_matches: trueMatches,
    predicted_matches: predictedMatches,
    correct_matches: TP,
    false_positives: FP,
    false_negatives: FN,
    correctly_flagged: correctlyFlagged,
    exact_match_count: exactMatchCount,
    ai_assisted_count: aiAssistedCount,
    three_way_count: threeWayCount,
    deterministic_count: deterministicCount,
    manual_count: manualCount,
    exception_categories: categoryCounts,
    breakdown: {
      exact: exactMatchCount,
      ai_assisted: aiAssistedCount,
      three_way: threeWayCount,
      deterministic: deterministicCount,
      manual: manualCount,
      partial: partialMatch,
      exceptions,
      duplicates,
      missing,
      unresolved,
    },
  };
}

// Fallback classification when a result has no stored category
function classifyException(result) {
  const rules = Array.isArray(result.rules_triggered) ? result.rules_triggered : [];
  const reason = (result.reason || '').toLowerCase();
  if (result.status === 'MISSING') return 'missing_payment';
  if (result.status === 'DUPLICATE') return 'duplicate';
  if (rules.includes('AMBIGUOUS_CANDIDATES') || reason.includes('multiple') || reason.includes('candidates')) return 'multiple_candidates';
  if (reason.includes('amount mismatch')) return 'amount_mismatch';
  if (reason.includes('date') && reason.includes('apart')) return 'date_mismatch';
  if (result.status === 'EXCEPTION' || result.status === 'UNRESOLVED') return 'low_confidence';
  return null;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}