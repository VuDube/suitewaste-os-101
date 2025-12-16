import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { HardHat, Menu, LayoutDashboard, Weight, Users, BookOpen, Settings2, Download, LogOut, FileText, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['operator', 'manager', 'admin', 'auditor'] },
  { href: '/quick-weight', label: 'Weigh', icon: Weight, roles: ['operator', 'manager', 'admin'] },
  { href: '/suppliers', label: 'Suppliers', icon: Users, roles: ['manager', 'admin'] },
  { href: '/ledger', label: 'Ledger', icon: BookOpen, roles: ['manager', 'admin', 'auditor'] },
  { href: '/transactions', label: 'Transactions', icon: FileText, roles: ['manager', 'admin', 'auditor'] },
  { href: '/chat', label: 'Chat', icon: MessageCircle, roles: ['operator','manager','admin','auditor'], features: ['chat-access'] },
  { href: '/hardware', label: 'Hardware', icon: Settings2, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: Settings2, roles: ['admin'] },
];
function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };
  return { installPrompt, handleInstall };
}
export function GlobalNav() {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { installPrompt, handleInstall } = usePWAInstall();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const accessibleNavItems = navItems.filter(item => 
    user && 
    item.roles.includes(user.role) && 
    (!item.features || item.features.every(f => user.features?.includes(f)))
  );
  const DesktopNavLinks = () => (
    <nav className="hidden md:flex items-center gap-1">
      {accessibleNavItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
  const MobileNavLinks = () => (
    <nav className="grid grid-cols-3 gap-2">
      {accessibleNavItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          onClick={() => setMobileMenuOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg p-2 h-20 text-xs font-medium transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <item.icon className="h-6 w-6" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:block hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2">
                <HardHat className="h-7 w-7 text-primary" />
                <span className="text-lg font-bold tracking-tighter">SuiteWaste OS</span>
              </Link>
              <DesktopNavLinks />
            </div>
            <div className="flex items-center gap-2">
              {installPrompt && (
                <Button onClick={handleInstall} variant="outline" size="sm"><Download className="mr-2 h-4 w-4" /> Install</Button>
              )}
              <ThemeToggle className="relative top-0 right-0" />
              <Button onClick={handleLogout} variant="ghost" size="icon" aria-label="Logout"><LogOut className="h-5 w-5" /></Button>
            </div>
          </div>
        </div>
      </header>
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-background/95 backdrop-blur-sm border-t z-50 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)]">
         <div className="grid h-full max-w-lg grid-cols-5 mx-auto">
            {accessibleNavItems.slice(0, 4).map(item => (
                 <NavLink key={item.href} to={item.href} className={({isActive}) => cn("inline-flex flex-col items-center justify-center px-1 hover:bg-accent group transition-colors duration-200", isActive ? "text-primary" : "text-muted-foreground")}>
                    <item.icon className="w-6 h-6 mb-1" />
                    <span className="text-xs sr-only sm:not-sr-only">{item.label}</span>
                </NavLink>
            ))}
             <Sheet open={isMobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                    <button type="button" className="inline-flex flex-col items-center justify-center px-1 hover:bg-accent group text-muted-foreground">
                        <Menu className="w-6 h-6 mb-1" />
                        <span className="text-xs sr-only sm:not-sr-only">More</span>
                    </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <MobileNavLinks />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {installPrompt && <Button onClick={handleInstall} variant="outline" className="h-12"><Download className="mr-2 h-4 w-4" /> Install App</Button>}
                        <Button onClick={handleLogout} variant="outline" className="h-12"><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
                    </div>
                </SheetContent>
            </Sheet>
         </div>
      </div>
    </>
  );
}