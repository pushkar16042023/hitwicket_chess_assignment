const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const port = process.env.PORT || 8050;
const server = http.createServer(app);
app.use(express.static('public'));

const wss = new WebSocket.Server({ server });

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

let gameState = {
    board: [],
    currentPlayer: 'A',
    players: {
        A: [],
        B: []
    },
    winner: null
};

function initializeGame() {
    gameState.board = Array(5).fill().map(() => Array(5).fill(null));
    gameState.currentPlayer = 'A';
    gameState.winner = null;

    gameState.players.A = [
        { type: 'P1', position: [0, 0] },
        { type: 'P2', position: [0, 1] },
        { type: 'H1', position: [0, 2] },
        { type: 'H2', position: [0, 3] },
        { type: 'P3', position: [0, 4] }
    ];

    gameState.players.B = [
        { type: 'P1', position: [4, 0] },
        { type: 'P2', position: [4, 1] },
        { type: 'H1', position: [4, 2] },
        { type: 'H2', position: [4, 3] },
        { type: 'P3', position: [4, 4] }
    ];

    gameState.players.A.forEach(character => {
        gameState.board[character.position[0]][character.position[1]] = `A-${character.type}`;
    });

    gameState.players.B.forEach(character => {
        gameState.board[character.position[0]][character.position[1]] = `B-${character.type}`;
    });

    console.log('Game initialized:', gameState);
}

function broadcastGameState() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'gameState',
                data: gameState
            }));
        }
    });
}

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function resetGame() {
    initializeGame();
    broadcastGameState();
}

function checkForGameEnd() {
    const players = gameState.players;
    const piecesLeft = { A: 0, B: 0 };

    for (const player in players) {
        piecesLeft[player] = players[player].length;
    }

    if (piecesLeft.A === 0) {
        gameState.winner = 'B';
    } else if (piecesLeft.B === 0) {
        gameState.winner = 'A';
    }

    if (gameState.winner) {
        broadcastGameState();
        broadcast({
            type: 'gameOver',
            data: { winner: gameState.winner }
        });
    }
}

function processMove(player, character, direction) {
    if (!isValidMove(player, character, direction)) {
        return { success: false, message: 'Invalid move' };
    }

    const playerCharacters = gameState.players[player];
    const characterData = playerCharacters.find(c => c.type === character);

    if (!characterData) {
        return { success: false, message: 'Character not found' };
    }

    const [x, y] = characterData.position;
    let newX = x;
    let newY = y;

    switch (character) {
        case 'P1': case 'P2': case 'P3': 
            switch (direction) {
                case 'L': newY -= 1; break;
                case 'R': newY += 1; break;
                case 'F': newX += (player === 'A' ? 1 : -1); break;
                case 'B': newX -= (player === 'A' ? 1 : -1); break;
                default: return { success: false, message: 'Invalid direction' };
            }
            break;

        case 'H1': case 'H2':
            switch (direction) {
                case 'L': newY -= 2; break;
                case 'R': newY += 2; break;
                case 'F': newX += (player === 'A' ? 2 : -2); break;
                case 'B': newX -= (player === 'A' ? 2 : -2); break;
                default: return { success: false, message: 'Invalid direction' };
            }
            // Handle killing opponent's character in the path
            if (direction === 'L' || direction === 'R') {
                const stepY = (direction === 'L') ? -1 : 1;
                if (gameState.board[x][y + stepY] && gameState.board[x][y + stepY][0] === (player === 'A' ? 'B' : 'A')) {
                    // Capture opponent's character
                    gameState.players[player].push({
                        type: gameState.board[x][y + stepY].split('-')[1],
                        position: [x, y + stepY]
                    });
                }
            }
            break;

        default:
            return { success: false, message: 'Character type not recognized' };
    }

    // Update board
    gameState.board[x][y] = null;
    gameState.board[newX][newY] = `${player}-${character}`;
    characterData.position = [newX, newY];

    return { success: true, message: 'Move processed successfully' };
}

function isValidMove(player, character, direction) {
    // Implement move validation logic here
    return true; // Placeholder
}

wss.on('connection', (ws) => {
    console.log('A new player connected');
    ws.send(JSON.stringify({
        type: 'gameState',
        data: gameState
    }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log('Received message from client:', parsedMessage);
            if (parsedMessage.type === 'restartGame') {
                resetGame();
            } else {
                handleClientMessage(parsedMessage, ws);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('A player disconnected');
    });
});

function handleClientMessage(message, ws) {
    try {
        if (message.type === 'move') {
            const { player, character, direction } = message.data;

            if (player !== gameState.currentPlayer) {
                ws.send(JSON.stringify({
                    type: 'invalidMove',
                    data: { message: 'Not your turn' }
                }));
                return;
            }

            const result = processMove(player, character, direction);
            checkForGameEnd();

            if (!result.success) {
                ws.send(JSON.stringify({
                    type: 'invalidMove',
                    data: { message: result.message }
                }));
                return;
            }

            console.log('Move processed successfully:', result.message);
            broadcastGameState();
        }
    } catch (error) {
        console.error('Error processing client message:', error);
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'An error occurred processing your request.' }
        }));
    }
}

initializeGame();
