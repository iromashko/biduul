import $ from 'balajs';
import * as d3 from 'd3';

import { isEqual, last } from 'lodash';
import * as api from '../../api';
import Axes from './items/Axes';
import ClipPath from './items/ClipPath';
import GridLines from './items/GridLines';
import Plot from './items/Plot';
import Svg from './items/Svg';

import './chart.global.css';

import {
  ResizeData, DrawData, Scales, StyleMargin, D3Selection,
  PriceLinesDatum, ChartPaddingPercents, DraftPrices,
} from './types';
import { TradingOrder, TradingPosition } from '../../store/types';
import { OrderSide } from '../../api';
import Measurer from './items/Measurer';
import { RootStore } from '../../store';
import Lines from './lines';

type ZooomTranslateBy = () => d3.Selection<d3.BaseType, unknown, null, undefined>;

interface Params {
  onUpdateAlerts: (d: number[]) => void;
  onUpdateDrafts: (d: DraftPrices) => void;
  onClickDraftCheck: (d: DraftPrices, side: OrderSide) => void;
  onDragLimitOrder: (orderId: number, price: number) => void;
  onCancelOrder: (orderId: number) => void;
  alerts: number[];
  draftPriceItems: PriceLinesDatum[];
  pricePrecision: number;
  paddingPercents: ChartPaddingPercents;
  calculateLiquidationPrice: RootStore['trading']['calculateLiquidationPrice'];
  getPseudoPosition: RootStore['trading']['getPseudoPosition'];
}

export default class CandlestickChart {
  #svg: Svg;

  #clipPath: ClipPath;

  #axes: Axes;

  #gridLines: GridLines;

  #plot: Plot;

  #width = 0;

  #height = 0;

