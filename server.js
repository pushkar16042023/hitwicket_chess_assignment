const express = require('express');
const WebSocketServer = require('ws').Server;
const http = require('http');

const app = express();
const port = process.env.PORT || 8050;
const httpServer = http.createServer(app);
app.use(express.static('public'));

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(port, () => console.log(`Listening on port ${port}`));

let gameStatus = {
    grid: [],
    activePlayer: 'A',
    teams: { A: [], B: [] },
    victor: null
};

function startNewGame() {
    setupBoard();
    assignTeams();
    logGameState();
}

function setupBoard() {
    gameStatus.grid = Array(5).fill().map(() => Array(5).fill(null));
    gameStatus.activePlayer = 'A';
    gameStatus.victor = null;
}

function assignTeams() {
    const positions = [0, 1, 2, 3, 4];
    const roles = ['P1', 'P2', 'H1', 'H2', 'P3'];
    gameStatus.teams.A = positions.map((pos, index) => createCharacter('A', roles[index], pos));
    gameStatus.teams.B = positions.map((pos, index) => createCharacter('B', roles[index], pos));
    populateBoard();
}

function createCharacter(team, role, pos) {
    return { type: role, coords: [team === 'A' ? 0 : 4, pos] };
}

function populateBoard() {
    Object.keys(gameStatus.teams).forEach(team => {
        gameStatus.teams[team].forEach(char => {
            gameStatus.grid[char.coords[0]][char.coords[1]] = `${team}-${char.type}`;
        });
    });
}

function logGameState() {
    console.log('Game state initialized:', gameStatus);
}

wss.on('connection', socket => {
    console.log('Player has connected');
    socket.on('message', message => handleIncomingMessage(message, socket));
    socket.on('close', () => console.log('Player has disconnected'));
});

function handleIncomingMessage(message, socket) {
    let parsedMessage;
    try {
        parsedMessage = JSON.parse(message);
        routeMessage(parsedMessage, socket);
    } catch (error) {
        console.error('Failed to decode message', error);
        socket.send(JSON.stringify({ event: 'error', details: 'Failed to decode your message.' }));
    }
}

function routeMessage({ event, content }, socket) {
    if (event === 'resetGame') {
        startNewGame();
        informClients();
    } else if (event === 'playerMove') {
        processPlayerMove(content, socket);
    }
}

function processPlayerMove({ participant, unit, move }, socket) {
    if (participant !== gameStatus.activePlayer) {
        socket.send(JSON.stringify({ event: 'error', details: 'Wait for your turn.' }));
        return;
    }
    const outcome = validateAndExecuteMove(participant, unit, move);
    if (outcome.valid) {
        switchPlayer();
        informClients();
    } else {
        socket.send(JSON.stringify({ event: 'moveError', details: outcome.reason }));
    }
}

function validateAndExecuteMove(team, type, direction) {
    const character = gameStatus.teams[team].find(char => char.type === type);
    if (!character) {
        return { valid: false, reason: 'Character not found.' };
    }
    const [newX, newY] = calculateNewCoords(character.coords, direction);
    if (!withinBounds(newX, newY)) {
        return { valid: false, reason: 'Out of bounds.' };
    }
    if (updatePositionIfPossible(character, newX, newY, team)) {
        checkForVictory();
        return { valid: true };
    }
    return { valid: false, reason: 'Blocked move.' };
}

function calculateNewCoords([x, y], direction) {
    const moves = { L: [0, -1], R: [0, 1], F: [1, 0], B: [-1, 0] };
    return [x + moves[direction][0], y + moves[direction][1]];
}

function withinBounds(x, y) {
    return x >= 0 && x < 5 && y >= 0 && y < 5;
}

function updatePositionIfPossible(char, newX, newY, team) {
    if (gameStatus.grid[newX][newY] && gameStatus.grid[newX][newY].startsWith(team)) {
        return false; // Blocked by own team
    }
    gameStatus.grid[char.coords[0]][char.coords[1]] = null;
    gameStatus.grid[newX][newY] = `${team}-${char.type}`;
    char.coords = [newX, newY];
    return true;
}

function checkForVictory() {
    const remaining = { A: gameStatus.teams.A.length, B: gameStatus.teams.B.length };
    if (!remaining.A || !remaining.B) {
        gameStatus.victor = !remaining.A ? 'B' : 'A';
        informVictory();
    }
}

function switchPlayer() {
    gameStatus.activePlayer = gameStatus.activePlayer === 'A' ? 'B' : 'A';
}

function informClients() {
    const state = JSON.stringify({ event: 'updateState', state: gameStatus });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(state);
        }
    });
}

function informVictory() {
    const message = JSON.stringify({ event: 'gameOver', winner: gameStatus.victor });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log(`Game over, winner: ${gameStatus.victor}`);
}

startNewGame();
