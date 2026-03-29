'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { Search, Flame, Tag, ChevronRight, ShoppingBasket, Plus, Fuel } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import WeeklyEssentials from './WeeklyEssentials';
import ProductCard, { Deal } from './ProductCard';

const CATEGORIES = [
  { id: 'Dairy', name: 'Dairy', icon: '🥛' },
  { id: 'Meat', name: 'Meat', icon: '🥩' },
  { id: 'Pantry', name: 'Pantry', icon: '🥫' },
  { id: 'Household', name: 'Household', icon: '🧹' },
  { id: 'Produce', name: 'Produce', icon: '🥦' },
  { id: 'Frozen', name: 'Frozen', icon: '🧊' },
  { id: 'Beverages', name: 'Beverages', icon: '🥤' },
  { id: 'Snacks', name: 'Snacks', icon: '🥨' },
  { id: 'Household Supplies', name: 'Supplies', icon: '🧼' },
  { id: 'Personal Care', name: 'Personal', icon: '🧴' },
];

interface ComparisonResult {
  name: string;
  price: number;
  dist: number;
  fuel: number;
  total: number;
  recommended: boolean;
}

export default function ConsumerHome() {
  const [searchQuery, setSearchQuery] = useState('');
  const [topDeals, setTopDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [comparingDeal, setComparingDeal] = useState<Deal | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    if (comparingDeal) {
      const fetchComparison = async () => {
        setLoadingComparison(true);
        try {
          const pricesRef = collection(db, 'prices');
          const q = query(
            pricesRef,
            where('productId', '==', comparingDeal.productId),
            limit(10)
          );
          const snap = await getDocs(q);
          const results = snap.docs.map(doc => {
            const data = doc.data();
            const dist = data.distance || 0;
            const fuel = dist > 0 ? (dist * 2 * 8 / 100) * 2.80 : 0;
            return {
              name: data.storeName || 'Unknown Store',
              price: data.price,
              dist: dist,
              fuel: fuel,
              total: data.price + fuel,
              recommended: false // Will calculate below
            };
          });

          // Find best choice
          if (results.length > 0) {
            const best = results.reduce((prev, curr) => (prev.total < curr.total) ? prev : curr);
            results.forEach(r => {
              if (r === best) r.recommended = true;
            });
          }

          setComparisonResults(results.sort((a, b) => a.total - b.total));
        } catch (err) {
          console.error('Error fetching comparison:', err);
        } finally {
          setLoadingComparison(false);
        }
      };
      fetchComparison();
    } else {
      setComparisonResults([]);
    }
  }, [comparingDeal]);

  useEffect(() => {
    // Fetch deals (ranked by discount or recency for now)
    const baseQuery = collection(db, 'prices');
    let q = query(
      baseQuery,
      orderBy('extractedAt', 'desc')
    );

    if (!showAll) {
      q = query(q, limit(10));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Fetched ${snapshot.docs.length} deals from Firestore`);
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
          storeName: data.storeName,
          productName: data.productName,
          validityEnd: data.validityEnd,
          brand: data.brand || 'Local',
          category: data.category || 'General'
        };
      });
      
      // Fetch missing names if necessary
      const fetchMissingNames = async (deals: Deal[]) => {
        const updatedDeals = [...deals];
        let changed = false;

        for (let i = 0; i < updatedDeals.length; i++) {
          const deal = updatedDeals[i];
          
          // Fix missing store name
          if (!deal.storeName && deal.storeId) {
            try {
              const storeDoc = await getDocs(query(collection(db, 'stores'), where('__name__', '==', deal.storeId)));
              if (!storeDoc.empty) {
                updatedDeals[i].storeName = storeDoc.docs[0].data().name;
                changed = true;
              }
            } catch (e) {
              console.error(`Error fetching store ${deal.storeId}:`, e);
            }
          }

          // Fix missing product name
          if (!deal.productName && deal.productId) {
            try {
              const productDoc = await getDocs(query(collection(db, 'products'), where('__name__', '==', deal.productId)));
              if (!productDoc.empty) {
                updatedDeals[i].productName = productDoc.docs[0].data().name;
                changed = true;
              }
            } catch (e) {
              console.error(`Error fetching product ${deal.productId}:`, e);
            }
          }
        }

        if (changed) {
          setTopDeals(updatedDeals);
        }
      };

      setTopDeals(dealsData);
      setLoading(false);
      fetchMissingNames(dealsData);
    }, (error) => {
      console.error("Error fetching deals:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [showAll]);

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

      {/* Weekly Essentials Basket */}
      <WeeklyEssentials />

      {/* Top Deals */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            🔥 {showAll ? 'All Deals' : 'Top Deals'}
          </h3>
          <button 
            onClick={() => setShowAll(!showAll)}
            className="text-sm font-bold text-zinc-500 flex items-center gap-1 hover:text-zinc-900 transition-colors"
          >
            {showAll ? 'Show Less' : 'View All'}
            <ChevronRight className={cn("w-4 h-4 transition-transform", showAll && "rotate-90")} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-64 bg-zinc-100 rounded-3xl animate-pulse" />
            ))
          ) : (
            topDeals.map((deal) => (
              <ProductCard 
                key={deal.id} 
                deal={deal} 
                onAddToList={addToLocalList}
                onCompare={(d) => setComparingDeal(d)}
                onSearch={(query) => {
                  setSearchQuery(query);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ))
          )}

          {!loading && topDeals.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
              <ShoppingBasket className="w-12 h-12 text-zinc-200 mb-4" />
              <h4 className="text-xl font-bold text-zinc-900 mb-2">No Deals Found</h4>
              <p className="text-zinc-500 text-sm max-w-xs text-center">
                We couldn&apos;t find any active deals at the moment. Check back later or try a different category.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Comparison View Overlay */}
      <AnimatePresence>
        {comparingDeal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setComparingDeal(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-xl bg-white z-[111] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-xl font-black text-zinc-900">Compare Stores</h3>
                <button 
                  onClick={() => setComparingDeal(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-200 transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              
              <div className="flex-grow overflow-y-auto p-6">
                <div className="flex gap-4 mb-8 p-4 bg-zinc-50 rounded-3xl border border-zinc-100">
                  <div className="relative w-20 h-20 bg-white rounded-2xl overflow-hidden border border-zinc-200">
                    {comparingDeal.productImageUrl ? (
                      <Image src={comparingDeal.productImageUrl} alt={comparingDeal.productName || ''} fill className="object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300"><ShoppingBasket /></div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{comparingDeal.brand}</p>
                    <h4 className="text-lg font-black text-zinc-900">{comparingDeal.productName}</h4>
                    <p className="text-xs text-zinc-500">{comparingDeal.unit}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-black text-zinc-900 uppercase tracking-wider">Available at these stores:</h5>
                    <div className="flex gap-2">
                      <button className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">Sort: Total Cost</button>
                      <button className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 transition-colors">Price</button>
                      <button className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 transition-colors">Distance</button>
                    </div>
                  </div>
                  
                  {/* Comparison List */}
                  {loadingComparison ? (
                    <div className="space-y-4">
                      {Array(3).fill(0).map((_, i) => (
                        <div key={i} className="h-32 bg-zinc-50 rounded-[24px] animate-pulse" />
                      ))}
                    </div>
                  ) : comparisonResults.length > 0 ? (
                    comparisonResults.map((store, idx) => (
                      <div key={idx} className={cn(
                        "p-5 rounded-[24px] border transition-all",
                        store.recommended ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20" : "bg-white border-zinc-100 hover:border-zinc-300"
                      )}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-zinc-900">{store.name}</span>
                              {store.recommended && (
                                <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Best Choice</span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">
                              {store.dist > 0 ? `${store.dist} km away • ~${Math.round(store.dist * 2.5)} min drive` : 'Distance unknown'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-zinc-900">${store.price.toFixed(2)}</p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase">Product Price</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-zinc-200/50">
                          <div className="flex items-center gap-4">
                            <div className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                              <Fuel className="w-3 h-3" />
                              Fuel: ${store.fuel.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn("text-xl font-black", store.recommended ? "text-emerald-600" : "text-zinc-900")}>
                              ${store.total.toFixed(2)}
                            </p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Total Cost (True Price)</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 bg-zinc-50 rounded-[24px] border border-dashed border-zinc-200">
                      <p className="text-zinc-400 text-sm italic">No other stores found carrying this product.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50">
                <button 
                  onClick={() => setComparingDeal(null)}
                  className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-black hover:bg-zinc-800 transition-all"
                >
                  Done Comparing
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
