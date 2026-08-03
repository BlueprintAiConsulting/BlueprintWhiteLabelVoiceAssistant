import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, LayoutDashboard, Settings as SettingsIcon, ShieldAlert, ThermometerSun, Calendar, Menu, X, LogIn, LogOut, CheckCircle } from "lucide-react";
import { auth, db, doc, setDoc, googleProvider, signInWithPopup, onAuthStateChanged, User } from "./firebase.ts";
import Dashboard from "./components/Dashboard.tsx";
import Simulator from "./components/Simulator.tsx";
import SettingsPage from "./components/Settings.tsx";
import QATests from "./components/QATests.tsx";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
    { path: "/qa", label: "QA Tests", icon: CheckCircle },
    { path: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="w-64 bg-stone-900 text-stone-300 flex flex-col h-screen border-r border-stone-800">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-stone-900">
            <ThermometerSun size={20} />
          </div>
          <span className="font-serif italic text-xl text-white">Blueprint AI</span>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-bold">HVAC Receptionist</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
              location.pathname === item.path 
                ? "bg-stone-800 text-white shadow-inner" 
                : "hover:bg-stone-800/50 hover:text-stone-100"
            )}
          >
            <item.icon size={18} className={cn(location.pathname === item.path ? "text-emerald-400" : "text-stone-500")} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-stone-800">
        {user ? (
          <div className="flex items-center justify-between p-2 bg-stone-800/50 rounded-xl">
            <div className="flex items-center gap-2 overflow-hidden">
              <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-stone-700" referrerPolicy="no-referrer" />
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 text-xs font-medium text-stone-200 truncate">
                  <span>{user.displayName}</span>
                  {user.email === "drewhufnagle@gmail.com" && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 font-bold uppercase rounded border border-emerald-500/30">Admin</span>
                  )}
                </div>
                <div className="text-[10px] text-stone-500 truncate">{user.email}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 text-stone-500 hover:text-rose-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-stone-800 text-stone-200 py-3 rounded-xl hover:bg-stone-700 transition-colors text-sm font-medium"
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
      <div className="flex h-screen w-full overflow-hidden bg-stone-50 font-sans selection:bg-emerald-100 selection:text-emerald-900">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/qa" element={<QATests />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
