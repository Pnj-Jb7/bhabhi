import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, LogOut, RotateCcw, Volume2, VolumeX, MessageCircle, Send, X, Phone, PhoneOff
} from 'lucide-react';
import SimplePeer from 'simple-peer';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_URL = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');

// Enhanced Sound effects using Web Audio API - Realistic card game sounds
const createSoundEffects = () => {
  let audioContext = null;
  
  const getContext = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  };

  // Create noise buffer for realistic sounds
  const createNoiseBuffer = (duration, type = 'white') => {
    const ctx = getContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
      if (type === 'pink') output[i] *= 0.5;
    }
    return buffer;
  };

  // Card sliding/swoosh sound - like pulling a card from deck
  const playCardSlide = () => {
    try {
      const ctx = getContext();
      
      // Noise source for the swoosh
      const noiseBuffer = createNoiseBuffer(0.15);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // Bandpass filter for swoosh character
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.1);
      filter.Q.value = 1;
      
      // Envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(ctx.currentTime);
      noise.stop(ctx.currentTime + 0.15);
      
      // Add a subtle tap sound
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const tapGain = ctx.createGain();
        osc.frequency.value = 150;
        osc.type = 'sine';
        tapGain.gain.setValueAtTime(0.3, ctx.currentTime);
        tapGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.connect(tapGain);
        tapGain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
      }, 80);
    } catch (e) {
      console.log('Card slide sound error:', e);
    }
  };

  // Crowd "Awwww" disappointment sound for tochoo
  const playTochooAww = () => {
    try {
      const ctx = getContext();
      
      // Multiple descending tones to simulate crowd
      const frequencies = [400, 350, 320, 280, 380, 330];
      
      frequencies.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq + Math.random() * 50, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + 0.5);
          
          filter.type = 'lowpass';
          filter.frequency.value = 800;
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
          gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.6);
        }, i * 30);
      });
      
      // Add a dramatic "bonk" hit
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }, 100);
    } catch (e) {
      console.log('Tochoo sound error:', e);
    }
  };

  // Punjabi Dhol beat for escape celebration
  const playDholBeat = () => {
    try {
      const ctx = getContext();
      
      // Dhol has two parts: bass (dhol) and treble (chanti)
      const playDholHit = (time, freq, duration, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + duration);
        
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + duration);
      };
      
      const playTrebleHit = (time, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, time);
        osc.frequency.exponentialRampToValueAtTime(400, time + 0.08);
        
        filter.type = 'highpass';
        filter.frequency.value = 300;
        
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.12);
      };
      
      const now = ctx.currentTime;
      
      // Dhol rhythm pattern: Dha Dhin Dha Dhin (Ta - Ti - Ta - Ti)
      // Bass hits
      playDholHit(now, 80, 0.2, 0.5);
      playDholHit(now + 0.15, 60, 0.15, 0.4);
      playDholHit(now + 0.3, 80, 0.2, 0.5);
      playDholHit(now + 0.45, 60, 0.15, 0.4);
      playDholHit(now + 0.6, 80, 0.25, 0.6);
      
      // Treble hits
      playTrebleHit(now + 0.08, 0.3);
      playTrebleHit(now + 0.23, 0.25);
      playTrebleHit(now + 0.38, 0.3);
      playTrebleHit(now + 0.53, 0.25);
      playTrebleHit(now + 0.68, 0.35);
      
      // Final flourish
      setTimeout(() => {
        const now2 = ctx.currentTime;
        playDholHit(now2, 100, 0.15, 0.5);
        playTrebleHit(now2 + 0.05, 0.35);
        playDholHit(now2 + 0.12, 70, 0.2, 0.6);
        playTrebleHit(now2 + 0.17, 0.4);
      }, 750);
    } catch (e) {
      console.log('Dhol sound error:', e);
    }
  };

  // Simple notification ping
  const playPing = (freq = 880, vol = 0.3) => {
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  // Sad trombone for losing
  const playSadTrombone = () => {
    try {
      const ctx = getContext();
      const notes = [392, 370, 349, 330, 311];
      
      notes.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(freq * 0.95, ctx.currentTime + 0.3);
          
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
          
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 600;
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.35);
        }, i * 250);
      });
    } catch (e) {}
  };

  // Play actual dhol.mp3 file for escapes/wins
  const playDholMP3 = () => {
    try {
      const audio = new Audio('/dhol.mp3');
      audio.volume = 0.7;
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
      console.log('Dhol sound error:', e);
    }
  };

  return {
    playCard: playCardSlide,
    tochoo: playTochooAww,
    escape: playDholMP3,  // Use actual dhol.mp3
    pickup: () => {
      // Card pickup swoosh (reversed slide)
      try {
        const ctx = getContext();
        const noiseBuffer = createNoiseBuffer(0.2);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(500, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.15);
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + 0.2);
      } catch (e) {}
    },
    win: playDholMP3,  // Use actual dhol.mp3
    lose: playSadTrombone,
    yourTurn: () => {
      playPing(880, 0.25);
      setTimeout(() => playPing(1100, 0.3), 120);
    },
    message: () => playPing(600, 0.15)
  };
};

const sounds = createSoundEffects();

// Suit symbols
const SUIT_DISPLAY = {
  hearts: { symbol: '♥', color: 'text-red-500' },
  diamonds: { symbol: '♦', color: 'text-red-500' },
  clubs: { symbol: '♣', color: 'text-gray-900' },
  spades: { symbol: '♠', color: 'text-gray-900' }
};

