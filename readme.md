# Song Quiz Game

A multiplayer music quiz game with buzzer functionality, Spotify integration, and a control panel for hosts.

**Disclaimer:**  
This project was programmed heavily with the help of GPT-4.1 (GitHub Copilot).

## ⚠️ Warning

This project is provided **as-is** and is intended for private or experimental use. 
**Exposing this application to the public internet is at your own risk.**  
There is **no warranty** or guarantee of security, reliability, or fitness for any particular purpose.  
Sensitive data, credentials, and game logic may not be fully protected against attacks or misuse.

**Do not use in production or with sensitive information unless you have reviewed and secured the code and infrastructure yourself.**

## Features

- **Buzzer system:** Real-time buzzer for players using WebSocket.
- **Spotify integration:** Play and control music via Spotify API.
- **Admin control panel:** Manage rounds, scores, and reveal answers.
- **Player/host separation:** Secure login system with roles.
- **Responsive design:** Works well on desktop and mobile.
- **Session management:** Only authenticated users can access game pages.
- **Healthcheck:** Automatic reconnection for clients if connection is lost.

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/EDDS.git
cd EDDS
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Spotify API

Create a `config.ini` file with your Spotify credentials:

```ini
[spotify]
clientId = your_spotify_client_id
clientSecret = your_spotify_client_secret
```

Set your Spotify app's **redirect URI** to:

```
https://yourdomain.myfritz.net/callback
```

**Token Storage:**  
- Your static Spotify credentials are stored in `config.ini`.
- Your dynamic Spotify access and refresh tokens are stored in `config2.ini` after authentication.

### 4. Run the server

```bash
node app.js
```

## Deployment with Nginx and SSL 

1. **Install Nginx and Certbot:**

   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. **Configure Nginx:**

   Use the provided `nginx.conf` (replace `xxx.myfritz.net` with your domain):

   ```nginx
   server {
       server_name xxx.myfritz.net;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       listen 443 ssl;
       ssl_certificate /etc/letsencrypt/live/xxx.myfritz.net/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/xxx.myfritz.net/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
   }
   server {
       if ($host = xxx.myfritz.net) {
           return 301 https://$host$request_uri;
       }
       listen 80;
       server_name xxx.myfritz.net;
       return 404;
   }
   ```

3. **Obtain SSL certificate:**

   ```bash
   sudo certbot --nginx -d xxx.myfritz.net
   ```

4. **Restart Nginx:**

   ```bash
   sudo systemctl restart nginx
   ```

## WebSocket Configuration

- **Client:** Uses `wss://yourdomain.myfritz.net/` for secure WebSocket connections.
- **Server:** WebSocket is attached to the same HTTP server as Express (`const wss = new WebSocket.Server({ server })`).
- **Nginx:** Proxies WebSocket and HTTP traffic to Node.js.

## Usage

- **Players:** Log in with the shared player credentials and join the game.
- **Host/Admin:** Log in with admin credentials to access the control panel.
- **Auto-login:** Use `/auto-login?user=player&pass=playonly` for quick player access.

## Security Notes

- Only `/login`, `/auto-login`, and static assets are accessible without authentication.
- All other pages and endpoints require a valid session.
- Credentials in URLs (auto-login) should only be used in trusted environments.

## License

MIT
