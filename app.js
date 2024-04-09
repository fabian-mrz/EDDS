const express = require('express');
const path = require('path');
const app = express();
const axios = require('axios');
const fs = require('fs');
const ini = require('ini');
const SpotifyWebApi = require('spotify-web-api-node');
const port = 8080;

// Lese die Konfigurationsdatei
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
// Definieren Sie die Spieler
let players = [
    { name: 'Spieler 1', buzzer: 'buzzer1', canPress: true, pressed: false, occupied: 0, score: 0 },
    { name: 'Spieler 2', buzzer: 'buzzer2', canPress: true, pressed: false, occupied: 0, score: 0 },
    { name: 'Spieler 3', buzzer: 'buzzer3', canPress: true, pressed: false, occupied: 0, score: 0 },
    { name: 'Spieler 4', buzzer: 'buzzer4', canPress: true, pressed: false, occupied: 0, score: 0 },
];

//authentification spotify
var scopes = ['user-read-playback-state', 'user-modify-playback-state'],
    state = 'your_state';

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
    redirectUri: 'http://localhost:8080/callback'
});

app.get('/login', (req, res) => {
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    console.log('Authorize URL:', authorizeURL);
    res.redirect(authorizeURL);
});



//controll.html
app.post('/control/right', (req, res) => {
    jumpToDrop(spotifyApi);
    startPlayback(spotifyApi);
    let player = players.find(player => player.pressed === true);
    if (player) {
        player.score++;
        console.log(`${player.name} hat einen Punkt erhalten. Gesamtpunktzahl: ${player.score}`);
        resetBuzzer(player.buzzer);
    }
    res.sendStatus(200);
});

app.post('/control/wrong', (req, res) => {
    startPlayback(spotifyApi);
    let player = players.find(player => player.pressed === true);
    if (player) {
        resetBuzzer(player.buzzer);
        buzzerPressed = false;
    }
    res.sendStatus(200);
});

app.post('/control/next', (req, res) => {
    jumpToRandomPosition(spotifyApi);
    players.forEach(player => {
        player.canPress = true;
    });
    buzzerPressed = false;
    console.log('Alle Spieler können wieder drücken.');

    res.sendStatus(200);
});


//buzzerX.hmtl
app.post('/reset-buzzer/:playerName', (req, res) => {
    let playerName = req.params.playerName;
    let player = players.find(player => player.name === playerName);
    if (player) {
        player.occupied = 0;
        console.log(`${player.name}'s buzzer has been reset.`);
        res.sendStatus(200);
        console.log(players);
    } else {
        console.log(`No player found with name ${playerName}`);
        console.log(players);
        res.sendStatus(404);
    }
});


// Check if a buzzer is occupied and set it as occupied if it's not
app.get('/check-buzzer-onload/:buzzerId', (req, res) => {
    let buzzerId = req.params.buzzerId;
    let player = players.find(player => player.buzzer === buzzerId);
    if (player) {
        player.occupied++;
        if (player.occupied <= 2) {
            res.json({ isOccupied: false });
        } else {
            res.json({ isOccupied: true });
        }
    } else {
        console.log(`No player found with buzzer ${buzzerId}`);
        res.sendStatus(404);
    }
});


const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

//index.html
// Join a buzzer and set it as occupied
app.post('/join-buzzer', (req, res) => {
    let name = req.body.name;
    let existingPlayer = players.find(player => player.name === name);
    if (existingPlayer) {
        console.log(`Player with name ${name} already exists`);
        res.json({ buzzer: null });
    } else {
        let availablePlayer = players.find(player => player.occupied === 0);
        if (availablePlayer) {
            availablePlayer.name = name;
            availablePlayer.occupied = 1;
            console.log(`${name} has joined ${availablePlayer.buzzer}`);
            res.json({ buzzer: `/${availablePlayer.buzzer}.html` });
        } else {
            console.log(`No available buzzer for ${name}`);
            res.json({ buzzer: null });
        }
    }
});


