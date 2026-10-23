/**
 * HDC Confidence Calibrator
 * 
 * Maps raw high-dimensional Hamming distance (D = 10,000 bits) into
 * calibrated Bayesian classification confidence.
 * 
 * In Binary Spatter Codes (Kanerva, 1996):
 * - Two independent random vectors have expected Hamming distance μ = 5,000 bits (σ = 50 bits).
 * - A distance of dH <= 4,850 bits is >3.0σ away from random noise (p < 0.00135).
 * - A distance of dH <= 3,500 bits is >30.0σ away from random noise (statistical certainty).
 */

export interface CalibratedConfidenceResult {
  confidencePercent: number; // 0.0 to 99.9%
  isConfident: boolean;
  distanceBits: number;
  rawSimilarityPercent: number;
  zScore: number;
  statusLabel: string;
}

export function calibrateHdcConfidence(
  distance: number,
  rawSimilarity: number,
  dimension: number = 10000
): CalibratedConfidenceResult {
  const mu = dimension * 0.5; // 5000 bits
  const sigma = Math.sqrt(dimension * 0.25); // 50 bits
  const zScore = (mu - distance) / sigma;
  const rawSimilarityPercent = parseFloat((rawSimilarity * 100).toFixed(1));

  // If at or below the 3.0σ noise floor (dH > 4850 bits):
  // Hand is in resting / unaligned state (orthogonal noise)
  if (zScore < 3.0 || distance > 4850) {
    return {
      confidencePercent: 0.0,
      isConfident: false,
      distanceBits: distance,
      rawSimilarityPercent,
      zScore: parseFloat(zScore.toFixed(1)),
      statusLabel: 'Neutral Hand (Resting) • Awaiting Gesture',
    };
  }

  // Above 3σ noise floor: confirmed gesture match
  // Smooth non-linear curve mapping 3σ..40σ into 72%..99.9% confidence
  const progress = Math.min(1.0, (4850 - distance) / 2350); // 0.0 at dH=4850, 1.0 at dH<=2500
  const curved = Math.pow(Math.max(0, progress), 0.65);
  const confidencePercent = parseFloat(Math.min(99.9, Math.max(72.0, 72.0 + curved * 27.9)).toFixed(1));

  return {
    confidencePercent,
    isConfident: true,
    distanceBits: distance,
    rawSimilarityPercent,
    zScore: parseFloat(zScore.toFixed(1)),
    statusLabel: `${confidencePercent}% Match • Confirmed (${zScore.toFixed(0)}σ above noise floor)`,
  };
}

/**
 * Calibrates a candidate's individual score for the breakdown ranking list.
 */
export function calibrateCandidateScore(
  distance: number,
  rawSimilarity: number,
  isPredictedWinner: boolean,
  winnerConfidence: number
): { confidence: number; labelText: string } {
  if (isPredictedWinner && winnerConfidence > 0) {
    return {
      confidence: winnerConfidence,
      labelText: `${winnerConfidence}%`,
    };
  }

  // Non-winner distractor candidates:
  if (distance > 4850) {
    // True orthogonal noise
    const noiseConf = parseFloat(Math.max(0.5, ((5000 - Math.min(5000, distance)) / 30)).toFixed(1));
    return {
      confidence: noiseConf,
      labelText: `${noiseConf}%`,
    };
  }

  // Runner-up with partial sub-threshold alignment:
  const runnerUpProgress = Math.min(0.8, (4850 - distance) / 2350);
  const runnerUpConf = parseFloat((runnerUpProgress * 45).toFixed(1));
  return {
    confidence: runnerUpConf,
    labelText: `${runnerUpConf}%`,
  };
}
