const express = require('express');
const WebSocketServer = require('ws').Server;
const http = require('http');

const app = express();
const port = process.env.PORT || 8050;
const httpServer = http.createServer(app);
app.use(express.static('public'));

const websocketServer = new WebSocketServer({ server: httpServer });

httpServer.listen(port, () => console.log(`Server listening on port ${port}`));

function restartGame() {
    setupNewGame();
    updateAllClients();
}

websocketServer.on('connection', socket => {
    console.log('Connected: New player');
    socket.on('message', data => processMessage(data, socket));
    socket.on('close', () => console.log('Disconnected: Player left'));
});

let gameData = {
    board: new Array(5).fill(null).map(() => new Array(5).fill(null)),
    activePlayer: 'A',
    teams: { A: [], B: [] },
    winner: null
};

function setupNewGame() {
    gameData.board = gameData.board.map(() => new Array(5).fill(null));
    gameData.activePlayer = 'A';
    gameData.winner = null;
    setInitialPositions();
    console.log('Game setup complete');
}

function setInitialPositions() {
    ['A', 'B'].forEach(team => {
        const baseRow = team === 'A' ? 0 : 4;
        gameData.teams[team] = ['P1', 'P2', 'H1', 'H2', 'P3'].map((type, idx) => ({
            type,
            pos: [baseRow, idx]
        }));
        gameData.teams[team].forEach(char => {
            gameData.board[char.pos[0]][char.pos[1]] = `${team}-${char.type}`;
        });
    });
}

function processMessage(message, socket) {
    try {
        const { type, payload } = JSON.parse(message);
        switch (type) {
            case 'restart':
                restartGame();
                break;
            case 'move':
                if (makeMove(payload, socket)) {
                    checkGameStatus();
                    updateAllClients();
                }
                break;
        }
    } catch (err) {
        console.error('Failed to process message:', err);
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
    }
}

function makeMove({ player, piece, direction }, socket) {
    if (player !== gameData.activePlayer) {
        socket.send(JSON.stringify({ type: 'error', error: 'Not your turn' }));
        return false;
    }
    let { success, message } = attemptMove(piece, direction);
    if (!success) {
        socket.send(JSON.stringify({ type: 'moveError', error: message }));
    }
    return success;
}

function attemptMove(piece, direction) {
    const moves = { L: [0, -1], R: [0, 1], F: [1, 0], B: [-1, 0] };
    let [x, y] = [piece.pos[0] + moves[direction][0], piece.pos[1] + moves[direction][1]];

    if (x < 0 || x >= 5 || y < 0 || y >= 5) return { success: false, message: 'Out of bounds' };
    if (gameData.board[x][y]) return { success: false, message: 'Space occupied' };

    gameData.board[piece.pos[0]][piece.pos[1]] = null;
    gameData.board[x][y] = `${gameData.activePlayer}-${piece.type}`;
    piece.pos = [x, y];
    return { success: true };
}

function checkGameStatus() {
    let remaining = { A: gameData.teams.A.length, B: gameData.teams.B.length };
    if (!remaining.A || !remaining.B) {
        gameData.winner = remaining.A > 0 ? 'A' : 'B';
        sendGameOver();
    }
}

function updateAllClients() {
    const state = JSON.stringify({ type: 'update', state: gameData });
    websocketServer.clients.forEach(client => {
        if (client.readyState === WebSocketServer.OPEN) {
            client.send(state);
        }
    });
}

function sendGameOver() {
    const message = JSON.stringify({ type: 'gameOver', winner: gameData.winner });
    websocketServer.clients.forEach(client => {
        if (client.readyState === WebSocketServer.OPEN) {
            client.send(message);
        }
    });
    console.log(`Game over! Winner: ${gameData.winner}`);
}

setupNewGame();
