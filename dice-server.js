const app = require('express')();
const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer);
const { port } = require('./config.json');
const { ERR_GAMESTARTED, ERR_NOTENOUGHPLAYERS, ERR_GAMENOTSTARTED, ERR_BADCALL, ERR_NOTYOURTURN, ERR_BADBLUFF } = require('./codes');

const { roomOf, playersOf, autoJoin } = require('@yacoubb/socket.io-rooms').toRoomServer(io, require('./config.json'));
const initialDice = 5;

io.on('connection', (socket) => {
	// autoJoin();

	socket.on('rules', (ack) => {
		ack(
			true,
			`Each round, each player rolls a hand of dice. Players cannot see other players' hands, but they can know how many dice they have. The first player begins bidding - calling the minimum quantity and value of dice the player believes are present. All players' dice are counted towards calls. Sixes are wildcards and can count towards any bid.
Turns rotate through players. Each player has two choices on their turn: to raise the bid by increasing the quantity or face value (or both), or to call out the previous players bluff. When a player makes a call, if they choose to increase the quantity the value can be anything - even lower than the previous call.
When a bluff is called, all players show their dice. If there are enough dice to meet the previous players' bid, they win, and the player that called the bluff loses a die. Otherwise, the player that made the bid loses a die. Once players reach zero dice they are out of the game. The last player in the game with any dice wins.`,
		);
	});

	socket.on('start', (ack) => {
		if (roomOf(socket).started) {
			ack(false, ERR_GAMESTARTED);
			return;
		}
		if (Object.keys(roomOf(socket).sockets).length < 2) {
			ack(false, ERR_NOTENOUGHPLAYERS);
			return;
		}
		roomOf(socket).started = true;
		roomOf(socket).turn = -1;
		playersOf(roomOf(socket)).forEach((player) => (player.diceCount = initialDice));

		const startDelay = 1;

		setTimeout(() => {
			startRound(roomOf(socket));
		}, startDelay * 1000);
		io.to(socket.roomName).emit('startCountdown', startDelay);
	});

	socket.on('call', (quantity, value, ack) => {
		const room = roomOf(socket);
		if (!room.started) {
			ack(false, ERR_GAMENOTSTARTED);
			return;
		}
		if (playersOf(room).filter((player) => player.diceCount > 0)[room.turn].id !== socket.id) {
			ack(false, ERR_NOTYOURTURN);
			return;
		}
		if (quantity <= 0 || value < 1 || value > 6) {
			ack(false, ERR_BADCALL);
			return;
		}
		if (room.history.length !== 0) {
			const [lastQuant, lastVal] = room.history[room.history.length - 1];
			if (quantity > lastQuant || (quantity === lastQuant && value > lastVal)) {
				// call is fine
			} else {
				ack(false, ERR_BADCALL);
				return;
			}
		}
		room.history.push([quantity, value]);
		room.lastPlayer = socket;
		io.to(socket.roomName).emit('call', socket.username, quantity, value);
		setTimeout(() => {
			startTurn(room);
		}, 1000);
		ack(true);
	});

	socket.on('bluff', (ack) => {
		const room = roomOf(socket);
		if (!room.started) {
			ack(false, ERR_GAMENOTSTARTED);
			return;
		}
		if (playersOf(room).filter((player) => player.diceCount > 0)[room.turn].id !== socket.id) {
			ack(false, ERR_NOTYOURTURN);
			return;
		}
		if (room.history.length === 0) {
			ack(false, ERR_BADBLUFF);
			return;
		}
		const [quantity, value] = room.history[room.history.length - 1];
		let available = 0;
		const globalState = {};
		playersOf(room)
			.filter((player) => player.diceCount > 0)
			.forEach((player) => {
				globalState[player.username] = player.dice;
				player.dice.forEach((roll) => {
					if (roll === value || roll === 6) {
						available++;
					}
				});
			});
		io.to(socket.roomName).emit('bluff', socket.username, room.lastPlayer.username, quantity, value, globalState);
		setTimeout(() => {
			if (available >= quantity) {
				io.to(socket.roomName).emit('bluffResult', room.lastPlayer.username, socket.username);
				socket.diceCount--;
				if (socket.diceCount === 0) {
					io.to(socket.roomName).emit('playerOut', socket.username, playersOf(room).filter((p) => p.diceCount > 0).length);
				}
				room.turn--;
			} else {
				io.to(socket.roomName).emit('bluffResult', socket.username, room.lastPlayer.username);
				room.lastPlayer.diceCount--;
				if (room.lastPlayer.diceCount === 0) {
					io.to(room.lastPlayer.roomName).emit('playerOut', room.lastPlayer.username, playersOf(room).filter((p) => p.diceCount > 0).length);
				}
			}
			if (playersOf(room).filter((p) => p.diceCount > 0).length === 1) {
				io.to(socket.roomName).emit('win', playersOf(room).filter((p) => p.diceCount > 0)[0].username);
			} else {
				setTimeout(() => {
					startRound(room);
				}, 1000);
			}
		}, 1000);
		ack(true);
	});
});

const startRound = (room) => {
	playersOf(room)
		.filter((player) => player.diceCount > 0)
		.forEach((player) => {
			player.dice = [];
			for (let i = 0; i < player.diceCount; i++) {
				player.dice.push(Math.ceil(Math.random() * 6));
			}
		});
	room.history = [];
	startTurn(room);
};

const startTurn = (room) => {
	room.turn = (room.turn + 1) % playersOf(room).filter((player) => player.diceCount > 0).length;
	const globalState = {};
	playersOf(room)
		.filter((player) => player.diceCount > 0)
		.forEach((player) => {
			globalState[player.username] = player.dice;
		});
	playersOf(room).forEach((playerOrSpectator) => {
		if (playerOrSpectator.diceCount > 0) {
			// player
			const playerState = {};
			playersOf(room)
				.filter((player) => player.diceCount > 0)
				.forEach((player) => {
					if (player.id === playerOrSpectator.id) {
						playerState[player.username] = player.dice;
					} else {
						playerState[player.username] = player.diceCount;
					}
				});
			// emit the playerstate, call history, current turn and whether it is this players turn
			playerOrSpectator.emit('turnStart', playerState, room.history, room.turn, playersOf(room).filter((player) => player.diceCount > 0)[room.turn].id === playerOrSpectator.id);
		} else {
			playerOrSpectator.emit('turnStart', globalState, room.history, room.turn, false);
		}
	});
};

httpServer.listen(port, 'localhost', () => {
	console.log(`dicegame server listening on port ${port}`);
});
