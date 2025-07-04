// Global type declarations
declare module 'quagga' {
  interface QuaggaConfig {
    inputStream: {
      name: string;
      type: string;
      target: HTMLElement;
      constraints: {
        facingMode: string;
        width: { min: number };
        height: { min: number };
        aspectRatio: { min: number; max: number };
      };
    };
    locator: {
      patchSize: string;
      halfSample: boolean;
    };
    numOfWorkers: number;
    frequency: number;
    decoder: {
      readers: string[];
    };
    locate: boolean;
  }

  interface DetectionResult {
    codeResult: {
      code: string;
    };
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }

  interface Quagga {
    init(config: QuaggaConfig, callback: (err: any) => void): void;
    start(): void;
    stop(): void;
    onDetected(callback: (result: DetectionResult) => void): void;
  }

  const Quagga: Quagga;
  export default Quagga;
}
