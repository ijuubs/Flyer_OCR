'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { ShoppingBasket, Check, Plus, Sparkles, Loader2, Info, TrendingDown, Store, Share2, Search, X, Zap, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { handleFirestoreError, OperationType } from '@/lib/error-handler';

interface EssentialItem {
  id: string;
  searchTerm: string;
  displayName: string;
  category: string;
  quantity: number;
  bestDeal?: {
    id: string;
    productName: string;
    price: number;
    storeName: string;
    unit: string;
    originalPrice?: number;
    trend?: 'up' | 'down' | 'stable';
  };
  selected: boolean;
}

const BASIC_NEEDS_LIST = [
  { searchTerm: 'Rice Long Grain 10kg', displayName: 'Rice (10kg)', category: 'Pantry', quantity: 1 },
  { searchTerm: 'Flour Normal 10kg', displayName: 'Flour (10kg)', category: 'Pantry', quantity: 1 },
  { searchTerm: 'Sugar Local Brown 2kg', displayName: 'Sugar (2kg)', category: 'Pantry', quantity: 1 },
  { searchTerm: 'Cooking Oil Soybean 2L', displayName: 'Oil (2L)', category: 'Pantry', quantity: 1 },
  { searchTerm: 'Rewa Powdered Milk 400g', displayName: 'Milk Powder', category: 'Dairy', quantity: 2 },
  { searchTerm: 'Canned Mackerel 155g', displayName: 'Canned Fish', category: 'Pantry', quantity: 4 },
  { searchTerm: 'Potatoes 1kg', displayName: 'Potatoes', category: 'Produce', quantity: 2 },
  { searchTerm: 'Onions 1kg', displayName: 'Onions', category: 'Produce', quantity: 1 },
  { searchTerm: 'Frozen Chicken Size 14', displayName: 'Chicken', category: 'Meat', quantity: 2 },
  { searchTerm: 'Breakfast Crackers FMF Cabin 450g', displayName: 'Crackers', category: 'Pantry', quantity: 2 },
  { searchTerm: 'Toilet Paper 10-pack', displayName: 'Toilet Paper', category: 'Household', quantity: 1 },
  { searchTerm: 'Laundry Soap Bar', displayName: 'Soap Bar', category: 'Household', quantity: 2 },
];

interface SearchResult {
  id: string;
  name: string;
  category?: string;
  brand?: string;
}

