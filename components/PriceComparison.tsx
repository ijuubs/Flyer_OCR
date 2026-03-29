'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, getDocs, limit, Timestamp } from 'firebase/firestore';
import { Search, MapPin, Navigation, Filter, DollarSign, ShoppingBasket, Loader2, Plus, Check, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { handleFirestoreError, OperationType } from '@/lib/error-handler';

interface Price {
  id: string;
  productId: string;
  storeId: string;
  price: number;
  unit: string;
  isSpecial: boolean;
  storeName?: string;
  storeLocation?: string;
  distance?: number;
  productName?: string;
  category?: string;
  extractedAt?: Timestamp;
}

export default function PriceComparison() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Price[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearYou, setNearYou] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load added items from localStorage to show correct state
    const savedList = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    setAddedItems(new Set(savedList.map((item: { id: string }) => item.id)));
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    
    try {
      const pricesRef = collection(db, 'prices');
      // More flexible search: fetch recent prices and filter locally for better matching
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 14);

      const q = query(
        pricesRef,
        where('extractedAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
        orderBy('extractedAt', 'desc'),
        limit(500)
      );

      let priceSnap;
      try {
        priceSnap = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'prices');
        return;
      }
      
      // Get all stores to calculate distances
      let storesSnap;
      try {
        storesSnap = await getDocs(collection(db, 'stores'));
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'stores');
        return;
      }
      const storesMap = new Map();
      storesSnap.docs.forEach(doc => {
        storesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c;
      };

      const searchTerms = searchQuery.toLowerCase().split(' ');
      
      const pricesData: Price[] = [];
      priceSnap.docs.forEach(doc => {
        const data = doc.data();
        const productName = (data.productName || '').toLowerCase();
        
        // Match if all search terms are present in product name
        if (searchTerms.every(term => productName.includes(term))) {
          const store = storesMap.get(data.storeId);
          let distance = undefined;
          
          if (userLocation && store?.latitude && store?.longitude) {
            distance = calculateDistance(
              userLocation.lat, 
              userLocation.lng, 
              store.latitude, 
              store.longitude
            );
          }

          pricesData.push({
            id: doc.id,
            productId: data.productId,
            storeId: data.storeId,
            price: data.price,
            unit: data.unit,
            isSpecial: data.isSpecial,
            storeName: data.storeName || store?.name,
            storeLocation: data.storeLocation || store?.location,
            productName: data.productName,
            category: data.category,
            distance: distance,
            extractedAt: data.extractedAt
          });
        }
      });

      setResults(pricesData);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNearYou = () => {
    if (!nearYou) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
            setNearYou(true);
          },
          (error) => {
            console.error('Geolocation error:', error);
            alert('Please enable location access to use this feature.');
          }
        );
      }
    } else {
      setNearYou(false);
    }
  };

  const addToList = (price: Price) => {
    const currentList = JSON.parse(localStorage.getItem('viti_deals_list') || '[]');
    const newItem = {
      id: price.id,
      name: price.productName || 'Unknown Product',
      price: price.price,
      storeName: price.storeName || 'Unknown Store',
      addedAt: new Date().toISOString()
    };
    
    localStorage.setItem('viti_deals_list', JSON.stringify([...currentList, newItem]));
    setAddedItems(prev => new Set([...prev, price.id]));
  };

  // Sort results based on criteria
  const sortedResults = [...results].sort((a, b) => {
    if (nearYou) return (a.distance || 999) - (b.distance || 999);
    return a.price - b.price;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Search Bar */}
      <div className="bg-white p-8 rounded-[40px] border border-zinc-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-400" />
            <input
              type="text"
              placeholder="Search for a product (e.g. Rice 10kg, Milk)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-3xl py-5 pl-14 pr-6 text-zinc-900 placeholder:text-zinc-500 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={toggleNearYou}
              className={cn(
                "flex items-center gap-2 px-8 py-5 rounded-3xl font-black text-sm transition-all",
                nearYou 
                  ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" 
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              <Navigation className={cn("w-4 h-4", nearYou && "animate-pulse")} />
              Near You
            </button>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-10 py-5 bg-zinc-900 text-white rounded-3xl font-black text-sm hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center gap-2 shadow-xl shadow-zinc-900/10"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Compare
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black text-zinc-900 font-display tracking-tight">
              {results.length > 0 ? `${results.length} Deals Found` : "Price Comparison"}
            </h3>
            {results.length > 0 && (
              <span className="px-3 py-1 bg-zinc-100 text-zinc-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                Last 14 Days
              </span>
            )}
          </div>
          {results.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
              <Filter className="w-3 h-3" />
              Sorted by {nearYou ? "Distance" : "Price"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {sortedResults.map((price, idx) => (
              <motion.div
                key={price.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "bg-white p-6 rounded-[32px] border transition-all flex flex-col md:flex-row items-center gap-6 group",
                  idx === 0 ? "border-indigo-200 shadow-xl shadow-indigo-600/5 ring-1 ring-indigo-100" : "border-zinc-200 shadow-sm hover:border-zinc-300"
                )}
              >
                {/* Product Icon/Image */}
                <div className="flex-shrink-0 w-20 h-20 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100 relative group-hover:scale-105 transition-transform">
                  {idx === 0 && !nearYou && (
                    <div className="absolute -top-3 -left-3 bg-emerald-500 text-white px-3 py-1 rounded-full shadow-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Best Price
                    </div>
                  )}
                  {idx === 0 && nearYou && (
                    <div className="absolute -top-3 -left-3 bg-indigo-500 text-white px-3 py-1 rounded-full shadow-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Closest
                    </div>
                  )}
                  <div className="text-3xl">
                    {price.category === 'Pantry' ? '🥫' : price.category === 'Dairy' ? '🥛' : price.category === 'Produce' ? '🥦' : price.category === 'Meat' ? '🥩' : '🛒'}
                  </div>
                </div>

                {/* Info Area */}
                <div className="flex-grow text-center md:text-left">
                  <h4 className="font-black text-zinc-900 text-xl font-display tracking-tight mb-1">{price.productName}</h4>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-500">
                      <Store className="w-4 h-4 text-indigo-600" />
                      {price.storeName}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-400">
                      <MapPin className="w-4 h-4" />
                      {price.storeLocation}
                    </div>
                  </div>
                </div>

                {/* Price Area */}
                <div className="flex flex-col items-center md:items-end gap-1 px-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-zinc-900">${price.price.toFixed(2)}</span>
                    <span className="text-sm font-bold text-zinc-400">/ {price.unit}</span>
                  </div>
                  {price.distance && (
                    <span className="text-xs font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg">
                      <Navigation className="w-3 h-3" />
                      {price.distance.toFixed(1)} km away
                    </span>
                  )}
                </div>

                {/* Action */}
                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    onClick={() => addToList(price)}
                    disabled={addedItems.has(price.id)}
                    className={cn(
                      "flex-grow md:flex-grow-0 px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-95",
                      addedItems.has(price.id)
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-lg shadow-zinc-900/10"
                    )}
                  >
                    {addedItems.has(price.id) ? (
                      <>
                        <Check className="w-4 h-4" />
                        In List
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add to List
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {!loading && searchQuery && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6">
                <ShoppingBasket className="w-10 h-10 text-zinc-200" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-2 font-display">No matches found</h3>
              <p className="text-zinc-500 text-sm font-medium">Try searching for generic terms like &quot;Rice&quot; or &quot;Milk&quot;</p>
            </div>
          )}

          {!loading && !searchQuery && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl">
                {['Rice', 'Milk', 'Oil', 'Flour'].map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setSearchQuery(term);
                      setTimeout(handleSearch, 0);
                    }}
                    className="p-6 bg-white border border-zinc-200 rounded-3xl hover:border-indigo-600 hover:shadow-lg transition-all text-center group"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                      {term === 'Rice' ? '🍚' : term === 'Milk' ? '🥛' : term === 'Oil' ? '🛢️' : '🍞'}
                    </div>
                    <div className="text-sm font-black text-zinc-900">{term}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
