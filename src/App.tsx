/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import MapComponent, { MapLayerType } from './components/MapComponent';
import AiAssistant from './components/AiAssistant';
import { RouteData, RoutePoint } from './types';
import { Layers, MapPin, Plus, Minus, User as UserIcon, LogIn, LogOut, Mountain, Bike, Car, Sun, Moon, Sparkles, Map as MapIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);
  const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(13);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeLayers, setActiveLayers] = useState<Set<MapLayerType>>(new Set(['dark']));
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [mobileActiveView, setMobileActiveView] = useState<'chat' | 'map'>('chat');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      setActiveLayers(prev => {
        const next = new Set(prev);
        next.delete('light');
        if (!next.has('terrain')) next.add('dark');
        return next;
      });
    } else {
      document.documentElement.classList.add('light');
      setActiveLayers(prev => {
        const next = new Set(prev);
        next.delete('dark');
        if (!next.has('terrain')) next.add('light');
        return next;
      });
    }
  }, [isDarkMode]);

  const toggleLayer = (layer: MapLayerType) => {
    setActiveLayers(prev => {
      const next = new Set<MapLayerType>();
      
      // Default base layer based on theme
      const baseLayer = isDarkMode ? 'dark' : 'light';
      next.add(baseLayer);

      // If the clicked layer was already active, we just return the clean base layer (toggling it off)
      if (prev.has(layer)) {
        return next;
      }

      // Otherwise, turn on the specifically clicked layer and clear others
      next.add(layer);
      
      // If we selected terrain (which is a base map, not an overlay), remove the dark/light base map
      if (layer === 'terrain') {
        next.delete('dark');
        next.delete('light');
      }

      return next;
    });
  };

  const refreshUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setRecenterTrigger(prev => prev + 1);
        },
        (error) => {
          console.error("Error getting location: ", error);
          if (userLocation) setRecenterTrigger(prev => prev + 1);
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const mapControls = {
    toggleLayer,
    activeLayers,
    recenter: refreshUserLocation,
    zoomIn: () => setZoomLevel(prev => Math.min(prev + 1, 19)),
    zoomOut: () => setZoomLevel(prev => Math.max(prev - 1, 1)),
    toggleMobileView: () => setMobileActiveView(prev => prev === 'chat' ? 'map' : 'chat'),
    mobileActiveView
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthLoading(false);
      
      if (user && !user.isAnonymous) {
        // Create/Update user profile in Firestore
        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            name: user.displayName,
            photoURL: user.photoURL,
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error("Error updating user profile:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleAnonymously = async () => {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error("Anonymous sign-in failed:", e);
    }
  };

  const handleLogout = () => signOut(auth);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location: ", error);
          // Fallback to LA if permission denied or error
          setUserLocation({ lat: 34.0522, lng: -118.2437 });
        }
      );
    }
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen w-full bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-kinetic border-t-transparent rounded-full animate-spin" />
          <p className="font-display text-sm uppercase tracking-widest text-on-surface/40">Initializing Neural Engine...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full bg-surface flex items-center justify-center p-6 bg-[url('https://picsum.photos/seed/cycling-dark/1920/1080?grayscale&blur=10')] bg-cover bg-center">
        <div className="max-w-md w-full glass-panel p-10 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-primary-container-kinetic/20 rounded-2xl flex items-center justify-center mb-8">
            <div className="w-10 h-10 border-4 border-primary-kinetic rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-primary-kinetic rounded-full" />
            </div>
          </div>
          <h1 className="font-display text-4xl font-black mb-4 tracking-tight">VELO.KINETIC</h1>
          <p className="text-on-surface/60 mb-10 leading-relaxed">Experience elite performance neural routing. Push your limits with AI-pioneer navigation.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-on-surface text-surface py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-transform active:scale-[0.98] mb-4"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
          
          <button 
            onClick={handleAnonymously}
            className="w-full bg-surface-highest/40 text-on-surface py-4 rounded-xl font-bold hover:bg-surface-highest/60 transition-all active:scale-[0.98]"
          >
            Start as Guest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden relative">
      {/* BACKGROUND MAP (Universal Background) */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
          path={currentRoute?.path || null} 
          userLocation={userLocation} 
          zoomLevel={zoomLevel}
          activeLayers={activeLayers}
          recenterTrigger={recenterTrigger}
        />
      </div>

      {/* FLOATING HEADER / ACCOUNT MENU (Moved to far right) */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-[100] flex items-center gap-4">
        <div className="relative">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="h-10 w-10 md:h-12 md:w-12 rounded-full border-2 border-primary-kinetic/30 p-1 glass-panel shadow-2xl overflow-hidden hover:border-primary-kinetic transition-all active:scale-95"
          >
            <img 
              src={user?.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`} 
              alt="Profile" 
              className="h-full w-full object-cover rounded-full"
              referrerPolicy="no-referrer"
            />
          </button>

          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 5, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-56 glass-panel border border-on-surface/10 rounded-2xl shadow-2xl p-2 overflow-hidden z-[110]"
              >
                <div className="p-3 border-b border-on-surface/5 mb-1">
                  <p className="text-xs font-bold truncate text-on-surface">{user.displayName || "Elite Pilot"}</p>
                  <p className="text-[10px] text-on-surface/40 truncate">{user.email || (user.isAnonymous ? "Guest Mode" : "")}</p>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-bold">Exit Simulation</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CORE INTERFACE - INTEGRATED WITH MAP BACKGROUND */}
      <div className="relative z-10 p-0 md:p-8 flex h-full gap-8 w-full pointer-events-none overflow-hidden">
        <div className="h-full flex flex-col w-full md:w-[440px]">
          <AiAssistant 
            onRouteGenerated={setCurrentRoute} 
            userLocation={userLocation}
            themeProps={{ isDarkMode, setIsDarkMode }}
            mapControls={mapControls}
          />
        </div>
      </div>
    </div>
  );
}
