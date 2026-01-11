from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
import random
import json
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ==================== MODELS ====================

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class RoomCreate(BaseModel):
    name: str
    max_players: int = 6

class PlayCardRequest(BaseModel):
    card: dict

class TakeCardsRequest(BaseModel):
    target_player_id: str

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, username: str) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== BHABHI CARD GAME LOGIC ====================
# Based on official rules from pagat.com/inflation/getaway.html

SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
BOT_NAMES = ["Anmol", "Simran", "Sehaj", "Jaggu", "Jaggi", "Jassi", "Munna"]

def create_deck() -> List[dict]:
    deck = []
    for suit in SUITS:
        for rank in RANKS:
            value = RANKS.index(rank) + 2  # 2=2, 3=3, ..., A=14
            deck.append({"suit": suit, "rank": rank, "value": value})
    random.shuffle(deck)
    return deck

def deal_cards(deck: List[dict], num_players: int) -> List[List[dict]]:
    hands = [[] for _ in range(num_players)]
    for i, card in enumerate(deck):
        hands[i % num_players].append(card)
    return hands

def find_ace_of_spades_holder(hands: List[List[dict]]) -> int:
    for i, hand in enumerate(hands):
        for card in hand:
            if card['suit'] == 'spades' and card['rank'] == 'A':
                return i
    return 0

def get_highest_of_suit(trick: List[dict], suit: str) -> tuple:
    """Returns (index, player_id) of who played the highest card of the given suit"""
    highest_index = -1
    highest_value = -1
    for i, card in enumerate(trick):
        if card['suit'] == suit and card['value'] > highest_value:
            highest_value = card['value']
            highest_index = i
    return highest_index

def has_suit(hand: List[dict], suit: str) -> bool:
    return any(c['suit'] == suit for c in hand)

def is_tochoo(card: dict, lead_suit: str) -> bool:
    """A tochoo is a card of different suit than the lead suit"""
    return card['suit'] != lead_suit

# ==================== BOT LOGIC ====================

def choose_bot_card(hand: List[dict], lead_suit: Optional[str], is_first_trick: bool, current_trick: List[dict] = None, game_state: dict = None, bot_id: str = None) -> dict:
    """Smart AI logic to choose which card to play"""
    if not hand:
        return None
    
    current_trick = current_trick or []
    game_state = game_state or {}
    
    # Track ALL suits where this bot got tochoo'd (from tochoo_history)
    tochoo_history = game_state.get("tochoo_history", {})
    my_tochoo_suits = set(tochoo_history.get(bot_id, []))
    
    # Also check last result
    last_result = game_state.get("last_trick_result")
    if last_result and last_result.get("type") == "pickup":
        if last_result.get("picker") == bot_id and last_result.get("lead_suit"):
            my_tochoo_suits.add(last_result["lead_suit"])
    
    # If leading (no lead_suit), choose strategically
    if lead_suit is None:
        suit_counts = {}
        for card in hand:
            suit_counts[card['suit']] = suit_counts.get(card['suit'], 0) + 1
        
        # Get all suits we have, sorted by count (fewest cards first for leading)
        # STRATEGY: Lead with suits others are likely to NOT have
        available_suits = list(suit_counts.keys())
        
        # SMART: NEVER lead with suits where we got tochoo'd before!
        safe_suits = [s for s in available_suits if s not in my_tochoo_suits]
        
        if safe_suits:
            # Sort safe suits by card count - prefer suits with fewer cards (opponents more likely to tochoo)
            # But also consider: if we have MANY of a suit, others might not have it
            # Best strategy: lead with suit we have moderate amount of (3-5 cards)
            moderate_suits = [s for s in safe_suits if 2 <= suit_counts[s] <= 5]
            if moderate_suits:
                # Pick one with highest cards (to potentially make others tochoo)
                best_suit = max(moderate_suits, key=lambda s: suit_counts[s])
            else:
                # Pick suit with most cards that's safe
                best_suit = max(safe_suits, key=lambda s: suit_counts[s])
        else:
            # All our suits got us tochoo'd! Pick the one we have FEWEST of
            # (to minimize damage when we get tochoo'd again)
            best_suit = min(available_suits, key=lambda s: suit_counts[s])
        
        suit_cards = [c for c in hand if c['suit'] == best_suit]
        
        # Play the LOWEST card from chosen suit (minimize getting power back)
        return min(suit_cards, key=lambda c: c['value'])
    
    # Must follow suit if possible
    suit_cards = [c for c in hand if c['suit'] == lead_suit]
    if suit_cards:
        if is_first_trick:
            # First trick - cards go to waste, play highest to get rid of big cards
            return max(suit_cards, key=lambda c: c['value'])
        
        # Check what's been played so far in this trick
        if current_trick:
            highest_played = max((c['value'] for c in current_trick if c['suit'] == lead_suit), default=0)
            
            winning_cards = [c for c in suit_cards if c['value'] > highest_played]
            losing_cards = [c for c in suit_cards if c['value'] <= highest_played]
            
            # Check if there's already a tochoo in current trick
            has_tochoo_in_trick = any(c['suit'] != lead_suit for c in current_trick)
            
            if has_tochoo_in_trick:
                # Someone tochoo'd! Highest card of lead suit picks up
                # We want to AVOID being highest if possible
                if losing_cards:
                    # Play our highest losing card (stay under, save low cards)
                    return max(losing_cards, key=lambda c: c['value'])
                # We have to win and pick up - play lowest winning card
                return min(winning_cards, key=lambda c: c['value'])
            
            # No tochoo yet - try to avoid getting power
            if losing_cards:
                # Play highest losing card (stay under current highest)
                return max(losing_cards, key=lambda c: c['value'])
            else:
                # We'll get power - play lowest to minimize lead next round
                return min(suit_cards, key=lambda c: c['value'])
        
        # Default: play lowest
        return min(suit_cards, key=lambda c: c['value'])
    
    # Can't follow suit - TOCHOO time!
    # SMART: Get rid of cards from suits we have FEW of (clear weak suits)
    suit_counts = {}
    for card in hand:
        suit_counts[card['suit']] = suit_counts.get(card['suit'], 0) + 1
    
    # Priority: singleton suits first, then doubles
    singleton_cards = [c for c in hand if suit_counts[c['suit']] == 1]
    if singleton_cards:
        # Play HIGHEST singleton (get rid of big dangerous cards)
        return max(singleton_cards, key=lambda c: c['value'])
    
    double_cards = [c for c in hand if suit_counts[c['suit']] == 2]
    if double_cards:
        return max(double_cards, key=lambda c: c['value'])
    
    # Default: play highest card overall to get rid of it
    return max(hand, key=lambda c: c['value'])

