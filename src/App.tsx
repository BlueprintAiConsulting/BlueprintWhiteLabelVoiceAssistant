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

function Sidebar() {
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
    <div className="w-64 bg-slate-900/50 backdrop-blur-2xl text-slate-300 flex flex-col h-screen border-r border-slate-800 relative z-20">
      <div className="p-6 border-b border-slate-800/80 mb-4">
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
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-transparent",
              location.pathname === item.path 
                ? "bg-slate-800/80 text-white shadow-inner border-slate-700/50" 
                : "hover:bg-slate-800/40 hover:text-slate-100 hover:border-slate-700/30"
            )}
          >
            <item.icon size={18} className={cn(
              "transition-colors",
              location.pathname === item.path ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" : "text-slate-500 group-hover:text-slate-400"
            )} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800/80">
        {user ? (
          <div className="flex items-center justify-between p-2 bg-slate-950/50 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2 overflow-hidden">
              <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-slate-700/80 shadow-[0_0_10px_rgba(0,0,0,0.5)]" referrerPolicy="no-referrer" />
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 truncate">
                  <span>{user.displayName}</span>
                  {user.email === "drewhufnagle@gmail.com" && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-cyan-500/10 text-cyan-400 font-mono font-bold uppercase rounded border border-cyan-500/20">Admin</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate font-mono">{user.email}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-rose-400 hover:drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-200 py-3 rounded-xl hover:bg-slate-700 transition-colors text-sm font-medium border border-slate-700/50"
          >
            <LogIn size={18} />
            Admin Login
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="flex h-screen w-full overflow-hidden bg-slate-950 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative">
        
        {/* Subtle grid background pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
        </div>
        
        {/* Ambient background glows */}
        <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen z-0"></div>
        <div className="absolute bottom-0 right-[10%] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen z-0"></div>

        <Sidebar />
        <main className="flex-1 overflow-hidden relative z-10">
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
