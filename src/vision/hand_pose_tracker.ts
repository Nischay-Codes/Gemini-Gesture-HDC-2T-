/**
 * HandPoseTracker: Precision Hand Perception & Kinematic Stability Engine
 * 
 * Part of our Custom Architecture:
 * - Tracks 1 or 2 hands with 42 3D joints at 60 FPS
 * - Computes real-time hand velocity, inter-hand Euclidean distance, and stability
 * - Detects intentional communicative holds without requiring any hardcoded sign dictionary
 * - Directly drives Google Gemini Multimodal Vision & On-Device HDC SIMD Reflex Cache
 */

import { SingleHand, LandmarkPoint } from './hand_tracker';

export interface HandKinematics {
  handCount: number;
  isEngaged: boolean;
  stabilityScore: number; // 0 to 1 (1 = perfectly stable hold)
  isHoldingPose: boolean;
  holdDurationMs: number;
  interHandDistance: number; // Normalized distance between 2 palms (0 to 1)
  dominantHand: string;
  centroid: { x: number; y: number };
  motionVelocity: number;
}

export class HandPoseTracker {
  private prevLandmarks: LandmarkPoint[][] = [];
  private holdStartTime: number = 0;
  private isHolding: boolean = false;
  private lastTriggerTime: number = 0;
  private readonly STABILITY_VELOCITY_THRESHOLD = 0.038; // Normalized units / frame (forgiving of micro-tremor)
  private readonly MIN_HOLD_DURATION_MS = 160; // Fast pose lock in 160ms for instant real-time interaction
  private readonly COOLDOWN_MS = 1200; // Fast repeat turnaround

  /**
   * Evaluates current hand pose and returns kinematic telemetry & trigger decision
   */
  public analyze(hands: SingleHand[], timestamp: number): HandKinematics & { shouldTriggerGemini: boolean } {
    if (!hands || hands.length === 0) {
      this.prevLandmarks = [];
      this.isHolding = false;
      this.holdStartTime = 0;
      return {
        handCount: 0,
        isEngaged: false,
        stabilityScore: 0,
        isHoldingPose: false,
        holdDurationMs: 0,
        interHandDistance: 0,
        dominantHand: 'None',
        centroid: { x: 0.5, y: 0.5 },
        motionVelocity: 0,
        shouldTriggerGemini: false,
      };
    }

    // 1. Calculate Average Hand Centroid
    let totalX = 0;
    let totalY = 0;
    let pointCount = 0;
    for (const hand of hands) {
      for (const pt of hand.landmarks) {
        totalX += pt.x;
        totalY += pt.y;
        pointCount++;
      }
    }
    const centroid = {
      x: totalX / (pointCount || 1),
      y: totalY / (pointCount || 1),
    };

    // 2. Hand Engagement Check
    // Hand is engaged if wrist (index 0) or fingertips are in active visual zone
    const primaryWrist = hands[0].landmarks[0];
    const isEngaged = primaryWrist.y < 0.95 && primaryWrist.y > 0.05 && primaryWrist.x > 0.05 && primaryWrist.x < 0.95;

    // 3. Two-Hand Inter-Palm Distance
    let interHandDistance = 0;
    if (hands.length >= 2) {
      const p1 = hands[0].landmarks[0]; // Wrist/base of palm
      const p2 = hands[1].landmarks[0];
      interHandDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    // 4. Kinematic Motion Velocity (Framewise Delta)
    let totalDelta = 0;
    let comparedPoints = 0;

    if (this.prevLandmarks.length === hands.length) {
      for (let h = 0; h < hands.length; h++) {
        const curPts = hands[h].landmarks;
        const prevPts = this.prevLandmarks[h];
        if (curPts && prevPts) {
          // Compare wrist and 5 fingertips (landmarks 0, 4, 8, 12, 16, 20)
          const keyIndices = [0, 4, 8, 12, 16, 20];
          for (const idx of keyIndices) {
            const dx = curPts[idx].x - prevPts[idx].x;
            const dy = curPts[idx].y - prevPts[idx].y;
            totalDelta += Math.hypot(dx, dy);
            comparedPoints++;
          }
        }
      }
    }

    // Store current landmarks for next velocity calculation
    this.prevLandmarks = hands.map(h => h.landmarks.map(p => ({ x: p.x, y: p.y, z: p.z })));

    const motionVelocity = comparedPoints > 0 ? totalDelta / comparedPoints : 0;
    
    // Normalize stability score (0 = fast moving, 1 = perfectly still)
    const rawScore = 1 - Math.min(motionVelocity / (this.STABILITY_VELOCITY_THRESHOLD * 2.5), 1);
    const stabilityScore = Math.max(0, Math.min(1, rawScore));

    // 5. Detect Pose Stability Hold
    const now = Date.now();
    const isVelocityLow = motionVelocity < this.STABILITY_VELOCITY_THRESHOLD;

    if (isEngaged && isVelocityLow) {
      if (!this.isHolding) {
        this.isHolding = true;
        this.holdStartTime = now;
      }
    } else {
      this.isHolding = false;
      this.holdStartTime = 0;
    }

    const holdDurationMs = this.isHolding ? now - this.holdStartTime : 0;
    const isHoldingPose = holdDurationMs >= this.MIN_HOLD_DURATION_MS;

    // 6. Decide if Gemini should be automatically triggered
    let shouldTriggerGemini = false;
    if (isHoldingPose && (now - this.lastTriggerTime > this.COOLDOWN_MS)) {
      shouldTriggerGemini = true;
      this.lastTriggerTime = now;
    }

    return {
      handCount: hands.length,
      isEngaged,
      stabilityScore,
      isHoldingPose,
      holdDurationMs,
      interHandDistance,
      dominantHand: hands[0].handedness || (hands.length >= 2 ? 'Both Hands' : 'Right'),
      centroid,
      motionVelocity,
      shouldTriggerGemini,
    };
  }

  public resetCooldown(): void {
    this.lastTriggerTime = 0;
  }
}