# ==================== WEBSOCKET MANAGER ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.user_rooms: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, room_code: str, user_id: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        self.active_connections[room_code][user_id] = websocket
        self.user_rooms[user_id] = room_code

    def disconnect(self, user_id: str):
        room_code = self.user_rooms.get(user_id)
        if room_code and room_code in self.active_connections:
            self.active_connections[room_code].pop(user_id, None)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]
        self.user_rooms.pop(user_id, None)

    async def broadcast_to_room(self, room_code: str, message: dict):
        if room_code in self.active_connections:
            disconnected = []
            for user_id, ws in self.active_connections[room_code].items():
                try:
                    await ws.send_json(message)
                except Exception:
                    disconnected.append(user_id)
            for user_id in disconnected:
                self.disconnect(user_id)

    async def send_personal(self, user_id: str, message: dict):
        room_code = self.user_rooms.get(user_id)
        if room_code and room_code in self.active_connections:
            ws = self.active_connections[room_code].get(user_id)
            if ws:
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect(user_id)

    def get_room_users(self, room_code: str) -> List[str]:
        return list(self.active_connections.get(room_code, {}).keys())

manager = ConnectionManager()

# ==================== GAME STATE HELPERS ====================

async def broadcast_game_state(game: dict, room: dict, room_code: str, message_type: str = "game_update"):
    """Send game state to all human players"""
    finished_players = game.get("finished_players", [])
    
    for pid in game["player_order"]:
        if not pid.startswith("bot_"):
            # If player has escaped, show them all hands (spectator mode)
            is_spectator = pid in finished_players
            
            await manager.send_personal(pid, {
                "type": message_type,
                "your_hand": game["player_hands"].get(pid, []),
                "all_hands": game["player_hands"] if is_spectator else None,  # Show all hands to escaped players
                "current_player": game["player_order"][game["current_player_index"]] if game["player_order"] else None,
                "current_trick": game.get("current_trick", []),
                "completed_trick": game.get("completed_trick", []),
                "lead_suit": game.get("lead_suit"),
                "player_card_counts": {p: len(cards) for p, cards in game["player_hands"].items()},
                "finished_players": finished_players,
                "loser": game.get("loser"),
                "status": game["status"],
                "players": room["players"] if room else [],
                "is_first_trick": game.get("is_first_trick", False),
                "trick_number": game.get("trick_number", 1),
                "last_trick_result": game.get("last_trick_result")
            })

