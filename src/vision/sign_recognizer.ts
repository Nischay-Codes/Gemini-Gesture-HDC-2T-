import { LandmarkPoint } from './hand_tracker';

export interface SignRecognitionOutput {
  signKey: string;
  signName: string;
  spokenPhrase: string;
  category: 'greeting' | 'response' | 'need' | 'emergency' | 'social' | 'number';
  confidence: number;
  description: string;
  features: {
    thumbExtended: boolean;
    indexExtended: boolean;
    middleExtended: boolean;
    ringExtended: boolean;
    pinkyExtended: boolean;
    isPinch: boolean;
    palmFacingCamera: boolean;
  };
}

/**
 * Robust geometric analyzer for 21 3D hand landmarks from MediaPipe Tasks-Vision.
 * Analyzes finger curl/extension ratios, distances, and spatial topology to accurately
 * identify standard ASL and everyday non-verbal signs without false positives.
 */
export class SignLanguageRecognizer {
  /**
   * Evaluates if a finger is extended vs curled based on Euclidean distance from wrist (0)
   * relative to its proximal interphalangeal joint (PIP / MCP).
   */
  private static isFingerExtended(
    landmarks: LandmarkPoint[],
    tipIdx: number,
    pipIdx: number,
    mcpIdx: number
  ): boolean {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const mcp = landmarks[mcpIdx];

    const dTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y, (tip.z - wrist.z) * 1.5);
    const dPipWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y, (pip.z - wrist.z) * 1.5);
    const dMcpWrist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y, (mcp.z - wrist.z) * 1.5);

    // If tip is significantly further from wrist than PIP and MCP, finger is extended
    return dTipWrist > dPipWrist * 1.15 && dTipWrist > dMcpWrist * 1.25;
  }

  /**
   * Thumb evaluation: Thumb moves along a different biomechanical plane.
   * Compares tip distance to pinky base (17) and index MCP (5).
   */
  private static isThumbExtended(landmarks: LandmarkPoint[]): boolean {
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    const wrist = landmarks[0];

    const dThumbIndexMcp = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
    const dPinkyMcpIndexMcp = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);

    // If thumb tip is spread outward past palm width
    const isSpread = dThumbIndexMcp > dPinkyMcpIndexMcp * 0.75;
    // Or if thumb is pointing vertically upward away from wrist (Thumbs up)
    const isPointingUp = thumbTip.y < indexMcp.y - 0.05 && thumbTip.y < wrist.y - 0.12;

    return isSpread || isPointingUp;
  }

  /**
   * Checks if thumb tip (4) and index tip (8) are touching (Pinch / OK gesture).
   */
  private static isThumbIndexPinching(landmarks: LandmarkPoint[]): boolean {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, thumbTip.z - indexTip.z);
    return dist < 0.07;
  }

  /**
   * Classifies the current 21-point hand skeleton into standard sign language signs.
   */
  public static recognize(landmarks: LandmarkPoint[]): SignRecognitionOutput | null {
    if (!landmarks || landmarks.length !== 21) {
      return null;
    }

    const thumbExt = this.isThumbExtended(landmarks);
    const indexExt = this.isFingerExtended(landmarks, 8, 6, 5);
    const middleExt = this.isFingerExtended(landmarks, 12, 10, 9);
    const ringExt = this.isFingerExtended(landmarks, 16, 14, 13);
    const pinkyExt = this.isFingerExtended(landmarks, 20, 18, 17);
    const isPinch = this.isThumbIndexPinching(landmarks);

    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const palmFacingCamera = (landmarks[5].x - landmarks[17].x) * (landmarks[5].y - wrist.y) < 0;

    const extendedCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

    const features = {
      thumbExtended: thumbExt,
      indexExtended: indexExt,
      middleExtended: middleExt,
      ringExtended: ringExt,
      pinkyExtended: pinkyExt,
      isPinch,
      palmFacingCamera,
    };

    // 1. OPEN PALM / HELLO / STOP
    // All 4 fingers extended + thumb extended
    if (indexExt && middleExt && ringExt && pinkyExt && thumbExt) {
      return {
        signKey: 'hello',
        signName: 'Hello / Greeting',
        spokenPhrase: 'Hello, how are you?',
        category: 'greeting',
        confidence: 0.96,
        description: 'Open hand with all 5 fingers spread naturally.',
        features,
      };
    }

    // 2. STOP / WAIT
    // 4 fingers extended together, thumb tucked or flat
    if (indexExt && middleExt && ringExt && pinkyExt && !thumbExt) {
      return {
        signKey: 'stop',
        signName: 'Stop / Wait',
        spokenPhrase: 'Please stop and wait.',
        category: 'need',
        confidence: 0.94,
        description: 'Flat upright palm facing outward.',
        features,
      };
    }

    // 3. I LOVE YOU (ASL ILY Sign)
    // Thumb extended, Index extended, Pinky extended, Middle & Ring curled
    if (thumbExt && indexExt && pinkyExt && !middleExt && !ringExt) {
      return {
        signKey: 'i_love_you',
        signName: 'I Love You (ASL)',
        spokenPhrase: 'I love you.',
        category: 'social',
        confidence: 0.98,
        description: 'Thumb, index, and pinky extended; middle and ring folded.',
        features,
      };
    }

    // 4. PEACE / TWO / VICTORY
    // Index and middle extended in V-shape, ring & pinky curled, thumb folded
    if (indexExt && middleExt && !ringExt && !pinkyExt && !thumbExt) {
      return {
        signKey: 'peace',
        signName: 'Peace / Two',
        spokenPhrase: 'Peace and harmony.',
        category: 'social',
        confidence: 0.95,
        description: 'Index and middle fingers extended in a V-shape.',
        features,
      };
    }

    // 5. THUMBS UP / YES / AGREE
    // Thumb extended vertically upwards, all other 4 fingers curled tightly
    if (thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt && thumbTip.y < wrist.y) {
      return {
        signKey: 'yes',
        signName: 'Yes / Agree',
        spokenPhrase: 'Yes, I agree.',
        category: 'response',
        confidence: 0.97,
        description: 'Thumb pointing upward with all four fingers curled.',
        features,
      };
    }

    // 6. THUMBS DOWN / NO / DISAGREE
    // Thumb pointing downwards, fingers curled
    if (thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt && thumbTip.y > wrist.y + 0.05) {
      return {
        signKey: 'no',
        signName: 'No / Disagree',
        spokenPhrase: 'No, thank you.',
        category: 'response',
        confidence: 0.94,
        description: 'Thumb pointing downward with fingers curled.',
        features,
      };
    }

    // 7. OK / PERFECT
    // Thumb and index touching in circle, middle/ring/pinky extended
    if (isPinch && middleExt && ringExt && pinkyExt) {
      return {
        signKey: 'ok',
        signName: 'OK / All Good',
        spokenPhrase: 'Everything is OK and good.',
        category: 'response',
        confidence: 0.95,
        description: 'Thumb and index tip touching, other three fingers extended.',
        features,
      };
    }

    // 8. WATER (ASL 'W' Sign)
    // Index, middle, and ring fingers extended up, thumb holding pinky
    if (indexExt && middleExt && ringExt && !pinkyExt) {
      return {
        signKey: 'water',
        signName: 'Water / Thirsty',
        spokenPhrase: 'I need some water, please.',
        category: 'need',
        confidence: 0.93,
        description: 'ASL "W" handshape: three middle fingers extended up.',
        features,
      };
    }

    // 9. POINT / YOU / ATTENTION
    // Index finger extended alone, all others curled
    if (indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) {
      return {
        signKey: 'point',
        signName: 'You / Look',
        spokenPhrase: 'Please look over here.',
        category: 'social',
        confidence: 0.92,
        description: 'Index finger pointing forward.',
        features,
      };
    }

    // 10. FIST / SOLID / HOLD
    // All fingers curled tightly
    if (!indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) {
      return {
        signKey: 'fist',
        signName: 'Fist / Solid',
        spokenPhrase: 'Holding tight.',
        category: 'response',
        confidence: 0.95,
        description: 'Closed fist with all fingers tucked.',
        features,
      };
    }

    // 11. THANK YOU / PLEASE (Fingers clustered flat)
    if (indexExt && middleExt && !pinkyExt && thumbExt) {
      return {
        signKey: 'thank_you',
        signName: 'Thank You',
        spokenPhrase: 'Thank you very much.',
        category: 'social',
        confidence: 0.88,
        description: 'Hand flat with thumb out in gesture of gratitude.',
        features,
      };
    }

    // 12. HELP / EMERGENCY (Clenched hand raised or moving)
    if (!indexExt && !middleExt && !ringExt && !pinkyExt && thumbExt) {
      return {
        signKey: 'help',
        signName: 'Help / Assistance',
        spokenPhrase: 'I need assistance, please help.',
        category: 'emergency',
        confidence: 0.89,
        description: 'Hand held up indicating need for support.',
        features,
      };
    }

    return null;
  }
}
