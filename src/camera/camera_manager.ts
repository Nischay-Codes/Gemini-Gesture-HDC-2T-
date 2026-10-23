export class CameraManager {
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private isSynthetic: boolean = false;
  private animationFrameId: number | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  public async startCamera(): Promise<boolean> {
    try {
      if (this.stream) {
        this.stopCamera();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      await new Promise<void>((resolve) => {
        const onReady = () => {
          this.videoElement.play().then(() => resolve()).catch(() => resolve());
        };
        if (this.videoElement.readyState >= 2) {
          onReady();
        } else {
          this.videoElement.onloadeddata = onReady;
          setTimeout(onReady, 400);
        }
      });
      this.isSynthetic = false;
      return true;
    } catch (err) {
      console.warn('Physical camera access failed or unavailable, activating synthetic tracker:', err);
      this.isSynthetic = true;
      return false;
    }
  }

  public stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.videoElement.srcObject = null;
    this.isSynthetic = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public isUsingSynthetic(): boolean {
    return this.isSynthetic;
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }
}
