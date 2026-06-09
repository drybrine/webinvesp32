declare module "bwip-js" {
  export interface ToCanvasOptions {
    bcid: string
    text: string
    scale?: number
    height?: number
    includetext?: boolean
    columns?: number
    [key: string]: unknown
  }

  export function toCanvas(canvas: HTMLCanvasElement, options: ToCanvasOptions): void

  const bwipjs: {
    toCanvas: typeof toCanvas
  }

  export default bwipjs
}
