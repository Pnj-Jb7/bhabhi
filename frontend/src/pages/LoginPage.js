import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  // Load saved credentials on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('bhabhi_remembered_email');
    const savedPassword = localStorage.getItem('bhabhi_remembered_password');
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      
      // Save or clear credentials based on Remember Me
      if (rememberMe) {
        localStorage.setItem('bhabhi_remembered_email', email);
        localStorage.setItem('bhabhi_remembered_password', password);
      } else {
        localStorage.removeItem('bhabhi_remembered_email');
        localStorage.removeItem('bhabhi_remembered_password');
      }
      
      toast.success('Welcome back!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/6664138/pexels-photo-6664138.jpeg)',
        }}
      />
      <div className="absolute inset-0 bg-black/80" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl" />

      <Card className="w-full max-w-md glass border-white/10 relative z-10" data-testid="login-card">
        <CardHeader className="text-center space-y-4">
          {/* Ace of Spades Logo */}
          <div className="mx-auto w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-xl">
            <span className="text-5xl">♠️</span>
          </div>
          <CardTitle className="text-4xl font-display bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
            BHABHI
          </CardTitle>
          <p className="text-xs text-muted-foreground font-medium">by JB7</p>
          <CardDescription className="text-muted-foreground">
            Sign in to play with friends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-zinc-900/50 border-zinc-700 focus:border-primary"
                  data-testid="login-email-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-zinc-900/50 border-zinc-700 focus:border-primary"
                  data-testid="login-password-input"
                />
              </div>
            </div>
            
            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                data-testid="remember-me-checkbox"
              />
              <Label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer select-none">
                Remember me
              </Label>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 rounded-full font-bold tracking-wide glow-primary"
              disabled={isLoading}
              data-testid="login-submit-btn"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium" data-testid="register-link">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
