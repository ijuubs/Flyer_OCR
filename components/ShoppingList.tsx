'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Calculator, ArrowRight, ShoppingBasket, CheckCircle2, Loader2, Info, Share2, Copy, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface ListItem {
  id: string;
  name: string;
  price: number;
  storeName: string;
  addedAt: string;
  checked?: boolean;
}

export default function ShoppingList() {
  const [state, setState] = useState({
    list: [] as ListItem[],
    loading: true
  });
  const [copied, setCopied] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const savedList: ListItem[] = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    setTimeout(() => {
      setState({ list: savedList, loading: false });
    }, 0);
  }, []);

  const { list, loading } = state;

  const saveList = (newList: ListItem[]) => {
    localStorage.setItem('viti_deals_list', JSON.stringify(newList));
    setState(prev => ({ ...prev, list: newList }));
  };

  const clearList = () => {
    saveList([]);
    setShowClearConfirm(false);
  };

  const removeItem = (id: string) => {
    const newList = list.filter(item => item.id !== id);
    saveList(newList);
  };

  const toggleCheck = (id: string) => {
    const newList = list.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    saveList(newList);
  };

  const copyToClipboard = () => {
    const text = list.map(item => 
      `${item.checked ? '[x]' : '[ ]'} ${item.name} - $${item.price.toFixed(2)} @ ${item.storeName}`
    ).join('\n');
    
    navigator.clipboard.writeText(`My VitiDeals Shopping List:\n\n${text}\n\nTotal: $${totalPrice.toFixed(2)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group items by store
  const groupedItems = list.reduce((acc, item) => {
    if (!acc[item.storeName]) acc[item.storeName] = [];
    acc[item.storeName].push(item);
    return acc;
  }, {} as Record<string, ListItem[]>);

  const stores = Object.keys(groupedItems);
  const totalPrice = list.reduce((sum, item) => sum + item.price, 0);
  const checkedPrice = list.filter(i => i.checked).reduce((sum, item) => sum + item.price, 0);
  const progress = list.length > 0 ? (list.filter(i => i.checked).length / list.length) * 100 : 0;

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-300" /></div>;

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 font-display tracking-tight flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-indigo-600" />
            Shopping List
          </h2>
          <p className="text-sm text-zinc-500 font-medium mt-1">
            {list.length} items across {stores.length} stores
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {list.length > 0 && (
            <>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 rounded-2xl text-sm font-bold transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy List'}
              </button>
              {showClearConfirm ? (
                <div className="flex items-center gap-2 bg-red-50 p-1 rounded-2xl border border-red-100">
                  <span className="text-[10px] font-black text-red-600 uppercase px-2">Clear all?</span>
                  <button
                    onClick={clearList}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-4 py-2 bg-white text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-100 transition-all border border-zinc-200"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl text-sm font-bold transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
          <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center shadow-sm mb-8">
            <ShoppingBasket className="w-12 h-12 text-zinc-200" />
          </div>
          <h3 className="text-2xl font-black text-zinc-900 mb-2 font-display">Your list is empty</h3>
          <p className="text-zinc-500 text-sm max-w-xs text-center font-medium">
            Browse deals and add them here to build your smart shopping trip.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List Items Grouped by Store */}
          <div className="lg:col-span-2 space-y-8">
            {stores.map((store) => (
              <div key={store} className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-600" />
                  <h3 className="text-lg font-black text-zinc-900 font-display tracking-tight uppercase">{store}</h3>
                  <span className="text-xs font-bold text-zinc-400 ml-auto">
                    {groupedItems[store].length} items
                  </span>
                </div>
                
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {groupedItems[store].map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "bg-white p-5 rounded-3xl border transition-all flex items-center gap-4 group",
                          item.checked ? "border-zinc-100 opacity-60" : "border-zinc-200 shadow-sm hover:border-indigo-200"
                        )}
                      >
                        <button
                          onClick={() => toggleCheck(item.id)}
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                            item.checked 
                              ? "bg-emerald-500 text-white" 
                              : "bg-zinc-50 text-zinc-300 border border-zinc-100 group-hover:border-indigo-200"
                          )}
                        >
                          <CheckCircle2 className="w-6 h-6" />
                        </button>
                        
                        <div className="flex-grow">
                          <h4 className={cn(
                            "font-bold text-zinc-900 transition-all",
                            item.checked && "line-through text-zinc-400"
                          )}>
                            {item.name}
                          </h4>
                        </div>
                        
                        <div className="text-right flex flex-col items-end gap-1">
                          <div className="text-lg font-black text-zinc-900">${item.price.toFixed(2)}</div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Sidebar */}
          <div className="space-y-6">
            <div className="bg-zinc-900 rounded-[40px] p-8 text-white shadow-xl shadow-zinc-900/20 sticky top-24">
              <div className="flex items-center gap-2 mb-8">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-black font-display tracking-tight">Trip Summary</h3>
              </div>

              <div className="space-y-6 mb-10">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total</div>
                    <div className="text-xl font-black">${totalPrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Spent</div>
                    <div className="text-xl font-black text-emerald-400">${checkedPrice.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Store Route</h4>
                <div className="space-y-3">
                  {stores.map((store, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-xs font-black">
                        {idx + 1}
                      </div>
                      <span className="font-bold text-sm truncate">{store}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-600 ml-auto" />
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={copyToClipboard}
                className="w-full mt-10 py-5 bg-white text-zinc-900 rounded-2xl font-black text-sm hover:bg-zinc-100 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {copied ? 'Copied to Clipboard!' : 'Share Shopping List'}
                {!copied && <Share2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-[32px] p-8 flex items-start gap-4">
              <Info className="w-6 h-6 text-zinc-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                Your shopping list is saved locally. Mark items as you shop to track your spending in real-time.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
