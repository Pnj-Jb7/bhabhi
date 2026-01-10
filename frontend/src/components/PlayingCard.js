import { cn } from '../lib/utils';

const SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

export default function PlayingCard({ 
  card, 
  isSelected = false, 
  onClick, 
  disabled = false,
  isBack = false,
  size = 'sm'
}) {
  const sizeStyles = {
    xs: { width: '40px', height: '56px', fontSize: '10px', center: '16px' },
    sm: { width: '48px', height: '68px', fontSize: '11px', center: '20px' },
    md: { width: '60px', height: '84px', fontSize: '12px', center: '24px' },
    lg: { width: '72px', height: '100px', fontSize: '14px', center: '28px' }
  };
  
  const styles = sizeStyles[size] || sizeStyles.sm;

  if (isBack) {
    return (
      <div 
        className={cn(
          "playing-card card-back rounded-md"
        )}
        style={{ width: styles.width, height: styles.height }}
        data-testid="card-back"
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={cn(
        "playing-card rounded-md shadow-lg bg-white flex flex-col justify-between p-1 cursor-pointer select-none transition-all duration-200",
        isSelected && "ring-2 ring-yellow-400 -translate-y-4 shadow-yellow-400/30 z-50",
        disabled && "opacity-70 cursor-not-allowed",
        !disabled && !isSelected && "hover:-translate-y-2 hover:z-50"
      )}
      style={{ width: styles.width, height: styles.height, fontSize: styles.fontSize }}
      data-testid={`card-${card.suit}-${card.rank}`}
    >
      {/* Top Left */}
      <div className={cn("flex flex-col items-start leading-none", isRed ? "text-red-600" : "text-gray-900")}>
        <span className="font-bold">{card.rank}</span>
        <span style={{ fontSize: styles.center, marginTop: '-2px' }}>{suitSymbol}</span>
      </div>

      {/* Center Symbol */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none",
        isRed ? "text-red-600" : "text-gray-900"
      )} style={{ fontSize: styles.center }}>
        {suitSymbol}
      </div>

      {/* Bottom Right (Rotated) */}
      <div className={cn(
        "flex flex-col items-end leading-none rotate-180 self-end",
        isRed ? "text-red-600" : "text-gray-900"
      )}>
        <span className="font-bold">{card.rank}</span>
        <span style={{ fontSize: styles.center, marginTop: '-2px' }}>{suitSymbol}</span>
      </div>
    </div>
  );
}
