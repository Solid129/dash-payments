import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { useLogout } from '@/features/auth/use-auth-mutations';
import { canManageTeam } from '@/lib/permissions';
import { useSidebar } from '@/lib/sidebar-context';
import { useTheme } from '@/lib/theme-context';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/api';

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, end: false },
  { to: '/payouts', label: 'Payouts', icon: Wallet, end: false },
];

const TEAM_NAV_ITEM = { to: '/team', label: 'Team', icon: Users, end: false };

function navItemsFor(role: UserRole | undefined) {
  return role && canManageTeam(role) ? [...BASE_NAV_ITEMS, TEAM_NAV_ITEM] : BASE_NAV_ITEMS;
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed = false,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && label}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 px-2', collapsed && 'justify-center px-0')}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="h-4 w-4" />
      </div>
      {!collapsed && <span className="font-semibold tracking-tight">Dash Payments</span>}
    </div>
  );
}

function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { profile } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const { isDark, toggle: toggleDark } = useTheme();

  if (!profile) return null;

  const initials = profile.user.fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const trigger = (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
        collapsed && 'justify-center px-0',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
        {initials}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile.user.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.merchant.businessName}</p>
        </div>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{profile.user.fullName}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{profile.user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleDark(); }}>
          {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { profile } = useAuth();
  const { collapsed, toggle: toggleCollapsed } = useSidebar();
  const navItems = navItemsFor(profile?.user.role);

  // Lock background scroll while the drawer covers the screen — otherwise the
  // page behind it keeps scrolling, which reads as broken on touch devices.
  useEffect(() => {
    if (!mobileNavOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r bg-background px-3 py-4 transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
          <BrandMark collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </nav>
        <UserMenu collapsed={collapsed} />
      </aside>

      {/* Content column: mobile top bar stacks above main, desktop sidebar sits
          beside this whole column — both live in one flex-col so they never
          compete for width as row siblings. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
          <BrandMark />
          <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 pb-16 md:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile slide-out nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative flex w-64 flex-col bg-background px-3 py-4 shadow-xl">
            <BrandMark />
            <nav className="mt-8 flex flex-1 flex-col gap-1">
              {navItems.map((item) => (
                <NavItem key={item.to} {...item} onNavigate={() => setMobileNavOpen(false)} />
              ))}
            </nav>
            <UserMenu />
          </div>
        </div>
      )}

      {/* Mobile bottom nav — column count follows the role-dependent item
          count, so an owner's extra "Team" tab doesn't squeeze the others. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background md:hidden"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2 text-xs font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
