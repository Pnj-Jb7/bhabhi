import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { 
  Swords, Copy, Check, Users, Crown, Play, LogOut, 
  Mic, MicOff, Volume2, VolumeX, Bot, X, Share2 
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_URL = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');

export default function RoomPage() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [voiceStatus, setVoiceStatus] = useState({});

  const fetchRoom = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rooms/${roomCode}`);
      setRoom(response.data.room);
      
      if (response.data.room.status === 'playing') {
        navigate(`/game/${roomCode}`);
      }
    } catch (error) {
      toast.error('Room not found');
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  }, [roomCode, navigate]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Periodic refresh to catch any missed updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (room?.status === 'waiting') {
        fetchRoom();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [room?.status, fetchRoom]);

  useEffect(() => {
    if (!user || !roomCode) return;

    const ws = new WebSocket(`${WS_URL}/ws/${roomCode}/${user.id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'player_joined':
        case 'player_left':
        case 'player_ready_changed':
          setRoom(prev => prev ? { ...prev, players: data.players } : prev);
          break;
        case 'user_connected':
        case 'user_disconnected':
          setConnectedUsers(data.connected_users || []);
          break;
        case 'game_started':
          navigate(`/game/${roomCode}`);
          break;
        case 'voice_status':
          setVoiceStatus(prev => ({
            ...prev,
            [data.user_id]: { is_speaking: data.is_speaking, is_muted: data.is_muted }
          }));
          break;
        case 'game_restarted':
          setRoom(prev => prev ? { ...prev, players: data.players, status: 'waiting' } : prev);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.destroy?.());
    };
  }, [user, roomCode, navigate]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast.success('Room code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareRoom = async () => {
    const shareData = {
      title: 'Join my Bhabhi Game!',
      text: `Join my Bhabhi game room! Code: ${roomCode}`,
      url: window.location.href
    };

    try {
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast.success('Shared successfully!');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(`Join my Bhabhi game! Room Code: ${roomCode}\n${window.location.href}`);
        toast.success('Share link copied to clipboard!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(`Join my Bhabhi game! Room Code: ${roomCode}\n${window.location.href}`);
        toast.success('Share link copied to clipboard!');
      }
    }
  };

  const toggleReady = async () => {
    try {
      await axios.post(`${API}/rooms/${roomCode}/ready`);
    } catch (error) {
      toast.error('Failed to update ready status');
    }
  };

  const startGame = async () => {
    const allReady = room.players.filter(p => !p.is_host && !p.is_bot).every(p => p.is_ready);
    if (!allReady && room.players.filter(p => !p.is_bot).length > 1) {
      toast.error('All players must be ready');
      return;
    }

    setIsStarting(true);
    try {
      await axios.post(`${API}/game/start/${roomCode}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start game');
    } finally {
      setIsStarting(false);
    }
  };

  const addBot = async () => {
    try {
      const response = await axios.post(`${API}/rooms/${roomCode}/add-bot`);
      // Update local state immediately since we made the request
      setRoom(response.data.room);
      toast.success('Bot added!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add bot');
    }
  };

  const removeBot = async (botId) => {
    try {
      await axios.post(`${API}/rooms/${roomCode}/remove-bot/${botId}`);
      // Refetch room to get updated state
      fetchRoom();
      toast.success('Bot removed');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove bot');
    }
  };

  const leaveRoom = async () => {
    try {
      await axios.post(`${API}/rooms/leave/${roomCode}`);
      navigate('/');
    } catch (error) {
      toast.error('Failed to leave room');
    }
  };

  const toggleMute = async () => {
    if (isMuted) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setIsMuted(false);
        wsRef.current?.send(JSON.stringify({ type: 'voice_status', is_muted: false }));
        toast.success('Microphone enabled');
      } catch (error) {
        toast.error('Could not access microphone');
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      setIsMuted(true);
      wsRef.current?.send(JSON.stringify({ type: 'voice_status', is_muted: true }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-2xl text-primary animate-pulse">Loading room...</div>
      </div>
    );
  }

  if (!room) return null;

  const isHost = room.host_id === user?.id;
  const currentPlayer = room.players.find(p => p.id === user?.id);
  const humanPlayers = room.players.filter(p => !p.is_bot);
  const nonHostHumans = humanPlayers.filter(p => !p.is_host);
  // Can start if: at least 2 players AND (all non-host humans are ready OR there are no non-host humans)
  const canStart = room.players.length >= 2 && 
    (nonHostHumans.length === 0 || nonHostHumans.every(p => p.is_ready));

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-hidden">
      {/* Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center -z-10"
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/6664138/pexels-photo-6664138.jpeg)',
        }}
      />
      <div className="fixed inset-0 bg-black/80 -z-10" />

      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display text-primary">{room.name}</h1>
            <p className="text-xs text-muted-foreground">Waiting for players...</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          onClick={leaveRoom}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          data-testid="leave-room-btn"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Leave
        </Button>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Room Code Card */}
        <Card className="glass border-white/10" data-testid="room-code-card">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <p className="text-sm text-muted-foreground mb-1">Share this code with friends</p>
                <div className="flex items-center gap-3">
                  <span className="text-4xl md:text-5xl font-display tracking-[0.3em] text-primary" data-testid="room-code-display">
                    {roomCode}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyRoomCode}
                    className="hover:bg-white/5"
                    data-testid="copy-code-btn"
                  >
                    {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={shareRoom}
                    className="hover:bg-white/5 text-violet-400 hover:text-violet-300"
                    data-testid="share-room-btn"
                  >
                    <Share2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-5 h-5" />
                <span>{room.players.length} / {room.max_players}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Players Grid */}
        <Card className="glass border-white/10" data-testid="players-card">
          <CardHeader>
            <CardTitle className="text-xl font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-400" />
              PLAYERS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {room.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`relative p-4 rounded-xl border transition-all ${
                    player.is_ready || player.is_host || player.is_bot
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-zinc-900/50 border-zinc-700'
                  } ${connectedUsers.includes(player.id) || player.is_bot ? 'ring-2 ring-emerald-500/50' : ''}`}
                  data-testid={`player-${player.id}`}
                >
                  {player.is_host && (
                    <Crown className="absolute -top-2 -right-2 w-6 h-6 text-yellow-500" />
                  )}
                  {player.is_bot && isHost && (
                    <button
                      onClick={() => removeBot(player.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      data-testid={`remove-bot-${player.id}`}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
                        player.is_bot 
                          ? 'bg-gradient-to-br from-cyan-500 to-blue-600' 
                          : 'bg-gradient-to-br from-violet-500 to-emerald-500'
                      }`}>
                        {player.is_bot ? <Bot className="w-6 h-6 text-white" /> : player.username[0].toUpperCase()}
                      </div>
                      {/* Voice indicator - only for human players */}
                      {!player.is_bot && (
                        <div className={`voice-indicator ${
                          voiceStatus[player.id]?.is_muted ? 'muted' : 
                          connectedUsers.includes(player.id) ? 'connected' : ''
                        }`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate flex items-center gap-1">
                        {player.username}
                        {player.is_bot && <span className="text-xs text-cyan-400">(AI)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {player.is_host ? 'Host' : player.is_bot ? 'Ready' : player.is_ready ? 'Ready' : 'Not Ready'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add Bot Button - only show for host when room not full */}
              {isHost && room.players.length < room.max_players && (
                <button
                  onClick={addBot}
                  className="p-4 rounded-xl border border-dashed border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 flex flex-col items-center justify-center gap-2 transition-all"
                  data-testid="add-bot-btn"
                >
                  <Bot className="w-8 h-8 text-cyan-400" />
                  <span className="text-cyan-400 text-sm font-medium">Add Bot</span>
                </button>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, room.max_players - room.players.length - (isHost ? 1 : 0)) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="p-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/20 flex items-center justify-center"
                >
                  <span className="text-muted-foreground text-sm">Waiting...</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Voice Chat Controls */}
        <Card className="glass border-white/10" data-testid="voice-controls-card">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                variant={isMuted ? 'outline' : 'default'}
                size="lg"
                onClick={toggleMute}
                className={`rounded-full ${isMuted ? 'border-red-500 text-red-400' : 'bg-emerald-500 text-white'}`}
                data-testid="toggle-mic-btn"
              >
                {isMuted ? <MicOff className="w-5 h-5 mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
                {isMuted ? 'Unmute' : 'Muted'}
              </Button>
              <Button
                variant={isDeafened ? 'outline' : 'ghost'}
                size="lg"
                onClick={() => setIsDeafened(!isDeafened)}
                className={`rounded-full ${isDeafened ? 'border-red-500 text-red-400' : ''}`}
                data-testid="toggle-deafen-btn"
              >
                {isDeafened ? <VolumeX className="w-5 h-5 mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
                {isDeafened ? 'Deafened' : 'Sound On'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          {!isHost && (
            <Button
              size="lg"
              onClick={toggleReady}
              className={`h-14 px-8 rounded-full font-bold tracking-wide ${
                currentPlayer?.is_ready
                  ? 'bg-zinc-700 hover:bg-zinc-600'
                  : 'glow-primary'
              }`}
              data-testid="ready-btn"
            >
              {currentPlayer?.is_ready ? 'Cancel Ready' : 'Ready Up'}
            </Button>
          )}
          
          {isHost && (
            <Button
              size="lg"
              onClick={startGame}
              disabled={!canStart || isStarting}
              className="h-14 px-8 rounded-full font-bold tracking-wide glow-primary disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="start-game-btn"
            >
              <Play className="w-5 h-5 mr-2" />
              {isStarting ? 'Starting...' : 'Start Game'}
            </Button>
          )}
        </div>

        {isHost && !canStart && room.players.length > 1 && (
          <p className="text-center text-yellow-500 text-sm">
            Waiting for all players to ready up...
          </p>
        )}
        {isHost && room.players.length < 2 && (
          <p className="text-center text-muted-foreground text-sm">
            Need at least 2 players to start
          </p>
        )}
      </div>
    </div>
  );
}
