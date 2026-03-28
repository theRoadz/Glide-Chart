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