async def process_trick_completion(game: dict, room: dict, room_code: str):
    """Process when a trick is complete (either everyone played or tochoo was played)"""
    lead_suit = game["lead_suit"]
    current_trick = game["current_trick"]
    is_first_trick = game.get("is_first_trick", False)
    
    # Save the completed trick for display
    completed_trick = list(current_trick)  # Copy the trick before clearing
    
    # Find who played the highest card of the lead suit
    highest_index = get_highest_of_suit(current_trick, lead_suit)
    power_player_id = current_trick[highest_index]["player_id"]
    
    # Check if there was a tochoo (someone couldn't follow suit)
    has_tochoo = any(is_tochoo(c, lead_suit) for c in current_trick)
    
    # Find who gave tochoo (if any)
    tochoo_giver = None
    if has_tochoo:
        for c in current_trick:
            if is_tochoo(c, lead_suit):
                tochoo_giver = c["player_id"]
                break
    
    # Initialize tochoo_history if not exists
    if "tochoo_history" not in game:
        game["tochoo_history"] = {}
    
    if is_first_trick:
        # FIRST TRICK: Cards ALWAYS go to waste pile, even with tochoo
        game["waste_pile"].extend([{k: v for k, v in c.items() if k != "player_id"} for c in current_trick])
        game["last_trick_result"] = {
            "type": "discarded", 
            "power_player": power_player_id,
            "completed_trick": completed_trick,
            "lead_suit": lead_suit
        }
    elif has_tochoo:
        # TOCHOO: Highest card of lead suit picks up ALL cards
        trick_cards = [{k: v for k, v in c.items() if k != "player_id"} for c in current_trick]
        game["player_hands"][power_player_id].extend(trick_cards)
        
        # Track which suit caused this player to get tochoo'd (for bot AI)
        if power_player_id not in game["tochoo_history"]:
            game["tochoo_history"][power_player_id] = []
        if lead_suit not in game["tochoo_history"][power_player_id]:
            game["tochoo_history"][power_player_id].append(lead_suit)
        
        game["last_trick_result"] = {
            "type": "pickup", 
            "picker": power_player_id, 
            "tochoo_by": tochoo_giver,
            "cards": len(trick_cards),
            "completed_trick": completed_trick,
            "lead_suit": lead_suit
        }
    else:
        # Everyone followed suit: cards go to waste pile
        game["waste_pile"].extend([{k: v for k, v in c.items() if k != "player_id"} for c in current_trick])
        game["last_trick_result"] = {
            "type": "discarded", 
            "power_player": power_player_id,
            "completed_trick": completed_trick,
            "lead_suit": lead_suit
        }
    
    # Store completed trick for display (will be cleared after broadcast)
    game["completed_trick"] = completed_trick
    
    # Clear current trick
    game["current_trick"] = []
    game["lead_suit"] = None
    game["is_first_trick"] = False
    game["trick_number"] = game.get("trick_number", 1) + 1
    
    # Check for players who finished (got away)
    active_players = [pid for pid in game["player_order"] if pid not in game.get("finished_players", [])]
    for pid in active_players:
        hand = game["player_hands"].get(pid, [])
        if len(hand) == 0 and pid != power_player_id:
            # Player got away! (played last card and doesn't have power)
            if pid not in game["finished_players"]:
                game["finished_players"].append(pid)
    
    # Update active players
    active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"]]
    
    # Check if game over (only one player left)
    if len(active_players) <= 1:
        if len(active_players) == 1:
            game["loser"] = active_players[0]
        game["status"] = "finished"
        
        # Update stats for human players
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
        for pid in game["finished_players"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
        
        await db.rooms.update_one({"code": room_code}, {"$set": {"status": "finished"}})
    else:
        # Power player leads next
        # But if power player has no cards, they must draw from waste
        power_hand = game["player_hands"].get(power_player_id, [])
        if len(power_hand) == 0 and game["waste_pile"]:
            # Draw random card from waste pile
            random.shuffle(game["waste_pile"])
            drawn_card = game["waste_pile"].pop()
            game["player_hands"][power_player_id] = [drawn_card]
        
        # Set next player to power player
        if power_player_id in game["player_order"]:
            game["current_player_index"] = game["player_order"].index(power_player_id)
        
        # Skip finished players
        while game["player_order"][game["current_player_index"]] in game["finished_players"]:
            game["current_player_index"] = (game["current_player_index"] + 1) % len(game["player_order"])
    
    return game

async def process_bot_turn(room_code: str):
    """Process bot's turn"""
    await asyncio.sleep(0.5)  # 1 second delay - faster gameplay
    
    game = await db.games.find_one({"room_code": room_code}, {"_id": 0})
    if not game or game.get("status") != "playing":
        return
    
    room = await db.rooms.find_one({"code": room_code}, {"_id": 0})
    if not room:
        return
    
    current_player_id = game["player_order"][game["current_player_index"]]
    
    if not current_player_id.startswith("bot_"):
        return
    
    hand = game["player_hands"].get(current_player_id, [])
    if not hand:
        return
    
    # Bot auto-forfeit if they have way too many cards (35+) - they can't win
    if len(hand) >= 35:
        game["loser"] = current_player_id
        game["status"] = "finished"
        active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"] and pid != current_player_id]
        game["finished_players"].extend(active_players)
        
        # Update stats for human players
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
        for pid in game["finished_players"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
        
        await db.games.update_one({"room_code": room_code}, {"$set": game})
        await db.rooms.update_one({"code": room_code}, {"$set": {"status": "finished"}})
        
        await manager.broadcast_to_room(room_code, {
            "type": "game_update",
            "status": "finished",
            "loser": current_player_id,
            "finished_players": game["finished_players"],
            "players": room["players"]
        })
        return
    
    # Choose card to play
    is_first_trick = game.get("is_first_trick", False)
    lead_suit = game.get("lead_suit")
    current_trick = game.get("current_trick", [])
    
    # If first player of trick, we're leading
    if not current_trick:
        # Must play Ace of Spades on first trick if we have it
        if is_first_trick:
            ace_spades = next((c for c in hand if c['suit'] == 'spades' and c['rank'] == 'A'), None)
            if ace_spades:
                card = ace_spades
            else:
                card = choose_bot_card(hand, None, is_first_trick, current_trick, game, current_player_id)
        else:
            card = choose_bot_card(hand, None, is_first_trick, current_trick, game, current_player_id)
        lead_suit = card['suit']
        game["lead_suit"] = lead_suit
    else:
        card = choose_bot_card(hand, lead_suit, is_first_trick, current_trick, game, current_player_id)
    
    # Remove card from hand
    game["player_hands"][current_player_id] = [c for c in hand if not (c['suit'] == card['suit'] and c['rank'] == card['rank'])]
    
    # Add to trick
    trick_card = {**card, "player_id": current_player_id}
    game["current_trick"].append(trick_card)
    
    # Check if this is a tochoo (not first trick) - trick ends immediately
    active_players = [pid for pid in game["player_order"] if pid not in game.get("finished_players", [])]
    
    trick_complete = False
    if not is_first_trick and is_tochoo(card, game["lead_suit"]):
        # Tochoo! Trick ends immediately
        trick_complete = True
    elif len(game["current_trick"]) == len(active_players):
        # Everyone has played
        trick_complete = True
    
    # IMPORTANT: Save and broadcast BEFORE processing trick completion
    # This ensures the last card is visible to all players
    await db.games.update_one(
        {"room_code": room_code},
        {"$set": game}
    )
    
    # Broadcast current state (showing the last played card)
    await broadcast_game_state(game, room, room_code)
    
    # If trick complete, wait for players to see the last card, then process
    if trick_complete:
        await asyncio.sleep(1.0)  # 2 seconds to see the complete trick with last card
        game = await process_trick_completion(game, room, room_code)
        
        # Save and broadcast the result
        await db.games.update_one(
            {"room_code": room_code},
            {"$set": game}
        )
        await broadcast_game_state(game, room, room_code)
        
        # Wait briefly then clear
        await asyncio.sleep(1.0)  # 2 seconds to see the result
        game["completed_trick"] = []
        game["last_trick_result"] = None
        await db.games.update_one(
            {"room_code": room_code},
            {"$set": {"completed_trick": [], "last_trick_result": None}}
        )
        await broadcast_game_state(game, room, room_code)
    else:
        # Move to next player
        game["current_player_index"] = (game["current_player_index"] + 1) % len(game["player_order"])
        while game["player_order"][game["current_player_index"]] in game.get("finished_players", []):
            game["current_player_index"] = (game["current_player_index"] + 1) % len(game["player_order"])
        
        await db.games.update_one(
            {"room_code": room_code},
            {"$set": {"current_player_index": game["current_player_index"]}}
        )
    
    # If next player is also a bot and game is still playing
    if game["status"] == "playing":
        next_player_id = game["player_order"][game["current_player_index"]]
        if next_player_id.startswith("bot_"):
            asyncio.create_task(process_bot_turn(room_code))

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username = await db.users.find_one({"username": data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "username": data.username,
        "email": data.email,
        "password": hash_password(data.password),
        "games_played": 0,
        "games_won": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    token = create_token(user_id, data.username)
    return {"token": token, "user": {"id": user_id, "username": data.username, "email": data.email}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["username"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "games_played": user.get("games_played", 0),
            "games_won": user.get("games_won", 0)
        }
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "games_played": user.get("games_played", 0),
        "games_won": user.get("games_won", 0)
    }

# ==================== ROOM ROUTES ====================

def generate_room_code() -> str:
    return ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))

@api_router.post("/rooms/create")
async def create_room(data: RoomCreate, user: dict = Depends(get_current_user)):
    room_code = generate_room_code()
    while await db.rooms.find_one({"code": room_code}):
        room_code = generate_room_code()
    
    room = {
        "id": str(uuid.uuid4()),
        "code": room_code,
        "name": data.name,
        "host_id": user["id"],
        "max_players": min(max(data.max_players, 2), 8),
        "players": [{
            "id": user["id"],
            "username": user["username"],
            "is_host": True,
            "is_ready": False
        }],
        "status": "waiting",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rooms.insert_one(room)
    return {"code": room_code, "room": {k: v for k, v in room.items() if k != "_id"}}

@api_router.post("/rooms/join/{room_code}")
async def join_room(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already in progress")
    
    if len(room["players"]) >= room["max_players"]:
        raise HTTPException(status_code=400, detail="Room is full")
    
    if any(p["id"] == user["id"] for p in room["players"]):
        return {"room": room}
    
    new_player = {
        "id": user["id"],
        "username": user["username"],
        "is_host": False,
        "is_ready": False
    }
    await db.rooms.update_one(
        {"code": room_code.upper()},
        {"$push": {"players": new_player}}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "player_joined",
        "player": new_player,
        "players": room["players"]
    })
    
    return {"room": room}

@api_router.post("/rooms/{room_code}/add-bot")
async def add_bot(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only host can add bots")
    
    if room["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already in progress")
    
    if len(room["players"]) >= room["max_players"]:
        raise HTTPException(status_code=400, detail="Room is full")
    
    bot_count = sum(1 for p in room["players"] if p["id"].startswith("bot_"))
    if bot_count >= len(BOT_NAMES):
        raise HTTPException(status_code=400, detail="Maximum bots reached")
    
    bot_name = BOT_NAMES[bot_count]
    bot_id = f"bot_{uuid.uuid4().hex[:8]}"
    
    new_bot = {
        "id": bot_id,
        "username": bot_name,
        "is_host": False,
        "is_ready": True,
        "is_bot": True
    }
    
    await db.rooms.update_one(
        {"code": room_code.upper()},
        {"$push": {"players": new_bot}}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "player_joined",
        "player": new_bot,
        "players": room["players"]
    })
    
    return {"room": room, "bot": new_bot}

@api_router.post("/rooms/{room_code}/remove-bot/{bot_id}")
async def remove_bot(room_code: str, bot_id: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only host can remove bots")
    
    if not bot_id.startswith("bot_"):
        raise HTTPException(status_code=400, detail="Can only remove bots")
    
    await db.rooms.update_one(
        {"code": room_code.upper()},
        {"$pull": {"players": {"id": bot_id}}}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "player_left",
        "player_id": bot_id,
        "players": room["players"]
    })
    
    return {"message": "Bot removed"}

@api_router.post("/rooms/leave/{room_code}")
async def leave_room(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    await db.rooms.update_one(
        {"code": room_code.upper()},
        {"$pull": {"players": {"id": user["id"]}}}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    if not room["players"]:
        await db.rooms.delete_one({"code": room_code.upper()})
        await db.games.delete_one({"room_code": room_code.upper()})
    else:
        if room["host_id"] == user["id"]:
            new_host = room["players"][0]
            await db.rooms.update_one(
                {"code": room_code.upper()},
                {"$set": {"host_id": new_host["id"], "players.0.is_host": True}}
            )
        
        await manager.broadcast_to_room(room_code.upper(), {
            "type": "player_left",
            "player_id": user["id"],
            "players": room["players"]
        })
    
    return {"message": "Left room"}

@api_router.get("/rooms/{room_code}")
async def get_room(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room": room}

@api_router.post("/rooms/{room_code}/ready")
async def toggle_ready(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    for i, player in enumerate(room["players"]):
        if player["id"] == user["id"]:
            new_ready = not player["is_ready"]
            await db.rooms.update_one(
                {"code": room_code.upper(), f"players.{i}.id": user["id"]},
                {"$set": {f"players.{i}.is_ready": new_ready}}
            )
            break
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "player_ready_changed",
        "players": room["players"]
    })
    
    return {"room": room}

# ==================== GAME ROUTES ====================

@api_router.post("/game/start/{room_code}")
async def start_game(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only host can start game")
    
    if len(room["players"]) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players")
    
    deck = create_deck()
    hands = deal_cards(deck, len(room["players"]))
    
    # Players play in sequence (order they joined) - NO randomization
    player_hands = {}
    player_order = []
    for i, player in enumerate(room["players"]):
        player_hands[player["id"]] = hands[i]
        player_order.append(player["id"])
    
    # Find who has Ace of Spades to start
    starter_index = 0
    for i, pid in enumerate(player_order):
        hand = player_hands[pid]
        if any(c["suit"] == "spades" and c["rank"] == "A" for c in hand):
            starter_index = i
            break
    
    game = {
        "id": str(uuid.uuid4()),
        "room_code": room_code.upper(),
        "player_hands": player_hands,
        "player_order": player_order,
        "current_player_index": starter_index,
        "current_trick": [],
        "lead_suit": None,
        "waste_pile": [],
        "finished_players": [],
        "loser": None,
        "status": "playing",
        "is_first_trick": True,
        "trick_number": 1,
        "last_trick_result": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.games.delete_one({"room_code": room_code.upper()})
    await db.games.insert_one(game)
    await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "playing"}})
    
    # Send game state to human players
    for player in room["players"]:
        if not player["id"].startswith("bot_"):
            await manager.send_personal(player["id"], {
                "type": "game_started",
                "your_hand": player_hands[player["id"]],
                "current_player": player_order[starter_index],
                "player_order": player_order,
                "players": room["players"],
                "is_first_trick": True,
                "trick_number": 1
            })
    
    # If first player is a bot, start bot turn
    first_player_id = player_order[starter_index]
    if first_player_id.startswith("bot_"):
        asyncio.create_task(process_bot_turn(room_code.upper()))
    
    return {"message": "Game started"}

@api_router.get("/game/{room_code}")
async def get_game_state(room_code: str, user: dict = Depends(get_current_user)):
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    # Check if user has escaped (is spectator)
    is_spectator = user["id"] in game.get("finished_players", [])
    
    return {
        "your_hand": game["player_hands"].get(user["id"], []),
        "all_hands": game["player_hands"] if is_spectator else None,  # Show all hands to spectators
        "current_player": game["player_order"][game["current_player_index"]] if game["player_order"] else None,
        "current_trick": game.get("current_trick", []),
        "lead_suit": game.get("lead_suit"),
        "player_order": game["player_order"],
        "player_card_counts": {pid: len(cards) for pid, cards in game["player_hands"].items()},
        "finished_players": game.get("finished_players", []),
        "loser": game.get("loser"),
        "status": game["status"],
        "players": room["players"] if room else [],
        "is_first_trick": game.get("is_first_trick", False),
        "trick_number": game.get("trick_number", 1),
        "last_trick_result": game.get("last_trick_result")
    }

@api_router.post("/game/{room_code}/play")
async def play_card(room_code: str, data: PlayCardRequest, user: dict = Depends(get_current_user)):
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game is not in progress")
    
    current_player_id = game["player_order"][game["current_player_index"]]
    if current_player_id != user["id"]:
        raise HTTPException(status_code=400, detail="Not your turn")
    
    hand = game["player_hands"].get(user["id"], [])
    card = data.card
    
    # Check if card is in hand
    card_in_hand = None
    for c in hand:
        if c["suit"] == card["suit"] and c["rank"] == card["rank"]:
            card_in_hand = c
            break
    
    if not card_in_hand:
        raise HTTPException(status_code=400, detail="Card not in hand")
    
    # Check if we're leading or following
    lead_suit = game.get("lead_suit")
    is_first_trick = game.get("is_first_trick", False)
    
    if not game.get("current_trick"):
        # We're leading
        # On first trick, must play Ace of Spades if we have it
        if is_first_trick:
            has_ace_spades = any(c['suit'] == 'spades' and c['rank'] == 'A' for c in hand)
            if has_ace_spades and not (card['suit'] == 'spades' and card['rank'] == 'A'):
                raise HTTPException(status_code=400, detail="Must play Ace of Spades to start")
        lead_suit = card['suit']
        game["lead_suit"] = lead_suit
    else:
        # We're following - must follow suit if possible
        if has_suit(hand, lead_suit) and card['suit'] != lead_suit:
            raise HTTPException(status_code=400, detail="Must follow suit")
    
    # Remove card from hand
    game["player_hands"][user["id"]] = [c for c in hand if not (c['suit'] == card['suit'] and c['rank'] == card['rank'])]
    
    # Add to trick
    trick_card = {**card, "player_id": user["id"]}
    game["current_trick"].append(trick_card)
    
    # Check if trick is complete
    active_players = [pid for pid in game["player_order"] if pid not in game.get("finished_players", [])]
    
    trick_complete = False
    if not is_first_trick and is_tochoo(card, game["lead_suit"]):
        # Tochoo played (not on first trick) - trick ends immediately
        trick_complete = True
    elif len(game["current_trick"]) == len(active_players):
        # Everyone has played
        trick_complete = True
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    # IMPORTANT: Save and broadcast BEFORE processing trick completion
    # This ensures the last card is visible to all players
    await db.games.update_one(
        {"room_code": room_code.upper()},
        {"$set": game}
    )
    
    # Broadcast current state (showing the last played card)
    await broadcast_game_state(game, room, room_code.upper())
    
    if trick_complete:
        # Wait for players to see the complete trick (especially last card)
        await asyncio.sleep(1.0)
        
        game = await process_trick_completion(game, room, room_code.upper())
        
        # Save and broadcast result
        await db.games.update_one(
            {"room_code": room_code.upper()},
            {"$set": game}
        )
        await broadcast_game_state(game, room, room_code.upper())
        
        # Wait for players to see the result
        await asyncio.sleep(1.0)
        
        # Clear completed trick
        game["completed_trick"] = []
        game["last_trick_result"] = None
        await db.games.update_one(
            {"room_code": room_code.upper()},
            {"$set": {"completed_trick": [], "last_trick_result": None}}
        )
        await broadcast_game_state(game, room, room_code.upper())
    else:
        # Move to next player
        game["current_player_index"] = (game["current_player_index"] + 1) % len(game["player_order"])
        while game["player_order"][game["current_player_index"]] in game.get("finished_players", []):
            game["current_player_index"] = (game["current_player_index"] + 1) % len(game["player_order"])
        
        await db.games.update_one(
            {"room_code": room_code.upper()},
            {"$set": {"current_player_index": game["current_player_index"]}}
        )
    
    # If next player is a bot and game is still playing
    if game["status"] == "playing":
        next_player_id = game["player_order"][game["current_player_index"]]
        if next_player_id.startswith("bot_"):
            asyncio.create_task(process_bot_turn(room_code.upper()))
    
    return {"message": "Card played"}

@api_router.post("/game/{room_code}/take-cards")
async def take_cards_from_player(room_code: str, data: TakeCardsRequest, user: dict = Depends(get_current_user)):
    """Take all cards from the player to your left (or next player with cards)"""
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game is not in progress")
    
    target_id = data.target_player_id
    
    # Verify target has cards
    target_hand = game["player_hands"].get(target_id, [])
    if len(target_hand) == 0:
        raise HTTPException(status_code=400, detail="Target has no cards")
    
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot take your own cards")
    
    # Transfer all cards
    game["player_hands"][user["id"]].extend(target_hand)
    game["player_hands"][target_id] = []
    
    # Target has gotten away
    if target_id not in game["finished_players"]:
        game["finished_players"].append(target_id)
    
    # Check if game over
    active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"]]
    if len(active_players) == 1:
        game["loser"] = active_players[0]
        game["status"] = "finished"
        
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
        for pid in game["finished_players"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
        
        await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "finished"}})
    
    await db.games.update_one(
        {"room_code": room_code.upper()},
        {"$set": game}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    for pid in game["player_order"]:
        if not pid.startswith("bot_"):
            await manager.send_personal(pid, {
                "type": "cards_taken",
                "taker_id": user["id"],
                "target_id": target_id,
                "your_hand": game["player_hands"].get(pid, []),
                "player_card_counts": {p: len(cards) for p, cards in game["player_hands"].items()},
                "finished_players": game["finished_players"],
                "loser": game["loser"],
                "status": game["status"],
                "players": room["players"] if room else []
            })
    
    return {"message": "Cards taken"}

@api_router.post("/game/{room_code}/request-cards")
async def request_cards_from_player(room_code: str, data: TakeCardsRequest, user: dict = Depends(get_current_user)):
    """Request cards from a player who has 3 or fewer cards. They will get a prompt to accept/decline."""
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game is not in progress")
    
    target_id = data.target_player_id
    
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot request cards from yourself")
    
    # Verify target is still in game
    if target_id in game.get("finished_players", []):
        raise HTTPException(status_code=400, detail="Target player has already escaped")
    
    # Check target has 3 or fewer cards
    target_hand = game["player_hands"].get(target_id, [])
    if len(target_hand) > 3:
        raise HTTPException(status_code=400, detail="Can only request cards from players with 3 or fewer cards")
    
    if len(target_hand) == 0:
        raise HTTPException(status_code=400, detail="Target has no cards")
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    requester_name = user.get("username", "Someone")
    
    # Send request to the target player (they get the Yes/No prompt)
    # If target is a bot, auto-accept (bots want to escape)
    if target_id.startswith("bot_"):
        # Bot auto-accepts - transfer cards
        game["player_hands"][user["id"]] = game["player_hands"].get(user["id"], []) + target_hand
        game["player_hands"][target_id] = []
        
        if target_id not in game["finished_players"]:
            game["finished_players"].append(target_id)
        
        # Check game over
        active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"]]
        if len(active_players) == 1:
            game["loser"] = active_players[0]
            game["status"] = "finished"
            
            for pid in game["player_order"]:
                if not pid.startswith("bot_"):
                    await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
            for pid in game["finished_players"]:
                if not pid.startswith("bot_"):
                    await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
            
            await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "finished"}})
        
        await db.games.update_one({"room_code": room_code.upper()}, {"$set": game})
        
        # Broadcast update
        bot_name = next((p["username"] for p in room["players"] if p["id"] == target_id), "Bot")
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await manager.send_personal(pid, {
                    "type": "cards_given",
                    "giver_id": target_id,
                    "receiver_id": user["id"],
                    "cards_count": len(target_hand),
                    "your_hand": game["player_hands"].get(pid, []),
                    "all_hands": game["player_hands"] if pid in game.get("finished_players", []) else None,
                    "player_card_counts": {p: len(cards) for p, cards in game["player_hands"].items()},
                    "finished_players": game["finished_players"],
                    "loser": game["loser"],
                    "status": game["status"],
                    "players": room["players"] if room else []
                })
        
        return {"message": f"{bot_name} accepted and gave you their cards!"}
    else:
        # Human player - send them the request prompt via broadcast to ensure delivery
        # First try direct message
        await manager.send_personal(target_id, {
            "type": "card_request",
            "requester_id": user["id"],
            "requester_name": requester_name,
            "your_cards": len(target_hand),
            "target_id": target_id  # Include target so frontend can filter
        })
        
        # Also broadcast to room as backup (frontend will filter by target_id)
        await manager.broadcast_to_room(room_code.upper(), {
            "type": "card_request_broadcast",
            "target_id": target_id,
            "requester_id": user["id"],
            "requester_name": requester_name,
            "your_cards": len(target_hand)
        })
        
        return {"message": "Request sent! Waiting for their response..."}

