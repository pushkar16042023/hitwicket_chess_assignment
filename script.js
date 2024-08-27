let websocket;
let currentGameState;
let chosenCharacter = null;

window.addEventListener('load', function() {
    websocket = new WebSocket('ws://localhost:8050');

    websocket.addEventListener('open', function() {
        console.log('Successfully connected to the server');
    });

    websocket.addEventListener('message', function(event) {
        const response = JSON.parse(event.data);
        processServerResponse(response);
    });

    document.getElementById('new-game').addEventListener('click', function() {
        websocket.send(JSON.stringify({ type: 'restartGame' }));
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('history-list').innerHTML = '';
        displayNotification('New game has started!');
    });
});

function processServerResponse(response) {
    switch (response.type) {
        case 'gameState':
            updateCurrentGameState(response.data);
            break;
        case 'invalidMove':
            displayNotification(response.data.message);
            break;
        case 'gameOver':
            finalizeGame(response.data.winner);
            break;
    }
}

function updateCurrentGameState(state) {
    currentGameState = state;
    renderGameBoard();
    document.getElementById('current-player').textContent = `Current Player: ${currentGameState.currentPlayer}`;
    clearMoveOptions();
    displayNotification('');
}

function renderGameBoard() {
    const boardElement = document.getElementById('game-board');
    boardElement.innerHTML = '';

    currentGameState.board.forEach((row, i) => {
        row.forEach((cell, j) => {
            const cellElement = document.createElement('div');
            cellElement.className = 'cell';
            if (cell) {
                cellElement.textContent = cell;
                cellElement.classList.add(cell.startsWith('A') ? 'playerA' : 'playerB');
                if (cell[0] === currentGameState.currentPlayer) {
                    cellElement.addEventListener('click', () => chooseCharacter(i, j));
                } else {
                    cellElement.style.cursor = 'not-allowed';
                }
            }
            boardElement.appendChild(cellElement);
        });
    });
}

function chooseCharacter(x, y) {
    const characterInfo = currentGameState.board[x][y];
    if (characterInfo && characterInfo[0] === currentGameState.currentPlayer) {
        chosenCharacter = { x, y, type: characterInfo.split('-')[1] };
        displayMoveOptions();
    }
}

function displayMoveOptions() {
    const moveOptions = document.getElementById('move-controls');
    moveOptions.innerHTML = '';

    const possibleDirections = determineValidMoves(chosenCharacter.type);
    possibleDirections.forEach(direction => {
        const moveButton = document.createElement('button');
        moveButton.textContent = direction;
        moveButton.addEventListener('click', () => executeMove(direction));
        moveOptions.appendChild(moveButton);
    });
}

function determineValidMoves(type) {
    switch (type) {
        case 'P1': case 'P2': case 'P3':
            return ['L', 'R', 'F', 'B'];
        case 'H1':
            return ['L', 'R', 'F', 'B'];
        case 'H2':
            return ['FL', 'FR', 'BL', 'BR'];
        default:
            return [];
    }
}

function executeMove(direction) {
    if (chosenCharacter) {
        websocket.send(JSON.stringify({
            type: 'move',
            data: {
                player: currentGameState.currentPlayer,
                character: chosenCharacter.type,
                direction
            }
        }));
        logMove(chosenCharacter.type, direction);
    }
}

function clearMoveOptions() {
    document.getElementById('move-controls').innerHTML = '';
}

function displayNotification(message) {
    document.getElementById('game-messages').textContent = message;
}

function logMove(character, direction) {
    const historyElement = document.getElementById('history-list');
    const entry = document.createElement('li');
    entry.textContent = `${currentGameState.currentPlayer}-${character}: ${direction}`;
    historyElement.appendChild(entry);
}

function finalizeGame(winner) {
    document.getElementById('winner-announcement').textContent = 'Player ' + winner + ' wins!';
    document.getElementById('game-over').style.display = 'block';
    displayNotification('Game over! Player ' + winner + ' wins!');

    lockGameBoard();
}

function lockGameBoard() {
    const boardCells = document.querySelectorAll('#game-board .cell');
    boardCells.forEach(cell => {
        cell.style.pointerEvents = 'none';
    });
}
