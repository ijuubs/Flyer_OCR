'use client';

import { useState, useEffect } from 'react';
import { 
  Home as HomeIcon, 
  Search, 
  TrendingUp, 
  ShoppingCart, 
  ShieldCheck, 
  Menu, 
  X,
  Zap,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import ConsumerHome from '@/components/ConsumerHome';
import PriceComparison from '@/components/PriceComparison';
import Trends from '@/components/Trends';
import ShoppingList from '@/components/ShoppingList';
import AdminPanel from '@/components/AdminPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import { auth } from '@/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

type Tab = 'home' | 'compare' | 'trends' | 'list' | 'admin';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const navItems = [
    { id: 'home', icon: HomeIcon, label: 'Home' },
    { id: 'compare', icon: Search, label: 'Compare' },
    { id: 'trends', icon: TrendingUp, label: 'Trends' },
    { id: 'list', icon: ShoppingCart, label: 'My List' },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setActiveTab('home')}
          >
            <div className="w-10 h-10 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/20 group-hover:scale-105 transition-transform duration-300">
              <Zap className="w-6 h-6 text-emerald-400 fill-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-zinc-900 leading-none">VITIDEALS</h1>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">Fiji&apos;s Smartest Deals</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                  activeTab === item.id 
                    ? "bg-white text-zinc-900 shadow-sm" 
                    : "text-zinc-400 hover:text-zinc-600 hover:bg-white/50"
                )}
              >
                <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-emerald-500" : "text-zinc-400")} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('admin')}
              className={cn(
                "hidden md:flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                activeTab === 'admin'
                  ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/20"
                  : "bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-900 hover:text-zinc-900"
              )}
            >
              <ShieldCheck className="w-4 h-4" />
              Admin
            </button>

            <button 
              className="md:hidden w-12 h-12 flex items-center justify-center bg-zinc-100 rounded-2xl text-zinc-600 hover:bg-zinc-200 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-white pt-24 px-6 md:hidden"
          >
            <div className="space-y-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as Tab);
                    setIsMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-6 rounded-3xl text-lg font-bold transition-all",
                    activeTab === item.id 
                      ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/20" 
                      : "bg-zinc-50 text-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <item.icon className="w-6 h-6" />
                    {item.label}
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-50" />
                </button>
              ))}
              <div className="pt-8 border-t border-zinc-100">
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setIsMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-6 rounded-3xl text-lg font-bold transition-all",
                    activeTab === 'admin'
                      ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20"
                      : "bg-zinc-50 text-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <ShieldCheck className="w-6 h-6" />
                    Admin Portal
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-50" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              {activeTab === 'home' && <ConsumerHome />}
              {activeTab === 'compare' && <PriceComparison />}
              {activeTab === 'trends' && <Trends />}
              {activeTab === 'list' && <ShoppingList />}
              {activeTab === 'admin' && <AdminPanel />}
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-900 rounded-2xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-emerald-400 fill-emerald-400" />
              </div>
              <h1 className="text-xl font-black tracking-tighter text-zinc-900">VITIDEALS</h1>
            </div>
            <p className="text-zinc-500 text-sm max-w-sm font-medium leading-relaxed">
              Fiji&apos;s first AI-powered supermarket price comparison engine. 
              Helping you save money on every grocery run with real-time flyer data.
            </p>
          </div>
          
          <div>
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Quick Links</h4>
            <ul className="space-y-4">
              {navItems.map(item => (
                <li key={item.id}>
                  <button 
                    onClick={() => setActiveTab(item.id as Tab)}
                    className="text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Legal</h4>
            <ul className="space-y-4">
              <li><button className="text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors">Privacy Policy</button></li>
              <li><button className="text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors">Terms of Service</button></li>
              <li><button className="text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors">Contact Us</button></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-16 mt-16 border-t border-zinc-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">© 2026 VitiDeals Fiji. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
              <MapPin className="w-4 h-4" />
              Suva, Fiji
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
