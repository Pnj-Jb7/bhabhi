import { cn } from '../lib/utils';
import { Crown, Mic, MicOff, Check, Bot } from 'lucide-react';

export default function PlayerAvatar({
  player,
  cardCount = 0,
  isCurrentPlayer = false,
  isFinished = false,
  isMuted = true,
  isConnected = false,
  isHost = false,
  isMe = false
}) {
  const isBot = player?.is_bot || player?.id?.startsWith('bot_');
  
  return (
    <div className={cn(
      "flex flex-col items-center gap-2 p-3 rounded-xl transition-all",
      isCurrentPlayer && "animate-pulse-glow",
      isFinished && "opacity-60"
    )}>
      {/* Avatar */}
      <div className="relative">
        <div className={cn(
          "w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-xl font-bold border-2",
          isCurrentPlayer ? "border-primary bg-primary/20" : "border-white/20 bg-zinc-800",
          isMe && "ring-2 ring-primary ring-offset-2 ring-offset-black",
          isBot && "bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-400"
        )}>
          {isFinished ? (
            <Check className="w-6 h-6 text-emerald-400" />
          ) : isBot ? (
            <Bot className="w-6 h-6 text-white" />
          ) : (
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-violet-400 to-emerald-400">
              {player.username?.[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>
        
        {/* Host Crown */}
        {isHost && (
          <Crown className="absolute -top-2 -right-2 w-5 h-5 text-yellow-500" />
        )}
        
        {/* Voice Indicator - only for human players */}
        {!isBot && (
          <div className={cn(
            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-black flex items-center justify-center",
            isMuted ? "bg-red-500" : isConnected ? "bg-emerald-500" : "bg-zinc-600"
          )}>
            {isMuted ? (
              <MicOff className="w-2 h-2 text-white" />
            ) : (
              <Mic className="w-2 h-2 text-white" />
            )}
          </div>
        )}
      </div>

      {/* Player Info */}
      <div className="text-center">
        <p className={cn(
          "text-sm font-medium truncate max-w-[80px]",
          isMe && "text-primary",
          isBot && "text-cyan-400"
        )}>
          {isMe ? 'You' : player.username}
        </p>
        {!isFinished && (
          <p className="text-xs text-muted-foreground">
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </p>
        )}
        {isFinished && (
          <p className="text-xs text-emerald-400 font-medium">Finished!</p>
        )}
      </div>
    </div>
  );
}
