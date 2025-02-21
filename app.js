const express = require('express');
const path = require('path');
const app = express();
const axios = require('axios');
const fs = require('fs');
const ini = require('ini');
const SpotifyWebApi = require('spotify-web-api-node');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
const port = 8080;


app.use(express.json());

app.use(cookieParser());

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 8081 });

// Broadcast function to send a message to all connected clients
async function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}


// Lese die Konfigurationsdatei
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
const config2 = ini.parse(fs.readFileSync('./config2.ini', 'utf-8'));

// Spielerdaten
let players = []

let buzzerPressed = false; // Wurde ein Buzzer bereits gedrückt?



//authentification spotify
var scopes = ['user-read-playback-state', 'user-modify-playback-state'],
    state = 'your_state';

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
    redirectUri: 'http://192.168.178.45:8080/callback'
});

app.get('/login', (req, res) => {
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    console.log('Authorize URL:', authorizeURL);
    res.redirect(authorizeURL);
});
spotifyApi.setAccessToken(config2.spotify.access_token);
spotifyApi.setRefreshToken(config2.spotify.refresh_token);


//routes
app.post('/update-score', (req, res) => {
    console.log(req.body.name
        , req.body.score);
    let player = players.find(player => player.name === req.body.name);
    if (player) {
        player.score = parseInt(req.body.score);
        broadcast({ type: 'players-updated', players });
        res.status(200).json({ message: 'Score updated successfully' });
    } else {
        res.status(400).json({ error: 'No player found with the provided name.' });
    }
});

app.post('/buzzer-pressed/:buzzer', (req, res) => {
    let buzzer = req.params.buzzer;
    let player = players.find(player => player.buzzer === buzzer);

    if (player) {
        if (player && player.canPress && !buzzerPressed) {
            buzzerPressed = true;
            player.pressed = true;
            player.canPress = false;
            res.json({ success: true });
            broadcast({ type: 'buzzer-pressed', buzzer: player.buzzer, pressed: "pressed" }); // Send the buzzer that was pressed and true to all connected clients
            pausePlayback(spotifyApi);
        } else {
            res.json({ success: false, message: 'Dieser Spieler kann den Buzzer nicht drücken.' });
        }
    } else {
        res.json({ success: false, message: 'Kein Spieler gefunden.' });
    }
});


// buzzer.html

// Add this function before the routes
function generateBuzzerId() {
    return `buzzer${players.length + 1}`;
}

