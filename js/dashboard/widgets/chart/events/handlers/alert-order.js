/* Copyright 2020-2021 Pascal Reinhard

This file is published under the terms of the GNU Affero General Public License
as published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version. See <https://www.gnu.org/licenses/>. */

'use strict'
const api = require('../../../../../apis/futures')

module.exports = class AlertOrderHandlers {

    constructor (chart) {
        this.chart = chart
        this.candles = chart.data.candles
        this.alertLabels = chart.alertLabels
        this.alertLinesData = chart.data.alertLines
        this.lastPrice = null
    }

    placeOrderAlert (node) {
        let price = this.chart.scales.y.invert( d3.mouse(node)[1] )
        price = +(price.toFixed(this.chart.yPrecision));

        let lastPrice = (api.lastPrice)
                ? api.lastPrice
                : this.candles.last.close

        let side = (price <= lastPrice) ? 'buy' : 'sell'
        let qty = d3.select('#' + side + '-qty').property('value')

        let data = { value: price, qty: Number(qty), side: side }
        this.alertLinesData.push(data)

        this.chart.draw()
    }

    checkAlerts() {
        const lastPrice = api.lastPrice
                ? +api.lastPrice
                : +this.candles.last.close;

        const previousLastPrice = this.lastPrice
        const alertLinesData = this.alertLinesData;

        if(lastPrice && previousLastPrice) {
            const up = alertLinesData.find(({ value }) => lastPrice >= value && previousLastPrice < value);
            const down = alertLinesData.find(({ value }) => lastPrice <= value && previousLastPrice > value);
            if(up) {
                this.alertedPrice = lastPrice;
                new Audio('./assets/audio/alert-up.mp3').play()
                this.cancelAlert(alertLinesData.indexOf(up))
            } else if(down) {
                this.alertedPrice = lastPrice;
                new Audio('./assets/audio/alert-down.mp3').play()
                this.cancelAlert(alertLinesData.indexOf(down))
            }
        }


        this.lastPrice = lastPrice;
    }
    
    onDragAlert () {
        this.alertLabels.draw(this.alertLinesData)
    }

    cancelAlert (i) {
        this.alertLinesData.splice(i, 1)
        this.alertLabels.draw(this.alertLinesData)
        this.chart.draw()
    }
} 