@api_router.post("/game/{room_code}/respond-card-request")
async def respond_to_card_request(room_code: str, data: dict, user: dict = Depends(get_current_user)):
    """Respond to a card request (accept or decline)"""
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    accept = data.get("accept", False)
    requester_id = data.get("requester_id")
    
    if not requester_id:
        raise HTTPException(status_code=400, detail="Missing requester_id")
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    if not accept:
        # Declined - notify requester
        await manager.send_personal(requester_id, {
            "type": "card_request_declined",
            "decliner_id": user["id"],
            "decliner_name": user.get("username", "Player")
        })
        return {"message": "Request declined"}
    
    # Accepted - transfer cards
    user_hand = game["player_hands"].get(user["id"], [])
    game["player_hands"][requester_id] = game["player_hands"].get(requester_id, []) + user_hand
    game["player_hands"][user["id"]] = []
    
    if user["id"] not in game["finished_players"]:
        game["finished_players"].append(user["id"])
    
    # Check game over
    active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"]]
    if len(active_players) == 1:
        game["loser"] = active_players[0]
        game["status"] = "finished"
        
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
        for pid in game["finished_players"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
        
        await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "finished"}})
    
    await db.games.update_one({"room_code": room_code.upper()}, {"$set": game})
    
    # Broadcast to all
    for pid in game["player_order"]:
        if not pid.startswith("bot_"):
            await manager.send_personal(pid, {
                "type": "cards_given",
                "giver_id": user["id"],
                "receiver_id": requester_id,
                "cards_count": len(user_hand),
                "your_hand": game["player_hands"].get(pid, []),
                "all_hands": game["player_hands"] if pid in game.get("finished_players", []) else None,
                "player_card_counts": {p: len(cards) for p, cards in game["player_hands"].items()},
                "finished_players": game["finished_players"],
                "loser": game["loser"],
                "status": game["status"],
                "players": room["players"] if room else []
            })
    
    return {"message": "Cards given! You escaped!"}

