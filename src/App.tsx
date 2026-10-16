import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, LayoutDashboard, Settings as SettingsIcon, ShieldAlert, ShieldCheck, ThermometerSun, Calendar, Menu, X, LogIn, LogOut, CheckCircle, Sun, Moon } from "lucide-react";
import { auth, db, doc, setDoc, serverTimestamp, googleProvider, signInWithPopup, onAuthStateChanged, User } from "./firebase.ts";
import Dashboard from "./components/Dashboard.tsx";
import Simulator from "./components/Simulator.tsx";
import SettingsPage from "./components/Settings.tsx";
import QATests from "./components/QATests.tsx";
import QADashboard from "./components/QADashboard.tsx";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import blueprintLogo from "./assets/logo.jpg";
import svLogo from "./assets/sv-logo.png";
import { SV_MODE, SV_BRAND } from "./tenant.ts";
const logoImg = SV_MODE ? svLogo : blueprintLogo;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function Sidebar({ isOpen, onClose, isDarkMode, onToggleTheme }: { isOpen: boolean; onClose: () => void; isDarkMode: boolean; onToggleTheme: () => void }) {
  const location = useLocation();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Automatically sync admin role in Firestore
        try {
          const userRef = doc(db, "users", u.uid);
          const isAdminUser = u.email === "drewhufnagle@gmail.com";
          await setDoc(userRef, {
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            role: isAdminUser ? "admin" : "user",
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.warn("Could not sync user profile:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/simulator", label: "Simulator", icon: Phone },
    ...(SV_MODE ? [] : [{ path: "/qa-dashboard", label: "QA Audit", icon: ShieldCheck }]),
    ...(SV_MODE ? [] : [{ path: "/qa", label: "QA Tests", icon: CheckCircle }]),
    { path: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 w-72 md:w-64 bg-white/95 md:bg-white/80 dark:bg-slate-900/95 dark:md:bg-slate-900/50 backdrop-blur-2xl text-slate-700 dark:text-slate-300 flex flex-col h-full border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-out md:static md:translate-x-0 shadow-lg md:shadow-none",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        <div className="p-5 md:p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt={SV_MODE ? "Spring Valley Roofing logo" : "Blueprint AI Consulting Co. Logo"}
              className="w-10 h-10 rounded-xl border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.25)] object-cover"
            />
            <div>
              <span className="font-serif italic text-lg text-slate-900 dark:text-slate-100 font-bold block leading-tight tracking-wide">{SV_MODE ? SV_BRAND : "Blueprint AI"}</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400 font-bold block">{SV_MODE ? "AI Receptionist" : "Consulting Co."}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all text-sm font-medium border border-transparent min-h-[44px]",
                location.pathname === item.path
                  ? "bg-slate-100 dark:bg-slate-800/90 text-cyan-700 dark:text-white shadow-sm dark:shadow-inner border-slate-200 dark:border-slate-700/60 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-200 dark:hover:border-slate-700/30"
              )}
            >
              <item.icon size={20} className={cn(
                "transition-colors flex-shrink-0",
                location.pathname === item.path ? "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400"
              )} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all border border-slate-200 dark:border-slate-700/50 cursor-pointer min-h-[42px]"
            aria-label="Toggle theme"
          >
            <span className="flex items-center gap-2 font-medium">
              {isDarkMode ? <Moon size={15} className="text-cyan-400" /> : <Sun size={15} className="text-amber-500" />}
              <span>{isDarkMode ? "Dark Mode" : "Light Mode"}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              {isDarkMode ? "To Light" : "To Dark"}
            </span>
          </button>

          {user ? (
            <div className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/50">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-700/80 shadow-sm object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                <div className="overflow-hidden">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    <span className="truncate">{user.displayName}</span>
                    {user.email === "drewhufnagle@gmail.com" && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-mono font-bold uppercase rounded border border-cyan-500/30 flex-shrink-0">Admin</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">{user.email}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 py-3 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-sm font-medium border border-slate-700/50 min-h-[44px] cursor-pointer"
            >
              <LogIn size={18} />
              Admin Login
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function MobileBottomNav() {
  const location = useLocation();
  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/simulator", label: "Simulator", icon: Phone },
    ...(SV_MODE ? [] : [{ path: "/qa-dashboard", label: "QA Audit", icon: ShieldCheck }]),
    ...(SV_MODE ? [] : [{ path: "/qa", label: "QA Tests", icon: CheckCircle }]),
    { path: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around safe-area-bottom shadow-lg">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[56px] min-h-[44px]",
              isActive
                ? "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-500/15 font-bold"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
            )}
          >
            <item.icon size={18} className={cn("mb-1 transition-transform", isActive && "scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]")} />
            <span className="text-[10px] tracking-tight leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
    } catch (e) {}
    // Default is LIGHT MODE
    return false;
  });

  const toggleGlobalTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      try { localStorage.setItem("theme", "dark"); } catch (e) {}
    } else {
      document.documentElement.classList.remove("dark");
      try { localStorage.setItem("theme", "light"); } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent("themechange", { detail: { isDark: nextDark } }));
  };

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ isDark: boolean }>;
      if (customEvent?.detail?.isDark !== undefined) {
        setIsDarkMode(customEvent.detail.isDark);
      } else {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };
    window.addEventListener("themechange", handleThemeChange);
    return () => window.removeEventListener("themechange", handleThemeChange);
  }, []);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="flex flex-col md:flex-row h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-800 dark:selection:text-cyan-200 relative">
        
        {/* Subtle grid background pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.04] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
        </div>
        
        {/* Ambient background glows */}
        <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-cyan-500/10 dark:bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none mix-blend-multiply dark:mix-blend-screen z-0"></div>
        <div className="absolute bottom-0 right-[10%] w-[600px] h-[600px] bg-blue-500/10 dark:bg-blue-900/10 rounded-full blur-[150px] pointer-events-none mix-blend-multiply dark:mix-blend-screen z-0"></div>

        {/* Mobile Top Navigation Header */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 safe-area-top bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/80 z-30 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt={SV_MODE ? "Spring Valley Roofing logo" : "Blueprint AI Consulting Co. Logo"}
              className="w-8 h-8 rounded-lg border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)] object-cover"
            />
            <div>
              <span className="font-serif italic text-base text-slate-900 dark:text-slate-100 font-bold block leading-none">{SV_MODE ? SV_BRAND : "Blueprint AI"}</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-400 font-bold block mt-0.5">Voice Receptionist</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleGlobalTheme}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/50 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Toggle light/dark theme"
            >
              {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-700" />}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/50 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </header>

        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} isDarkMode={isDarkMode} onToggleTheme={toggleGlobalTheme} />
        <main className="flex-1 overflow-hidden relative z-10 flex flex-col min-w-0 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/qa-dashboard" element={<QADashboard />} />
            <Route path="/qa" element={<QATests />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <MobileBottomNav />
      </div>
    </Router>
  );
}
