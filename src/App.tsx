import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, LayoutDashboard, Settings as SettingsIcon, ShieldAlert, ShieldCheck, ThermometerSun, Calendar, Menu, X, LogIn, LogOut, CheckCircle } from "lucide-react";
import { auth, db, doc, setDoc, googleProvider, signInWithPopup, onAuthStateChanged, User } from "./firebase.ts";
import Dashboard from "./components/Dashboard.tsx";
import Simulator from "./components/Simulator.tsx";
import SettingsPage from "./components/Settings.tsx";
import QATests from "./components/QATests.tsx";
import QADashboard from "./components/QADashboard.tsx";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import logoImg from "./assets/logo.jpg";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
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
            updatedAt: new Date()
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
    { path: "/qa-dashboard", label: "QA Audit", icon: ShieldCheck },
    { path: "/qa", label: "QA Tests", icon: CheckCircle },
    { path: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 w-72 md:w-64 bg-slate-900/95 md:bg-slate-900/50 backdrop-blur-2xl text-slate-300 flex flex-col h-full border-r border-slate-800 transition-transform duration-300 ease-out md:static md:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        <div className="p-5 md:p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Blueprint AI Consulting Co. Logo"
              className="w-10 h-10 rounded-xl border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] object-cover"
            />
            <div>
              <span className="font-serif italic text-lg text-slate-100 font-bold block leading-tight tracking-wide">Blueprint AI</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 font-bold block">Consulting Co.</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                  ? "bg-slate-800/90 text-white shadow-inner border-slate-700/60"
                  : "hover:bg-slate-800/40 hover:text-slate-100 hover:border-slate-700/30"
              )}
            >
              <item.icon size={20} className={cn(
                "transition-colors flex-shrink-0",
                location.pathname === item.path ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" : "text-slate-500 group-hover:text-slate-400"
              )} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          {user ? (
            <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/50">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-slate-700/80 shadow-[0_0_10px_rgba(0,0,0,0.5)] object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                <div className="overflow-hidden">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 truncate">
                    <span className="truncate">{user.displayName}</span>
                    {user.email === "drewhufnagle@gmail.com" && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-cyan-500/10 text-cyan-400 font-mono font-bold uppercase rounded border border-cyan-500/20 flex-shrink-0">Admin</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">{user.email}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-rose-400 hover:drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-200 py-3 rounded-xl hover:bg-slate-700 transition-colors text-sm font-medium border border-slate-700/50 min-h-[44px]"
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

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-slate-950 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative">
        
        {/* Subtle grid background pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
        </div>
        
        {/* Ambient background glows */}
        <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen z-0"></div>
        <div className="absolute bottom-0 right-[10%] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen z-0"></div>

        {/* Mobile Top Navigation Header */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Blueprint AI Consulting Co. Logo"
              className="w-8 h-8 rounded-lg border border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.2)] object-cover"
            />
            <div>
              <span className="font-serif italic text-base text-slate-100 font-bold block leading-none">Blueprint HVAC AI</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-cyan-400 font-bold block mt-0.5">Voice Receptionist</span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/70 border border-slate-700/50 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>

        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        <main className="flex-1 overflow-hidden relative z-10 flex flex-col min-w-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/qa-dashboard" element={<QADashboard />} />
            <Route path="/qa" element={<QATests />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