@api_router.post("/game/{room_code}/offer-cards")
async def offer_cards_to_player(room_code: str, data: TakeCardsRequest, user: dict = Depends(get_current_user)):
    """Offer your cards to another player (when you have 3 or fewer cards)"""
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game is not in progress")
    
    # Check user has 3 or fewer cards
    user_hand = game["player_hands"].get(user["id"], [])
    if len(user_hand) > 3:
        raise HTTPException(status_code=400, detail="You can only offer cards when you have 3 or fewer")
    
    if len(user_hand) == 0:
        raise HTTPException(status_code=400, detail="You have no cards to offer")
    
    target_id = data.target_player_id
    
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot offer cards to yourself")
    
    # Verify target is still in game
    if target_id in game.get("finished_players", []):
        raise HTTPException(status_code=400, detail="Target player has already escaped")
    
    # Transfer all cards from user to target
    target_hand = game["player_hands"].get(target_id, [])
    game["player_hands"][target_id] = target_hand + user_hand
    game["player_hands"][user["id"]] = []
    
    # User has gotten away!
    if user["id"] not in game["finished_players"]:
        game["finished_players"].append(user["id"])
    
    # Check if game over
    active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"]]
    if len(active_players) == 1:
        game["loser"] = active_players[0]
        game["status"] = "finished"
        
        for pid in game["player_order"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
        for pid in game["finished_players"]:
            if not pid.startswith("bot_"):
                await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
        
        await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "finished"}})
    
    await db.games.update_one(
        {"room_code": room_code.upper()},
        {"$set": game}
    )
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    # Broadcast to all players
    for pid in game["player_order"]:
        if not pid.startswith("bot_"):
            await manager.send_personal(pid, {
                "type": "cards_offered",
                "offerer_id": user["id"],
                "taker_id": target_id,
                "cards_count": len(user_hand),
                "your_hand": game["player_hands"].get(pid, []),
                "player_card_counts": {p: len(cards) for p, cards in game["player_hands"].items()},
                "finished_players": game["finished_players"],
                "loser": game["loser"],
                "status": game["status"],
                "players": room["players"] if room else []
            })
    
    return {"message": "Cards offered and accepted"}

