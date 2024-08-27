let ws;
let gameState;
let selectedCharacter = null;

window.onload = () => {
    ws = new WebSocket('ws://localhost:8050');
    
    ws.onopen = () => {
        console.log('Connected to server');
    };

    ws.onmessage = (message) => {
        const parsedMessage = JSON.parse(message.data);
        handleServerMessage(parsedMessage);
    };

    document.getElementById('new-game').onclick = () => {
        ws.send(JSON.stringify({ type: 'restartGame' })); // Send a request to restart the game
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('history-list').innerHTML = '';
        displayMessage('New game started!');
    };
};

function handleServerMessage(message) {
    switch (message.type) {
        case 'gameState':
            updateGameState(message.data);
            break;
        case 'invalidMove':
            displayMessage(message.data.message);
            break;
        case 'gameOver':
            handleGameOver(message.data.winner);
            break;
    }
}

function updateGameState(state) {
    gameState = state;
    updateBoard();
    document.getElementById('current-player').textContent = `Current Player: ${gameState.currentPlayer}`;
    resetMoveControls();
    displayMessage('');
}

function updateBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';

    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const character = gameState.board[i][j];
            if (character) {
                cell.textContent = character;
                if (character.startsWith('A')) {
                    cell.classList.add('playerA');
                } else if (character.startsWith('B')) {
                    cell.classList.add('playerB');
                }
                if (character[0] === gameState.currentPlayer) {
                    cell.onclick = () => selectCharacter(i, j);
                } else {
                    cell.style.cursor = 'not-allowed';
                }
            }
            board.appendChild(cell);
        }
    }
}

function selectCharacter(x, y) {
    const character = gameState.board[x][y];
    if (character && character[0] === gameState.currentPlayer) {
        selectedCharacter = { x, y, type: character.split('-')[1] };
        showMoveControls();
    }
}

function showMoveControls() {
    const controls = document.getElementById('move-controls');
    controls.innerHTML = '';

    const directions = getValidMoves(selectedCharacter.type);
    directions.forEach(direction => {
        const button = document.createElement('button');
        button.textContent = direction;
        button.onclick = () => makeMove(direction);
        controls.appendChild(button);
    });
}

function getValidMoves(type) {
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

function makeMove(direction) {
    if (selectedCharacter) {
        ws.send(JSON.stringify({
            type: 'move',
            data: {
                player: gameState.currentPlayer,
                character: selectedCharacter.type,
                direction
            }
        }));
        addToHistory(selectedCharacter.type, direction);
    }
}

function resetMoveControls() {
    document.getElementById('move-controls').innerHTML = '';
}

function displayMessage(message) {
    document.getElementById('game-messages').textContent = message;
}

function addToHistory(character, direction) {
    const historyList = document.getElementById('history-list');
    const listItem = document.createElement('li');
    listItem.textContent = `${gameState.currentPlayer}-${character}: ${direction}`;
    historyList.appendChild(listItem);
}


function handleGameOver(winner) {
    document.getElementById('winner-announcement').textContent = 'Player '+winner+' wins!';
    document.getElementById('game-over').style.display = 'block';
    displayMessage('Game over! Player ' + winner + ' wins!');
    
    // Disable further moves
    disableGameBoard();
}

function disableGameBoard() {
    const board = document.getElementById('game-board');
    const cells = board.getElementsByClassName('cell');
    for (let cell of cells) {
        cell.style.pointerEvents = 'none';  // Disable clicks on the board
    }
}
