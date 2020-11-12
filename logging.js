module.exports = (logger, logErr, chalk) => {
    const stripAnsi = require('strip-ansi')

    const pad = (word, length) => {
        var padded = word
        for (let i = word.length; i < length; i++) {
            padded += ' '
        }
        return padded
    }

    const line = (length) => {
        var line = ''
        for (let i = 0; i < length; i++) {
            line += '-'
        }
        return line
    }

    const colSpace = '    '

    const table = (data, column1, column2) => {
        // assume data is just a key:value pair
        var col1MaxLength = column1.length
        var col2MaxLength = column2.length
        Object.keys(data).forEach((key) => {
            col1MaxLength = Math.max(col1MaxLength, stripAnsi(key).length)
            col2MaxLength = Math.max(col2MaxLength, stripAnsi(data[key].toString()).length)
        })

        return [
            pad(column1, col1MaxLength) + colSpace + pad(column2, col2MaxLength),
            line(col1MaxLength) + colSpace + line(col2MaxLength),
            ...Object.keys(data).map((key) => pad(key, col1MaxLength) + colSpace + pad(data[key], col2MaxLength)),
        ]
    }

    const logClients = (clients, myId) => {
        const formatted = {}
        Object.keys(clients).forEach((id) => {
            if (clients[id] === null) {
                formatted[id] = chalk.red('null')
            } else {
                formatted[id] = chalk.blue(clients[id])
            }
            if (id === myId) {
                formatted[chalk.green(id)] = formatted[id]
                delete formatted[id]
            }
        })
        table(formatted, 'id', 'nickname').forEach((line) => {
            logger(line)
        })
    }

    const logRound = (state, currentPlayer = -3, bluffedNumber = 0) => {
        var i = -2 // minus two to account for header and lines
        Object.keys(state).forEach((player) => {
            if (bluffedNumber !== 0) {
                Object.keys(state[player]).forEach((index) => {
                    if (state[player][index] === bluffedNumber || state[player][index] === 6) {
                        state[player][index] = chalk.green(chalk.bold(state[player][index].toString()))
                    }
                })
            }
        })
        table(state, 'nickname', 'dice').forEach((line) => {
            if (i === currentPlayer) {
                line += '<'
            }
            logger(line)
            i++
        })
        logger('')
    }

    return { logClients, logRound, table }
}