//Spotify

app.get('/callback', (req, res) => {
    const error = req.query.error;
    const code = req.query.code;
    const state = req.query.state;

    if (error) {
        console.error('Callback Error:', error);
        res.send(`Callback Error: ${error}`);
        return;
    }

    spotifyApi.authorizationCodeGrant(code).then(data => {
        const access_token = data.body['access_token'];
        const refresh_token = data.body['refresh_token'];
        const expires_in = data.body['expires_in'];

        spotifyApi.setAccessToken(access_token);
        spotifyApi.setRefreshToken(refresh_token);

        console.log('access_token:', access_token);
        console.log('refresh_token:', refresh_token);

        console.log(`Sucessfully retreived access token. Expires in ${expires_in} s.`);
        res.send('Success! You can now close the window.');

    }).catch(error => {
        console.error('Error getting Tokens:', error);
        res.send(`Error getting Tokens: ${error}`);
    });
});


//pause playback
function pausePlayback(spotifyApi) {
    spotifyApi.getMyCurrentPlaybackState()
        .then((response) => {
            if (response.body && response.body.is_playing) {
                spotifyApi.pause()
                    .then(() => {
                        console.log('Playback paused');
                    })
                    .catch((error) => {
                        console.error('Failed to pause playback:', error);
                    });
            } else {
                console.log('No playback to pause');
            }
        })
        .catch((error) => {
            console.error('Failed to get current playback state:', error);
        });
}

//start playback
function startPlayback(spotifyApi) {
    spotifyApi.getMyCurrentPlaybackState()
        .then((response) => {
            if (response.body && !response.body.is_playing) {
                spotifyApi.play()
                    .then(() => {
                        console.log('Playback started');
                    })
                    .catch((error) => {
                        console.error('Failed to start playback:', error);
                    });
            } else {
                console.log('Playback is already running');
            }
        })
        .catch((error) => {
            console.error('Failed to get current playback state:', error);
        });
}

//jump to a random position in the song
function jumpToRandomPosition(spotifyApi) {
    let randomPositionMs; // Declare the variable outside the Promise flow

    spotifyApi.skipToNext()
        .then(() => {
            console.log('Skipped to next track');
            return spotifyApi.getMyCurrentPlaybackState();
        })
        .then((response) => {
            if (response.body && response.body.item) {
                const durationMs = response.body.item.duration_ms;
                randomPositionMs = Math.random() * durationMs * 0.9; // Assign the variable inside the second .then() block

                return spotifyApi.seek(Math.floor(randomPositionMs));
            } else {
                console.log('No song is currently playing');
            }
        })
        .then(() => {
            console.log(`Jumped to position: ${randomPositionMs} ms`); // Now you can access the variable here
        })
        .catch((error) => {
            console.error('Failed to jump to position:', error);
        });
}

//jump to a set position in the song
function jumpToDrop(spotifyApi) {
    spotifyApi.getMyCurrentPlaybackState()
        .then((response) => {
            if (response.body && response.body.item) {
                const durationMs = response.body.item.duration_ms;
                const dropPosition = durationMs * 0.31; // Jump to the drop of the song

                spotifyApi.seek(Math.floor(dropPosition))
                    .then(() => {
                        console.log(`Jumped to position: ${dropPosition} ms`);
                    })
                    .catch((error) => {
                        console.error('Failed to jump to position:', error);
                    });
            } else {
                console.log('No song is currently playing');
            }
        })
        .catch((error) => {
            console.error('Failed to get current playback state:', error);
        });
}


//buzzers 
app.get('/buzzer1.html', checkBuzzer('buzzer1'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public/buzzer1.html'));
});

app.get('/buzzer2.html', checkBuzzer('buzzer2'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public/buzzer2.html'));
});

app.get('/buzzer3.html', checkBuzzer('buzzer3'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public/buzzer3.html'));
});

app.get('/buzzer4.html', checkBuzzer('buzzer4'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public/buzzer4.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});