import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface SingleHand {
  landmarks: LandmarkPoint[];
  handedness: string;
}

export interface HandDetectionResult {
  hasHand: boolean;
  handCount: number;
  hands: SingleHand[];
  landmarks: LandmarkPoint[];
  handedness: string;
}

// Sleek, anatomically correct hand skeleton connections (no spiderweb diagonals across palm)
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [5, 6], [6, 7], [7, 8],
  // Middle
  [9, 10], [10, 11], [11, 12],
  // Ring
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [17, 18], [18, 19], [19, 20],
  // Palm perimeter outline
  [0, 5], [5, 9], [9, 13], [13, 17], [17, 0]
];

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private isReady: boolean = false;
  private syntheticPose: string = 'peace';
  private syntheticTime: number = 0;

  public async init(): Promise<void> {
    try {
      console.log('Initializing MediaPipe HandLandmarker with dual-hand support...');
      const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
      
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      this.isReady = true;
      console.log('MediaPipe HandLandmarker initialized (2-Hand Mode Active).');
    } catch (err) {
      console.warn('GPU delegate failed or asset error, falling back to CPU:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        this.isReady = true;
      } catch (cpuErr) {
        console.warn('CPU landmarker initialization failed, running in synthetic mode:', cpuErr);
        this.isReady = true;
      }
    }
  }

  public setSyntheticPose(pose: string): void {
    this.syntheticPose = pose;
  }

  public detectHand(video: HTMLVideoElement, timestampMs: number, isLiveCamera: boolean): HandDetectionResult {
    if (isLiveCamera) {
      if (this.landmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const result = this.landmarker.detectForVideo(video, timestampMs);
          if (result && result.landmarks && result.landmarks.length > 0) {
            const hands: SingleHand[] = [];

            for (let h = 0; h < result.landmarks.length; h++) {
              const rawLms = result.landmarks[h];
              const landmarks: LandmarkPoint[] = rawLms.map((pt) => ({
                x: pt.x,
                y: pt.y,
                z: pt.z ?? 0.0,
              }));

              const handedness = result.handedness?.[h]?.[0]?.categoryName ?? (h === 0 ? 'Right' : 'Left');
              hands.push({ landmarks, handedness });
            }

            return {
              hasHand: true,
              handCount: hands.length,
              hands,
              landmarks: hands[0].landmarks,
              handedness: hands[0].handedness,
            };
          }
        } catch (err) {
          // Frame skip
        }
      }
      return { hasHand: false, handCount: 0, hands: [], landmarks: [], handedness: '' };
    }

    const synth = this.generateSyntheticHand();
    return {
      hasHand: true,
      handCount: 1,
      hands: [{ landmarks: synth.landmarks, handedness: 'Right' }],
      landmarks: synth.landmarks,
      handedness: 'Right',
    };
  }

  public generateSyntheticHand(): HandDetectionResult {
    this.syntheticTime += 0.03;
    const t = this.syntheticTime;
    const lms: LandmarkPoint[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

    lms[0] = { x: 0.5 + Math.sin(t * 1.5) * 0.02, y: 0.8 + Math.cos(t * 1.2) * 0.02, z: 0 };
    lms[9] = { x: 0.5 + Math.sin(t * 1.5) * 0.02, y: 0.45 + Math.cos(t * 1.2) * 0.02, z: 0 };

    if (this.syntheticPose === 'thumbs_up') {
      lms[1] = { x: 0.42, y: 0.70, z: 0 };
      lms[2] = { x: 0.38, y: 0.55, z: 0 };
      lms[3] = { x: 0.35, y: 0.35, z: 0 };
      lms[4] = { x: 0.35, y: 0.15 + Math.sin(t * 2) * 0.02, z: 0 };
      for (let id = 5; id < 21; id++) {
        const fIdx = Math.floor((id - 5) / 4);
        const j = (id - 5) % 4;
        lms[id] = { x: 0.44 + fIdx * 0.06, y: 0.48 + j * 0.02, z: -0.04 };
      }
    } else {
      for (let id = 1; id < 21; id++) {
        const fIdx = Math.floor((id - 1) / 4);
        const j = (id - 1) % 4;
        lms[id] = { x: 0.35 + fIdx * 0.07, y: 0.70 - j * 0.12, z: 0 };
      }
    }

    return {
      hasHand: true,
      handCount: 1,
      hands: [{ landmarks: lms, handedness: 'Right' }],
      landmarks: lms,
      handedness: 'Right',
    };
  }

  /**
   * Draws a sleek, refined, modern holographic skeleton overlay (not bulky or bloated)
   */
  public drawSkeleton(
    ctx: CanvasRenderingContext2D,
    input: LandmarkPoint[] | SingleHand[],
    width: number,
    height: number
  ): void {
    ctx.clearRect(0, 0, width, height);

    if (!input || (input as any).length === 0) return;

    const handsToDraw: SingleHand[] = (input[0] && 'landmarks' in input[0])
      ? (input as SingleHand[])
      : [{ landmarks: input as LandmarkPoint[], handedness: 'Right' }];

    handsToDraw.forEach((hand, hIdx) => {
      const landmarks = hand.landmarks;
      if (!landmarks || landmarks.length < 21) return;

      const isRightHand = hand.handedness === 'Right' || hIdx === 0;
      const boneStrokeColor = isRightHand ? 'rgba(56, 189, 248, 0.75)' : 'rgba(192, 132, 252, 0.75)';
      const nodeFillColor = isRightHand ? '#38bdf8' : '#c084fc';
      const wristAnchorColor = isRightHand ? '#10b981' : '#a855f7';

      // 1. Sleek Laser Bone Lines (clean 1.1px stroke, zero blurry shadow)
      ctx.save();
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = boneStrokeColor;

      for (const [start, end] of HAND_CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Refined Precision Tracking Micro-Nodes (small, crisp, elegant)
      const tipIndices = new Set([4, 8, 12, 16, 20]);

      for (let i = 0; i < landmarks.length; i++) {
        const pt = landmarks[i];
        const px = pt.x * width;
        const py = pt.y * height;

        if (i === 0) {
          // Wrist Anchor: small 2.5px crisp reticle
          ctx.beginPath();
          ctx.arc(px, py, 2.8, 0, 2 * Math.PI);
          ctx.strokeStyle = wristAnchorColor;
          ctx.lineWidth = 1.0;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Handedness pill tag above wrist
          ctx.save();
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle = isRightHand ? '#38bdf8' : '#c084fc';
          ctx.fillText(hand.handedness.toUpperCase(), px - 10, py + 12);
          ctx.restore();
        } else if (tipIndices.has(i)) {
          // Fingertip Micro-Reticles: small 2.2px crisp outer ring + tiny white center dot
          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, 2 * Math.PI);
          ctx.strokeStyle = nodeFillColor;
          ctx.lineWidth = 0.9;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, 1.0, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        } else {
          // Intermediate Finger Knuckles: tiny 1.2px clean dot
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
          ctx.fill();
        }
      }
    });

    // If both hands are active, draw a delicate connecting indicator line
    if (handsToDraw.length >= 2) {
      const w1 = handsToDraw[0].landmarks[0];
      const w2 = handsToDraw[1].landmarks[0];
      const d = Math.hypot(w1.x - w2.x, w1.y - w2.y);
      if (d < 0.35) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(w1.x * width, w1.y * height);
        ctx.lineTo(w2.x * width, w2.y * height);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
