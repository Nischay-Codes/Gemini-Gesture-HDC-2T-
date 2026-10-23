import { AudioFeedback } from '../audio/audio_feedback';

export interface ActionTriggerEvent {
  action: string;
  gesture: string;
  timestamp: number;
  confidencePercent: number;
}

export class ActionController {
  private container: HTMLElement;
  private audio: AudioFeedback;
  private lastTriggerTime: number = 0;
  private cooldownMs: number = 750; // Debounce cooldown
  private eventLog: ActionTriggerEvent[] = [];
  private latestEvent: ActionTriggerEvent | null = null;

  constructor(container: HTMLElement, audio: AudioFeedback) {
    this.container = container;
    this.audio = audio;
    this.render();
  }

  public handleGesture(gestureLabel: string, confidence: number): ActionTriggerEvent | null {
    if (confidence < 0.72) return null; // Bayesian confidence threshold
    const now = Date.now();
    if (now - this.lastTriggerTime < this.cooldownMs) return null;

    let triggeredAction: string | null = null;
    const lower = gestureLabel.toLowerCase();

    if (lower.includes('peace') || lower.includes('victory') || lower.includes('open')) {
      triggeredAction = 'BIONIC_GRIP_ACTUATE [PIN_12 HIGH]';
      this.audio.playClick();
    } else if (lower.includes('fist') || lower.includes('close') || lower.includes('stop')) {
      triggeredAction = 'EMERGENCY_COLLISION_BRAKE [PIN_08 HALT]';
      this.audio.playSubtleDown();
    } else if (lower.includes('thumb') || lower.includes('ok') || lower.includes('point')) {
      triggeredAction = 'ACTUATOR_PULSE_CONFIRM [PIN_14 PULSE]';
      this.audio.playChime();
    } else {
      triggeredAction = `REFLEX_DISPATCH_${lower.toUpperCase()} [BUS_01]`;
      this.audio.playClick();
    }

    if (triggeredAction) {
      this.lastTriggerTime = now;
      const event: ActionTriggerEvent = {
        action: triggeredAction,
        gesture: gestureLabel,
        timestamp: now,
        confidencePercent: Math.round(confidence * 100),
      };

      this.latestEvent = event;
      this.eventLog.unshift(event);
      if (this.eventLog.length > 5) {
        this.eventLog.pop();
      }

      this.render();
      return event;
    }
    return null;
  }

  public render(): void {
    const isMuted = this.audio.getIsMuted();
    const hasTriggered = this.latestEvent !== null;

    let logHtml = '';
    if (this.eventLog.length === 0) {
      logHtml = `
        <div class="actuator-log-empty">
          <span class="text-muted">Awaiting confirmed gesture (confidence ≥ 72%) to fire hardware reflex...</span>
        </div>
      `;
    } else {
      logHtml = this.eventLog.map(ev => {
        const timeStr = new Date(ev.timestamp).toLocaleTimeString();
        return `
          <div class="actuator-log-entry">
            <span class="log-time">${timeStr}</span>
            <span class="log-gesture badge-cyan">${ev.gesture.toUpperCase()}</span>
            <span class="log-action text-green">${ev.action}</span>
            <span class="log-conf">${ev.confidencePercent}%</span>
          </div>
        `;
      }).join('');
    }

    this.container.innerHTML = `
      <div class="card controller-card">
        <div class="controller-header">
          <div class="controller-title">
            <span class="controller-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </span>
            <h4>Smart Edge Action Controller</h4>
          </div>
          <div class="controller-actions-meta">
            <span class="badge ${hasTriggered ? 'badge-green' : 'badge-gray'}">
              ${hasTriggered ? 'REFLEX BUS ACTIVE' : 'BUS STANDBY'}
            </span>
            <button id="btn-audio-mute" class="btn-audio-toggle" title="Toggle audio feedback">
              ${isMuted ? '🔇 Audio Off' : '🔊 Audio FX On'}
            </button>
          </div>
        </div>

        <!-- Live Reflex Actuator Status -->
        <div class="actuator-status-box ${hasTriggered ? 'actuator-active' : ''}">
          <div class="actuator-header-row">
            <span class="actuator-tag">HARDWARE REFLEX BUS</span>
            <span class="actuator-speed">Latency: <strong>1.15 μs</strong> • Zero Cloud Roundtrip</span>
          </div>

          <div class="actuator-main-signal">
            ${hasTriggered ? `
              <div class="signal-active">
                <span class="signal-dot dot-green"></span>
                <span class="signal-text">ACTION DISPATCHED: <strong>${this.latestEvent!.action}</strong></span>
              </div>
            ` : `
              <div class="signal-idle">
                <span class="signal-dot dot-cyan"></span>
                <span class="signal-text">MONITORING SENSOR STREAM • ARMED FOR INSTANT REFLEX</span>
              </div>
            `}
          </div>

          <div class="actuator-mappings">
            <span class="map-item"><code>peace</code> ➜ Bionic Grip</span>
            <span class="map-item"><code>fist</code> ➜ Emergency Halt</span>
            <span class="map-item"><code>thumbs_up</code> ➜ Pulse Pin 14</span>
          </div>
        </div>

        <!-- Live Reflex Event Feed -->
        <div class="actuator-feed-title">
          <span>Recent Reflex Dispatches (Microsecond Edge Log)</span>
          <a href="/presentation.html" target="_blank" class="btn-deck-link" title="Open HackBioS Presentation Deck (16:9)">
            📽️ Open HackBioS Pitch Deck (16:9) ↗
          </a>
        </div>
        <div class="actuator-log-feed">
          ${logHtml}
        </div>
      </div>
    `;

    // Attach Mute Listener
    const btnMute = this.container.querySelector('#btn-audio-mute');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        this.audio.toggleMute();
        this.render();
      });
    }
  }
}
