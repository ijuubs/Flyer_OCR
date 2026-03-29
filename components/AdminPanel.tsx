'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import OCRProcessor from './OCRProcessor';
import AdminStores from './AdminStores';
import AdminDatabase from './AdminDatabase';
import Auth from './Auth';
import { LayoutDashboard, ScanLine, Store, Database, ShieldCheck, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

type AdminTab = 'dashboard' | 'ocr' | 'stores' | 'database';

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Check if user is admin
        // For now, we'll check the email or a role in Firestore
        if (user.email === 'vitideals@gmail.com' && user.emailVerified) {
          setIsAdmin(true);
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            setIsAdmin(userDoc.exists() && userDoc.data().role === 'admin');
          } catch (error) {
            console.error('Error checking admin status:', error);
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-zinc-300" />
        <p className="text-zinc-500 font-medium">Verifying admin access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 max-w-md mx-auto text-center">
        <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mb-2">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Admin Access Only</h2>
          <p className="text-zinc-500 font-medium">
            This area is restricted to authorized administrators. Please sign in with an admin account to continue.
          </p>
        </div>
        <Auth />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-zinc-900 p-8 rounded-[40px] text-white shadow-xl shadow-zinc-900/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display tracking-tight">Admin Dashboard</h2>
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Authenticated as {user.displayName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 overflow-x-auto scrollbar-hide">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
            { id: 'ocr', icon: ScanLine, label: 'Flyer Upload' },
            { id: 'stores', icon: Store, label: 'Stores' },
            { id: 'database', icon: Database, label: 'Database' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-white text-zinc-900 shadow-lg" 
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Admin Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[40px] border border-zinc-200 shadow-sm">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Total Flyers</p>
                <p className="text-4xl font-black text-zinc-900">124</p>
              </div>
              <div className="bg-white p-8 rounded-[40px] border border-zinc-200 shadow-sm">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Active Deals</p>
                <p className="text-4xl font-black text-zinc-900">1,245</p>
              </div>
              <div className="bg-white p-8 rounded-[40px] border border-zinc-200 shadow-sm">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Needs Review</p>
                <p className="text-4xl font-black text-emerald-500">12</p>
              </div>
            </div>
          )}
          
          {activeTab === 'ocr' && <OCRProcessor />}
          
          {activeTab === 'stores' && <AdminStores />}
          
          {activeTab === 'database' && <AdminDatabase />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
