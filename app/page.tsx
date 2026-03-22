'use client';

import { useState } from 'react';
import Auth from '@/components/Auth';
import OCRProcessor from '@/components/OCRProcessor';
import PriceDashboard from '@/components/PriceDashboard';
import { ShoppingCart, LayoutDashboard, ScanLine, Info, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ocr'>('dashboard');

  return (
    <main className="min-h-screen pb-20">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display text-zinc-900 tracking-tight leading-none">VitiDeals</h1>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mt-1">Fiji Price Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'dashboard' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('ocr')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'ocr' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <ScanLine className="w-4 h-4" />
                OCR Upload
              </button>
            </nav>
            <Auth />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white border-b border-zinc-200 py-12 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-4xl sm:text-5xl font-bold font-display text-zinc-900 tracking-tight mb-4">
              Track Supermarket Prices <br />
              <span className="text-zinc-400 italic">Across Fiji with AI.</span>
            </h2>
            <p className="text-lg text-zinc-500 leading-relaxed">
              Upload supermarket flyers, and our AI will automatically extract product details, 
              prices, and validity dates. Compare prices across MH, RB Patel, NewWorld, and more.
            </p>
            
            <div className="flex flex-wrap gap-4 mt-8">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-medium text-zinc-600">
                <MapPin className="w-3 h-3" />
                Suva, Nadi, Lautoka & More
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-medium text-zinc-600">
                <Info className="w-3 h-3" />
                Powered by Gemini 1.5 Flash
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'dashboard' ? <PriceDashboard /> : <OCRProcessor />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-white/80 backdrop-blur-lg border border-zinc-200 p-1.5 rounded-2xl shadow-xl">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'dashboard' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/20' : 'text-zinc-500'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('ocr')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'ocr' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/20' : 'text-zinc-500'
            }`}
          >
            <ScanLine className="w-4 h-4" />
            OCR
          </button>
        </div>
      </div>
    </main>
  );
}
