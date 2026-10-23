import { LandmarkPoint } from '../vision/hand_tracker';

export const WINDOW_SIZE = 15;
export const LANDMARKS_PER_FRAME = 21;
export const DIMS_PER_FRAME = LANDMARKS_PER_FRAME * 3; // 63
export const TOTAL_FLOATS = WINDOW_SIZE * DIMS_PER_FRAME; // 945

/**
 * Normalizes planar hand orientation relative to the wrist-to-middle-MCP axis.
 * Maps any hand tilt/rotation into a canonical vertical orientation (-Y),
 * providing mathematical tilt invariance (0° to 45°) in HDC hypervector space.
 */
export function normalizePalmOrientation(landmarks: LandmarkPoint[]): LandmarkPoint[] {
  if (!landmarks || landmarks.length !== LANDMARKS_PER_FRAME) {
    return landmarks;
  }
  const wrist = landmarks[0];
  const mcp = landmarks[9]; // Middle MCP joint base
  const dx = mcp.x - wrist.x;
  const dy = mcp.y - wrist.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-4) {
    return landmarks;
  }
  // Angle of middle MCP relative to wrist
  const angle = Math.atan2(dy, dx);
  // Canonical reference direction: pointing straight up along -Y axis (-Math.PI / 2)
  const rot = -Math.PI / 2 - angle;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  return landmarks.map(p => {
    const rx = p.x - wrist.x;
    const ry = p.y - wrist.y;
    return {
      x: wrist.x + rx * cosR - ry * sinR,
      y: wrist.y + rx * sinR + ry * cosR,
      z: p.z,
    };
  });
}

export class TrajectoryBuffer {
  private buffer: LandmarkPoint[][] = [];
  private lastWristPos: { x: number; y: number; z: number } | null = null;
  private currentVelocity: number = 0;
  private smoothedLandmarks: LandmarkPoint[] | null = null;
  private skipWarmup: boolean = false;

  public addFrame(landmarks: LandmarkPoint[]): boolean {
    if (!landmarks || landmarks.length !== LANDMARKS_PER_FRAME) {
      return false;
    }

    // High-precision Exponential Moving Average (EMA) temporal smoothing filter:
    // Suppresses random camera pixel flicker and micro-jitter while maintaining instant responsiveness
    const alpha = 0.78;
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== LANDMARKS_PER_FRAME) {
      this.smoothedLandmarks = landmarks.map(p => ({ x: p.x, y: p.y, z: p.z }));
    } else {
      for (let i = 0; i < LANDMARKS_PER_FRAME; i++) {
        this.smoothedLandmarks[i].x = alpha * landmarks[i].x + (1 - alpha) * this.smoothedLandmarks[i].x;
        this.smoothedLandmarks[i].y = alpha * landmarks[i].y + (1 - alpha) * this.smoothedLandmarks[i].y;
        this.smoothedLandmarks[i].z = alpha * landmarks[i].z + (1 - alpha) * this.smoothedLandmarks[i].z;
      }
    }

    // Canonicalize palm orientation to eliminate rotation / tilt errors
    const alignedLandmarks = normalizePalmOrientation(this.smoothedLandmarks);

    // Calculate wrist velocity
    const wrist = landmarks[0];
    if (this.lastWristPos) {
      const dx = wrist.x - this.lastWristPos.x;
      const dy = wrist.y - this.lastWristPos.y;
      const dz = wrist.z - this.lastWristPos.z;
      this.currentVelocity = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.lastWristPos = { x: wrist.x, y: wrist.y, z: wrist.z };

    // Dedicated capture mode for 1-Shot Enrollment & Reinforcement:
    // Accumulates 15 genuine consecutive frames across time instead of single-frame replication!
    if (this.skipWarmup) {
      this.buffer.push(alignedLandmarks);
      if (this.buffer.length >= WINDOW_SIZE) {
        this.skipWarmup = false;
      }
      return this.buffer.length === WINDOW_SIZE;
    }

    // Instant warm-up during live webcam browsing:
    // Replicates initial frame so classification starts immediately without awkward 250ms freeze
    if (this.buffer.length === 0) {
      for (let i = 0; i < WINDOW_SIZE; i++) {
        this.buffer.push(alignedLandmarks);
      }
      return true;
    }

    this.buffer.push(alignedLandmarks);
    if (this.buffer.length > WINDOW_SIZE) {
      this.buffer.shift();
    }

    return this.buffer.length === WINDOW_SIZE;
  }

  public isFull(): boolean {
    return this.buffer.length === WINDOW_SIZE;
  }

  public getVelocity(): number {
    return this.currentVelocity;
  }

  public getFlattenedTrajectory(): Float64Array | null {
    if (!this.isFull()) {
      return null;
    }

    const flat = new Float64Array(TOTAL_FLOATS);
    for (let t = 0; t < WINDOW_SIZE; t++) {
      const frame = this.buffer[t];
      const offset = t * DIMS_PER_FRAME;
      for (let i = 0; i < LANDMARKS_PER_FRAME; i++) {
        const lm = frame[i];
        flat[offset + i * 3] = lm.x;
        flat[offset + i * 3 + 1] = lm.y;
        flat[offset + i * 3 + 2] = lm.z;
      }
    }

    return flat;
  }

  public getFrames(): LandmarkPoint[][] {
    return this.buffer.map(frame => frame.map(p => ({ x: p.x, y: p.y, z: p.z })));
  }

  public clear(skipWarmup: boolean = false): void {
    this.buffer = [];
    this.lastWristPos = null;
    this.currentVelocity = 0;
    this.smoothedLandmarks = null;
    this.skipWarmup = skipWarmup;
  }
}

