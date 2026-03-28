export interface DataPoint {
  timestamp: number;
  value: number;
}

export interface Series {
  id: string;
  data: DataPoint[];
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScaleDomain {
  min: number;
  max: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ScaleOptions {
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  padding: Padding;
}
