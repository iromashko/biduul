import React, { ReactElement } from 'react';
import {
  Nav, NavItem, NavLink, TabContent,
} from 'reactstrap';
import useChange from 'use-change';

import useWidgetSizeBreakpoint from '../../../hooks/useWidgetSizeBreakpoint';
import Widget from '../../layout/Widget';
import TradingOptions from './TradingOptions';
import { PERSISTENT } from '../../../store';
import Limit from './Limit';
import Market from './Market';
import StopLimit from './StopLimit';
import StopMarket from './StopMarket';

const Trading = ({ title, id }: { title: string; id: string; }): ReactElement => {
  const [type, setType] = useChange(PERSISTENT, 'tradingType');
  const [isWideLayout, wideLayoutRef] = useWidgetSizeBreakpoint('lg');
  const [postOnly, setPostOnly] = useChange(PERSISTENT, 'tradingPostOnly');
  const [reduceOnly, setReduceOnly] = useChange(PERSISTENT, 'tradingReduceOnly');

  return (
    <Widget id={id} title={title} bodyRef={wideLayoutRef} shouldCheckAccount>
      <TradingOptions
        postOnly={postOnly}
        reduceOnly={reduceOnly}
        setPostOnly={setPostOnly}
        setReduceOnly={setReduceOnly}
      />
      <Nav tabs className="mt-3">
        <NavItem>
          <NavLink active={type === 'LIMIT'} onClick={() => setType('LIMIT')} className="cursor-pointer px-3 py-1">Limit</NavLink>
        </NavItem>
        <NavItem>
          <NavLink active={type === 'MARKET'} onClick={() => setType('MARKET')} className="cursor-pointer px-3 py-1">Market</NavLink>
        </NavItem>
        <NavItem>
          <NavLink active={type === 'STOP'} onClick={() => setType('STOP')} className="cursor-pointer px-3 py-1">Stop Limit</NavLink>
        </NavItem>
        <NavItem>
          <NavLink active={type === 'STOP_MARKET'} onClick={() => setType('STOP_MARKET')} className="cursor-pointer px-3 py-1">Stop Market</NavLink>
        </NavItem>
      </Nav>
      <TabContent className="p-1" data-trading-type={type}>
        <div className={`tab-pane fade${type === 'LIMIT' ? ' show active' : ''}`}>
          <Limit
            isWideLayout={isWideLayout}
            postOnly={postOnly}
            reduceOnly={reduceOnly}
            tradingType="LIMIT"
          />
        </div>
        <div className={`tab-pane fade${type === 'MARKET' ? ' show active' : ''}`}>
          <Market
            isWideLayout={isWideLayout}
            postOnly={postOnly}
            reduceOnly={reduceOnly}
            tradingType="MARKET"
          />
        </div>
        <div className={`tab-pane fade${type === 'STOP' ? ' show active' : ''}`}>
          <StopLimit
            isWideLayout={isWideLayout}
            postOnly={postOnly}
            reduceOnly={reduceOnly}
            tradingType="STOP"
          />
        </div>
        <div className={`tab-pane fade${type === 'STOP_MARKET' ? ' show active' : ''}`}>
          <StopMarket
            isWideLayout={isWideLayout}
            postOnly={postOnly}
            reduceOnly={reduceOnly}
            tradingType="STOP_MARKET"
          />
        </div>
      </TabContent>
    </Widget>
  );
};

export default Trading;
