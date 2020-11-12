const clientFactory = (config) => {
	const client = require('@yacoubb/socket.io-rooms').clientFactory(config);
	const { socket, commands, callbacks, registerCommands, setLogger: parentSetLogger, logErrorCode: parentLogErrorCode, chalk } = client;
	const { ERR_GAMESTARTED, ERR_GAMENOTSTARTED, ERR_NOTENOUGHPLAYERS, ERR_NOTYOURTURN, ERR_BADCALL, ERR_BADBLUFF } = require('./codes');
	var { logger, logErr } = client;
	var { logRound } = require('./logging')(logger, logErr, chalk);

	const dicegameCommands = {
		rules: {
			fn: () => {
				return new Promise((resolve, reject) => {
					socket.emit('rules', (success, data) => {
						if (success) {
							resolve(data);
						} else {
							reject(data);
						}
					});
				});
			},
			highlight: 'green',
			help: 'get the rules of the game',
		},
		start: {
			fn: () => {
				return new Promise((resolve, reject) => {
					socket.emit('start', (success, data) => {
						if (success) {
							resolve(data);
						} else {
							reject(data);
						}
					});
				});
			},
			highlight: 'blue',
			help: 'start a new game',
		},
		bluff: {
			fn: () => {
				return new Promise((resolve, reject) => {
					socket.emit('bluff', (success, data) => {
						if (success) {
							resolve(data);
						} else {
							reject(data);
						}
					});
				});
			},
			highlight: 'blue',
			help: `call the previous player's bluff`,
		},
		call: {
			fn: (args) => {
				return new Promise((resolve, reject) => {
					if (args.length !== 2) {
						// logger(`${chalk.red.bold('err')} bad call - usage: call {quantity} {value}`);
						reject(`bad call - usage: call {quantity} {value}`);
						return;
					}
					const [quantity, value] = args.map((s) => parseInt(s));
					socket.emit('call', quantity, value, (success, data) => {
						if (success) {
							resolve(data);
						} else {
							reject(data);
						}
					});
				});
			},
			highlight: 'blue',
			help: 'make a new call. usage: call [quantity] [value]',
		},
	};

	registerCommands(dicegameCommands);

	socket.on('startCountdown', (delay) => {
		let count = delay - 1;
		logger(`game starting in ${delay} seconds`);
		const interval = setInterval(() => {
			if (count === 0) {
				clearInterval(interval);
				return;
			}
			logger(`game starting in ${count} seconds`);
			count--;
		}, 1000);
	});

	socket.on('turnStart', (state, history, turn, myTurn) => {
		Object.keys(state).forEach((player) => {
			if (typeof state[player] === 'number') {
				const count = state[player];
				state[player] = [];
				for (let i = 0; i < count; i++) {
					state[player].push('x');
				}
			}
		});
		logger('');
		logRound(state, turn, history.length > 0 ? history[history.length - 1][1] : 0);

		if (myTurn) {
			logger(chalk.green(`it's your turn! enter a bluff or call`));
		}
	});

	socket.on('call', (username, quantity, value) => {
		logger(`${chalk.bold.yellow(username)} called ${chalk.bold.green(quantity + ' ' + value + 's')}`);
	});

	socket.on('bluff', (username, lastPlayerUsername, quantity, value, rolls) => {
		logger(`${chalk.bold.yellow(username)} called ${chalk.bold.yellow(lastPlayerUsername)}'s bluff of ${chalk.bold.green(quantity + ' ' + value)}`);
		logRound(rolls, -3, value);
	});

	socket.on('bluffResult', (winner, loser) => {
		logger(`${chalk.bold.yellow(winner)} wins! ${chalk.bold.yellow(loser)} loses a die`);
	});

	socket.on('playerOut', (player, otherPlayersCount) => {
		logger(`${chalk.bold.yellow(player)} is out of dice. ${otherPlayersCount} players remain`);
	});

	socket.on('win', (player) => {
		logger(`${chalk.bold.green(player)} wins!!`);
	});

	const setLogger = (newLogger, newLogErr) => {
		logger = newLogger;
		logErr = newLogErr;
		logRound = require('./logging')(logger, logErr, chalk).logRound;
		parentSetLogger(newLogger, newLogErr);
	};

	const logErrorCode = (errorCode, ...args) => {
		switch (errorCode) {
			case ERR_GAMESTARTED:
				logErr(`game already started`);
				break;
			case ERR_GAMENOTSTARTED:
				logErr(`game not started`);
				break;
			case ERR_NOTENOUGHPLAYERS:
				logErr(`game requires at least 2 players to start`);
				break;
			case ERR_NOTYOURTURN:
				logErr(`not your turn`);
				break;
			case ERR_BADCALL:
				logErr(`bad call - format should be: call {quantity} {value}`);
				break;
			case ERR_BADBLUFF:
				logErr(`you can't bluff on the first turn`);
				break;
			default:
				parentLogErrorCode(errorCode, ...args);
				break;
		}
	};

	return { socket, commands, callbacks, registerCommands, setLogger, logger, logErr, logErrorCode, chalk };
};

module.exports = clientFactory;