@api_router.post("/game/{room_code}/forfeit")
async def forfeit_game(room_code: str, user: dict = Depends(get_current_user)):
    """Forfeit the game - player becomes the loser immediately"""
    game = await db.games.find_one({"room_code": room_code.upper()}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if game["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game is not in progress")
    
    if user["id"] in game.get("finished_players", []):
        raise HTTPException(status_code=400, detail="You have already escaped")
    
    # Set this player as the loser
    game["loser"] = user["id"]
    game["status"] = "finished"
    
    # All other active players are winners
    active_players = [pid for pid in game["player_order"] if pid not in game["finished_players"] and pid != user["id"]]
    game["finished_players"].extend(active_players)
    
    # Update stats
    for pid in game["player_order"]:
        if not pid.startswith("bot_"):
            await db.users.update_one({"id": pid}, {"$inc": {"games_played": 1}})
    for pid in game["finished_players"]:
        if not pid.startswith("bot_"):
            await db.users.update_one({"id": pid}, {"$inc": {"games_won": 1}})
    
    await db.games.update_one({"room_code": room_code.upper()}, {"$set": game})
    await db.rooms.update_one({"code": room_code.upper()}, {"$set": {"status": "finished"}})
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    
    # Broadcast game over
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "game_update",
        "status": "finished",
        "loser": user["id"],
        "finished_players": game["finished_players"],
        "players": room["players"] if room else []
    })
    
    return {"message": "You forfeited. Game over."}

