'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { Search, MapPin, Navigation, Filter, Star, Zap, DollarSign, ArrowRight, ShoppingBasket, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  category: string;
  productImageUrl?: string;
}

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
}

export default function PriceComparison() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Price[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearYou, setNearYou] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    
    try {
      // 1. Find products matching the search
      const productsRef = collection(db, 'products');
      const productQuery = query(
        productsRef,
        where('name', '>=', searchQuery),
        where('name', '<=', searchQuery + '\uf8ff')
      );
      const productSnap = await getDocs(productQuery);
      
      if (productSnap.empty) {
        setResults([]);
        setLoading(false);
        return;
      }

      const productIds = productSnap.docs.map(doc => doc.id);
      
      // 2. Find prices for these products
      const pricesRef = collection(db, 'prices');
      const priceQuery = query(
        pricesRef,
        where('productId', 'in', productIds),
        orderBy('price', 'asc')
      );
      
      const priceSnap = await getDocs(priceQuery);
      const pricesData: Price[] = priceSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productId: data.productId,
          storeId: data.storeId,
          price: data.price,
          unit: data.unit,
          isSpecial: data.isSpecial,
          storeName: data.storeName || 'Unknown Store',
          storeLocation: data.storeLocation || 'Unknown Location',
          distance: Math.random() * 10 // Mock distance for now
        };
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

  // Sort results based on criteria
  const sortedResults = [...results].sort((a, b) => {
    if (nearYou) return (a.distance || 0) - (b.distance || 0);
    return a.price - b.price;
  });

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search for a product to compare prices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleNearYou}
              className={cn(
                "flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm transition-all",
                nearYou 
                  ? "bg-zinc-900 text-white shadow-lg shadow-zinc-900/20" 
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              <Navigation className={cn("w-4 h-4", nearYou && "animate-pulse")} />
              Near You
            </button>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">
            {results.length > 0 ? `${results.length} results found` : "Search to compare prices"}
          </h3>
          {results.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
              <Filter className="w-3 h-3" />
              Sorted by {nearYou ? "Distance" : "Price"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {sortedResults.map((price, idx) => (
            <motion.div
              key={price.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-center gap-6"
            >
              {/* Badge Area */}
              <div className="flex-shrink-0 w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100 relative">
                {idx === 0 && !nearYou && (
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-full shadow-lg">
                    <DollarSign className="w-3 h-3" />
                  </div>
                )}
                {idx === 0 && nearYou && (
                  <div className="absolute -top-2 -right-2 bg-indigo-500 text-white p-1.5 rounded-full shadow-lg">
                    <MapPin className="w-3 h-3" />
                  </div>
                )}
                <ShoppingBasket className="w-8 h-8 text-zinc-200" />
              </div>

              {/* Info Area */}
              <div className="flex-grow text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                  <h4 className="font-bold text-zinc-900 text-lg">{price.storeName}</h4>
                  {idx === 0 && !nearYou && (
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                      Cheapest Overall
                    </span>
                  )}
                  {idx === 0 && nearYou && (
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                      Closest Cheapest
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-500 font-medium flex items-center justify-center sm:justify-start gap-1">
                  <MapPin className="w-3 h-3" />
                  {price.storeLocation}
                </p>
              </div>

              {/* Price Area */}
              <div className="flex flex-col items-center sm:items-end gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-3xl font-black text-zinc-900">${price.price.toFixed(2)}</span>
                  <span className="text-sm font-bold text-zinc-400">/ {price.unit}</span>
                </div>
                {price.distance && (
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                    <Navigation className="w-3 h-3" />
                    {price.distance.toFixed(1)} km away
                  </span>
                )}
              </div>

              {/* Action */}
              <button className="w-full sm:w-auto px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2">
                View Deal
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ))}

          {!loading && searchQuery && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
              <ShoppingBasket className="w-12 h-12 text-zinc-200 mb-4" />
              <p className="text-zinc-500 font-medium">No prices found for &quot;{searchQuery}&quot;</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
