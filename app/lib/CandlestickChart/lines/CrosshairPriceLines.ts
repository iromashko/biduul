import * as d3 from 'd3';
import { ChartAxis, ResizeData } from '../types';
import PriceLines from './PriceLines';

interface Params {
  axis: ChartAxis;
}

export default class CrosshairPriceLines extends PriceLines {
  constructor({ axis }: Params, resizeData: ResizeData) {
    super({
      axis,
      items: [{ id: 'crosshair', isVisible: false }],
      showX: true,
      color: '#3F51B5',
      lineStyle: 'dotted',
      pointerEventsNone: true,
    }, resizeData);
  }

  public show = (x: number, y: number): void => {
    this.updateItem('crosshair', {
      isVisible: true,
      xValue: this.invertX(x),
      yValue: this.invertY(y),
    });
  };

  public hide = (): void => {
    this.updateItem('crosshair', { isVisible: false });
  };

  public appendTo = (
    parent: Element,
    resizeData: ResizeData,
    { wrapperCSSStyle }: { wrapperCSSStyle?: Partial<CSSStyleDeclaration> } = {},
  ): void => {
    super.appendTo(parent, resizeData, { wrapperCSSStyle });
    this.eventsArea?.on('mousemove', this.#onMouseMove)
      .on('mouseleave', this.#onMouseLeave);
  };

  #onMouseMove = (evt: MouseEvent): void => {
    const [x, y] = d3.pointer(evt);

    this.show(x, y);
  };

  #onMouseLeave = (): void => {
    this.hide();
  };
}
