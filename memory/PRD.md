# Bhabhi Multiplayer Card Game - Product Requirements Document

## Original Problem Statement
Build a multiplayer Bhabhi card game with the following features:
- User authentication (login/register)
- Room creation and joining with room codes
- Support for 2-8 players with bot opponents
- Real-time gameplay via WebSocket
- Voice chat between players
- Text chat in-game
- Player statistics tracking

## Core Requirements
1. **Authentication**: JWT-based auth with email/password
2. **Rooms**: Create, join, leave rooms with unique codes
3. **Bots**: AI-controlled bot opponents
4. **Game Logic**: Full Bhabhi card game rules including:
   - Ace of Spades starts first trick
   - Must follow suit
   - Tochoo (breaking suit) mechanic
   - Card requesting from players with <=3 cards
   - Escape/win mechanics
5. **Real-time Features**: WebSocket for game state, chat, reactions
6. **Voice Chat**: PeerJS-based peer-to-peer voice communication
7. **Sound Effects**: Card sounds, dhol beat on win/escape

## Technical Architecture

### Backend (FastAPI + MongoDB)
- `/app/backend/server.py`: Single file containing all API routes, WebSocket handlers, game logic
- MongoDB collections: users, rooms, games
- JWT authentication
- WebSocket endpoint: `/api/ws/{room_code}/{user_id}`

### Frontend (React + Tailwind)
- `/app/frontend/src/pages/GamePage.js`: Main game component
- `/app/frontend/src/pages/LobbyPage.js`: Room waiting room
- `/app/frontend/src/pages/HomePage.js`: Dashboard with room creation
- `/app/frontend/src/pages/LoginPage.js`: Authentication
- PeerJS for voice chat
- Web Audio API for sound effects

## What's Been Implemented (as of Jan 12, 2026)

### Completed Features
- [x] User authentication (login/register)
- [x] Room creation and joining
- [x] Bot opponents (AI players)
- [x] Full game logic with Bhabhi rules
- [x] Real-time game state via WebSocket
- [x] Text chat (fixed - now connected)
- [x] Voice chat with PeerJS
- [x] Sound effects (dhol.mp3, card sounds)
- [x] Quick emoji/phrase reactions
- [x] Turn timer (12 seconds auto-play)
- [x] Player statistics display
- [x] Escape position tracking (1st, 2nd, 3rd)
- [x] Spectator mode after escape
- [x] Forfeit functionality

### Bug Fixes Applied
- [x] WebSocket routing fixed (added /api prefix)
- [x] Chat connection now works (green indicator)
- [x] Trick clearing delay increased to 5 seconds
- [x] Sound preloading for better playback
- [x] PeerJS voice chat replacing simple-peer

## Known Issues / Pending Items

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] "Play Again" button to restart with same players
- [ ] Player reconnect logic (1-minute window)

### P2 - Medium Priority
- [ ] Bot AI improvements (smarter card selection)
- [ ] Turn-based card sound on every play

### P3 - Low Priority
- [ ] Voice chat requires manual "Call All" button click
- [ ] Some empty catch blocks need proper logging

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Rooms
- `POST /api/rooms/create` - Create new room
- `POST /api/rooms/join/{room_code}` - Join room
- `POST /api/rooms/leave/{room_code}` - Leave room
- `GET /api/rooms/{room_code}` - Get room info
- `POST /api/rooms/{room_code}/add-bot` - Add bot
- `POST /api/rooms/{room_code}/remove-bot/{bot_id}` - Remove bot
- `POST /api/rooms/{room_code}/ready` - Toggle ready

### Game
- `POST /api/game/start/{room_code}` - Start game
- `GET /api/game/{room_code}` - Get game state
- `POST /api/game/{room_code}/play` - Play a card
- `POST /api/game/{room_code}/request-cards` - Request cards
- `POST /api/game/{room_code}/respond-card-request` - Accept/decline
- `POST /api/game/{room_code}/forfeit` - Forfeit game
- `POST /api/game/{room_code}/restart` - Restart game

### WebSocket
- `WS /api/ws/{room_code}/{user_id}` - Real-time events

## Test Credentials
- Email: jobansidhu209@gmail.com
- Password: joban123
- Username: JB7

## File References
- Backend: `/app/backend/server.py`
- Game Page: `/app/frontend/src/pages/GamePage.js`
- Lobby: `/app/frontend/src/pages/LobbyPage.js`
- Sound: `/app/frontend/public/dhol.mp3`
