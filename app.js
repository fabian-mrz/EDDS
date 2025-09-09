const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs');
const ini = require('ini');
const SpotifyWebApi = require('spotify-web-api-node');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
// Add near the top with other requires
const session = require('express-session');
const port = 3000;
const wsPort = 8081;  
const hostname = "127.0.0.1"


app.use(express.json());

app.use(cookieParser());

// Add after other app.use statements
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Add authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        next();
    } else {
        res.redirect('/login.html');
    }
}

// Create a WebSocket server
const wss = new WebSocket.Server({ port: wsPort });

// Broadcast function to send a message to all connected clients
async function broadcast(data) {
    try {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    } catch (error) {
        console.error("Error broadcasting message:", error);
    }
}


// Lese die Konfigurationsdatei
let config, config2;
try {
    config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
    config2 = ini.parse(fs.readFileSync('./config2.ini', 'utf-8'));
} catch (error) {
    console.error("Error reading config files:", error);
    process.exit(1); // Exit if config files are unreadable
}

// Spielerdaten
let players = []

let buzzerPressed = false; // Wurde ein Buzzer bereits gedrückt?



//authentification spotify
var scopes = ['user-read-playback-state', 'user-modify-playback-state'],
    state = 'your_state';

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
    redirectUri: `http://${hostname}:3000/callback`
});

app.get('/login', (req, res) => {
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    console.log('Authorize URL:', authorizeURL);
    res.redirect(authorizeURL);
});

try {
    spotifyApi.setAccessToken(config2.spotify.access_token);
    spotifyApi.setRefreshToken(config2.spotify.refresh_token);
} catch (error) {
    console.error("Error setting access token:", error);
}

// Check token validity and start refresh cycle
spotifyApi.getMe()
    .then(() => {
        console.log('Initial token is valid');
        // Start refresh cycle 1 minute before token expires
        setTimeout(refreshAccessToken, 3540 * 1000); // 3600 - 60 seconds
    })
    .catch(() => {
        console.log('Initial token expired, refreshing now...');
        refreshAccessToken();
    });

function refreshAccessToken() {
    spotifyApi.refreshAccessToken()
        .then(data => {
            const access_token = data.body['access_token'];
            console.log('Access token has been refreshed!');

            spotifyApi.setAccessToken(access_token);

            // Update config2.ini with new access token
            try {
                const currentConfig = ini.parse(fs.readFileSync('./config2.ini', 'utf-8'));
                currentConfig.spotify.access_token = access_token;
                fs.writeFileSync('./config2.ini', ini.stringify(currentConfig));
            } catch (error) {
                console.error("Error updating config2.ini:", error);
            }

            // Schedule next refresh before token expires (subtract 1 minute for safety)
            setTimeout(refreshAccessToken, (data.body['expires_in'] - 60) * 1000);
        })
        .catch(error => {
            console.error('Could not refresh access token:', error);
            console.log('Please re-authenticate at /login');
        });
}

