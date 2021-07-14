/* Copyright 2020-2021 Pascal Reinhard

This file is published under the terms of the GNU Affero General Public License
as published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version. See <https://www.gnu.org/licenses/>. */

'use strict'
const api = require('../apis/futures')

module.exports = { getFee, getBreakEven, getPnl, getDailyPnl, getDailyBreakEven }

function getFee (qty, type = 'limit') {
    let feeTier = api.account.feeTier || 0
    let feeRate = (type === 'market')
        ? [.04, .04, .035, .032, .03, .027, .025, .022, .020, 0.017][feeTier]
        : [.02, .016, .014, .012, .01, .008, .006, .004, .002, 0][feeTier]

    return qty * feeRate / 100
}

function getPnl (symbol = SYMBOL) {
    let position = api.positions.filter(x => x.symbol === symbol)[0]

    if (!position || position.qty == 0)
        return {value: 0, percent: 0}

    let qty = position.qty
    let price = api.lastTrade.price
    let entryPrice = +position.price
    let baseValue = +position.baseValue
    let fee = getFee(qty, 'limit') // Todo: get fee sum from order histo

    let pnl = (price - entryPrice) / entryPrice * baseValue - fee
    return {
        value: pnl || 0,
        percent: pnl / api.account.balance || 0
    }
}

let timer
let incomeHistory = []
let historyStart = new Date(Date.now() - 4*3600000).setHours(4)

async function getDailyPnl (symbol = SYMBOL) {
    let currentBalance = api.account.balance

    // Throttle api calls
    if (!timer || Date.now() > timer + 5 * 1000) {
        timer = Date.now()
        // Get all balance modifying events since last 4am.
        let start = historyStart
        let end = Date.now()
        let response
        let error
        let data = incomeHistory

        do {
            response = await api.lib.futuresIncome({
                symbol: symbol,
                startTime: start,
                endTime: end,
                limit: 1000
            })
            .catch(err => {
                error = err
                if (err.code == 'ETIMEDOUT')
                    console.warn('Warning: futuresIncome() request timed out')
            })

            if (error || !response.length)
                break

            data = [].concat(response, data)
            start = response.last.time + 1
        }
        while (response.length >= 999) // API limit reached

        if (!error) {
            incomeHistory = data
            historyStart = start
        }
    }

    let pnlArray = incomeHistory.filter(
        x => x.incomeType == 'REALIZED_PNL' && x.symbol == symbol
    )
    let feesArray = incomeHistory.filter(
        x => x.incomeType == 'COMMISSION' && x.symbol == symbol
    )
    let fundingArray = incomeHistory.filter(
        x => x.incomeType == 'FUNDING_FEE' && x.symbol == symbol
    )

    let totalPnl = 0
    for (let x of pnlArray)
        totalPnl += +x.income

    let totalFee = 0
    for (let x of feesArray)
        totalFee += +x.income

    let totalFunding = 0
    for (let x of fundingArray)
        totalFunding += +x.income

    totalPnl += totalFee + totalFunding

    let oldBalance = currentBalance - totalPnl
    let percent = (totalPnl > 0)
            ? totalPnl / oldBalance
            // if in loss, show % required to recover loss
            // instead of % lost
            : totalPnl / currentBalance

    return {
        value: totalPnl,
        percent: percent
    }
}

async function getBreakEven (symbol = SYMBOL) {
    let position = api.positions.filter(x => x.symbol === symbol)[0]

    if (!position || position.qty == 0)
        return 0

    let trades = await api.getPositionTrades(symbol)

    let entryPrice = +position.price
    let baseValue = +position.baseValue

    let pnl = 0
    trades.forEach(x => pnl += +x.realizedPnl)

    let fees = 0
    trades.forEach(x => fees += +x.commission)
    fees += getFee(Math.abs(baseValue)) // position closing fee

    let breakEven = entryPrice * (fees - pnl) / baseValue + entryPrice
    return breakEven
}

async function getDailyBreakEven (symbol = SYMBOL) {
    let position = api.positions.filter(x => x.symbol === symbol)[0]

    if (!position || position.qty == 0)
        return 0

    let entryPrice = +position.price
    let baseValue = +position.baseValue
    let fee = getFee(Math.abs(baseValue))
    let dailyPnl = await getDailyPnl(symbol)
    dailyPnl = dailyPnl.value

    let breakEven = entryPrice * (fee - dailyPnl) / baseValue + entryPrice

    return Math.max(breakEven, 0)
}