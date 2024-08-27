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

function resetGame() {
    initializeGame();  
    broadcastGameState();  
}

wss.on('connection', (ws) => {
    console.log('A new player connected');
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log('Received message:', parsedMessage);

            if (parsedMessage.type === 'restartGame') {
                resetGame();  
            } else {
                handleClientMessage(parsedMessage, ws);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log('Received message:', parsedMessage);
            handleClientMessage(parsedMessage, ws);
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

initializeGame();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('A new player connected');

    // Send the initial game state to the connected client
    ws.send(JSON.stringify({
        type: 'gameState',
        data: gameState
    }));

    // Handle incoming messages from clients
    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        console.log('Received message from client:', parsedMessage);
        handleClientMessage(parsedMessage, ws);
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('A player disconnected');
    });
});

// Function to handle messages from clients
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
function checkForGameEnd() {
    const players = gameState.players;
    const piecesLeft = { A: 0, B: 0 };
    
    for (const player in players) {
        piecesLeft[player] = players[player].length;
    }
    console.log(piecesLeft)
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

        case 'H1':
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
                    gameState.board[x][y + stepY] = null;
                }
            } else {
                const stepX = (direction === 'F') ? (player === 'A' ? 1 : -1) : (player === 'A' ? -1 : 1);
                if (gameState.board[x + stepX][y] && gameState.board[x + stepX][y][0] === (player === 'A' ? 'B' : 'A')) {
                    gameState.board[x + stepX][y] = null;
                }
            }
            break;

        case 'H2': // Hero2 moves two blocks diagonally in any direction
            switch (direction) {
                case 'FL': newX += (player === 'A' ? 2 : -2); newY -= 2; break;
                case 'FR': newX += (player === 'A' ? 2 : -2); newY += 2; break;
                case 'BL': newX -= (player === 'A' ? 2 : -2); newY -= 2; break;
                case 'BR': newX -= (player === 'A' ? 2 : -2); newY += 2; break;
                default: return { success: false, message: 'Invalid direction' };
            }
            // Handle killing opponent's character in the path
            const stepX = (direction[0] === 'F') ? (player === 'A' ? 1 : -1) : (player === 'A' ? -1 : 1);
            const stepY = (direction[1] === 'L') ? -1 : 1;
            if (gameState.board[x + stepX][y + stepY] && gameState.board[x + stepX][y + stepY][0] === (player === 'A' ? 'B' : 'A')) {
                gameState.board[x + stepX][y + stepY] = null;
            }
            break;

        default:
            return { success: false, message: 'Invalid character type' };
    }

    if (newX < 0 || newX >= 5 || newY < 0 || newY >= 5) {
        return { success: false, message: 'Move out of bounds' };
    }

    const opponent = player === 'A' ? 'B' : 'A';
    if (gameState.board[newX][newY] && gameState.board[newX][newY][0] === opponent) {
        console.log(`Capturing opponent's piece at [${newX}, ${newY}]`);
        gameState.players[opponent] = gameState.players[opponent].filter(c => !(c.position[0] === newX && c.position[1] === newY));
    }
    gameState.board[x][y] = null;
    gameState.board[newX][newY] = `${player}-${character}`;
    characterData.position = [newX, newY];

    console.log(`Character ${character} moved to [${newX}, ${newY}]`);
    if (gameState.players[opponent].length === 0) {
        gameState.winner = player;
        broadcastGameOver(player);  
        return { success: true, message: `${player} wins the game!` };
    } else {
        gameState.currentPlayer = opponent;
    }

    return { success: true, message: 'Move processed successfully' };
}

// Function to validate a move
function isValidMove(player, character, direction) {
    const playerCharacters = gameState.players[player];
    const characterData = playerCharacters.find(c => c.type === character);

    if (!characterData) {
        return false;
    }

    const [x, y] = characterData.position;
    let newX = x;
    let newY = y;

    switch (character) {
        case 'P1': case 'P2': case 'P3': // Pawn moves one block in any direction
            switch (direction) {
                case 'L': newY -= 1; break;
                case 'R': newY += 1; break;
                case 'F': newX += (player === 'A' ? 1 : -1); break;
                case 'B': newX -= (player === 'A' ? 1 : -1); break;
                default: return false;
            }
            break;

        // case 'H1': // Hero1 moves two blocks straight in any direction
        //     switch (direction) {
        //         case 'L': newY -= 2; break;
        //         case 'R': newY += 2; break;
        //         case 'F': newX += (player === 'A' ? 2 : -2); break;
        //         case 'B': newX -= (player === 'A' ? 2 : -2); break;
        //         default: return false;
        //     }
        //     break;

        case 'H1': // Hero1 moves two blocks straight in any direction
    let stepX = 0, stepY = 0;
    switch (direction) {
        case 'L': stepY = -1; break;
        case 'R': stepY = 1; break;
        case 'F': stepX = (player === 'A' ? 1 : -1); break;
        case 'B': stepX = (player === 'A' ? -1 : 1); break;
        default: return { success: false, message: 'Invalid direction' };
    }
    newX = x + 2 * stepX;
    newY = y + 2 * stepY;

    // Handle killing opponent's characters in the path
    for (let i = 1; i <= 2; i++) {
        const intermediateX = x + i * stepX;
        const intermediateY = y + i * stepY;
        if (gameState.board[intermediateX][intermediateY] && gameState.board[intermediateX][intermediateY][0] === (player === 'A' ? 'B' : 'A')) {
            gameState.board[intermediateX][intermediateY] = null;
            gameState.players[opponent] = gameState.players[opponent].filter(c => !(c.position[0] === intermediateX && c.position[1] === intermediateY));
        }
    }
    break;

        case 'H2': // Hero2 moves two blocks diagonally in any direction
            switch (direction) {
                case 'FL': newX += (player === 'A' ? 2 : -2); newY -= 2; break;
                case 'FR': newX += (player === 'A' ? 2 : -2); newY += 2; break;
                case 'BL': newX -= (player === 'A' ? 2 : -2); newY -= 2; break;
                case 'BR': newX -= (player === 'A' ? 2 : -2); newY += 2; break;
                default: return false;
            }
            break;

        default:
            return false;
    }

    if (newX < 0 || newX >= 5 || newY < 0 || newY >= 5) {
        console.log('Invalid move: Out of bounds');
        return false;
    }

    if (gameState.board[newX][newY] && gameState.board[newX][newY][0] === player) {
        console.log('Invalid move: Friendly fire');
        return false;
    }

    return true;
}
// Function to broadcast the current game state to all clients
function broadcastGameState() {
    try {
        const gameStateMessage = JSON.stringify({
            type: 'gameState',
            data: gameState
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(gameStateMessage);
            }
        });

        if (gameState.winner) {
            broadcastGameOver(gameState.winner);
        }
    } catch (error) {
        console.error('Error broadcasting game state:', error);
    }
}
function broadcastGameOver(winner) {
    const gameOverMessage = JSON.stringify({
        type: 'gameOver',
        data: { winner }
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(gameOverMessage);
        }
    });

    console.log(`Game over! Player ${winner} wins.`);
}
function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}
