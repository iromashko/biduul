d3 = require('d3')

OUT = console.log // Haaa :D

const chart = require('./js/dashboard/chart')
const trading = require('./js/dashboard/trading')
const myOrders = require('./js/dashboard/my-orders')

//// CHART
chart.drawChart('#chart')

//// TRADING
d3.selectAll('.num-input')
    .on('keyup', () => { trading.forceNumInput() })
d3.select('#market-order')
    .on('change', () => { trading.onMarketOrderToggled() })
d3.select('#buy')
    .on('click', () => { trading.onBuy() })
d3.select('#sell')
    .on('click', () => { trading.onSell() })

//// MY ORDERS
