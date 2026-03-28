export enum LayerType {
  Background = 'Background',
  Axis = 'Axis',
  Data = 'Data',
  Interaction = 'Interaction',
}

export const LAYER_ORDER = [
  LayerType.Background,
  LayerType.Axis,
  LayerType.Data,
  LayerType.Interaction,
] as const;

export interface Layer {
  readonly type: LayerType;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  isDirty: boolean;
  draw(): void;
}

export type LayerDrawCallback = (ctx: CanvasRenderingContext2D) => void;

export interface FrameSchedulerOptions {
  idleFramesBeforeSleep?: number; // default: 3
}