// Large card component - BIGGER and BRIGHTER
function LargeCard({ card, highlight = false, highlightColor = 'yellow', isLastPlayed = false }) {
  if (!card) return null;
  
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suit = SUIT_DISPLAY[card.suit];
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, y: -50 }}
      animate={{ 
        opacity: 1, 
        scale: isLastPlayed ? 1.1 : 1, 
        y: 0,
        boxShadow: isLastPlayed ? '0 0 30px rgba(255,255,0,0.8)' : 'none'
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex flex-col items-center"
    >
      <div 
        className={`
          relative bg-white rounded-xl shadow-2xl border-3
          ${highlight ? (highlightColor === 'red' ? 'border-red-500 ring-4 ring-red-500/60' : 'border-yellow-400 ring-4 ring-yellow-400/60') : 'border-gray-200'}
          ${isLastPlayed ? 'border-yellow-400 ring-4 ring-yellow-500/80 animate-pulse' : ''}
          flex flex-col justify-between p-2.5
          w-[80px] h-[115px] md:w-[95px] md:h-[135px]
        `}
        style={{ 
          boxShadow: isLastPlayed 
            ? '0 0 35px rgba(250, 204, 21, 0.9), 0 8px 30px rgba(0,0,0,0.4)' 
            : highlight 
              ? `0 0 25px ${highlightColor === 'red' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(250, 204, 21, 0.6)'}` 
              : '0 10px 30px rgba(0,0,0,0.35)'
        }}
      >
        {/* Top Left */}
        <div className={`flex flex-col items-start leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          <span className="font-black text-xl md:text-2xl">{card.rank}</span>
          <span className="text-2xl md:text-3xl -mt-1">{suit.symbol}</span>
        </div>

        {/* Center Symbol */}
        <div className={`absolute inset-0 flex items-center justify-center ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          <span className="text-4xl md:text-5xl opacity-25">{suit.symbol}</span>
        </div>

        {/* Bottom Right */}
        <div className={`flex flex-col items-end leading-none rotate-180 self-end ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          <span className="font-black text-xl md:text-2xl">{card.rank}</span>
          <span className="text-2xl md:text-3xl -mt-1">{suit.symbol}</span>
        </div>
        
        {/* LAST PLAYED indicator */}
        {isLastPlayed && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
            LAST
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Player slot with card and reactions
function PlayerSlot({ 
  player, 
  cardCount, 
  playedCard, 
  isCurrentPlayer, 
  isFinished,
  isTochoo,
  hasPower,
  position,
  isLastCardPlayed,
  isMe = false,
  escapePosition = null
}) {
  const isBot = player?.is_bot || player?.id?.startsWith('bot_');
  
  // Spread out positions more
  const positionStyles = {
    'top': 'top-20 left-1/2 -translate-x-1/2',
    'top-left': 'top-20 left-[10%]',
    'top-right': 'top-20 right-[10%]',
    'left': 'left-2 top-[40%] -translate-y-1/2',
    'right': 'right-2 top-[40%] -translate-y-1/2',
  };
  
  const getPositionBadge = (pos) => {
    if (!pos) return null;
    const badges = {1: '🥇', 2: '🥈', 3: '🥉'};
    return badges[pos] || `#${pos}`;
  };

  return (
    <div className={`absolute ${positionStyles[position]} z-10`}>
      {/* Show EITHER the played card OR the avatar - card replaces avatar */}
      <AnimatePresence mode="wait">
        {playedCard ? (
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.5, rotateY: 180 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="flex flex-col items-center"
          >
            <LargeCard 
              card={playedCard}
              highlight={isTochoo || hasPower}
              highlightColor={isTochoo ? 'red' : 'yellow'}
              isLastPlayed={isLastCardPlayed}
            />
            {/* Player name below card - smaller */}
            <div className={`mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${
              isCurrentPlayer ? 'bg-yellow-500 text-black' : 'bg-black/70 text-white'
            }`}>
              {player.username?.slice(0, 6)}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="avatar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`
              flex flex-col items-center p-2 rounded-xl transition-all backdrop-blur-sm
              ${isCurrentPlayer ? 'bg-yellow-500/40 ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/30' : 'bg-black/50'}
              ${isFinished ? 'bg-emerald-900/50 ring-2 ring-emerald-500' : ''}
            `}
          >
            <div className={`
              w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 relative
              ${isBot ? 'bg-gradient-to-br from-cyan-400 to-blue-600 border-cyan-300' : 'bg-gradient-to-br from-violet-500 to-pink-500 border-white/40'}
              ${isCurrentPlayer ? 'ring-2 ring-yellow-400 animate-pulse' : ''}
              ${isFinished ? 'bg-emerald-600 border-emerald-400' : ''}
            `}>
              {isFinished ? '✓' : isBot ? '🤖' : player.username?.[0]?.toUpperCase()}
              {/* Position badge */}
              {escapePosition && (
                <span className="absolute -top-1 -right-1 text-sm">{getPositionBadge(escapePosition)}</span>
              )}
            </div>
            
            <div className="text-center mt-1">
              <p className={`text-xs font-bold ${isMe ? 'text-primary' : 'text-white'}`}>
                {isMe ? 'You' : player.username?.slice(0, 6)}
              </p>
              <p className={`text-[10px] font-medium ${isFinished ? 'text-emerald-400' : 'text-gray-300'}`}>
                {isFinished ? `${escapePosition ? getPositionBadge(escapePosition) : '✓'}` : `${cardCount}c`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Text Chat Component
function TextChat({ messages, onSendMessage, players, isOpen, onToggle, wsConnected }) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (message.trim() && wsConnected) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const getPlayerName = (playerId) => {
    const player = players.find(p => p.id === playerId);
    return player?.username || 'Unknown';
  };

  if (!isOpen) {
    return (
      <Button
        onClick={onToggle}
        className="fixed bottom-24 right-4 z-40 rounded-full w-14 h-14 bg-primary/90 hover:bg-primary shadow-lg"
      >
        <MessageCircle className="w-6 h-6" />
        {!wsConnected && (
          <span className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
        )}
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            {messages.length > 9 ? '9+' : messages.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-80 h-96 bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-zinc-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-700">
        <h3 className="font-bold text-white flex items-center gap-2">
          <MessageCircle className="w-5 h-5" /> Chat
          {wsConnected ? (
            <span className="w-2 h-2 bg-emerald-500 rounded-full" title="Connected"></span>
          ) : (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Connecting..."></span>
          )}
        </h3>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-center text-sm">No messages yet</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="bg-zinc-800 rounded-lg p-2">
              <p className="text-xs text-primary font-bold">{getPlayerName(msg.user_id)}</p>
              <p className="text-sm text-white">{msg.message}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="p-3 border-t border-zinc-700 flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={wsConnected ? "Type a message..." : "Connecting..."}
          className="flex-1 bg-zinc-800 border-zinc-600 text-sm"
          disabled={!wsConnected}
        />
        <Button onClick={handleSend} size="icon" className="shrink-0" disabled={!wsConnected}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function GamePage() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [gameState, setGameState] = useState(null);
  const [room, setRoom] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [displayTrick, setDisplayTrick] = useState([]);
  const [trickResult, setTrickResult] = useState(null);
  const [showTochooAlert, setShowTochooAlert] = useState(false);
  const [lastPlayedCardId, setLastPlayedCardId] = useState(null);
  
  // Keep track of ALL cards played in the trick (don't clear them)
  const [allPlayedCards, setAllPlayedCards] = useState([]);
  
  // Card request dialog (when someone requests YOUR cards - you have ≤3)
  const [cardRequestDialog, setCardRequestDialog] = useState({ open: false, requesterId: null, requesterName: '' });
  
  // Spectator mode - can only watch ONE player (cannot switch!)
  const [allHands, setAllHands] = useState(null);
  const [spectatorChoiceDialog, setSpectatorChoiceDialog] = useState(false);
  const [watchingPlayerId, setWatchingPlayerId] = useState(null);
  const [spectatorLocked, setSpectatorLocked] = useState(false); // Once chosen, cannot change
  const [escapePositions, setEscapePositions] = useState({}); // Track escape order: {playerId: position}
  
  // Emoji reactions - display under player name
  const [playerReactions, setPlayerReactions] = useState({}); // {playerId: {emoji, text, timestamp}}
  
  // Text chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  
  // WebSocket connection state
  const [wsConnected, setWsConnected] = useState(false);
  
  // Turn timer - 12 seconds
  const [turnTimer, setTurnTimer] = useState(12);
  const turnTimerRef = useRef(null);
  
  // Voice chat
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [connectedPeers, setConnectedPeers] = useState({});
  const [voiceUsers, setVoiceUsers] = useState([]); // Users in voice chat
  const [speakingUsers, setSpeakingUsers] = useState({}); // Track who is speaking
  
  const wsRef = useRef(null);
  const prevCurrentPlayer = useRef(null);
  const prevTrickLength = useRef(0);
  const prevFinishedPlayers = useRef([]);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const audioElementsRef = useRef({});
  const audioAnalyserRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  
  // Quick emojis and phrases for reactions
  const QUICK_EMOJIS = ['🤣', '🥳', '🤬', '👍', '😭', '❤️', '💩'];
  const QUICK_PHRASES = ['Hahahaha', 'Aa chak fer', 'Leh swaad', 'Ku***', 'BC', 'Damn It', 'Marr ja'];

  const fetchGameState = useCallback(async () => {
    try {
      const [gameRes, roomRes] = await Promise.all([
        axios.get(`${API}/game/${roomCode}`),
        axios.get(`${API}/rooms/${roomCode}`)
      ]);
      setGameState(gameRes.data);
      setRoom(roomRes.data.room);
      
      // Update allHands for spectators
      if (gameRes.data.all_hands) {
        setAllHands(gameRes.data.all_hands);
      }
      
      // Track escape positions
      const finishedPlayers = gameRes.data.finished_players || [];
      if (finishedPlayers.length > 0) {
        setEscapePositions(prev => {
          const newPositions = { ...prev };
          finishedPlayers.forEach((pid, index) => {
            if (!newPositions[pid]) {
              newPositions[pid] = Object.keys(newPositions).length + 1;
            }
          });
          return newPositions;
        });
      }
    } catch (error) {
      if (error.response?.status === 404) {
        navigate(`/room/${roomCode}`);
      }
    }
  }, [roomCode, navigate]);

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (gameState?.status === 'playing') {
        fetchGameState();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [gameState?.status, fetchGameState]);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    if (!user || !roomCode) return;
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout;

    const connectWebSocket = () => {
      const ws = new WebSocket(`${WS_URL}/ws/${roomCode}/${user.id}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        reconnectAttempts = 0;
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        
        // Auto-reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * reconnectAttempts, 5000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          reconnectTimeout = setTimeout(connectWebSocket, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'game_started':
          setGameState({
            your_hand: data.your_hand,
            current_player: data.current_player,
            current_trick: [],
            completed_trick: [],
            lead_suit: null,
            player_order: data.player_order,
            player_card_counts: {},
            finished_players: [],
            loser: null,
            status: 'playing',
            players: data.players
          });
          setDisplayTrick([]);
          setTrickResult(null);
          setLastPlayedCardId(null);
          setTurnTimer(12); // Start timer
          break;
          
        case 'game_update':
        case 'cards_taken':
        case 'cards_offered':
          const completedTrick = data.completed_trick || [];
          const currentTrick = data.current_trick || [];
          
          // Track last played card
          if (currentTrick.length > prevTrickLength.current) {
            const lastCard = currentTrick[currentTrick.length - 1];
            setLastPlayedCardId(lastCard?.player_id);
            setTimeout(() => setLastPlayedCardId(null), 3000);
          }
          prevTrickLength.current = currentTrick.length;
          
          // Update all_hands if we're a spectator
          if (data.all_hands) {
            setAllHands(data.all_hands);
          }
          
          // Reset timer when turn changes
          if (data.current_player === user?.id) {
            setTurnTimer(12);
          }
          
          // Sounds
          if (soundEnabled) {
            if (data.last_trick_result?.type === 'pickup' && data.last_trick_result !== trickResult) {
              sounds.tochoo();
              setShowTochooAlert(true);
              setTimeout(() => setShowTochooAlert(false), 4000);
            }
            if (currentTrick.length > (displayTrick.length || 0) && !completedTrick.length) {
              sounds.playCard();
            }
            if (data.current_player === user?.id && prevCurrentPlayer.current !== user?.id) {
              sounds.yourTurn();
            }
            // Game finished - play dhol for winners
            if (data.status === 'finished' && data.loser && gameState?.status !== 'finished') {
              setTimeout(() => {
                if (data.loser === user?.id) {
                  sounds.lose();
                } else {
                  // Winner - play dhol!
                  sounds.escape();
                }
              }, 500);
            }
          }
          prevCurrentPlayer.current = data.current_player;
          
          // Update display
          if (completedTrick.length > 0) {
            setDisplayTrick(completedTrick);
            setTrickResult(data.last_trick_result);
          } else if (currentTrick.length > 0) {
            setDisplayTrick(currentTrick);
            setTrickResult(null);
          } else {
            setDisplayTrick([]);
            setTrickResult(data.last_trick_result);
          }
          
          setGameState(prev => ({
            ...prev,
            your_hand: data.your_hand,
            current_player: data.current_player,
            current_trick: data.current_trick,
            completed_trick: data.completed_trick,
            lead_suit: data.lead_suit,
            player_card_counts: data.player_card_counts,
            finished_players: data.finished_players,
            loser: data.loser,
            status: data.status,
            players: data.players,
            last_trick_result: data.last_trick_result
          }));
          
          // Track escape positions
          const newFinishedPlayers = data.finished_players || [];
          if (newFinishedPlayers.length > 0) {
            setEscapePositions(prev => {
              const newPositions = { ...prev };
              newFinishedPlayers.forEach(pid => {
                if (!newPositions[pid]) {
                  newPositions[pid] = Object.keys(newPositions).length + 1;
                }
              });
              return newPositions;
            });
          }
          
          // Check if the player we're watching has escaped - lock spectator view
          if (spectatorLocked && watchingPlayerId && newFinishedPlayers.includes(watchingPlayerId)) {
            toast.info(`${(data.players || []).find(p => p.id === watchingPlayerId)?.username} has escaped! You can no longer see anyone's cards.`);
            setWatchingPlayerId(null);
          }
          
          // Check if WE just escaped - show spectator choice dialog (only if not already locked)
          const justEscaped = newFinishedPlayers.includes(user?.id) && !prevFinishedPlayers.current.includes(user?.id);
          if (justEscaped && !spectatorLocked) {
            setSpectatorChoiceDialog(true);
            // Play dhol for escape!
            if (soundEnabled) {
              sounds.escape();
            }
            const myPosition = newFinishedPlayers.indexOf(user?.id) + 1;
            toast.success(`🎉 You escaped! Position: ${myPosition}${myPosition === 1 ? 'st' : myPosition === 2 ? 'nd' : myPosition === 3 ? 'rd' : 'th'}!`, { duration: 5000 });
          }
          
          // Check if ANYONE else just escaped (by playing last card)
          const newlyEscaped = newFinishedPlayers.filter(p => !prevFinishedPlayers.current.includes(p) && p !== user?.id);
          if (newlyEscaped.length > 0) {
            if (soundEnabled) sounds.escape(); // Play dhol for other player's escape
            const escapedPlayer = data.players?.find(p => newlyEscaped.includes(p.id));
            const position = newFinishedPlayers.indexOf(newlyEscaped[0]) + 1;
            if (escapedPlayer) {
              toast.info(`${escapedPlayer.username} escaped! Position: ${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}`, { duration: 3000 });
            }
          }
          prevFinishedPlayers.current = newFinishedPlayers;
          
          if (data.type === 'cards_taken') {
            const taker = data.players?.find(p => p.id === data.taker_id);
            const target = data.players?.find(p => p.id === data.target_id);
            toast.info(`${taker?.username} took cards from ${target?.username}!`);
            if (soundEnabled) sounds.pickup();
          }
          if (data.type === 'cards_given') {
            const giver = data.players?.find(p => p.id === data.giver_id);
            const receiver = data.players?.find(p => p.id === data.receiver_id);
            toast.success(`${giver?.username} escaped by giving ${data.cards_count} cards to ${receiver?.username}!`);
            // Play dhol beat TWICE for card giving escape!
            if (soundEnabled) {
              sounds.escape();
              setTimeout(() => sounds.escape(), 900);
            }
            if (data.all_hands) setAllHands(data.all_hands);
            
            // If WE just escaped, show choice dialog
            if (data.giver_id === user?.id && !watchingPlayerId) {
              setSpectatorChoiceDialog(true);
            }
          }
          break;
          
        case 'card_request':
          // Someone is requesting YOUR cards (you have ≤3)
          if (!data.target_id || data.target_id === user?.id) {
            setCardRequestDialog({
              open: true,
              requesterId: data.requester_id,
              requesterName: data.requester_name
            });
            if (soundEnabled) sounds.yourTurn();
            toast.info(`🃏 ${data.requester_name} wants your cards! Accept to ESCAPE!`, { duration: 10000 });
          }
          break;
        
        case 'card_request_broadcast':
          // Backup broadcast - only show to target player
          if (data.target_id === user?.id && !cardRequestDialog.open) {
            setCardRequestDialog({
              open: true,
              requesterId: data.requester_id,
              requesterName: data.requester_name
            });
            if (soundEnabled) sounds.yourTurn();
            toast.info(`🃏 ${data.requester_name} wants your cards! Accept to ESCAPE!`, { duration: 10000 });
          }
          break;
          
        case 'card_request_declined':
          toast.error(`${data.decliner_name} declined to give you their cards`);
          break;
          
        case 'chat_message':
          setChatMessages(prev => [...prev.slice(-50), { 
            user_id: data.user_id, 
            message: data.message,
            timestamp: data.timestamp
          }]);
          if (soundEnabled && data.user_id !== user?.id) sounds.message();
          break;
          
        case 'voice_signal':
          // Handle incoming WebRTC signal
          handleVoiceSignal(data);
          break;
          
        case 'voice_user_joined':
          // Someone joined voice chat - create peer connection
          if (data.user_id !== user?.id && voiceEnabled && localStreamRef.current) {
            createPeer(data.user_id, true);
          }
          setVoiceUsers(prev => [...new Set([...prev, data.user_id])]);
          toast.info(`🎤 ${data.username} joined voice chat`);
          break;
          
        case 'voice_user_left':
          // Someone left voice chat
          destroyPeer(data.user_id);
          setVoiceUsers(prev => prev.filter(id => id !== data.user_id));
          setSpeakingUsers(prev => {
            const newState = { ...prev };
            delete newState[data.user_id];
            return newState;
          });
          break;
        
        case 'voice_status':
          // Someone's speaking status changed
          if (data.user_id !== user?.id) {
            setSpeakingUsers(prev => ({
              ...prev,
              [data.user_id]: data.is_speaking
            }));
          }
          break;
        
        case 'reaction':
          // Someone sent an emoji/phrase reaction - show under their name
          if (data.user_id !== user?.id) {
            setPlayerReactions(prev => ({
              ...prev,
              [data.user_id]: { text: data.reaction, timestamp: Date.now() }
            }));
            // Clear after 3 seconds
            setTimeout(() => {
              setPlayerReactions(prev => {
                const newReactions = { ...prev };
                if (newReactions[data.user_id]?.timestamp <= Date.now() - 2900) {
                  delete newReactions[data.user_id];
                }
                return newReactions;
              });
            }, 3000);
          }
          break;
          
        case 'game_restarted':
          navigate(`/room/${roomCode}`);
          setWatchingPlayerId(null);
          setSpectatorLocked(false);
          setSpectatorChoiceDialog(false);
          setAllPlayedCards([]);
          cleanupVoice();
          break;
          
        default:
          break;
      }
      };
    };
    
    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on unmount
        wsRef.current.close();
      }
      cleanupVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomCode, navigate, soundEnabled, trickResult, voiceEnabled, cardRequestDialog.open, spectatorLocked, watchingPlayerId]);

  // Turn timer effect - auto play highest card after 12 seconds
  useEffect(() => {
    // Clear any existing timer
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
    
    // Only start timer if it's my turn and game is playing
    const isMyTurnNow = gameState?.current_player === user?.id && gameState?.status === 'playing';
    
    if (isMyTurnNow) {
      // Reset timer to 12 when it becomes my turn
      setTurnTimer(12);
      
      turnTimerRef.current = setInterval(() => {
        setTurnTimer(prev => {
          if (prev <= 1) {
            // Time's up - auto-play
            clearInterval(turnTimerRef.current);
            turnTimerRef.current = null;
            autoPlayCard();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTurnTimer(0);
    }
    
    return () => {
      if (turnTimerRef.current) {
        clearInterval(turnTimerRef.current);
        turnTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.current_player, gameState?.status, user?.id]);

  // Auto-play highest valid card
  const autoPlayCard = async () => {
    if (!gameState?.your_hand || gameState.your_hand.length === 0) return;
    
    const hand = gameState.your_hand;
    const leadSuit = gameState.lead_suit;
    let cardToPlay;
    
    if (leadSuit) {
      // Must follow suit if possible
      const suitCards = hand.filter(c => c.suit === leadSuit);
      if (suitCards.length > 0) {
        // Play highest of the suit
        cardToPlay = suitCards.reduce((a, b) => a.value > b.value ? a : b);
      } else {
        // No suit cards - play highest card
        cardToPlay = hand.reduce((a, b) => a.value > b.value ? a : b);
      }
    } else {
      // Leading - play highest card
      cardToPlay = hand.reduce((a, b) => a.value > b.value ? a : b);
    }
    
    if (cardToPlay) {
      try {
        await axios.post(`${API}/game/${roomCode}/play`, { card: cardToPlay });
        toast.info('⏱️ Time up! Auto-played card.');
      } catch (error) {
        console.error('Auto-play error:', error);
      }
    }
  };

  // Voice chat functions
  const handleVoiceSignal = (data) => {
    const { from_user, signal } = data;
    
    if (peersRef.current[from_user]) {
      try {
        peersRef.current[from_user].signal(signal);
      } catch (e) {
        console.error('Error signaling peer:', e);
      }
    } else if (localStreamRef.current) {
      // Create peer for incoming signal
      createPeer(from_user, false, signal);
    }
  };

  const createPeer = (peerId, initiator, incomingSignal = null) => {
    if (peersRef.current[peerId]) {
      console.log('Peer already exists for:', peerId);
      return;
    }

    console.log('Creating peer for:', peerId, 'initiator:', initiator);

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStreamRef.current,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    });

    peer.on('signal', (signal) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'voice_signal',
          target_user: peerId,
          signal
        }));
      }
    });

    peer.on('stream', (stream) => {
      console.log('Received stream from:', peerId);
      // Create audio element for this peer
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.playsInline = true;
      audioElementsRef.current[peerId] = audio;
      
      // Try to play (may need user interaction)
      audio.play().catch(e => console.log('Audio autoplay blocked:', e));
      
      setConnectedPeers(prev => ({ ...prev, [peerId]: true }));
    });

    peer.on('connect', () => {
      console.log('Peer connected:', peerId);
      setConnectedPeers(prev => ({ ...prev, [peerId]: true }));
    });

    peer.on('close', () => {
      console.log('Peer closed:', peerId);
      destroyPeer(peerId);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', peerId, err);
      destroyPeer(peerId);
    });

    peersRef.current[peerId] = peer;

    // If we received an incoming signal, process it
    if (incomingSignal) {
      peer.signal(incomingSignal);
    }
  };

  const destroyPeer = (peerId) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].destroy();
      delete peersRef.current[peerId];
    }
    if (audioElementsRef.current[peerId]) {
      audioElementsRef.current[peerId].srcObject = null;
      delete audioElementsRef.current[peerId];
    }
    setConnectedPeers(prev => {
      const newPeers = { ...prev };
      delete newPeers[peerId];
      return newPeers;
    });
  };

  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      localStreamRef.current = stream;
      setVoiceEnabled(true);
      setIsMuted(false);
      
      // Setup audio analyser to detect when user is speaking
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioAnalyserRef.current = { analyser, dataArray };
      
      // Check speaking status periodically
      speakingIntervalRef.current = setInterval(() => {
        if (audioAnalyserRef.current && !isMuted) {
          const { analyser, dataArray } = audioAnalyserRef.current;
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
          const isSpeaking = average > 30; // Threshold for speech detection
          
          // Broadcast speaking status
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ 
              type: 'voice_status',
              is_speaking: isSpeaking,
              is_muted: isMuted
            }));
          }
        }
      }, 100);
      
      // Notify server we joined voice
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'voice_join',
          username: user?.username 
        }));
      }
      
      toast.success('🎤 Voice chat ON! Others can hear you now.');
    } catch (error) {
      console.error('Microphone error:', error);
      toast.error('Could not access microphone. Check permissions.');
    }
  };

  const stopVoiceChat = () => {
    // Notify server we left voice
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'voice_leave' }));
    }
    cleanupVoice();
    toast.info('Voice chat disabled');
  };

  const cleanupVoice = () => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    Object.keys(peersRef.current).forEach(peerId => {
      destroyPeer(peerId);
    });
    audioAnalyserRef.current = null;
    setVoiceEnabled(false);
    setIsMuted(true);
    setConnectedPeers({});
    setVoiceUsers([]);
    setSpeakingUsers({});
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
        
        // Notify others of mute status
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            type: 'voice_status',
            is_speaking: false,
            is_muted: !isMuted
          }));
        }
      }
    }
  };

  const sendChatMessage = (message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat_message', message }));
    } else {
      toast.error('Chat disconnected. Reconnecting...');
    }
  };
  
  // Send emoji/phrase reaction - shows under player name
  const sendReaction = (reaction, isEmoji = true) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'reaction',
        reaction,
        is_emoji: isEmoji
      }));
      // Show locally immediately
      setPlayerReactions(prev => ({
        ...prev,
        [user.id]: { text: reaction, timestamp: Date.now() }
      }));
      // Clear after 3 seconds
      setTimeout(() => {
        setPlayerReactions(prev => {
          const newReactions = { ...prev };
          if (newReactions[user.id]?.timestamp <= Date.now() - 2900) {
            delete newReactions[user.id];
          }
          return newReactions;
        });
      }, 3000);
    }
  };

  const playCard = async () => {
    if (!selectedCard) {
      toast.error('Select a card to play');
      return;
    }
    if (gameState?.current_player !== user?.id) {
      toast.error('Not your turn!');
      return;
    }
    
    // Clear timer
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
    setTurnTimer(0);

    setIsPlaying(true);
    try {
      await axios.post(`${API}/game/${roomCode}/play`, { card: selectedCard });
      setSelectedCard(null);
      if (soundEnabled) sounds.playCard();
      fetchGameState();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Cannot play this card');
      fetchGameState();
    } finally {
      setIsPlaying(false);
    }
  };

  // Request cards FROM someone who has ≤3 cards
  const handleRequestCards = async (targetId) => {
    try {
      const response = await axios.post(`${API}/game/${roomCode}/request-cards`, { target_player_id: targetId });
      toast.info(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Cannot request cards');
    }
  };

  // Respond to card request (when someone requests YOUR cards)
  const respondToCardRequest = async (accept) => {
    try {
      await axios.post(`${API}/game/${roomCode}/respond-card-request`, {
        accept,
        requester_id: cardRequestDialog.requesterId
      });
      if (accept) {
        toast.success('You escaped! 🎉');
        if (soundEnabled) sounds.win();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error responding');
    }
    setCardRequestDialog({ open: false, requesterId: null, requesterName: '' });
  };

  const restartGame = async () => {
    try {
      await axios.post(`${API}/game/${roomCode}/restart`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Cannot restart game');
    }
  };

  const leaveGame = async () => {
    try {
      await axios.post(`${API}/rooms/leave/${roomCode}`);
    } catch (error) {}
    navigate('/');
  };

  if (!gameState || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-2xl text-primary animate-pulse">Loading game...</div>
      </div>
    );
  }

  const isMyTurn = gameState.current_player === user?.id;
  const isHost = room.host_id === user?.id;
  const isGameOver = gameState.status === 'finished';
  const hasEscaped = gameState.finished_players?.includes(user?.id);
  
  // Sort hand
  const SUIT_ORDER = { 'spades': 0, 'hearts': 1, 'clubs': 2, 'diamonds': 3 };
  const myHand = [...(gameState.your_hand || [])].sort((a, b) => {
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return b.value - a.value;
  });
  
  const myCardCount = myHand.length;
  const otherPlayers = (gameState.players || room.players || []).filter(p => p.id !== user?.id);
  
  // Find players with ≤3 cards that I can request from
  const playersWithFewCards = otherPlayers.filter(p => {
    const cardCount = gameState.player_card_counts?.[p.id] || 0;
    return cardCount > 0 && cardCount <= 3 && !gameState.finished_players?.includes(p.id);
  });
  
  // Active players (not escaped) for spectator choice
  const activePlayers = otherPlayers.filter(p => !gameState.finished_players?.includes(p.id));
  
  // Get the player we're watching (for spectator mode)
  const watchingPlayer = watchingPlayerId 
    ? otherPlayers.find(p => p.id === watchingPlayerId)
    : null;
  
  const getPlayedCard = (playerId) => {
    const trick = displayTrick.length > 0 ? displayTrick : (gameState.current_trick || []);
    return trick.find(c => c.player_id === playerId);
  };

  // Get player's hand (only for the ONE player we're watching)
  const getWatchingPlayerHand = () => {
    if (!allHands || !watchingPlayerId) return null;
    const hand = allHands[watchingPlayerId] || [];
    return [...hand].sort((a, b) => {
      if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return b.value - a.value;
    });
  };

  const getPlayerPosition = (index, total) => {
    const positions = {
      1: ['top'],
      2: ['left', 'right'],
      3: ['left', 'top', 'right'],
      4: ['left', 'top-left', 'top-right', 'right'],
      5: ['left', 'top-left', 'top', 'top-right', 'right']
    };
    return positions[total]?.[index] || 'top';
  };

  const loserPlayer = gameState.loser 
    ? (gameState.players || room.players || []).find(p => p.id === gameState.loser)
    : null;

  const myPlayedCard = getPlayedCard(user?.id);
  
  // Find last card in current trick
  const currentTrick = displayTrick.length > 0 ? displayTrick : (gameState.current_trick || []);
  const lastCardInTrick = currentTrick.length > 0 ? currentTrick[currentTrick.length - 1] : null;
  
  // My reaction
  const myReaction = playerReactions[user?.id]?.text;

  return (
    <div className="game-page h-screen w-screen overflow-hidden relative bg-zinc-950" data-testid="game-page">
      {/* Spectator Banner - LEFT side, compact */}
      {hasEscaped && !isGameOver && (
        <div className="absolute top-2 left-2 z-40 bg-emerald-600/90 text-white px-3 py-2 rounded-lg font-bold text-sm max-w-[200px]">
          <div className="flex items-center gap-2">
            <span>🎉 Escaped!</span>
          </div>
          {watchingPlayerId && watchingPlayer ? (
            <div className="text-xs mt-1">👁️ {watchingPlayer.username}</div>
          ) : spectatorLocked ? (
            <div className="text-xs mt-1 text-yellow-200">No cards to see</div>
          ) : (
            <Button 
              size="sm" 
              onClick={() => setSpectatorChoiceDialog(true)}
              className="bg-white text-emerald-700 hover:bg-emerald-100 font-bold text-xs h-6 mt-1"
            >
              Choose Player
            </Button>
          )}
        </div>
      )}

      {/* TOCHOO Alert */}
      <AnimatePresence>
        {showTochooAlert && trickResult?.type === 'pickup' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-gradient-to-br from-red-600 to-red-800 text-white px-16 py-10 rounded-3xl shadow-2xl border-4 border-red-400">
              <div className="text-6xl font-black text-center mb-3 animate-pulse">🔥 TOCHOO! 🔥</div>
              <div className="text-2xl text-center text-yellow-200 font-bold">
                {(gameState.players || room.players)?.find(p => p.id === trickResult.tochoo_by)?.username} gave tochoo!
              </div>
              <div className="text-xl text-center mt-3 text-white/90">
                {(gameState.players || room.players)?.find(p => p.id === trickResult.picker)?.username} picks up {trickResult.cards} cards!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Table */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div 
          className="relative rounded-[80px] md:rounded-[120px] border-[10px] border-zinc-800 shadow-2xl overflow-hidden"
          style={{ 
            width: '95vw', 
            height: '72vh', 
            maxWidth: '1400px', 
            maxHeight: '750px',
            background: 'linear-gradient(145deg, #1a5c30 0%, #2d7a47 50%, #1a5c30 100%)'
          }}
        >
          {/* Table texture */}
          <div className="absolute inset-0 opacity-15" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }} />

          {/* Center - Show reactions and emojis */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <AnimatePresence>
              {Object.entries(playerReactions).map(([playerId, data]) => {
                const player = (gameState.players || room.players)?.find(p => p.id === playerId);
                if (!data || !player) return null;
                return (
                  <motion.div
                    key={playerId}
                    initial={{ opacity: 0, scale: 0.5, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: -50 }}
                    className="absolute bg-white/95 text-black px-4 py-2 rounded-2xl shadow-xl text-center"
                    style={{
                      // Spread reactions around center
                      transform: `translate(${Math.random() * 100 - 50}px, ${Math.random() * 60 - 30}px)`
                    }}
                  >
                    <div className="text-2xl">{data.text}</div>
                    <div className="text-xs text-gray-600 font-bold">{player.username}</div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Other Players */}
          {otherPlayers.map((player, index) => {
            const position = getPlayerPosition(index, otherPlayers.length);
            const cardCount = gameState.player_card_counts?.[player.id] || 0;
            const isFinished = gameState.finished_players?.includes(player.id);
            const isCurrentPlayer = gameState.current_player === player.id;
            const playedCard = getPlayedCard(player.id);
            const isTochoo = trickResult?.tochoo_by === player.id;
            const hasPower = trickResult?.picker === player.id || trickResult?.power_player === player.id;
            const isLastCard = lastCardInTrick?.player_id === player.id;
            const escapePos = escapePositions[player.id] || (isFinished ? gameState.finished_players.indexOf(player.id) + 1 : null);

            return (
              <PlayerSlot
                key={player.id}
                player={player}
                cardCount={cardCount}
                playedCard={playedCard}
                isCurrentPlayer={isCurrentPlayer}
                isFinished={isFinished}
                isTochoo={isTochoo}
                hasPower={hasPower}
                position={position}
                isLastCardPlayed={isLastCard && lastPlayedCardId === player.id}
                escapePosition={escapePos}
                reaction={reaction}
              />
            );
          })}

          {/* My played card */}
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20">
            <AnimatePresence>
              {myPlayedCard && (
                <LargeCard 
                  card={myPlayedCard}
                  highlight={trickResult?.tochoo_by === user?.id || trickResult?.picker === user?.id}
                  highlightColor={trickResult?.tochoo_by === user?.id ? 'red' : 'yellow'}
                  isLastPlayed={lastPlayedCardId === user?.id}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* My Hand */}
      <div className="absolute bottom-0 left-0 right-0 p-2 z-30">
        <div className="flex flex-col items-center gap-2">
          {/* Info bar */}
          <div className="flex items-center gap-4 bg-black/70 px-5 py-2.5 rounded-full backdrop-blur-sm flex-wrap justify-center">
            <div className={`
              w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold
              ${isMyTurn ? 'bg-yellow-500 ring-2 ring-yellow-300 animate-pulse' : hasEscaped ? 'bg-emerald-500' : 'bg-violet-600'}
            `}>
              {hasEscaped ? '✓' : user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="text-white">
              <p className="text-sm font-bold text-primary">
                {hasEscaped ? 'Spectating' : `You (${myCardCount} cards)`}
              </p>
            </div>
            
            {/* Take cards buttons - show when others have ≤3 cards */}
            {!hasEscaped && !isGameOver && playersWithFewCards.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <span className="text-xs text-yellow-400 mr-1">Take from:</span>
                {playersWithFewCards.map(player => (
                  <Button
                    key={player.id}
                    size="sm"
                    onClick={() => handleRequestCards(player.id)}
                    className="h-7 px-2 text-xs bg-rose-600 hover:bg-rose-500"
                  >
                    {player.username?.slice(0, 6)} ({gameState.player_card_counts?.[player.id]})
                  </Button>
                ))}
              </div>
            )}
            
            {isMyTurn && !isGameOver && !hasEscaped && (
              <Button
                onClick={playCard}
                disabled={!selectedCard || isPlaying}
                className="h-10 px-8 rounded-full font-bold bg-primary hover:bg-primary/80"
              >
                {isPlaying ? '...' : 'Play Card'}
              </Button>
            )}
          </div>
          
          {/* Quick Emoji/Phrase Reactions */}
          <div className="flex flex-wrap justify-center gap-1 mb-2">
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji, true)}
                className="text-xl hover:scale-125 transition-transform bg-black/30 rounded-full w-8 h-8 flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
            {QUICK_PHRASES.map(phrase => (
              <button
                key={phrase}
                onClick={() => sendReaction(phrase, false)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-full text-white"
              >
                {phrase}
              </button>
            ))}
            {/* My reaction display */}
            {myReaction && (
              <span className="bg-yellow-500 text-black px-2 py-1 rounded-full text-sm font-bold animate-bounce">
                {myReaction}
              </span>
            )}
          </div>
          
          {/* Cards - Scrollable for many cards */}
          <div className="flex justify-center items-end max-w-full overflow-x-auto pb-3 px-2 scrollbar-hide">
            <div className="flex" style={{ minWidth: myHand.length > 15 ? `${myHand.length * 25}px` : 'auto' }}>
              {myHand.map((card, index) => {
                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                const isSelected = selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
                
                // Tighter overlap for many cards - scales down more aggressively
                const overlap = myHand.length > 25 ? -52 : myHand.length > 20 ? -48 : myHand.length > 15 ? -44 : myHand.length > 10 ? -38 : myHand.length > 6 ? -30 : -20;
                
                // Scale down cards when there are many
                const cardScale = myHand.length > 20 ? 0.7 : myHand.length > 15 ? 0.8 : myHand.length > 10 ? 0.9 : 1;
                
                return (
                  <motion.div
                    key={`${card.suit}-${card.rank}`}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: isSelected ? -25 : 0, scale: cardScale }}
                    transition={{ delay: index * 0.01 }}
                    style={{ 
                      marginLeft: index === 0 ? 0 : overlap,
                      zIndex: isSelected ? 100 : index 
                    }}
                    className="relative cursor-pointer"
                    onClick={() => isMyTurn && !isGameOver && setSelectedCard(isSelected ? null : card)}
                  >
                    <div 
                      className={`
                        bg-white rounded-lg shadow-xl border-2 p-1.5
                        w-[50px] h-[75px] md:w-[58px] md:h-[85px]
                        flex flex-col justify-between
                        transition-all duration-200
                        ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400/70 shadow-yellow-400/50' : 'border-gray-200'}
                        ${!isMyTurn || isGameOver ? 'opacity-60' : 'hover:border-primary hover:-translate-y-3 hover:shadow-2xl hover:z-50'}
                      `}
                    >
                      <div className={`flex flex-col items-start leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                        <span className="font-bold text-sm md:text-base">{card.rank}</span>
                        <span className="text-lg md:text-xl -mt-0.5">{SUIT_DISPLAY[card.suit].symbol}</span>
                      </div>
                      <div className={`flex flex-col items-end leading-none rotate-180 self-end ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                        <span className="font-bold text-sm md:text-base">{card.rank}</span>
                        <span className="text-lg md:text-xl -mt-0.5">{SUIT_DISPLAY[card.suit].symbol}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-40">
        {/* Voice Chat Controls */}
        {!voiceEnabled ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={startVoiceChat}
            className="rounded-full text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-gray-600"
            title="Start Voice Chat"
          >
            <Phone className="w-5 h-5" />
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-1 bg-emerald-600/30 rounded-full px-2 py-1 border border-emerald-500">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-emerald-400">LIVE</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={`rounded-full ${isMuted ? 'text-red-400 bg-red-500/30 border border-red-500' : 'text-emerald-400 bg-emerald-500/30 border border-emerald-500'}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={stopVoiceChat}
              className="rounded-full text-red-400 bg-red-500/20 border border-red-500 hover:bg-red-500/30"
              title="End Voice Chat"
            >
              <PhoneOff className="w-5 h-5" />
            </Button>
            {/* Voice chat indicator */}
            {voiceUsers.length > 1 && (
              <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full">
                🎤 {voiceUsers.length} in call
              </span>
            )}
            {/* Show who's speaking */}
            {voiceUsers.filter(id => speakingUsers[id] && id !== user?.id).map(id => {
              const speakingPlayer = (gameState?.players || room?.players || []).find(p => p.id === id);
              return speakingPlayer ? (
                <span key={id} className="text-xs bg-yellow-500/30 text-yellow-300 px-2 py-1 rounded-full animate-pulse border border-yellow-500">
                  🗣️ {speakingPlayer.username}
                </span>
              ) : null;
            })}
          </>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`rounded-full ${soundEnabled ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'}`}
          title={soundEnabled ? 'Sound ON' : 'Sound OFF'}
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={leaveGame}
          className="rounded-full text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Turn Indicator with Timer */}
      {!isGameOver && !hasEscaped && (
        <div className="absolute top-4 left-4 z-40">
          <div className={`bg-black/80 px-5 py-3 rounded-full backdrop-blur-sm ${isMyTurn ? 'ring-2 ring-yellow-400' : ''}`}>
            {isMyTurn ? (
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 font-bold text-lg animate-pulse">🎴 YOUR TURN!</span>
                {turnTimer > 0 && (
                  <span className={`font-mono font-bold text-lg ${turnTimer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    {turnTimer}s
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-300">
                ⏳ {(gameState.players || room.players)?.find(p => p.id === gameState.current_player)?.username}'s turn
              </span>
            )}
          </div>
        </div>
      )}

      {/* Text Chat */}
      <TextChat
        messages={chatMessages}
        onSendMessage={sendChatMessage}
        players={gameState.players || room.players || []}
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        wsConnected={wsConnected}
      />

      {/* Spectator Choice Dialog - choose player to watch (CANNOT CHANGE AFTER!) */}
      <Dialog open={spectatorChoiceDialog} onOpenChange={() => {}}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">🎉 You Escaped!</DialogTitle>
            <DialogDescription className="text-gray-400">
              Choose <span className="text-primary font-bold">ONE player</span> whose cards you want to see.
              <br />
              <span className="text-yellow-400">⚠️ You CANNOT change this choice! When they escape, you can't see anyone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {activePlayers.map(player => (
              <Button
                key={player.id}
                onClick={async () => {
                  setWatchingPlayerId(player.id);
                  setSpectatorLocked(true); // Lock the choice!
                  setSpectatorChoiceDialog(false);
                  toast.success(`Now watching ${player.username}'s cards. You cannot change this!`);
                  // Fetch latest game state to get all hands
                  await fetchGameState();
                }}
                className="w-full h-12 justify-start gap-3 bg-zinc-800 hover:bg-zinc-700"
              >
                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                  {player.id.startsWith('bot_') ? '🤖' : player.username?.[0]?.toUpperCase()}
                </div>
                <span>{player.username}</span>
                <span className="ml-auto text-gray-400">{gameState.player_card_counts?.[player.id]} cards</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Card Request Dialog - when someone wants YOUR cards (you have ≤3) */}
      <Dialog open={cardRequestDialog.open} onOpenChange={(open) => !open && setCardRequestDialog({ open: false, requesterId: null, requesterName: '' })}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">🃏 Card Request!</DialogTitle>
            <DialogDescription className="text-gray-400">
              <span className="text-primary font-bold">{cardRequestDialog.requesterName}</span> wants to take your cards!
              <br /><br />
              <span className="text-emerald-400">✓ If you say YES, you escape and WIN!</span>
              <br />
              <span className="text-rose-400">⚠️ They will receive your remaining cards</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => respondToCardRequest(false)}>
              No, Keep My Cards
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={() => respondToCardRequest(true)}>
              Yes, I'll Escape! 🎉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Watching Player's Cards (spectator mode) */}
      {hasEscaped && watchingPlayer && allHands && (
        <div className="absolute top-16 left-4 z-40 bg-black/80 p-3 rounded-xl backdrop-blur-sm max-w-xs">
          <p className="text-sm text-emerald-400 mb-2">
            👁️ Watching: <span className="font-bold">{watchingPlayer.username}</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {getWatchingPlayerHand()?.map((card, i) => {
              const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
              return (
                <div key={i} className="bg-white rounded px-1.5 py-0.5 text-xs font-bold">
                  <span className={isRed ? 'text-red-600' : 'text-gray-900'}>
                    {card.rank}{SUIT_DISPLAY[card.suit]?.symbol}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Game Over */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-900 border border-zinc-700 p-10 rounded-3xl text-center max-w-md mx-4"
            >
              <h2 className="text-5xl font-black mb-4">
                {gameState.loser === user?.id ? (
                  <span className="text-rose-500">😢 YOU ARE BHABHI!</span>
                ) : (
                  <span className="text-emerald-400">🎉 YOU WIN!</span>
                )}
              </h2>
              {loserPlayer && gameState.loser !== user?.id && (
                <p className="text-xl text-gray-400 mb-4">
                  <span className="text-rose-400 font-bold">{loserPlayer.username}</span> is the Bhabhi!
                </p>
              )}
              
              {/* Show escape positions/rankings */}
              <div className="mb-6 text-left bg-zinc-800 rounded-xl p-4">
                <p className="text-sm text-gray-400 mb-2">Final Rankings:</p>
                {(gameState.finished_players || []).map((pid, index) => {
                  const player = (gameState.players || room.players)?.find(p => p.id === pid);
                  const position = index + 1;
                  const positionText = position === 1 ? '🥇 1st' : position === 2 ? '🥈 2nd' : position === 3 ? '🥉 3rd' : `${position}th`;
                  return (
                    <div key={pid} className="flex items-center gap-2 py-1">
                      <span className="text-lg">{positionText}</span>
                      <span className={`font-bold ${pid === user?.id ? 'text-emerald-400' : 'text-white'}`}>
                        {player?.username} {pid === user?.id && '(You)'}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 py-1 border-t border-zinc-700 mt-2 pt-2">
                  <span className="text-lg">💩 Last</span>
                  <span className="text-rose-400 font-bold">{loserPlayer?.username} (Bhabhi)</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                {isHost && (
                  <Button onClick={restartGame} className="w-full h-14 rounded-full font-bold text-lg bg-primary">
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Play Again
                  </Button>
                )}
                <Button variant="outline" onClick={leaveGame} className="w-full h-14 rounded-full text-lg">
                  Back to Lobby
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
