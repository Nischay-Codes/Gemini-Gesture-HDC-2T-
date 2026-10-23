export class CameraManager {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isSynthetic: boolean = false;

  constructor(videoElement?: HTMLVideoElement) {
    if (videoElement) {
      this.videoElement = videoElement;
    }
  }

  public setVideoElement(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement;
  }

  public async start(videoElement?: HTMLVideoElement): Promise<boolean> {
    return this.startCamera(videoElement);
  }

  public async startCamera(videoElement?: HTMLVideoElement): Promise<boolean> {
    if (videoElement) {
      this.videoElement = videoElement;
    }

    if (!this.videoElement) {
      console.error('No HTMLVideoElement provided to CameraManager.');
      return false;
    }

    try {
      if (this.stream) {
        this.stop();
      }

      console.log('Requesting webcam access from browser...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, min: 480 },
          height: { ideal: 480, min: 360 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      await new Promise<void>((resolve) => {
        const onReady = () => {
          this.videoElement?.play().then(() => resolve()).catch(() => resolve());
        };
        if (this.videoElement && this.videoElement.readyState >= 2) {
          onReady();
        } else if (this.videoElement) {
          this.videoElement.onloadeddata = onReady;
          setTimeout(onReady, 500);
        } else {
          resolve();
        }
      });

      this.isSynthetic = false;
      console.log('Camera stream acquired and playing.');
      return true;
    } catch (err: any) {
      console.error('Physical camera access failed:', err);
      alert('Camera permission error: ' + (err.message || 'Please enable camera permissions for localhost.'));
      this.isSynthetic = true;
      return false;
    }
  }

  public stop(): void {
    this.stopCamera();
  }

  public stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isSynthetic = true;
  }

  public isStreaming(): boolean {
    return Boolean(this.stream && this.stream.active && this.stream.getVideoTracks().some(t => t.readyState === 'live'));
  }

  public isUsingSynthetic(): boolean {
    return this.isSynthetic;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }
}
