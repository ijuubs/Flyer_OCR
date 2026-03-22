'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Calculator, MapPin, ArrowRight, ShoppingBasket, CheckCircle2, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface ListItem {
  id: string;
  name: string;
  price: number;
  storeName: string;
  addedAt: string;
}

export default function ShoppingList() {
  const [list, setList] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We use useEffect to avoid SSR mismatch with localStorage
    const savedList = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    const timer = setTimeout(() => {
      setList(savedList);
      setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const clearList = () => {
    localStorage.setItem('viti_deals_list', '[]');
    setList([]);
  };

  const removeItem = (id: string) => {
    const newList = list.filter(item => item.id !== id);
    localStorage.setItem('viti_deals_list', JSON.stringify(newList));
    setList(newList);
  };

  // Calculate best plan
  const stores = Array.from(new Set(list.map(item => item.storeName)));
  const totalSavings = list.length * 2.45; // Mock savings calculation
  const totalPrice = list.reduce((sum, item) => sum + item.price, 0);

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-300" /></div>;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-zinc-400" />
          My Shopping List
        </h2>
        {list.length > 0 && (
          <button
            onClick={clearList}
            className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl text-sm font-bold transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Clear List
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6">
            <ShoppingBasket className="w-10 h-10 text-zinc-200" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-2">Your list is empty</h3>
          <p className="text-zinc-500 text-sm max-w-xs text-center">
            Add deals from the Home or Compare screens to build your shopping list.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List Items */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence initial={false}>
              {list.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-zinc-900 transition-colors">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-zinc-900">{item.name}</h4>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.storeName}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-zinc-900">${item.price.toFixed(2)}</div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Best Plan / Summary */}
          <div className="space-y-6">
            <div className="bg-zinc-900 rounded-[40px] p-8 text-white shadow-xl shadow-zinc-900/20">
              <div className="flex items-center gap-2 mb-8">
                <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold font-display tracking-tight">Best Plan</h3>
              </div>

              <div className="space-y-6 mb-8">
                {stores.map((store, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-1">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{store}</p>
                      <p className="text-xs text-zinc-400 font-medium">
                        {list.filter(i => i.storeName === store).length} items to buy here
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Price</span>
                  <span className="text-xl font-black">${totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400">
                  <span className="text-xs font-bold uppercase tracking-widest">Est. Savings</span>
                  <span className="text-xl font-black">-${totalSavings.toFixed(2)}</span>
                </div>
              </div>

              <button className="w-full mt-8 py-4 bg-white text-zinc-900 rounded-2xl font-black text-sm hover:bg-zinc-100 transition-all active:scale-95 flex items-center justify-center gap-2">
                Recalculate
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6 flex items-start gap-3">
              <Info className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                This list is stored locally on your device. It will not be synced across devices or browsers.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
