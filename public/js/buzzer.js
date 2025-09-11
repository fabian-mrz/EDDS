const ws = new WebSocket(`ws://${window.location.hostname}:3000`);

let buzzerId;
let canPress = true;
let healthTimeout;

ws.onmessage = function (event) {
    const data = JSON.parse(event.data);
    const buzzerButton = document.getElementById('buzzerButton');

    if (data.type === 'clear-session') {
        document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        document.cookie = 'playerName=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        window.location.href = data.redirect;
    }
    else if (data.type === 'status-update') {

        // Healthcheck: reset timer on each status-update
        clearTimeout(healthTimeout);
        healthTimeout = setTimeout(() => {
            // If we miss two status-updates, reload to reconnect
            location.reload();
        }, 12000); // 12 seconds allows for network jitter
        // Find this player in the broadcasted players array
        const playerStatus = data.players.find(p => p.buzzer === buzzerId);
        if (playerStatus) {
            canPress = playerStatus.canPress;
            if (canPress) {
                buzzerButton.classList.remove('disabled', 'waiting', 'right', 'wrong');
            } else {
                buzzerButton.classList.add('disabled');
            }
        }
        updateScoreboard(data.players);
    }
    else if (data.type === 'buzzer-pressed') {
        if (data.buzzer === buzzerId) {
            // This is the player who pressed - show waiting state
            buzzerButton.classList.add('waiting');
            canPress = false;
        } else {
            // Other players - show disabled state
            buzzerButton.classList.add('disabled');
            canPress = false;
        }
    }
    // When a wrong answer is given, enable buttons for others
    else if (data.songGuessed === false) {
        if (data.buzzer === buzzerId) {
            // Wrong answer - show red first, then fade to disabled
            buzzerButton.classList.remove('waiting');
            buzzerButton.classList.add('wrong');
            canPress = false;

            setTimeout(() => {
                buzzerButton.classList.remove('wrong');
                buzzerButton.classList.add('disabled');
            }, 5000);
        } else {
            // Other players can press again
            buzzerButton.classList.remove('disabled');
            canPress = true;
        }
    }
    else if (data.type === 'track-revealed' && data.trackInfo) {
        document.getElementById('albumCover').src = data.trackInfo.albumCoverUrl;
        document.getElementById('trackName').textContent = data.trackInfo.trackName;
        document.getElementById('artistName').textContent = data.trackInfo.artistName;
    }
    else if (data.type === 'new-song' && data.trackInfo) {
        // Update track info with hidden values
        document.getElementById('albumCover').src = data.trackInfo.albumCoverUrl;
        document.getElementById('trackName').textContent = data.trackInfo.trackName;
        document.getElementById('artistName').textContent = data.trackInfo.artistName;
    }
    else if (data.songGuessed === true && data.trackInfo) {
        // Reveal track info for everyone
        document.getElementById('albumCover').src = data.trackInfo.albumCoverUrl;
        document.getElementById('trackName').textContent = data.trackInfo.trackName;
        document.getElementById('artistName').textContent = data.trackInfo.artistName;

        if (data.buzzer === buzzerId) {
            buzzerButton.classList.remove('waiting');
            buzzerButton.classList.add('right');
        }
    }
    else if (data.songGuessed === false && data.buzzer === buzzerId) {
        // Wrong answer - show red first, then fade to disabled
        buzzerButton.classList.remove('waiting');
        buzzerButton.classList.add('wrong');
        canPress = false; // This player can't press anymore

        // Wait 5 seconds, then switch to disabled state
        setTimeout(() => {
            buzzerButton.classList.remove('wrong');
            buzzerButton.classList.add('disabled');
        }, 5000);
    }
    else if (data.type === 'disable-buzzer' && data.buzzer === buzzerId) {
        // Disable buzzer when someone else got it right
        buzzerButton.classList.remove('waiting');
        buzzerButton.classList.add('disabled');
        canPress = false;
    }
    else if (data.type === 'can-press-again' && data.buzzer === buzzerId) {
        // Other players can press again after someone guessed wrong
        buzzerButton.classList.remove('waiting', 'right', 'wrong', 'disabled');
        canPress = true;
    }
    // Update the ws.onmessage function's round-end handling
    else if (data.type === 'round-end') {
        // New round - reset button state completely
        buzzerButton.classList.remove('waiting', 'right', 'wrong', 'disabled');
        canPress = true;

        // Add a subtle animation to indicate the buzzer is ready
        buzzerButton.animate([
            { transform: 'scale(0.95)', opacity: '0.7' },
            { transform: 'scale(1)', opacity: '1' }
        ], {
            duration: 300,
            easing: 'ease-out'
        });
    }
    // Add this condition to handle player updates
    else if (data.type === 'players-updated') {
        updateScoreboard(data.players);
    }
};


// On page load, check if buzzer is occupied, if yes, redirect to home

window.onload = function () {
    buzzerId = window.location.pathname.replace('/', '').replace('.html', '');
    const buzzerButton = document.getElementById('buzzerButton');
    buzzerButton.classList.add('disabled');
    canPress = false;

    console.log("Onload check for buzzerId:", buzzerId);

    fetch(`/check-buzzer-onload/${buzzerId}`)
        .then(response => response.json())
        .then(data => {
            if (data.isOccupied) {
                console.log(data.isOccupied);
                console.log('Buzzer is occupied. Redirecting to home.');
                window.location.href = '/index.html';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            window.location.href = '/index.html';
        });
};

// Buzzer button press handler

function buzzerPressed() {
    if (!canPress) {
        console.log("Buzzer press ignored: canPress is false");
        return;
    }

    const buzzerButton = document.getElementById('buzzerButton');
    buzzerButton.classList.add('waiting');
    canPress = false;

    buzzerButton.classList.remove('disabled');

    console.log("Buzzer pressed, sending POST to /buzzer-pressed/" + buzzerId);

    fetch(`/buzzer-pressed/${buzzerId}`, {
        method: 'POST',
    })
        .then(response => response.json())
        .then(data => {
            console.log("Buzzer press response:", data);
            if (!data.success) {
                buzzerButton.classList.remove('waiting');
                buzzerButton.classList.add('disabled');
                console.log("Buzzer press failed: someone else was faster");
            }
        })
        .catch((error) => {
            console.error('Error during buzzer press:', error);
            buzzerButton.classList.remove('waiting');
            canPress = true;
        });
}

// Update scoreboard with top 3 players
function updateScoreboard(players) {
    const scoreList = document.getElementById('scoreList');

    // Sort players by score in descending order
    const topPlayers = [...players]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);  // Get top 3

    // Clear current list
    scoreList.innerHTML = '';

    // Add top 3 players
    topPlayers.forEach(player => {
        const li = document.createElement('li');
        li.className = 'score-item' + (player.buzzer === buzzerId ? ' highlight' : '');
        li.innerHTML = `
                <span>${player.name}</span>
                <span>${player.score}</span>
            `;
        scoreList.appendChild(li);
    });
}

function randomColor() {
    // Generate a random pastel color
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 80%)`;
}

function setRandomGradient() {
    const color1 = randomColor();
    const color2 = randomColor();
    const color3 = randomColor();
    document.getElementById('randomBg').style.background =
        `radial-gradient(circle at ${Math.random() * 100}% ${Math.random() * 100}%, ${color1} 0%, ${color2} 60%, ${color3} 100%)`;
}

window.addEventListener('beforeunload', () => {
    clearTimeout(healthTimeout);
});

addEventListener('DOMContentLoaded', (event) => {
    setRandomGradient();
}

);