@api_router.post("/game/{room_code}/restart")
async def restart_game(room_code: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only host can restart game")
    
    await db.rooms.update_one(
        {"code": room_code.upper()},
        {"$set": {"status": "waiting"}}
    )
    
    for i in range(len(room["players"])):
        await db.rooms.update_one(
            {"code": room_code.upper()},
            {"$set": {f"players.{i}.is_ready": room["players"][i].get("is_bot", False)}}
        )
    
    await db.games.delete_one({"room_code": room_code.upper()})
    
    room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
    await manager.broadcast_to_room(room_code.upper(), {
        "type": "game_restarted",
        "players": room["players"]
    })
    
    return {"message": "Game restarted"}

# ==================== WEBSOCKET ====================

@app.websocket("/ws/{room_code}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, user_id: str):
    await manager.connect(websocket, room_code.upper(), user_id)
    
    try:
        room = await db.rooms.find_one({"code": room_code.upper()}, {"_id": 0})
        if room:
            await manager.broadcast_to_room(room_code.upper(), {
                "type": "user_connected",
                "user_id": user_id,
                "connected_users": manager.get_room_users(room_code.upper())
            })
        
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "voice_join":
                # User joined voice chat - notify others
                username = data.get("username", "Someone")
                await manager.broadcast_to_room(room_code.upper(), {
                    "type": "voice_user_joined",
                    "user_id": user_id,
                    "username": username
                })
            elif data["type"] == "voice_leave":
                # User left voice chat
                await manager.broadcast_to_room(room_code.upper(), {
                    "type": "voice_user_left",
                    "user_id": user_id
                })
            elif data["type"] == "voice_signal":
                # WebRTC signaling for voice chat - relay to target
                target_user = data.get("target_user")
                if target_user:
                    await manager.send_personal(target_user, {
                        "type": "voice_signal",
                        "from_user": user_id,
                        "signal": data.get("signal")
                    })
            elif data["type"] == "voice_status":
                await manager.broadcast_to_room(room_code.upper(), {
                    "type": "voice_status",
                    "user_id": user_id,
                    "is_speaking": data.get("is_speaking", False),
                    "is_muted": data.get("is_muted", False)
                })
            elif data["type"] == "chat_message":
                await manager.broadcast_to_room(room_code.upper(), {
                    "type": "chat_message",
                    "user_id": user_id,
                    "message": data["message"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            elif data["type"] == "reaction":
                # Emoji/phrase reactions - broadcast to all in room
                await manager.broadcast_to_room(room_code.upper(), {
                    "type": "reaction",
                    "user_id": user_id,
                    "reaction": data.get("reaction", ""),
                    "is_emoji": data.get("is_emoji", True)
                })
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        # Notify voice chat left
        await manager.broadcast_to_room(room_code.upper(), {
            "type": "voice_user_left",
            "user_id": user_id
        })
        await manager.broadcast_to_room(room_code.upper(), {
            "type": "user_disconnected",
            "user_id": user_id,
            "connected_users": manager.get_room_users(room_code.upper())
        })

# ==================== SETUP ====================

@api_router.get("/")
async def root():
    return {"message": "Bhabhi Game API - by JB7"}

# Health endpoint for Kubernetes health checks
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "bhabhi-game-api"}

@api_router.get("/health")
async def api_health_check():
    return {"status": "healthy", "service": "bhabhi-game-api"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
