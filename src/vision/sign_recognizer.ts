import { LandmarkPoint, SingleHand } from './hand_tracker';

export interface SignRecognitionOutput {
  signKey: string;
  signName: string;
  spokenPhrase: string;
  category: 'greeting' | 'response' | 'need' | 'emergency' | 'social' | 'number';
  confidence: number;
  description: string;
  handCount: 1 | 2;
}

/**
 * Robust geometric analyzer for MediaPipe 3D hand landmarks.
 * Analyzes single-hand poses and two-handed spatial interactions
 * (e.g. Namaste, ASL Help, Heart, Time-Out, Clapping, Home)
 * to empower fluid, natural non-verbal communication.
 */
export class SignLanguageRecognizer {
  /**
   * Distance between two 3D landmarks
   */
  private static dist(p1: LandmarkPoint, p2: LandmarkPoint): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z - p2.z) * 1.5);
  }

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

    const dTipWrist = this.dist(tip, wrist);
    const dPipWrist = this.dist(pip, wrist);
    const dMcpWrist = this.dist(mcp, wrist);

    return dTipWrist > dPipWrist * 1.15 && dTipWrist > dMcpWrist * 1.25;
  }

  /**
   * Thumb evaluation: checks outward spread or upright vertical orientation.
   */
  private static isThumbExtended(landmarks: LandmarkPoint[]): boolean {
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    const wrist = landmarks[0];

    const dThumbIndexMcp = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
    const dPinkyMcpIndexMcp = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);

    const isSpread = dThumbIndexMcp > dPinkyMcpIndexMcp * 0.75;
    const isPointingUp = thumbTip.y < indexMcp.y - 0.05 && thumbTip.y < wrist.y - 0.10;

    return isSpread || isPointingUp;
  }

  /**
   * Checks if thumb tip (4) and index tip (8) are touching (Pinch / OK gesture).
   */
  private static isThumbIndexPinching(landmarks: LandmarkPoint[]): boolean {
    return this.dist(landmarks[4], landmarks[8]) < 0.07;
  }

  /**
   * Evaluates hand fingers state summary
   */
  private static getHandState(landmarks: LandmarkPoint[]) {
    const thumbExt = this.isThumbExtended(landmarks);
    const indexExt = this.isFingerExtended(landmarks, 8, 6, 5);
    const middleExt = this.isFingerExtended(landmarks, 12, 10, 9);
    const ringExt = this.isFingerExtended(landmarks, 16, 14, 13);
    const pinkyExt = this.isFingerExtended(landmarks, 20, 18, 17);
    const isPinch = this.isThumbIndexPinching(landmarks);

    const extendedCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

    return {
      thumbExt,
      indexExt,
      middleExt,
      ringExt,
      pinkyExt,
      isPinch,
      extendedCount,
      allFourExtended: indexExt && middleExt && ringExt && pinkyExt,
      allFiveExtended: indexExt && middleExt && ringExt && pinkyExt && thumbExt,
      isFist: !indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt,
      isThumbsUp: thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt && landmarks[4].y < landmarks[0].y,
      isPeace: indexExt && middleExt && !ringExt && !pinkyExt && !thumbExt,
      isIly: thumbExt && indexExt && pinkyExt && !middleExt && !ringExt,
    };
  }

  /**
   * Main entry point: Accepts array of SingleHand (1 or 2 hands)
   */
  public static recognize(handsInput: SingleHand[] | LandmarkPoint[]): SignRecognitionOutput | null {
    if (!handsInput || handsInput.length === 0) return null;

    // Convert input to SingleHand array
    const hands: SingleHand[] = ('landmarks' in handsInput[0])
      ? (handsInput as SingleHand[])
      : [{ landmarks: handsInput as LandmarkPoint[], handedness: 'Right' }];

    // If 2 hands are present, first check for iconic 2-handed interactions!
    if (hands.length >= 2) {
      const twoHandMatch = this.recognizeTwoHands(hands[0].landmarks, hands[1].landmarks);
      if (twoHandMatch) {
        return twoHandMatch;
      }
    }

    // Single hand evaluation (or dominant hand when 2 hands are present but independent)
    const primary = hands[0].landmarks;
    const singleMatch = this.recognizeSingleHand(primary);
    if (singleMatch) return singleMatch;

    // If secondary hand is present, check it too
    if (hands.length >= 2) {
      return this.recognizeSingleHand(hands[1].landmarks);
    }

    return null;
  }

  /**
   * Two-Handed Sign Language Recognition Engine
   */
  private static recognizeTwoHands(h1: LandmarkPoint[], h2: LandmarkPoint[]): SignRecognitionOutput | null {
    if (h1.length < 21 || h2.length < 21) return null;

    const s1 = this.getHandState(h1);
    const s2 = this.getHandState(h2);

    const w1 = h1[0]; // Wrist 1
    const w2 = h2[0]; // Wrist 2
    const dWrists = this.dist(w1, w2);
    const dIndexTips = this.dist(h1[8], h2[8]);
    const dThumbTips = this.dist(h1[4], h2[4]);
    const dMiddleTips = this.dist(h1[12], h2[12]);

    // 1. 🙏 NAMASTE / PRAYER / PLEASE / THANK YOU (Palms together, upright)
    // Both hands open, wrists close, index tips close, fingers pointing up
    if (s1.allFourExtended && s2.allFourExtended && dWrists < 0.28 && dIndexTips < 0.16) {
      const fingersUp1 = h1[12].y < w1.y;
      const fingersUp2 = h2[12].y < w2.y;
      if (fingersUp1 && fingersUp2) {
        return {
          signKey: 'namaste',
          signName: 'Namaste / Thank You',
          spokenPhrase: 'Thank you very much, with respect and gratitude.',
          category: 'greeting',
          confidence: 0.98,
          description: 'Two hands pressed together in respect.',
          handCount: 2,
        };
      }
    }

    // 2. 🆘 ASL OFFICIAL HELP (Fist resting on flat palm base)
    // One hand is a flat base palm, the other hand is a fist on top of it
    const isBase1 = s1.allFourExtended;
    const isFist2 = s2.isFist || s2.isThumbsUp;
    const isBase2 = s2.allFourExtended;
    const isFist1 = s1.isFist || s1.isThumbsUp;

    if ((isBase1 && isFist2) || (isBase2 && isFist1)) {
      const dHandCenters = Math.hypot(h1[9].x - h2[0].x, h1[9].y - h2[0].y);
      if (dHandCenters < 0.22) {
        return {
          signKey: 'asl_help',
          signName: 'Emergency Help (ASL)',
          spokenPhrase: 'I need urgent help and assistance right now!',
          category: 'emergency',
          confidence: 0.98,
          description: 'ASL Help: Fist placed on top of flat palm base.',
          handCount: 2,
        };
      }
    }

    // 3. ❤️ TWO-HANDED HEART / LOVE
    // Both thumbs touching at bottom, both index tips touching at top
    if (dThumbTips < 0.14 && dIndexTips < 0.16 && (s1.thumbExt && s2.thumbExt)) {
      const thumbsBelowIndices = (h1[4].y > h1[8].y - 0.05) && (h2[4].y > h2[8].y - 0.05);
      if (thumbsBelowIndices) {
        return {
          signKey: 'heart',
          signName: 'Heart / Love',
          spokenPhrase: 'Sending you love from the bottom of my heart.',
          category: 'social',
          confidence: 0.96,
          description: 'Two hands joined forming a heart shape.',
          handCount: 2,
        };
      }
    }

    // 4. 🛑 TIME OUT / STOP ('T' Shape)
    // One flat horizontal hand, one flat vertical hand touching palm center
    const isH1Horizontal = Math.abs(h1[9].x - h1[0].x) > Math.abs(h1[9].y - h1[0].y) * 0.8;
    const isH2Horizontal = Math.abs(h2[9].x - h2[0].x) > Math.abs(h2[9].y - h2[0].y) * 0.8;

    if ((isH1Horizontal && s2.allFourExtended) || (isH2Horizontal && s1.allFourExtended)) {
      const horiz = isH1Horizontal ? h1 : h2;
      const vert = isH1Horizontal ? h2 : h1;
      const dTouch = Math.hypot(vert[8].x - horiz[9].x, vert[8].y - horiz[9].y);
      if (dTouch < 0.18) {
        return {
          signKey: 'time_out',
          signName: 'Time Out / Pause',
          spokenPhrase: 'Time out, please pause for a moment.',
          category: 'need',
          confidence: 0.95,
          description: 'One horizontal palm, one vertical forming a T-shape.',
          handCount: 2,
        };
      }
    }

    // 5. 🏠 HOME / FAMILY / ROOF
    // Both hands flat, fingertips touching at apex angle, wrists spread apart
    if (s1.allFourExtended && s2.allFourExtended && dMiddleTips < 0.12 && dWrists > 0.22) {
      return {
        signKey: 'home',
        signName: 'Home / Family',
        spokenPhrase: 'I would like to go home to my family.',
        category: 'need',
        confidence: 0.94,
        description: 'Fingertips touching at an angle forming a roof.',
        handCount: 2,
      };
    }

    // 6. 👐 WELCOME / OPEN / GATHER
    // Both hands open, facing camera, spaced apart
    if (s1.allFiveExtended && s2.allFiveExtended && dWrists > 0.26) {
      return {
        signKey: 'welcome',
        signName: 'Welcome / Everyone',
        spokenPhrase: 'Welcome everyone, pleased to see you all.',
        category: 'greeting',
        confidence: 0.96,
        description: 'Both open palms spread wide facing outward.',
        handCount: 2,
      };
    }

    // 7. 🤲 RECEIVE / GIVING / HUMBLE REQUEST
    // Both palms facing up, wrists close side by side
    if (s1.allFourExtended && s2.allFourExtended && dWrists < 0.26 && dIndexTips < 0.20) {
      const palmsUp1 = h1[12].y > h1[9].y - 0.15;
      if (palmsUp1) {
        return {
          signKey: 'receive',
          signName: 'Please Give / Request',
          spokenPhrase: 'Could you please give or provide this to me?',
          category: 'need',
          confidence: 0.93,
          description: 'Both cupped hands open side-by-side.',
          handCount: 2,
        };
      }
    }

    // 8. 👏 APPLAUSE / CLAPPING / BRAVO
    // Open hands very close together
    if (s1.allFourExtended && s2.allFourExtended && dWrists < 0.18 && dIndexTips < 0.14) {
      return {
        signKey: 'applause',
        signName: 'Applause / Bravo',
        spokenPhrase: 'Bravo! Outstanding job and applause!',
        category: 'social',
        confidence: 0.95,
        description: 'Both hands clapping together.',
        handCount: 2,
      };
    }

    // 9. 👍👍 DOUBLE THUMBS UP
    if (s1.isThumbsUp && s2.isThumbsUp) {
      return {
        signKey: 'double_thumbs_up',
        signName: 'Double Thumbs Up / Great',
        spokenPhrase: 'Excellent! I completely agree and approve!',
        category: 'response',
        confidence: 0.98,
        description: 'Both hands showing thumbs up simultaneously.',
        handCount: 2,
      };
    }

    // 10. ✌️✌️ DOUBLE PEACE / HARMONY
    if (s1.isPeace && s2.isPeace) {
      return {
        signKey: 'double_peace',
        signName: 'Double Peace / Harmony',
        spokenPhrase: 'Peace and unity to everyone.',
        category: 'social',
        confidence: 0.97,
        description: 'Both hands showing victory/peace signs.',
        handCount: 2,
      };
    }

    // 11. 🤝 TOGETHER / FRIENDSHIP
    // Both fists or close hands interlocking
    if ((s1.isFist || s1.isThumbsUp) && (s2.isFist || s2.isThumbsUp) && dWrists < 0.24) {
      return {
        signKey: 'together',
        signName: 'Together / Friendship',
        spokenPhrase: 'We are united together in friendship.',
        category: 'social',
        confidence: 0.95,
        description: 'Both fists touching together in solidarity.',
        handCount: 2,
      };
    }

    return null;
  }

  /**
   * Single-Handed Sign Language Recognition
   */
  private static recognizeSingleHand(landmarks: LandmarkPoint[]): SignRecognitionOutput | null {
    if (!landmarks || landmarks.length !== 21) return null;

    const s = this.getHandState(landmarks);
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];

    // 1. OPEN PALM / HELLO / GREETING
    if (s.allFiveExtended) {
      return {
        signKey: 'hello',
        signName: 'Hello / Greeting',
        spokenPhrase: 'Hello, how are you today?',
        category: 'greeting',
        confidence: 0.96,
        description: 'Open hand with all 5 fingers spread naturally.',
        handCount: 1,
      };
    }

    // 2. STOP / WAIT
    if (s.allFourExtended && !s.thumbExt) {
      return {
        signKey: 'stop',
        signName: 'Stop / Wait',
        spokenPhrase: 'Please stop and wait.',
        category: 'need',
        confidence: 0.94,
        description: 'Flat upright palm facing outward.',
        handCount: 1,
      };
    }

    // 3. I LOVE YOU (ASL ILY Sign)
    if (s.isIly) {
      return {
        signKey: 'i_love_you',
        signName: 'I Love You (ASL)',
        spokenPhrase: 'I love you.',
        category: 'social',
        confidence: 0.98,
        description: 'Thumb, index, and pinky extended; middle and ring folded.',
        handCount: 1,
      };
    }

    // 4. PEACE / TWO
    if (s.isPeace) {
      return {
        signKey: 'peace',
        signName: 'Peace / Two',
        spokenPhrase: 'Peace and harmony.',
        category: 'social',
        confidence: 0.95,
        description: 'Index and middle fingers extended in a V-shape.',
        handCount: 1,
      };
    }

    // 5. THUMBS UP / YES
    if (s.isThumbsUp) {
      return {
        signKey: 'yes',
        signName: 'Yes / Agree',
        spokenPhrase: 'Yes, I agree.',
        category: 'response',
        confidence: 0.97,
        description: 'Thumb pointing upward with all four fingers curled.',
        handCount: 1,
      };
    }

    // 6. THUMBS DOWN / NO
    if (s.thumbExt && !s.indexExt && !s.middleExt && !s.ringExt && !s.pinkyExt && thumbTip.y > wrist.y + 0.05) {
      return {
        signKey: 'no',
        signName: 'No / Disagree',
        spokenPhrase: 'No, thank you.',
        category: 'response',
        confidence: 0.94,
        description: 'Thumb pointing downward with fingers curled.',
        handCount: 1,
      };
    }

    // 7. OK / PERFECT
    if (s.isPinch && s.middleExt && s.ringExt && s.pinkyExt) {
      return {
        signKey: 'ok',
        signName: 'OK / All Good',
        spokenPhrase: 'Everything is OK and good.',
        category: 'response',
        confidence: 0.95,
        description: 'Thumb and index tip touching, other three fingers extended.',
        handCount: 1,
      };
    }

    // 8. WATER (ASL 'W')
    if (s.indexExt && s.middleExt && s.ringExt && !s.pinkyExt) {
      return {
        signKey: 'water',
        signName: 'Water / Thirsty',
        spokenPhrase: 'I need some water, please.',
        category: 'need',
        confidence: 0.93,
        description: 'ASL "W" handshape: three middle fingers extended up.',
        handCount: 1,
      };
    }

    // 9. POINT / YOU
    if (s.indexExt && !s.middleExt && !s.ringExt && !s.pinkyExt && !s.thumbExt) {
      return {
        signKey: 'point',
        signName: 'You / Look',
        spokenPhrase: 'Please look over here.',
        category: 'social',
        confidence: 0.92,
        description: 'Index finger pointing forward.',
        handCount: 1,
      };
    }

    // 10. FIST / SOLID
    if (s.isFist) {
      return {
        signKey: 'fist',
        signName: 'Fist / Solid',
        spokenPhrase: 'Holding tight.',
        category: 'response',
        confidence: 0.95,
        description: 'Closed fist with all fingers tucked.',
        handCount: 1,
      };
    }

    // 11. THANK YOU (Single hand gratitude)
    if (s.indexExt && s.middleExt && !s.pinkyExt && s.thumbExt) {
      return {
        signKey: 'thank_you',
        signName: 'Thank You',
        spokenPhrase: 'Thank you very much.',
        category: 'social',
        confidence: 0.88,
        description: 'Hand flat with thumb out in gesture of gratitude.',
        handCount: 1,
      };
    }

    // 12. HELP / ASSISTANCE (Single hand)
    if (!s.indexExt && !s.middleExt && !s.ringExt && !s.pinkyExt && s.thumbExt) {
      return {
        signKey: 'help',
        signName: 'Help / Assistance',
        spokenPhrase: 'I need assistance, please help.',
        category: 'emergency',
        confidence: 0.89,
        description: 'Hand held up indicating need for support.',
        handCount: 1,
      };
    }

    return null;
  }
}