app.post('/join-buzzer', (req, res) => {
    let name = req.body.name;
    let existingPlayer = players.find(player => player.name === name);
    
    if (existingPlayer) {
        // If player exists, just reconnect them
        existingPlayer.occupied = 1; // Reset occupation count
        res.cookie('playerId', existingPlayer.buzzer, { 
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        res.cookie('playerName', name, {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        res.json({ buzzer: `/${existingPlayer.buzzer}.html` });
    } else {
        const buzzerId = generateBuzzerId();
        const newPlayer = {
            name: name,
            buzzer: buzzerId,
            canPress: true,
            pressed: false,
            occupied: 1,
            score: 0
        };
        
        players.push(newPlayer);
        console.log(`${name} has joined as ${buzzerId}`);
        
        const buzzerHtml = generateBuzzerHtml(buzzerId);
        const filePath = path.join(__dirname, 'public', `${buzzerId}.html`);
        fs.writeFileSync(filePath, buzzerHtml);
        
        res.cookie('playerId', buzzerId, { 
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        res.cookie('playerName', name, {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        
        res.json({ buzzer: `/${buzzerId}.html` });
        broadcast({ type: 'players-updated', players });
    }
});

// Replace the existing generateBuzzerHtml function with:
function generateBuzzerHtml(buzzerId) {
    const templatePath = path.join(__dirname, 'public', 'buzzer-template.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    return template.replace('{{BUZZER_ID}}', buzzerId);
}

app.get('/check-session', (req, res) => {
    const playerId = req.cookies.playerId;
    const playerName = req.cookies.playerName;
    
    if (playerId && playerName) {
        const player = players.find(p => p.buzzer === playerId && p.name === playerName);
        if (player) {
            res.json({ 
                exists: true, 
                buzzer: `/${player.buzzer}.html`,
                name: player.name
            });
            return;
        }
    }
    // Clear invalid cookies
    res.clearCookie('playerId');
    res.clearCookie('playerName');
    res.json({ exists: false });
});


//controll.html
app.post('/control/right', (req, res) => {
    console.log(players);
    let player = players.find(player => player.pressed === true);
    if (player) {
        player.score++;
        console.log(`${player.name} hat einen Punkt erhalten. Gesamtpunktzahl: ${player.score}`);
        broadcast({ type: 'players-updated', players });
        
        // Get and broadcast the revealed track info
        getCurrentTrackInfo(spotifyApi, true).then(trackInfo => {
            broadcast({ 
                songGuessed: true, 
                buzzer: player.buzzer,
                trackInfo: trackInfo
            });
        });
        
        // Disable all other players' buzzers
        players.forEach(p => {
            p.canPress = false;
            if (p.buzzer !== player.buzzer) {
                broadcast({ type: 'disable-buzzer', buzzer: p.buzzer });
            }
        });
        
        // Wait for the drop animation
        setTimeout(() => {
            jumpToDrop(spotifyApi);
            startPlayback(spotifyApi);
            player.pressed = false;
            buzzerPressed = false;
        }, 3000);  // Increased delay to show track info
    }
    res.sendStatus(200);
});

app.post('/control/wrong', (req, res) => {
    let player = players.find(player => player.pressed === true);
    if (player) {
        // Only disable the player who guessed wrong
        player.canPress = false;
        player.pressed = false;
        broadcast({ songGuessed: false, buzzer: player.buzzer }); // Send to wrong guesser
        
        // Enable all other players to buzz again
        players.forEach(p => {
            if (p.buzzer !== player.buzzer) {
                p.canPress = true;
                broadcast({ type: 'can-press-again', buzzer: p.buzzer });
            }
        });
        
        startPlayback(spotifyApi);
        buzzerPressed = false;
    }
    res.sendStatus(200);
});

app.post('/control/next', async (req, res) => {
    jumpToRandomPosition(spotifyApi);
    
    players.forEach(player => {
        player.canPress = true;
        player.pressed = false;
    });
    buzzerPressed = false;
    
    // Get and broadcast the hidden track info
    const trackInfo = await getCurrentTrackInfo(spotifyApi, false);
    broadcast({ type: 'new-song', trackInfo: trackInfo });
    
    players.forEach(player => {
        broadcast({ type: 'round-end', buzzer: player.buzzer });
    });
    
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


app.get('/check-buzzer-onload/:buzzerId', (req, res) => {
    let buzzerId = req.params.buzzerId;
    const playerName = req.cookies.playerName;
    let player = players.find(player => player.buzzer === buzzerId && player.name === playerName);
    
    if (player) {
        res.json({ isOccupied: false });
    } else {
        res.json({ isOccupied: true });
    }
});


const bodyParser = require('body-parser');
const { start } = require('repl');
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));




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

        // Write tokens to config2.ini
        const config = {
            spotify: {
                access_token: access_token,
                refresh_token: refresh_token
            }
        };
        fs.writeFileSync('./config2.ini', ini.stringify(config));

        console.log(`Sucessfully retreived access token. Expires in ${expires_in} s.`);
        res.send('Success! You can now close the window.');

    }).catch(error => {
        console.error('Error getting Tokens:', error);
        res.send(`Error getting Tokens: ${error}`);
    });
});



//functions

//get current track info
async function getCurrentTrackInfo(spotifyApi, revealed = false) {
    try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const data = await spotifyApi.getMyCurrentPlaybackState();
        if (data.body && data.body.item) {
            const trackInfo = {
                trackName: data.body.item.name,
                artistName: data.body.item.artists[0].name,
                albumCoverUrl: data.body.item.album.images[0].url,
                revealed: revealed
            };

            if (!revealed) {
                trackInfo.trackName = '???';
                trackInfo.artistName = '???';
                trackInfo.albumCoverUrl = '/cover.png';
            }

            console.log('Track info:', trackInfo);
            return trackInfo;
        }
        return null;
    } catch (err) {
        console.log('Something went wrong!', err);
        return null;
    }
}

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
                const dropPosition = durationMs * 0.28; // Jump to the drop of the song

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

app.post('/control/reset-game', (req, res) => {
    // Reset all player scores and states
    players.forEach(player => {
        player.score = 0;
        player.pressed = false;
        player.canPress = true;
        
        // Delete the generated buzzer HTML file
        const filePath = path.join(__dirname, 'public', `${player.buzzer}.html`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });
    
    // Clear the players array
    players = [];
    buzzerPressed = false;
    
    // Notify all clients about the reset
    broadcast({ type: 'players-updated', players });
    broadcast({ type: 'game-reset', message: 'Game has been reset' });
    
    // Notify all clients to clear their cookies and redirect
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
                type: 'clear-session', 
                redirect: '/index.html' 
            }));
        }
    });
    
    console.log('Game has been reset');
    res.sendStatus(200);
});


// Replace the existing static buzzer routes with:
app.get('/:buzzerId.html', (req, res) => {
    const filePath = path.join(__dirname, 'public', `${req.params.buzzerId}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Buzzer not found');
    }
});

app.listen(port, '192.168.178.45', () => {
    console.log(`Server running at http://192.168.1.90:${port}`);
});