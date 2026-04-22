import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, Plus, History, Settings, Sparkles, Play, Activity, FileUp, Star, Trash2, MapIcon, ChevronRight, Timer, Heart, Gauge, Mountain, MapPin, Minus, Bike, Car, Layers, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';
import { ChatMessage, RouteData, BiometricData } from '../types';
import { generateRoute } from '../services/geminiService';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import BiometricDashboard from './BiometricDashboard';

interface AiAssistantProps {
  onRouteGenerated: (route: RouteData) => void;
  userLocation: { lat: number; lng: number } | null;
  themeProps: {
    isDarkMode: boolean;
    setIsDarkMode: (val: boolean) => void;
  };
  mapControls: {
    toggleLayer: (layer: any) => void;
    activeLayers: Set<any>;
    recenter: () => void;
    focusRoute?: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    toggleMobileView?: () => void;
    mobileActiveView?: 'chat' | 'map';
  };
}

export default function AiAssistant({ 
  onRouteGenerated, 
  userLocation, 
  themeProps,
  mapControls 
}: AiAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentBiometrics, setCurrentBiometrics] = useState<BiometricData | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'history' | 'settings'>('chat');
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [lastGeneratedRoute, setLastGeneratedRoute] = useState<RouteData | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [autoSyncHR, setAutoSyncHR] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = () => {
    setIsInactive(false);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setIsInactive(true);
    }, 30000); // 30 seconds
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false);
      }
      if (layerMenuRef.current && !layerMenuRef.current.contains(event.target as Node)) {
        setShowLayerMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Check for SpeechRecognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        setIsListening(true);
        recognitionRef.current.start();
      } else {
        alert('Voice recognition is not supported in this browser session.');
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'rides'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRideHistory(history);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeView === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeView]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const location = userLocation || { lat: 34.0522, lng: -118.2437 };
      const routeData = await generateRoute(textToSend, location, currentBiometrics || undefined);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: routeData.description,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        route: routeData
      };

      setMessages(prev => [...prev, assistantMessage]);
      setLastGeneratedRoute(routeData);
      onRouteGenerated(routeData);

      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'users', auth.currentUser.uid, 'rides'), {
            userId: auth.currentUser.uid,
            name: routeData.name,
            distanceKm: routeData.distanceKm,
            elevationGainM: routeData.elevationGainM,
            description: routeData.description,
            path: routeData.path,
            elevationProfile: routeData.elevationProfile,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error saving ride to history:", e);
        }
      }
    } catch (error) {
      console.error('Failed to generate route:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I couldn't generate a route based on your request. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      setShowPlusMenu(false);
      setTimeout(() => {
        const assistantMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Imported tactical GPX session: "${file.name}". Neural data synced. Calculating performance offsets...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsLoading(false);
      }, 1500);
    }
  };

  const handleFavorite = async () => {
    if (!lastGeneratedRoute || !auth.currentUser) {
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Please generate or select a route before adding to favorites.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, msg]);
      setShowPlusMenu(false);
      return;
    }

    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'favorites'), {
        ...lastGeneratedRoute,
        createdAt: serverTimestamp()
      });
      const successMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Route "${lastGeneratedRoute.name}" has been pinned to your Neural Favorites.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e) {
      console.error("Error saving to favorites:", e);
    }
    setShowPlusMenu(false);
  };

  const handleSetDestination = () => {
    setInput("Plan a high-performance route to: ");
    setShowPlusMenu(false);
  };

  const handleHistoryClick = (ride: any) => {
    if (ride.path) {
      const route = {
        name: ride.name,
        distanceKm: ride.distanceKm,
        elevationGainM: ride.elevationGainM,
        description: ride.description,
        path: ride.path,
        elevationProfile: ride.elevationProfile
      };
      onRouteGenerated(route);
      setLastGeneratedRoute(route);
      setActiveView('chat');
      if (mapControls.focusRoute) {
        setTimeout(() => mapControls.focusRoute!(), 100);
      }
    }
  };

  const handleDeleteHistory = async (rideId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'rides', rideId));
    } catch (error) {
      console.error("Error deleting history:", error);
    }
  };

  const generateRoutePreview = (path: { lat: number; lng: number }[]) => {
    if (!path || path.length === 0) return '';
    const lats = path.map(p => Number(p.lat));
    const lngs = path.map(p => Number(p.lng));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    // Dynamic aspect ratio calculation based on median latitude
    const medianLat = (minLat + maxLat) / 2;
    const aspectRatio = 1 / Math.cos(medianLat * Math.PI / 180);
    
    const rawWidth = maxLng - minLng;
    const rawHeight = (maxLat - minLat) * aspectRatio;
    const maxDimension = Math.max(rawWidth, rawHeight);
    
    const padding = 10; // SVG units
    const scale = (100 - (padding * 2)) / (maxDimension || 1);
    
    const offsetX = (100 - (rawWidth * scale)) / 2;
    const offsetY = (100 - (rawHeight * scale)) / 2;
    
    const normalize = (lat: number, lng: number) => {
      const x = (Number(lng) - minLng) * scale + offsetX;
      const y = 100 - ((Number(lat) - minLat) * aspectRatio * scale + offsetY);
      return `${x},${y}`;
    };

    const points = path.map(p => normalize(p.lat, p.lng)).join(' ');
    // Use backgroundSize contain to avoid further clipping
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpolyline points='${points}' fill='none' stroke='rgb(195, 244, 0)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' opacity='0.25' /%3E%3C/svg%3E")`;
  };

  return (
    <div className="w-full md:w-[440px] flex flex-col gap-0 md:gap-6 h-full pointer-events-none">
      <div className={cn(
        "flex-1 md:rounded-[32px] flex flex-col md:border border-on-surface/5 shadow-2xl overflow-hidden relative transition-all duration-500",
        (mapControls.mobileActiveView === 'map' && window.innerWidth < 768) 
          ? "bg-transparent backdrop-blur-none border-transparent !pointer-events-none" 
          : "glass-panel bg-surface/20 backdrop-blur-xl pointer-events-auto"
      )}>
        {/* HEADER - PERSISTENT */}
        <div className="flex items-center justify-between p-4 md:p-6 flex-shrink-0 border-b border-on-surface/5 bg-surface/10 backdrop-blur-md relative z-50 pointer-events-auto">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setActiveView('chat');
                if (mapControls.mobileActiveView === 'map' && mapControls.toggleMobileView) {
                  mapControls.toggleMobileView();
                }
              }}
              className={cn(
                "p-2.5 rounded-xl transition-all shadow-lg",
                (activeView === 'chat' && (window.innerWidth >= 768 || mapControls.mobileActiveView !== 'map'))
                  ? "bg-primary-kinetic text-surface shadow-primary-kinetic/20 scale-105" 
                  : "bg-surface-highest/20 text-on-surface/40 hover:text-on-surface hover:bg-surface-highest/40"
              )}
            >
              <Sparkles className="w-5 h-5 transition-colors" />
            </button>
            
            {activeView !== 'chat' && (
              <h3 className="font-display font-bold tracking-tight text-on-surface">
                {activeView === 'history' ? 'History' : 'Settings'}
              </h3>
            )}

            {/* MOBILE MAP TOGGLE */}
            <button 
              onClick={mapControls.toggleMobileView}
              className={cn(
                "flex md:hidden items-center justify-center p-2.5 rounded-xl transition-all shadow-lg",
                mapControls.mobileActiveView === 'map' 
                  ? "bg-primary-kinetic text-surface shadow-primary-kinetic/20 scale-105" 
                  : "bg-primary-kinetic/10 text-primary-kinetic"
              )}
            >
              <MapIcon className="w-5 h-5" />
            </button>

            {/* MOBILE SETTINGS TOGGLE (Next to Map on Mobile) */}
            <button 
              onClick={() => {
                setActiveView('settings');
                if (mapControls.mobileActiveView === 'map' && mapControls.toggleMobileView) {
                  mapControls.toggleMobileView();
                }
              }}
              className={cn(
                "md:hidden items-center justify-center p-2.5 rounded-xl transition-all shadow-lg",
                (mapControls.mobileActiveView === 'map') ? "hidden" : "flex",
                (activeView === 'settings' && mapControls.mobileActiveView !== 'map')
                  ? "bg-primary-kinetic text-surface shadow-primary-kinetic/20 scale-105" 
                  : "bg-surface-highest/20 text-on-surface/40 hover:text-on-surface hover:bg-surface-highest/40"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* MOBILE HISTORY TOGGLE */}
            <button 
              onClick={() => {
                setActiveView('history');
                if (mapControls.mobileActiveView === 'map' && mapControls.toggleMobileView) {
                  mapControls.toggleMobileView();
                }
              }}
              className={cn(
                "flex md:hidden items-center justify-center p-2.5 rounded-xl transition-all shadow-lg",
                (activeView === 'history' && mapControls.mobileActiveView !== 'map')
                  ? "bg-primary-kinetic text-surface shadow-primary-kinetic/20 scale-105" 
                  : "bg-surface-highest/20 text-on-surface/40 hover:text-on-surface hover:bg-surface-highest/40"
              )}
            >
              <History className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1 pr-12 md:pr-0">
            <button 
              onClick={() => {
                setActiveView('history');
                if (mapControls.mobileActiveView === 'map' && mapControls.toggleMobileView) {
                  mapControls.toggleMobileView();
                }
              }}
              className={cn(
                "hidden md:flex items-center p-2 rounded-lg transition-colors font-bold",
                activeView === 'history' ? "text-primary-kinetic bg-primary-kinetic/10 shadow-sm" : "text-on-surface/40 hover:text-on-surface/60"
              )}
            >
              <History className="w-5 h-5" />
            </button>

            {/* INTEGRATED MAP CONTROLS (Right of History) */}
            <div className={cn(
              "items-center gap-0.5 ml-1 mr-1 px-1 border-x border-on-surface/5 transition-all",
              (mapControls.mobileActiveView === 'map' || window.innerWidth >= 768) ? "flex" : "hidden"
            )}>
              <div className="relative" ref={layerMenuRef}>
                <button 
                  onClick={() => setShowLayerMenu(!showLayerMenu)}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    showLayerMenu ? "text-primary-kinetic bg-primary-kinetic/10" : "text-on-surface/30 hover:text-primary-kinetic hover:bg-primary-kinetic/10"
                  )}
                >
                  <Layers className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showLayerMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 8, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full w-48 glass-panel border border-on-surface/10 rounded-xl shadow-2xl p-2 z-[100] bg-surface/90 backdrop-blur-xl"
                    >
                      <div className="space-y-1">
                        <button onClick={() => { mapControls.toggleLayer('terrain'); setShowLayerMenu(false); }} className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-widest transition-colors", mapControls.activeLayers.has('terrain') ? "bg-primary-kinetic text-surface" : "text-on-surface/60 hover:bg-white/5")}>
                          <Mountain className="w-3 h-3" /> Terrain
                        </button>
                        <button onClick={() => { mapControls.toggleLayer('cycling'); setShowLayerMenu(false); }} className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-widest transition-colors", mapControls.activeLayers.has('cycling') ? "bg-secondary-kinetic text-surface" : "text-on-surface/60 hover:bg-white/5")}>
                          <Bike className="w-3 h-3" /> Cycling
                        </button>
                        <button onClick={() => { mapControls.toggleLayer('traffic'); setShowLayerMenu(false); }} className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-widest transition-colors", mapControls.activeLayers.has('traffic') ? "bg-sky-400 text-surface" : "text-on-surface/60 hover:bg-white/5")}>
                          <Car className="w-3 h-3" /> Traffic
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button 
                onClick={mapControls.recenter}
                className="p-2 rounded-lg text-on-surface/30 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-all"
                title="Recenter"
              >
                <MapPin className="w-4 h-4" />
              </button>
              <button 
                onClick={mapControls.zoomIn}
                className="p-2 rounded-lg text-on-surface/30 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={mapControls.zoomOut}
                className="p-2 rounded-lg text-on-surface/30 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-all"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            <button 
              onClick={() => {
                setActiveView('settings');
                if (mapControls.mobileActiveView === 'map' && mapControls.toggleMobileView) {
                  mapControls.toggleMobileView();
                }
              }}
              className={cn(
                "hidden md:flex items-center p-2 rounded-lg transition-colors font-bold",
                activeView === 'settings' ? "text-primary-kinetic bg-primary-kinetic/10 shadow-sm" : "text-on-surface/40 hover:text-on-surface/60"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTENT AREA */}
        <motion.div 
          className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden relative pointer-events-auto"
          initial={false}
          animate={{ 
            x: (window.innerWidth < 768 && mapControls.mobileActiveView === 'map') ? '-100%' : '0%',
            opacity: (window.innerWidth < 768 && mapControls.mobileActiveView === 'map') ? 0 : 1
          }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          <AnimatePresence mode="wait">
            {activeView === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div 
                  ref={scrollRef} 
                  onScroll={resetInactivityTimer}
                  className={cn(
                    "flex-1 space-y-6 overflow-y-auto pr-2 custom_scrollbar transition-opacity duration-1000 relative",
                    isInactive ? "opacity-30" : "opacity-100"
                  )}
                  style={lastGeneratedRoute ? {
                    backgroundImage: `${generateRoutePreview(lastGeneratedRoute.path)}`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  } : {}}
                >
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "flex flex-col relative z-10 pointer-events-auto",
                          msg.role === 'user' ? "items-end" : "items-start"
                        )}
                      >
                        <div 
                          className={cn(
                            "p-4 rounded-2xl max-w-[85%] border-l-2 text-sm leading-relaxed",
                            msg.role === 'user' 
                              ? "bg-surface-highest/60 rounded-tr-none border-primary-kinetic/30" 
                              : "bg-primary-kinetic/10 rounded-tl-none border-primary-kinetic backdrop-blur-md"
                          )}
                        >
                          <p className="text-on-surface">{msg.content}</p>
                          {msg.route && (
                            <div className="mt-4 pt-4 border-t border-on-surface/5 space-y-4">
                              <div className="flex justify-between items-end">
                                <div>
                                  <p className="text-[9px] uppercase text-on-surface/40 tracking-widest">Distance</p>
                                  <p className="font-display text-2xl font-black">{msg.route.distanceKm}<span className="text-xs font-normal ml-1">KM</span></p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] uppercase text-on-surface/40 tracking-widest">Elevation</p>
                                  <p className="font-display text-2xl font-black text-primary-kinetic">{msg.route.elevationGainM}<span className="text-xs font-normal ml-1">M</span></p>
                                </div>
                              </div>
                              <div className="h-16 w-full flex items-end gap-[2px]">
                                {msg.route.elevationProfile.map((height, i) => (
                                  <div 
                                    key={i} 
                                    className="flex-1 bg-primary-kinetic/40 rounded-t-[1px] border-t border-primary-kinetic/60"
                                    style={{ height: `${(height / Math.max(...msg.route!.elevationProfile)) * 100}%` }}
                                  />
                                ))}
                              </div>
                              <button 
                                onClick={() => {
                                  if (mapControls.mobileActiveView !== 'map' && mapControls.toggleMobileView) {
                                    mapControls.toggleMobileView();
                                  }
                                  if (mapControls.focusRoute) {
                                    mapControls.focusRoute();
                                  }
                                }}
                                className="w-full flex items-center justify-center gap-2 mt-4 p-3 bg-primary-kinetic text-surface font-bold rounded-xl active:scale-95 transition-all shadow-lg shadow-primary-kinetic/20 hover:bg-primary-kinetic/90"
                              >
                                <Play className="w-4 h-4 fill-surface" />
                                <span>LET'S GO</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] uppercase tracking-widest text-on-surface/30 mt-2">
                          {msg.role === 'assistant' ? 'KINETIC ENGINE • JUST NOW' : msg.timestamp}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isLoading && (
                    <div className="flex flex-col items-start animate-pulse">
                      <div className="bg-primary-kinetic/10 p-4 rounded-2xl rounded-tl-none border-l-2 border-primary-kinetic">
                        <div className="flex gap-1 h-4 items-center">
                          <div className="w-1.5 h-1.5 bg-primary-kinetic rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-primary-kinetic rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-primary-kinetic rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* BIOMETRIC HUD (Compact) */}
                <div className="mt-6 mb-2 flex-shrink-0 flex justify-center pointer-events-auto">
                  <BiometricDashboard onMetricsUpdate={setCurrentBiometrics} />
                </div>

                <div className="mt-6 space-y-4 flex-shrink-0 relative pointer-events-auto">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".gpx,.fit" 
                    onChange={handleFileUpload} 
                  />
                  <AnimatePresence>
                    {showPlusMenu && (
                      <motion.div
                        ref={plusMenuRef}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: -8, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full left-0 mb-2 w-56 glass-panel border border-white/10 rounded-2xl shadow-2xl p-2 z-[70] overflow-hidden bg-surface-low/90 backdrop-blur-xl"
                      >
                        <div className="space-y-1">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-on-surface/70 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-colors"
                          >
                            <FileUp className="w-4 h-4" />
                            <span className="font-medium">Upload GPX / FIT</span>
                          </button>
                          <button 
                            onClick={handleFavorite}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-on-surface/70 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-colors"
                          >
                            <Star className="w-4 h-4" />
                            <span className="font-medium">Favorite Route</span>
                          </button>
                          <button 
                            onClick={handleSetDestination}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-on-surface/70 hover:text-primary-kinetic hover:bg-primary-kinetic/10 transition-colors"
                          >
                            <MapIcon className="w-4 h-4" />
                            <span className="font-medium">Set Destination</span>
                          </button>
                          <div className="h-px bg-white/5 my-1" />
                          <button 
                            onClick={() => { setMessages([]); setShowPlusMenu(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="font-medium">Clear History</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="relative flex items-center bg-surface-low border border-white/10 rounded-xl px-4 py-3 focus-within:border-primary-kinetic/50 transition-all">
                    <button 
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors mr-1",
                        showPlusMenu ? "text-primary-kinetic bg-primary-kinetic/10" : "text-on-surface/40 hover:text-primary-kinetic hover:bg-primary-kinetic/10"
                      )}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <input 
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        resetInactivityTimer();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSend();
                          resetInactivityTimer();
                        }
                      }}
                      className="bg-transparent border-none focus:ring-0 text-sm font-sans text-on-surface placeholder:text-on-surface/30 w-full" 
                      placeholder={isListening ? "Listening..." : "Ask AI Assistant..."} 
                      type="text" 
                    />
                    <button 
                      onClick={toggleVoiceInput} 
                      className={cn(
                        "p-1.5 rounded-lg transition-all relative overflow-hidden",
                        isListening ? "text-red-400 bg-red-400/10" : "text-primary-kinetic hover:bg-primary-kinetic/10"
                      )}
                    >
                      {isListening && (
                        <motion.div
                          layoutId="pulse"
                          className="absolute inset-0 bg-red-400/20"
                          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      <Mic className={cn("w-5 h-5 relative z-10", isListening && "animate-pulse")} />
                    </button>
                    <button onClick={() => handleSend()} className="p-1.5 rounded-lg text-primary-kinetic hover:bg-primary-kinetic/10 transition-colors">
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  
                </div>
              </motion.div>
            )}

            {activeView === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col overflow-hidden pointer-events-auto"
              >
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {rideHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                      <History className="w-12 h-12 mb-4" />
                      <p className="text-sm font-medium">No recorded rides found.<br/>Start your journey to populate neural records.</p>
                    </div>
                  ) : (
                    rideHistory.map((ride) => (
                      <button 
                        key={ride.id}
                        onClick={() => handleHistoryClick(ride)}
                        className="w-full glass-panel p-4 rounded-2xl border border-white/5 hover:border-primary-kinetic/30 hover:bg-primary-kinetic/5 transition-all text-left group relative"
                      >
                        <div className="flex justify-between items-start mb-4 pr-8">
                          <div>
                            <h4 className="font-display font-bold text-on-surface group-hover:text-primary-kinetic transition-colors">{ride.name}</h4>
                            <p className="text-[10px] text-on-surface/40 uppercase tracking-widest">{new Date(ride.createdAt?.toDate?.() || ride.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteHistory(ride.id, e)}
                          className="absolute top-4 right-4 p-2 text-on-surface/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-red-400/10 rounded-lg md:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-primary-kinetic/10 rounded-lg">
                              <Gauge className="w-3 h-3 text-primary-kinetic" />
                            </div>
                            <span className="text-xs font-bold">{ride.distanceKm} KM</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-sky-400/10 rounded-lg">
                              <Mountain className="w-3 h-3 text-sky-400" />
                            </div>
                            <span className="text-xs font-bold">{ride.elevationGainM} M</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeView === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar pointer-events-auto"
              >
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary-kinetic mb-4">Neural Tuning</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 glass-panel rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          {themeProps.isDarkMode ? <Moon className="w-4 h-4 text-on-surface/40" /> : <Sun className="w-4 h-4 text-on-surface/40" />}
                          <span className="text-sm font-medium">Dark Mode Appearance</span>
                        </div>
                        <div 
                          onClick={() => themeProps.setIsDarkMode(!themeProps.isDarkMode)}
                          className={cn(
                            "w-10 h-5 rounded-full relative p-1 cursor-pointer transition-colors",
                            themeProps.isDarkMode ? "bg-primary-kinetic/20" : "bg-on-surface/10"
                          )}
                        >
                          <motion.div 
                            animate={{ x: themeProps.isDarkMode ? 20 : 0 }}
                            className={cn(
                              "w-3 h-3 rounded-full absolute left-1",
                              themeProps.isDarkMode ? "bg-primary-kinetic" : "bg-on-surface/40"
                            )} 
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 glass-panel rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <Heart className="w-4 h-4 text-on-surface/40" />
                          <span className="text-sm font-medium">Auto-Sync Heart Rate</span>
                        </div>
                        <div 
                          onClick={() => setAutoSyncHR(!autoSyncHR)}
                          className={cn(
                            "w-10 h-5 rounded-full relative p-1 cursor-pointer transition-colors",
                            autoSyncHR ? "bg-primary-kinetic/20" : "bg-on-surface/10"
                          )}
                        >
                          <motion.div 
                            animate={{ x: autoSyncHR ? 20 : 0 }}
                            className={cn(
                              "w-3 h-3 rounded-full absolute left-1",
                              autoSyncHR ? "bg-primary-kinetic" : "bg-on-surface/40"
                            )} 
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 glass-panel rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <Timer className="w-4 h-4 text-on-surface/40" />
                          <span className="text-sm font-medium">Recovery Mode Routing</span>
                        </div>
                        <div 
                          onClick={() => setRecoveryMode(!recoveryMode)}
                          className={cn(
                            "w-10 h-5 rounded-full relative p-1 cursor-pointer transition-colors",
                            recoveryMode ? "bg-primary-kinetic/20" : "bg-on-surface/10"
                          )}
                        >
                          <motion.div 
                            animate={{ x: recoveryMode ? 20 : 0 }}
                            className={cn(
                              "w-3 h-3 rounded-full absolute left-1",
                              recoveryMode ? "bg-primary-kinetic" : "bg-on-surface/40"
                            )} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-on-surface/30 mb-4">Metric Configuration</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setUnitSystem('metric')}
                        className={cn(
                          "p-4 glass-panel rounded-2xl text-center transition-all",
                          unitSystem === 'metric' ? "border border-primary-kinetic/30 bg-primary-kinetic/5 text-primary-kinetic" : "border border-white/5 text-on-surface/40 hover:opacity-100"
                        )}
                      >
                        <span className="text-xs font-bold">Metric (km/m)</span>
                      </button>
                      <button 
                        onClick={() => setUnitSystem('imperial')}
                        className={cn(
                          "p-4 glass-panel rounded-2xl text-center transition-all",
                          unitSystem === 'imperial' ? "border border-primary-kinetic/30 bg-primary-kinetic/5 text-primary-kinetic" : "border border-white/5 text-on-surface/40 hover:opacity-100"
                        )}
                      >
                        <span className="text-xs font-bold">Imperial (mi/ft)</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-on-surface/30 mb-4">System</h4>
                    <button 
                      onClick={() => auth.signOut()}
                      className="w-full flex items-center justify-center gap-3 p-4 glass-panel rounded-2xl border border-white/5 text-red-400 hover:bg-red-400/5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm font-bold">Destroy Session Data</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* FLOATING MOBILE DASHBOARD (MAP VIEW) */}
      {mapControls.mobileActiveView === 'map' && (
        <div className="md:hidden absolute bottom-8 left-0 right-0 flex justify-center z-[100] pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-4">
          <div className="glass-panel px-6 py-3 rounded-[24px] border border-white/10 shadow-2xl bg-surface/70 backdrop-blur-xl">
            <BiometricDashboard onMetricsUpdate={setCurrentBiometrics} />
          </div>
        </div>
      )}
    </div>
  );
}
