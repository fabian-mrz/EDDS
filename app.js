const express = require('express');
const path = require('path');
const app = express();
const port = 8080;

// Definieren Sie die Spieler
let players = [
    { name: 'Spieler 1', buzzer: 'buzzer1', canPress: true, pressed: false, score: 0 },
    { name: 'Spieler 2', buzzer: 'buzzer2', canPress: true, pressed: false, score: 0 },
    { name: 'Spieler 3', buzzer: 'buzzer3', canPress: true, pressed: false, score: 0 },
    { name: 'Spieler 4', buzzer: 'buzzer4', canPress: true, pressed: false, score: 0 },
];

let buzzerCounters = {};

let buzzerPressed = false;

//Who pressed first
function checkBuzzer(buzzerName) {
    return (req, res, next) => {
        if (buzzerPressed) {
            res.status(400).send('Ein Spieler hat bereits den Buzzer gedrückt.');
        } else {
            let player = players.find(player => player.buzzer === buzzerName);
            if (player && player.canPress) {
                player.pressed = true;
                buzzerPressed = true;
                console.log(`${player.name} hat den Buzzer gedrückt.`);
            }
            next();
        }
    };
}

//Reset buzzer
function resetBuzzer(buzzerName) {
    let player = players.find(player => player.buzzer === buzzerName);
    if (player) {
        player.pressed = false;
    }
    console.log(`Buzzer ${buzzerName} wurde zurückgesetzt.`);
}


//controll.html
app.post('/control/right', (req, res) => {
    let player = players.find(player => player.pressed === true);
    if (player) {
        player.score++;
        console.log(`${player.name} hat einen Punkt erhalten. Gesamtpunktzahl: ${player.score}`);
        resetBuzzer(player.buzzer);
    }
    res.sendStatus(200);
});

app.post('/control/wrong', (req, res) => {
    let player = players.find(player => player.pressed === true);
    if (player) {
        resetBuzzer(player.buzzer);
        buzzerPressed = false;
    }
    res.sendStatus(200);
});

app.post('/control/next', (req, res) => {
    players.forEach(player => {
        player.canPress = true;
    });
    buzzerPressed = false;
    console.log('Alle Spieler können wieder drücken.');
    res.sendStatus(200);
});

app.post('/reset-buzzer/:buzzerId', (req, res) => {
    let buzzerId = req.params.buzzerId;
    if (buzzerCounters.hasOwnProperty(buzzerId)) {
        buzzerCounters[buzzerId] = false;
        console.log(`Resetting buzzer ${buzzerId}`);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Buzzer not found' });
    }
});

//buzzerX.hmtl
app.post('/buzzer-pressed/:buzzer', (req, res) => {
    let buzzerName = req.params.buzzer;
    let player = players.find(player => player.buzzer === buzzerName);
    if (player) {
        if (player.canPress && !buzzerPressed) {
            player.pressed = true;
            player.canPress = false; 
            buzzerPressed = true;
            console.log(`${player.name} hat den Buzzer gedrückt.`);
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Dieser Spieler kann den Buzzer nicht drücken.' });
        }
    } else {
        res.json({ success: false, message: 'Unbekannter Buzzer.' });
    }
});


app.get('/check-buzzer-onload/:buzzerId', (req, res) => {
    let buzzerId = req.params.buzzerId;
    if (buzzerCounters[buzzerId] === false) {
        buzzerCounters[buzzerId] = true;
        res.json({ isOccupied: false });
    } else {
        buzzerCounters[buzzerId] = false;
        res.json({ isOccupied: true });
    }
    console.log(buzzerCounters);
});


const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

//index.html
app.post('/join-buzzer', (req, res) => {
    let name = req.body.name;
    let availablePlayer = players.find(player => !player.pressed);
    if (availablePlayer) {
        availablePlayer.pressed = true;
        console.log(`${name} has joined ${availablePlayer.buzzer}`);
        res.json({ buzzer: `/${availablePlayer.buzzer}.html` });
    } else {
        console.log(`No available buzzer for ${name}`);
        res.json({ buzzer: null });
    }
});

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