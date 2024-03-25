const express = require('express');
const path = require('path');
const app = express();
const port = 8080;

let players = [
    { name: 'Spieler1', buzzer: 'buzzer1', score: 0, pressed: false, canPress: true },
    { name: 'Spieler2', buzzer: 'buzzer2', score: 0, pressed: false, canPress: true },
    { name: 'Spieler3', buzzer: 'buzzer3', score: 0, pressed: false, canPress: true },
    { name: 'Spieler4', buzzer: 'buzzer4', score: 0, pressed: false, canPress: true }
];

let buzzers = {};
players.forEach(player => buzzers[player.buzzer] = false);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

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


app.post('/buzzer-pressed/:buzzer', (req, res) => {
    let buzzerName = req.params.buzzer;
    let player = players.find(player => player.buzzer === buzzerName);
    if (player) {
        if (player.canPress) {
            player.pressed = true;
            console.log(`${player.name} hat den Knopf gedrückt.`);
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Dieser Spieler kann den Knopf nicht drücken.' });
        }
    } else {
        res.status(400).send('Ungültiger Buzzername.');
    }
});

app.post('/check-buzzer', (req, res) => {
    let buzzerName = req.body.buzzer;
    let player = players.find(player => player.buzzer === buzzerName);
    if (player) {
        if (player.pressed) {
            res.json({ status: 'occupied' });
        } else {
            res.json({ status: 'free' });
        }
    } else {
        res.status(400).send('Ungültiger Buzzername.');
    }
});

function resetBuzzer() {
    players.forEach(player => {
        player.pressed = false;
        player.canPress = true;
    });
    console.log('Alle Buzzer wurden zurückgesetzt.');
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    resetBuzzer()
});