  #margin: StyleMargin = {
    top: 0, right: 55, bottom: 30, left: 55,
  };

  #paddingPercents: ChartPaddingPercents;

  #scales: Scales;

  #container: HTMLElement;

  #measurer: Measurer;

  #pricePrecision: number;

  #hasInitialScroll = false;

  #candles: api.FuturesChartCandle[] = [];

  #zoom = d3.zoom();

  #zoomTransform: Pick<d3.ZoomTransform, 'x' | 'y' | 'k'> = { k: 1, x: 0, y: 0 };

  #lines: Lines;

  constructor(
    container: string | Node | HTMLElement | HTMLElement[] | Node[],
    {
      pricePrecision, alerts, paddingPercents, calculateLiquidationPrice, getPseudoPosition,
      onUpdateDrafts, onUpdateAlerts, onClickDraftCheck, onDragLimitOrder, onCancelOrder,
    }: Params,
  ) {
    const containerElement = $.one(container);
    if (!containerElement) throw new Error('Element not found');
    this.#container = containerElement;

    const resizeData = this.#calcDimensions();

    const x = d3.scaleTime().range([0, this.#width]);

    this.#scales = {
      x,
      scaledX: x,
      y: localStorage.getItem('forceChartLinearScale') === 'true'
        ? d3.scaleLinear().range([this.#height, 0])
        : d3.scaleSymlog().range([this.#height, 0]),
    };

    this.#pricePrecision = pricePrecision;
    this.#svg = new Svg();
    this.#axes = new Axes({ scales: this.#scales });
    this.#clipPath = new ClipPath();
    this.#gridLines = new GridLines({ scales: this.#scales });
    this.#paddingPercents = paddingPercents;
    this.#measurer = new Measurer({ scales: this.#scales, resizeData });
    this.#plot = new Plot({ scales: this.#scales });

    this.#lines = new Lines({
      axis: this.#axes.getAxis(),
      alerts,
      calculateLiquidationPrice,
      getPseudoPosition,
      onUpdateAlerts,
      onUpdateDrafts,
      onClickDraftCheck,
      onDragLimitOrder,
      onCancelOrder,
    }, resizeData);

    this.#initialRender();

    d3.select(this.#container).select('svg').call(
      this.#zoom.on('zoom', (event: d3.D3ZoomEvent<Element, unknown>) => {
        const { transform } = event;

        this.#zoomTransform = transform;

        const scaledX = transform.rescaleX(this.#scales.x);

        this.#scales.scaledX = scaledX;

        this.#axes.update({ scaledX });
        this.#gridLines.update({ scaledX });
        this.#plot.update({ scaledX });
        this.#lines.update();

        this.#draw();
      }) as (selection: D3Selection<d3.BaseType>) => void,
    );
  }

  /**
   * The method updates chart properties but not chart data
   * @param properties - New chart properties
   */
  public update(data: {
    totalWalletBalance?: number;
    currentSymbolInfo?: api.FuturesExchangeInfoSymbol | null;
    currentSymbolLeverage?: number;
    // not implicitly used but required for component updates
    isCurrentSymbolMarginTypeIsolated?: boolean;
    candles?: api.FuturesChartCandle[],
    position?: TradingPosition | null;
    orders?: TradingOrder[];
    alerts?: number[];
    customPriceLines?: PriceLinesDatum[];

    buyDraftPrice?: number | null;
    sellDraftPrice?: number | null;
    buyDraftSize?: number | null;
    sellDraftSize?: number | null;
    shouldShowBuyDraftPrice?: boolean;
    shouldShowSellDraftPrice?: boolean;

    stopBuyDraftPrice?: number | null;
    stopSellDraftPrice?: number | null;
    shouldShowStopBuyDraftPrice?: boolean;
    shouldShowStopSellDraftPrice?: boolean;

    canCreateDraftLines?: boolean;

    paddingPercents?: ChartPaddingPercents;
  }): void {
    if (typeof data.currentSymbolInfo !== 'undefined') {
      const pricePrecision = data.currentSymbolInfo?.pricePrecision ?? 0;

      this.#pricePrecision = pricePrecision;
      this.#axes.update({ pricePrecision });
      this.#lines.update({ pricePrecision });
    }

    if (typeof data.candles !== 'undefined') {
      const isNewSymbol = !!this.#candles.length
        && this.#candles[0]?.symbol !== data.candles[0]?.symbol;
      const isNewInterval = this.#candles[0]?.interval !== data.candles[0]?.interval;
      this.#candles = data.candles;
      const lastPrice = +(last(data.candles ?? [])?.close ?? 0);

      if (lastPrice) {
        this.#lines.draftLines.updateDraftLines({ lastPrice });

        if (isNewSymbol) {
          this.#lines.alertLines.update({ lastPrice });
        }

        this.#lines.alertLines.checkAlerts(lastPrice);
      }

      this.#draw();

      if (isNewSymbol || isNewInterval) {
        this.#resize();
        this.#lines.update();
      }
    }

    if (
      typeof data.buyDraftPrice !== 'undefined'
      || typeof data.sellDraftPrice !== 'undefined'
      || typeof data.buyDraftSize !== 'undefined'
      || typeof data.sellDraftSize !== 'undefined'
      || typeof data.shouldShowBuyDraftPrice !== 'undefined'
      || typeof data.shouldShowSellDraftPrice !== 'undefined'
      || typeof data.stopBuyDraftPrice !== 'undefined'
      || typeof data.stopSellDraftPrice !== 'undefined'
      || typeof data.shouldShowStopBuyDraftPrice !== 'undefined'
      || typeof data.shouldShowStopSellDraftPrice !== 'undefined'
      || typeof data.canCreateDraftLines !== 'undefined'
    ) {
      this.#lines.draftLines.updateDraftLines(data);
    }

    if (typeof data.totalWalletBalance !== 'undefined') this.#measurer.update({ totalWalletBalance: data.totalWalletBalance });

    if (typeof data.currentSymbolLeverage !== 'undefined') {
      this.#measurer.update({ currentSymbolLeverage: data.currentSymbolLeverage });
    }

    if (typeof data.orders !== 'undefined') {
      this.#measurer.update({ orders: data.orders });
      this.#lines.orderLines.updateOrderLines(data.orders);
    }

    if (typeof data.position !== 'undefined') {
      this.#measurer.update({ position: data.position });
      this.#lines.positionLines.updatePositionLine(data.position);
    }

    if (typeof data.alerts !== 'undefined') this.#lines.alertLines.updateAlertLines(data.alerts);

    if (typeof data.customPriceLines !== 'undefined') this.#lines.customLines.update({ items: data.customPriceLines });

    if (typeof data.paddingPercents !== 'undefined' && !isEqual(data.paddingPercents, this.#paddingPercents)) {
      this.#paddingPercents = data.paddingPercents;

      this.#translateBy(
        -this.#zoomTransform.x
        + (this.#width * (-Math.min(90, Math.max(0, this.#paddingPercents.right)) / 100 || 0)),
      );

      this.#draw();
    }
  }

  /**
   * Removes SVG
   */
  public unmount(): void {
    d3.select(this.#container).select('svg').remove();
  }

  public resetAlerts = (): void => {
    this.#lines.alertLines.empty();
  };

  #draw = (): void => {
    this.#calcXDomain();
    this.#calcYDomain();
    const resizeData: ResizeData = {
      width: this.#width, height: this.#height, margin: this.#margin, scales: this.#scales,
    };

    const drawData: DrawData = { candles: this.#candles, zoomTransform: this.#zoomTransform };

    this.#axes.draw(resizeData);

    this.#gridLines.draw();

    this.#plot.draw(drawData);

    this.#lines.currentPriceLines.updateItem('currentPrice', {
      yValue: +(this.#candles[this.#candles.length - 1]?.close ?? 0),
    });

    if (!this.#hasInitialScroll && this.#candles.length) {
      this.#hasInitialScroll = true;
      this.#translateBy(
        this.#width * (-Math.min(90, Math.max(0, this.#paddingPercents.right)) / 100 || 0),
      );
    }
  };

  #translateBy = (value: number): void => {
    d3.select(this.#container).select('svg').call(
      this.#zoom.translateBy as ZooomTranslateBy, value,
    );
  };

  #resize = (): void => {
    const resizeData: ResizeData = this.#calcDimensions();
    this.#svg.resize(resizeData);
    this.#scales.x.range([0, this.#width]);
    this.#scales.y.range([this.#height, 0]);
    this.#axes.resize(resizeData);
    this.#clipPath.resize(resizeData);
    this.#gridLines.resize(resizeData);
    this.#lines.resize(resizeData);

    if (this.#candles.length) {
      this.#draw();
      this.#translateBy(0);
    }
  };

  #initialRender = (): void => {
    const resizeData: ResizeData = {
      width: this.#width, height: this.#height, margin: this.#margin, scales: this.#scales,
    };
    //  Order of appending = visual z-order (last is top)
    const svgContainer = this.#svg.appendTo(this.#container, resizeData);

    this.#gridLines.appendTo(svgContainer, resizeData);
    this.#axes.appendTo(svgContainer, resizeData);
    this.#plot.appendTo(svgContainer);
    this.#clipPath.appendTo(svgContainer, resizeData);
    this.#lines.appendTo(svgContainer, resizeData);
    this.#measurer.appendTo(svgContainer, resizeData);

    new ResizeObserver(() => this.#resize()).observe(this.#container);
  };

  #calcDimensions = (): ResizeData => {
    this.#width = this.#container.offsetWidth - this.#margin.left - this.#margin.right;
    this.#height = this.#container.offsetHeight - this.#margin.top - this.#margin.bottom;

    return {
      width: this.#width, height: this.#height, margin: this.#margin, scales: this.#scales,
    };
  };

  #calcXDomain = (): void => {
    const candles = this.#candles
      .slice(-Math.round(this.#width / 3), this.#candles.length);
    const xDomain = (candles.length)
      ? [candles[0].time, last(candles)?.time]
      : [new Date(0), new Date()];
    this.#scales.x.domain(xDomain as Iterable<Date | d3.NumberValue>);
  };

  #calcYDomain = (): void => {
    const { y } = this.#scales;
    const xDomain = this.#scales.scaledX.domain();
    const candles = this.#candles.filter((x) => x.time >= xDomain[0].getTime()
          && x.time <= xDomain[1].getTime());

    const yDomain: [number, number] = candles.length
      ? [d3.min(candles, (d) => +d.low) as number, d3.max(candles, (d) => +d.high) as number]
      : [0, 1];

    y.domain(yDomain);

    const paddingTopPercent = Math.min(50, Math.max(0, this.#paddingPercents.top)) || 0;
    const paddingBottomPercent = Math.min(50, Math.max(0, this.#paddingPercents.bottom)) || 0;
    const paddingTop = this.#height * (paddingTopPercent / 100);
    const paddingBottom = (this.#height * (paddingBottomPercent / 100));

    // Padding
    const yPaddingTop = y.invert(-paddingTop) - y.invert(0);
    const yPaddingBottom = y.invert(this.#height)
      - y.invert(this.#height + paddingBottom);

    yDomain[1] = (yDomain[1] ?? 0) + (+yPaddingTop.toFixed(this.#pricePrecision));
    yDomain[0] = (yDomain[0] ?? 0) - (+yPaddingBottom.toFixed(this.#pricePrecision));

    y.domain(yDomain);
  };
}
