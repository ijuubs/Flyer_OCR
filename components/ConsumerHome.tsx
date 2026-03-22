'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { Search, Flame, Tag, ChevronRight, ShoppingBasket, Clock, MapPin, Plus, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  productId: string;
  storeId: string;
  price: number;
  originalPrice?: number;
  unit: string;
  isSpecial: boolean;
  productImageUrl?: string;
  extractedAt: any;
  storeName?: string;
  productName?: string;
  validityEnd?: any;
}

const CATEGORIES = [
  { id: 'meat', name: 'Meat', icon: '🥩' },
  { id: 'dairy', name: 'Dairy', icon: '🥛' },
  { id: 'vegetables', name: 'Vegetables', icon: '🥦' },
  { id: 'pantry', name: 'Pantry', icon: '🥫' },
  { id: 'household', name: 'Household', icon: '🧹' },
];

export default function ConsumerHome() {
  const [searchQuery, setSearchQuery] = useState('');
  const [topDeals, setTopDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    // Fetch top deals (ranked by discount or recency for now)
    const q = query(
      collection(db, 'prices'),
      orderBy('extractedAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dealsData: Deal[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productId: data.productId,
          storeId: data.storeId,
          price: data.price,
          originalPrice: data.originalPrice,
          unit: data.unit,
          isSpecial: data.isSpecial,
          productImageUrl: data.productImageUrl,
          extractedAt: data.extractedAt,
          storeName: data.storeName || 'Unknown Store',
          productName: data.productName || 'Unknown Product',
          validityEnd: data.validityEnd
        };
      });
      
      setTopDeals(dealsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching deals:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addToLocalList = (deal: Deal) => {
    const currentList = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    const newItem = {
      id: deal.id,
      name: deal.productName,
      price: deal.price,
      storeName: deal.storeName,
      addedAt: new Date().toISOString()
    };
    localStorage.setItem('viti_deals_list', JSON.stringify([...currentList, newItem]));
    // Optional: Show toast
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-zinc-900 p-8 text-white">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold font-display tracking-tight mb-2">
            Best Deals in Fiji This Week
          </h2>
          <p className="text-zinc-400 text-sm font-medium">
            Updated from latest supermarket flyers across the islands.
          </p>
          
          <div className="mt-8 relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search for chicken, milk, rice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all backdrop-blur-md"
            />
          </div>
        </div>
        
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full" />
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-zinc-400" />
            Categories
          </h3>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all font-semibold text-sm",
                selectedCategory === cat.id 
                  ? "bg-zinc-900 border-zinc-900 text-white shadow-lg shadow-zinc-900/20" 
                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
              )}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {/* Top Deals */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            🔥 Top Deals
          </h3>
          <button className="text-sm font-bold text-zinc-500 flex items-center gap-1 hover:text-zinc-900 transition-colors">
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-64 bg-zinc-100 rounded-3xl animate-pulse" />
            ))
          ) : (
            topDeals.map((deal) => (
              <motion.div
                key={deal.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group bg-white rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl hover:border-zinc-300 transition-all overflow-hidden flex flex-col"
              >
                {/* Image Container */}
                <div className="relative aspect-[4/3] bg-zinc-50 overflow-hidden">
                  {deal.productImageUrl ? (
                    <Image
                      src={deal.productImageUrl}
                      alt={deal.productName || ''}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBasket className="w-12 h-12 text-zinc-200" />
                    </div>
                  )}
                  
                  {/* Discount Badge */}
                  {deal.originalPrice && (
                    <div className="absolute top-4 left-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                      ↓ {Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100)}%
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex-grow flex flex-col">
                  <div className="mb-3">
                    <h4 className="font-bold text-zinc-900 text-lg line-clamp-1">{deal.productName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-black text-zinc-900">${deal.price.toFixed(2)}</span>
                      <span className="text-sm font-bold text-zinc-400">/ {deal.unit}</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                      <MapPin className="w-3.5 h-3.5" />
                      Store: {deal.storeName}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                      <Clock className="w-3.5 h-3.5" />
                      Valid: {deal.validityEnd ? new Date(deal.validityEnd.seconds * 1000).toLocaleDateString() : 'Limited Time'}
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <button 
                      onClick={() => addToLocalList(deal)}
                      className="flex-grow flex items-center justify-center gap-2 bg-zinc-900 text-white py-3 rounded-2xl text-sm font-bold hover:bg-zinc-800 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Add to List
                    </button>
                    <button className="w-12 h-12 flex items-center justify-center bg-zinc-100 text-zinc-900 rounded-2xl hover:bg-zinc-200 transition-all">
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