//routes
app.post('/update-score', (req, res) => {
    try {
        console.log(req.body.name, req.body.score);
        let player = players.find(player => player.name === req.body.name);
        if (player) {
            player.score = parseInt(req.body.score);
            broadcast({ type: 'players-updated', players });
            res.status(200).json({ message: 'Score updated successfully' });
        } else {
            res.status(400).json({ error: 'No player found with the provided name.' });
        }
    } catch (error) {
        console.error("Error updating score:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/buzzer-pressed/:buzzer', async (req, res) => {
    try {
        let buzzer = req.params.buzzer;
        let player = players.find(player => player.buzzer === buzzer);

        if (player) {
            if (player && player.canPress && !buzzerPressed) {
                buzzerPressed = true;
                player.pressed = true;
                player.canPress = false;
                res.json({ success: true });
                console.log(`${player.name} hat den Buzzer gedrückt.`);
                broadcast({ type: 'buzzer-pressed', buzzer: player.buzzer, pressed: "pressed" }); // Send the buzzer that was pressed and true to all connected clients
                pausePlayback(spotifyApi);
            } else {
                res.json({ success: false, message: 'Dieser Spieler kann den Buzzer nicht drücken.' });
            }
        } else {
            res.json({ success: false, message: 'Kein Spieler gefunden.' });
        }
    } catch (error) {
        console.error("Error processing buzzer press:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// buzzer.html

// Add this function before the routes
function generateBuzzerId() {
    return `buzzer${players.length + 1}`;
}

function getUniquePlayerName(baseName) {
    let name = baseName;
    let counter = 1;

    while (players.some(player => player.name === name)) {
        name = `${baseName}${counter}`;
        counter++;
    }

    return name;
}

// Update the join-buzzer route
app.post('/join-buzzer', (req, res) => {
    try {
        let requestedName = req.body.name;

        // Always create a new player with a unique name
        const uniqueName = getUniquePlayerName(requestedName);
        const buzzerId = generateBuzzerId();
        const newPlayer = {
            name: uniqueName,
            buzzer: buzzerId,
            canPress: true,
            pressed: false,
            occupied: 1,
            score: 0
        };

        players.push(newPlayer);
        console.log(`${uniqueName} has joined as ${buzzerId}`);

        const buzzerHtml = generateBuzzerHtml(buzzerId);
        const filePath = path.join(__dirname, 'public', `${buzzerId}.html`);
        fs.writeFileSync(filePath, buzzerHtml);

        res.cookie('playerId', buzzerId, {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        res.cookie('playerName', uniqueName, {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        });

        res.json({ buzzer: `/${buzzerId}.html` });
        broadcast({ type: 'players-updated', players });
    } catch (error) {
        console.error("Error joining buzzer:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


function generateBuzzerHtml(buzzerId) {
    try {
        const templatePath = path.join(__dirname, 'public', 'buzzer-template.html');
        let template = fs.readFileSync(templatePath, 'utf8');
        return template.replace('{{BUZZER_ID}}', buzzerId);
    } catch (error) {
        console.error("Error generating buzzer HTML:", error);
        return `<p>Error generating buzzer. Please refresh.</p>`; // Fallback in case of error
    }
}

// Check for existing sesstion
// set is occupied to false, then after 5 seconds to true again, eles we have endless loop
app.get('/check-session', (req, res) => {
    try {
        const playerId = req.cookies.playerId;
        const playerName = req.cookies.playerName;

        if (playerId && playerName) {
            const player = players.find(p => p.buzzer === playerId && p.name === playerName);
            if (player) {
                // Set occupied to false
                player.occupied = false;

                // Reset occupied to true after 5 seconds
                setTimeout(() => {
                    player.occupied = true;
                }, 5000);

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
    } catch (error) {
        console.error("Error checking session:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//controll.html
// Protect all control routes
app.post('/control/*', requireAuth);
app.get('/control.html', requireAuth);
app.get('/get-winner', requireAuth); // Add this line
app.post('/control/right', (req, res) => {
    try {
        console.log(players);
        let player = players.find(player => player.pressed === true);
        if (player) {
            setTimeout(async () => {
                player.score++;
                console.log(`${player.name} hat einen Punkt erhalten. Gesamtpunktzahl: ${player.score}`);

                // Get and broadcast the revealed track info
                try {
                    const trackInfo = await getCurrentTrackInfo(spotifyApi, true);
                    broadcast({
                        songGuessed: true,
                        buzzer: player.buzzer,
                        trackInfo: trackInfo
                    });
                } catch (error) {
                    console.error("Error getting track info:", error);
                }

                broadcast({ type: 'players-updated', players });

                // Disable all other players' buzzers
                players.forEach(p => {
                    p.canPress = false;
                    if (p.buzzer !== player.buzzer) {
                        broadcast({ type: 'disable-buzzer', buzzer: p.buzzer });
                    }
                });

                // Wait for the drop animation
                try {
                    jumpToDrop(spotifyApi);
                    startPlayback(spotifyApi);
                } catch (error) {
                    console.error("Error controlling playback or external device:", error);
                }
                console.log('Alle anderen Spieler können nicht mehr drücken.');
                player.pressed = false;
                buzzerPressed = false;
            }, 500);
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling correct answer:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add this new route with other control routes
app.post('/control/get-winner', async (req, res) => {
    try {
        // Find player with highest score
        const winner = players.reduce((prev, current) => {
            return (prev.score > current.score) ? prev : current;
        });

        // Play "The Winner Takes It All" by ABBA
        await spotifyApi.play({
            uris: ['spotify:track:3oEkrIfXfSh9zGnE7eBzSV'] // The Winner Takes It All
        });

        //jump to ms
        spotifyApi.seek(232000)
            .then(() => {
                console.log(`Jumped to position: 0 ms`);
            })
            .catch((error) => {
                console.error('Failed to jump to position:', error);
            }
        );

        // Broadcast winner info to all clients
        broadcast({ 
            type: 'game-winner', 
            winner: {
                name: winner.name,
                score: winner.score,
                buzzer: winner.buzzer
            }
        });

        res.sendStatus(200);
    } catch (error) {
        console.error("Error announcing winner:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// please get request for winner, since broadcast may fail
app.get('/get-winner', (req, res) => {
    try {
        const winner = players.reduce((prev, current) => {
            return (prev.score > current.score) ? prev : current;
        });

        res.json({
            name: winner.name,
            score: winner.score,
            buzzer: winner.buzzer
        });
    } catch (error) {
        console.error("Error getting winner:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/control/reveal', async (req, res) => {
    try {
        // Get and broadcast the revealed track info without checking for pressed players
        const trackInfo = await getCurrentTrackInfo(spotifyApi, true);
        if (trackInfo) {
            // Disable all buzzers
            players.forEach(p => {
                p.canPress = false;
                broadcast({ type: 'disable-buzzer', buzzer: p.buzzer });
            });

            // Broadcast the revealed track info
            broadcast({
                type: 'track-revealed',
                trackInfo: trackInfo
            });

            res.sendStatus(200);
        } else {
            res.status(500).json({ error: 'Could not get track info' });
        }
    } catch (error) {
        console.error('Error in reveal route:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/control/wrong', (req, res) => {
    try {
        refreshAccessToken();
        let player = players.find(player => player.pressed === true);
        if (player) {
            // Only disable the player who guessed wrong
            player.canPress = false;
            player.pressed = false;
            broadcast({ songGuessed: false, buzzer: player.buzzer }); // Send to wrong guesser

            console.log(`${player.name} hat falsch geraten und kann nicht mehr drücken.`);

            // Enable all other players to buzz again
            players.forEach(p => {
                if (p.buzzer !== player.buzzer) {
                    p.canPress = true;
                    broadcast({ type: 'can-press-again', buzzer: p.buzzer });
                }
            });

            startPlayback(spotifyApi);
            buzzerPressed = false;
            // after 3 seconds fetch http://192.168.179.3/win&PL=1
            
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling wrong answer:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/control/next', async (req, res) => {
    try {
        refreshAccessToken();
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

       
        // Start playback and jump to a random position

        console.log('Alle Spieler können wieder drücken.');
        jumpToRandomPosition(spotifyApi);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error proceeding to next song:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});




app.get('/check-buzzer-onload/:buzzerId', (req, res) => {
    try {
        let buzzerId = req.params.buzzerId;
        const playerName = req.cookies.playerName;
        let player = players.find(player => player.buzzer === buzzerId && player.name === playerName);

        // debug log
        console.log("Checking buzzer onload:", buzzerId, playerName, player);

        if (player) {
            res.json({ isOccupied: false });
        } else {
            res.json({ isOccupied: true });
        }
    } catch (error) {
        console.error("Error checking buzzer onload:", error);
        res.status(500).json({ error: 'Internal server error' });
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
        try {
            fs.writeFileSync('./config2.ini', ini.stringify(config));
        } catch (error) {
            console.error("Error writing to config2.ini:", error);
        }

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
    try {
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
    } catch (error) {
        console.error("Error resetting game:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// route for start-game that striggers broadcast
app.post('/control/start-game', (req, res) => {
    try {
        // Reset game state for new round
        buzzerPressed = false;
        
        // Reset all players' states
        players.forEach(player => {
            player.canPress = true;
            player.pressed = false;
        });

        // Broadcast start-game event to all clients
        broadcast({ 
            type: 'start-game',
            message: 'Game is starting'
        });

        // Get initial track info and broadcast it after a delay
        setTimeout(async () => {
            try {
                const trackInfo = await getCurrentTrackInfo(spotifyApi, false);
                broadcast({ type: 'new-song', trackInfo: trackInfo });
                
                // Jump to random position in song
                jumpToRandomPosition(spotifyApi);
                
                // Notify all players they can press again
                players.forEach(player => {
                    broadcast({ type: 'round-end', buzzer: player.buzzer });
                });

              
            } catch (error) {
                console.error("Error setting up first song:", error);
            }
        }, 4000); // Wait for intro animation to finish

        res.sendStatus(200);
    } catch (error) {
        console.error("Error starting game:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Replace the existing static buzzer routes with:
app.get('/:buzzerId.html', (req, res) => {
    const filePath = path.join(__dirname, 'public', `${req.params.buzzerId}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        // redirect to index.html if the buzzer file does not exist
        res.redirect('/index.html');
    }
});

//auth
// Add this with your other routes
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Replace these with your desired credentials
    const validUsername = 'admin';
    const validPassword = 'songquiz123';

    if (username === validUsername && password === validPassword) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.json({
            success: false,
            message: 'Invalid username or password'
        });
    }
});

// Add logout route
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}`);
});