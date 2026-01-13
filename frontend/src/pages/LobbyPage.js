import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { LogOut, Plus, Users, Trophy, HelpCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('4');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) {
      toast.error('Please enter a room name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await axios.post(`${API}/rooms/create`, {
        name: roomName,
        max_players: parseInt(maxPlayers)
      });
      toast.success(`Room created! Code: ${response.data.code}`);
      navigate(`/room/${response.data.code}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }

    setIsJoining(true);
    try {
      await axios.post(`${API}/rooms/join/${joinCode.toUpperCase()}`);
      toast.success('Joined room!');
      navigate(`/room/${joinCode.toUpperCase()}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

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
      <header className="flex items-center justify-between mb-8 md:mb-12">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center glow-primary">
            <Swords className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-display bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              BHABHI
            </h1>
            <p className="text-xs text-muted-foreground">by JB7</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {/* How to Play Dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="hover:bg-white/5"
                data-testid="how-to-play-btn"
              >
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-display text-primary">HOW TO PLAY BHABHI</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  Player with <strong className="text-white">Ace of Spades</strong> plays first
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  Follow the lead suit if you can
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">3.</span>
                  <span>If everyone follows suit → cards go to <strong className="text-emerald-400">waste pile</strong></span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">4.</span>
                  <span><strong className="text-rose-400">TOCHOO:</strong> Can't follow suit? Play any card - highest of lead suit <strong className="text-rose-400">picks up ALL cards!</strong></span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-yellow-500 font-bold">5.</span>
                  <span>Highest card of lead suit "has power" - leads next trick</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-violet-500 font-bold">★</span>
                  <span>
                    <strong className="text-violet-400">First trick:</strong> Cards always go to waste (even with tochoo)
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">6.</span>
                  <span><strong className="text-emerald-400">Get Away:</strong> Empty your hand to escape!</span>
                </p>
                <p className="flex items-start gap-2 pt-2 border-t border-white/10">
                  <span className="text-rose-500 font-bold">⚠</span>
                  Last player with cards = <span className="text-rose-400 font-bold">BHABHI</span> (loser)!
                </p>
              </div>
            </DialogContent>
          </Dialog>
          
          <span className="text-muted-foreground hidden md:block">
            Welcome, <span className="text-primary font-semibold">{user?.username}</span>
          </span>
          {/* Stats Display */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-muted-foreground">
                {user?.games_won || 0}W / {(user?.games_played || 0) - (user?.games_won || 0)}L
              </span>
            </div>
            {user?.games_played > 0 && (
              <span className="text-emerald-400 font-bold">
                {Math.round(((user?.games_won || 0) / (user?.games_played || 1)) * 100)}%
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={logout}
            className="hover:bg-white/5"
            data-testid="logout-btn"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content - Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-6xl mx-auto">
        {/* Create Room - Large Card */}
        <Card className="md:col-span-8 glass border-white/10" data-testid="create-room-card">
          <CardHeader>
            <CardTitle className="text-2xl font-display flex items-center gap-2">
              <Plus className="w-6 h-6 text-primary" />
              CREATE ROOM
            </CardTitle>
            <CardDescription>
              Start a new game and invite your friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRoom} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Room Name</Label>
                  <Input
                    id="roomName"
                    placeholder="My Awesome Game"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="h-12 bg-zinc-900/50 border-zinc-700 focus:border-primary"
                    data-testid="room-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPlayers">Max Players</Label>
                  <Select value={maxPlayers} onValueChange={setMaxPlayers}>
                    <SelectTrigger className="h-12 bg-zinc-900/50 border-zinc-700" data-testid="max-players-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Players</SelectItem>
                      <SelectItem value="3">3 Players</SelectItem>
                      <SelectItem value="4">4 Players</SelectItem>
                      <SelectItem value="5">5 Players</SelectItem>
                      <SelectItem value="6">6 Players</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full md:w-auto h-12 px-8 rounded-full font-bold tracking-wide glow-primary"
                disabled={isCreating}
                data-testid="create-room-btn"
              >
                {isCreating ? 'Creating...' : 'Create Room'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* User Stats Card */}
        <Card className="md:col-span-4 glass border-white/10" data-testid="user-stats-card">
          <CardHeader>
            <CardTitle className="text-xl font-display flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              YOUR STATS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50">
              <span className="text-muted-foreground">Games Played</span>
              <span className="text-2xl font-bold text-primary">{user?.games_played || 0}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50">
              <span className="text-muted-foreground">Games Won</span>
              <span className="text-2xl font-bold text-emerald-400">{user?.games_won || 0}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="text-2xl font-bold text-violet-400">
                {user?.games_played > 0 
                  ? `${Math.round((user?.games_won / user?.games_played) * 100)}%`
                  : '0%'
                }
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Join Room Card */}
        <Card className="md:col-span-6 glass border-white/10" data-testid="join-room-card">
          <CardHeader>
            <CardTitle className="text-2xl font-display flex items-center gap-2">
              <Users className="w-6 h-6 text-violet-400" />
              JOIN ROOM
            </CardTitle>
            <CardDescription>
              Enter a room code to join your friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="joinCode">Room Code</Label>
                <Input
                  id="joinCode"
                  placeholder="ABCD12"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="h-12 bg-zinc-900/50 border-zinc-700 focus:border-primary text-center text-xl tracking-widest font-mono"
                  maxLength={6}
                  data-testid="join-code-input"
                />
              </div>
              <Button 
                type="submit" 
                variant="outline"
                className="w-full h-12 rounded-full font-bold tracking-wide border-2 border-violet-500 text-violet-400 hover:bg-violet-500/10"
                disabled={isJoining}
                data-testid="join-room-btn"
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