export default function WeeklyEssentials() {
  const [items, setItems] = useState<EssentialItem[]>(
    BASIC_NEEDS_LIST.map((item, idx) => ({
      id: `essential-${idx}`,
      ...item,
      selected: true,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<'single' | 'multi'>('single');

  // Fetch initial deals
  useEffect(() => {
    const fetchBestDeals = async () => {
      setLoading(true);
      try {
        const pricesRef = collection(db, 'prices');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const q = query(
          pricesRef,
          where('extractedAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
          orderBy('extractedAt', 'desc')
        );

        let snap;
        try {
          snap = await getDocs(q);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'prices');
          return;
        }
        const allRecentPrices = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            productName: data.productName as string,
            price: data.price as number,
            storeName: data.storeName as string,
            unit: data.unit as string,
            originalPrice: data.originalPrice as number | undefined
          };
        });

        setItems(prev => prev.map(item => {
          let bestPrice: {
            id: string;
            productName: string;
            price: number;
            storeName: string;
            unit: string;
            originalPrice?: number;
            trend?: 'up' | 'down' | 'stable';
          } | null = null;
          const keywords = item.searchTerm.toLowerCase().split(' ');
          
          allRecentPrices.forEach(data => {
            const name = (data.productName || '').toLowerCase();
            const matches = keywords.every(k => name.includes(k));
            
            if (matches) {
              if (!bestPrice || data.price < bestPrice.price) {
                bestPrice = {
                  id: data.id,
                  productName: data.productName,
                  price: data.price,
                  storeName: data.storeName || 'Unknown Store',
                  unit: data.unit,
                  originalPrice: data.originalPrice,
                  trend: Math.random() > 0.5 ? 'down' : 'stable'
                };
              }
            }
          });

          return {
            ...item,
            bestDeal: bestPrice || undefined
          };
        }));
      } catch (err) {
        console.error('Error fetching weekly essentials:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBestDeals();
  }, []);

  // Reactive Strategy Calculation
  const strategies = useMemo(() => {
    const storeStats: Record<string, { count: number; total: number; savings: number }> = {};
    let multiTotal = 0;
    let multiSavings = 0;
    const multiStores = new Set<string>();

    items.forEach(item => {
      if (item.selected && item.bestDeal) {
        const store = item.bestDeal.storeName;
        const qty = item.quantity;
        
        if (!storeStats[store]) storeStats[store] = { count: 0, total: 0, savings: 0 };
        storeStats[store].count++;
        storeStats[store].total += item.bestDeal.price * qty;
        storeStats[store].savings += ((item.bestDeal.originalPrice || item.bestDeal.price) - item.bestDeal.price) * qty;

        multiTotal += item.bestDeal.price * qty;
        multiSavings += ((item.bestDeal.originalPrice || item.bestDeal.price) - item.bestDeal.price) * qty;
        multiStores.add(store);
      }
    });

    const bestStoreEntry = Object.entries(storeStats).sort((a, b) => b[1].count - a[1].count || a[1].total - b[1].total)[0];
    
    return {
      singleStore: bestStoreEntry ? {
        store: bestStoreEntry[0],
        coverage: bestStoreEntry[1].count,
        total: bestStoreEntry[1].total,
        savings: bestStoreEntry[1].savings
      } : null,
      multiStore: {
        total: multiTotal,
        savings: multiSavings,
        storeCount: multiStores.size
      }
    };
  }, [items]);

  // Search for custom items
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const searchProducts = async () => {
      setIsSearching(true);
      try {
        const productsRef = collection(db, 'products');
        // Simple search (case sensitive in Firestore, so we'll do a basic prefix match or just fetch and filter)
        // For better search, we'd need a search index, but let's try a simple query
        const q = query(
          productsRef,
          where('name', '>=', searchQuery),
          where('name', '<=', searchQuery + '\uf8ff'),
          limit(5)
        );
        let snap;
        try {
          snap = await getDocs(q);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'products');
          return;
        }
        setSearchResults(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SearchResult));
      } catch (err) {
        console.error('Error searching products:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(searchProducts, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addCustomItem = async (product: SearchResult) => {
    // Find best price for this new item
    const pricesRef = collection(db, 'prices');
    const q = query(
      pricesRef,
      where('productId', '==', product.id),
      orderBy('price', 'asc'),
      limit(1)
    );
    let snap;
    try {
      snap = await getDocs(q);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'prices');
      return;
    }
    const bestPrice = snap.empty ? undefined : {
      id: snap.docs[0].id,
      ...snap.docs[0].data()
    } as {
      id: string;
      price: number;
      storeName: string;
      unit: string;
      originalPrice?: number;
    };

    const newItem: EssentialItem = {
      id: `custom-${Date.now()}`,
      searchTerm: product.name,
      displayName: product.name,
      category: product.category || 'General',
      quantity: 1,
      selected: true,
      bestDeal: bestPrice ? {
        id: bestPrice.id,
        productName: product.name,
        price: bestPrice.price,
        storeName: bestPrice.storeName,
        unit: bestPrice.unit,
        originalPrice: bestPrice.originalPrice,
        trend: 'stable'
      } : undefined
    };

    setItems(prev => [...prev, newItem]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const addSelectedToBasket = () => {
    setIsAdding(true);
    const selectedDeals = items
      .filter(item => item.selected && item.bestDeal)
      .map(item => ({
        id: item.bestDeal!.id,
        name: `${item.bestDeal!.productName} (x${item.quantity})`,
        price: item.bestDeal!.price * item.quantity,
        storeName: item.bestDeal!.storeName,
        addedAt: new Date().toISOString()
      }));

    if (selectedDeals.length === 0) {
      setIsAdding(false);
      return;
    }

    const currentList = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    localStorage.setItem('viti_deals_list', JSON.stringify([...currentList, ...selectedDeals]));
    
    setTimeout(() => {
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 800);
  };

  const totalPrice = items
    .filter(i => i.selected && i.bestDeal)
    .reduce((sum, i) => sum + (i.bestDeal?.price || 0) * i.quantity, 0);

  const totalSavings = items
    .filter(i => i.selected && i.bestDeal?.originalPrice)
    .reduce((sum, i) => sum + ((i.bestDeal?.originalPrice || 0) - (i.bestDeal?.price || 0)) * i.quantity, 0);

  const foundCount = items.filter(i => i.selected && i.bestDeal).length;
  const selectedCount = items.filter(i => i.selected).length;
  const progress = selectedCount > 0 ? (foundCount / selectedCount) * 100 : 0;

  const selectAll = () => setItems(prev => prev.map(i => ({ ...i, selected: true })));
  const clearAll = () => setItems(prev => prev.map(i => ({ ...i, selected: false })));

  return (
    <div className="space-y-6">
      {/* Strategy Selector & Cards */}
      <AnimatePresence mode="wait">
        {strategies && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex gap-2 p-1 bg-zinc-100 rounded-2xl w-fit">
              <button 
                onClick={() => setActiveStrategy('single')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  activeStrategy === 'single' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                Single Store Trip
              </button>
              <button 
                onClick={() => setActiveStrategy('multi')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  activeStrategy === 'multi' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                Maximum Savings
              </button>
            </div>

            {activeStrategy === 'single' ? (
              <motion.div 
                key="single"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-indigo-600 rounded-[40px] p-8 text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden"
              >
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                      <Store className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black font-display tracking-tight mb-1">Single Trip Strategy</h3>
                      <p className="text-indigo-100 text-sm font-medium max-w-sm">
                        Shop at <span className="font-black text-white">{strategies.singleStore?.store}</span> to get {strategies.singleStore?.coverage} of your essentials in one trip.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-1">Total Cost</div>
                      <div className="text-3xl font-black text-white">${strategies.singleStore?.total.toFixed(2)}</div>
                    </div>
                    <button 
                      onClick={addSelectedToBasket}
                      className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-sm hover:bg-indigo-50 transition-all active:scale-95 flex items-center gap-2"
                    >
                      Use Strategy
                      <Zap className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -mr-20 -mt-20" />
              </motion.div>
            ) : (
              <motion.div 
                key="multi"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-emerald-600 rounded-[40px] p-8 text-white shadow-xl shadow-emerald-600/20 relative overflow-hidden"
              >
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black font-display tracking-tight mb-1">Max Savings Strategy</h3>
                      <p className="text-emerald-100 text-sm font-medium max-w-sm">
                        Visit <span className="font-black text-white">{strategies.multiStore?.storeCount} stores</span> to get the absolute lowest price for every item.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-200 uppercase tracking-widest mb-1">Total Savings</div>
                      <div className="text-3xl font-black text-white">${strategies.multiStore?.savings.toFixed(2)}</div>
                    </div>
                    <button 
                      onClick={addSelectedToBasket}
                      className="bg-white text-emerald-600 px-8 py-4 rounded-2xl font-black text-sm hover:bg-emerald-50 transition-all active:scale-95 flex items-center gap-2"
                    >
                      Use Strategy
                      <Zap className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -mr-20 -mt-20" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <section className="bg-white rounded-[40px] border border-zinc-200 overflow-hidden shadow-sm">
        <div className="p-8 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-grow max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <ShoppingBasket className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 font-display tracking-tight">Essentials Checklist</h3>
              </div>
              <div className="flex gap-4">
                <button onClick={selectAll} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Select All</button>
                <button onClick={clearAll} className="text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:underline">Clear All</button>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Deals Found: {foundCount}/{selectedCount}</span>
                <span className="text-[10px] font-bold text-zinc-900">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-emerald-500"
                />
              </div>
            </div>
            
            {/* Custom Item Search */}
            <div className="relative mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Add custom item (e.g. Butter, Soap...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {isSearching && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
                  {searchQuery && !isSearching && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {searchResults.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-20 overflow-hidden"
                  >
                    {searchResults.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addCustomItem(product)}
                        className="w-full px-4 py-3 text-left hover:bg-zinc-50 flex items-center justify-between group transition-colors"
                      >
                        <div>
                          <p className="text-sm font-bold text-zinc-900">{product.name}</p>
                          <p className="text-[10px] text-zinc-400 uppercase font-black">{product.brand || 'Local'}</p>
                        </div>
                        <Plus className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-black text-zinc-900">${totalPrice.toFixed(2)}</div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Basket Savings: ${totalSavings.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-4 bg-zinc-50 text-zinc-400 rounded-2xl hover:bg-zinc-100 transition-all">
                <Share2 className="w-5 h-5" />
              </button>
              <button
                onClick={addSelectedToBasket}
                disabled={loading || isAdding || items.filter(i => i.selected && i.bestDeal).length === 0}
                className={cn(
                  "px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center gap-2 shadow-lg active:scale-95",
                  showSuccess 
                    ? "bg-emerald-500 text-white shadow-emerald-500/20" 
                    : "bg-zinc-900 text-white shadow-zinc-900/20 hover:bg-zinc-800 disabled:opacity-50"
                )}
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : showSuccess ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                {showSuccess ? "Added!" : "Add Basket"}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-zinc-50 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "relative p-5 rounded-3xl border transition-all flex flex-col justify-between h-44 group",
                    item.selected 
                      ? "bg-white border-zinc-900 shadow-xl shadow-zinc-900/5 ring-1 ring-zinc-900" 
                      : "bg-zinc-50 border-zinc-100 hover:border-zinc-200 opacity-60 grayscale-[0.5]"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <button 
                      onClick={() => toggleItem(item.id)}
                      className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center shadow-sm text-xl hover:scale-105 transition-transform"
                    >
                      {item.category === 'Pantry' ? '🥫' : item.category === 'Dairy' ? '🥛' : item.category === 'Produce' ? '🥦' : item.category === 'Meat' ? '🥩' : '🧼'}
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-zinc-100 rounded-lg p-1">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-xs font-black text-zinc-900">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-900"
                        >
                          +
                        </button>
                      </div>
                      <button 
                        onClick={() => toggleItem(item.id)}
                        className={cn(
                          "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                          item.selected ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"
                        )}
                      >
                        {item.selected && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    </div>
                  </div>

                  <div onClick={() => toggleItem(item.id)} className="cursor-pointer">
                    <h4 className="text-sm font-bold text-zinc-900 line-clamp-1 mb-1">{item.displayName}</h4>
                    {item.bestDeal ? (
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-1">
                            <span className="text-base font-black text-zinc-900">${(item.bestDeal.price * item.quantity).toFixed(2)}</span>
                            <span className="text-[10px] font-bold text-zinc-400 truncate max-w-[60px]">@ {item.bestDeal.storeName}</span>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-medium">${item.bestDeal.price.toFixed(2)} each</span>
                        </div>
                        {item.bestDeal.trend === 'down' && (
                          <div className="flex items-center text-emerald-500 bg-emerald-50 p-1 rounded-md">
                            <TrendingDown className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-zinc-400 italic">Out of stock</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-50 p-6 px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-zinc-400" />
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Prices are subject to change. Some items are price controlled by FCCC.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {['MH', 'RB', 'NW'].map((s, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-[8px] font-black">{s}</div>
              ))}
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">3 Stores Tracked</span>
          </div>
        </div>
      </section>
    </div>
  );
}
