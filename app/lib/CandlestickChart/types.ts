import { FuturesChartCandle } from 'node-binance-api';

export type D3Selection<T extends d3.BaseType, C extends d3.BaseType = null>
  = d3.Selection<T, unknown, C, unknown>;

export interface StyleMargin {
  top: number; right: number; bottom: number; left: number;
}

export interface ChartItem {
  appendTo: (parent: Element, resizeData: ResizeData) => void;
  resize: ({ width, height, margin }: ResizeData) => void
}

export interface Scales {
  x: d3.ScaleTime<number, number, never>;
  scaledX: d3.ScaleTime<number, number, never>;
  y: d3.ScaleSymLog<number, number, never>;
}

export interface ResizeData {
  width: number;
  height: number;
  margin: StyleMargin;
  scales: Scales;
}

export interface DrawData {
  candles: FuturesChartCandle[];
}

export interface SmoozCandle extends Omit<FuturesChartCandle, 'open' | 'close'> {
  direction: 'up' | 'down';
  open: number;
  close: number;
}

export interface LineData {
  text: string;
  value: string;
  color: string;
}
