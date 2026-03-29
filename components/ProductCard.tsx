'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Clock, 
  Fuel, 
  Plus, 
  ChevronRight, 
  Heart, 
  Info, 
  TrendingDown, 
  TrendingUp,
  Store,
  ArrowRight,
  Search,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { handleFirestoreError, OperationType } from '@/lib/error-handler';

export interface Deal {
  id: string;
  productId: string;
  storeId: string;
  price: number;
  originalPrice?: number;
  unit: string;
  isSpecial: boolean;
  productImageUrl?: string;
  extractedAt: Timestamp;
  storeName?: string;
  productName?: string;
  brand?: string;
  category?: string;
  validityEnd?: Timestamp;
  distance?: number; // in km
  travelTime?: number; // in minutes
  description?: string;
}

interface ProductCardProps {
  deal: Deal;
  onAddToList?: (deal: Deal) => void;
  onCompare?: (deal: Deal) => void;
  onSearch?: (query: string) => void;
  layout?: 'horizontal' | 'vertical';
}

// Constants for Fuel Calculation (Configurable)
const FUEL_CONSUMPTION = 8; // L/100km
const FUEL_PRICE = 2.80; // FJD per Litre

export default function ProductCard({ deal, onAddToList, onCompare, onSearch, layout = 'vertical' }: ProductCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [comparisonDeals, setComparisonDeals] = useState<Deal[]>([]);
  const [priceInsights, setPriceInsights] = useState<{ avg: number; low: number; trend: number } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fuel Cost Logic: Fuel Cost = (Distance × 2 × Fuel Consumption ÷ 100) × Fuel Price
  const distance = deal.distance || 0; 
  const travelTime = deal.travelTime || 0; 
  const fuelCost = distance > 0 ? (distance * 2 * FUEL_CONSUMPTION / 100) * FUEL_PRICE : 0;
  const totalCost = deal.price + fuelCost;

  useEffect(() => {
    if (isExpanded && deal.productId) {
      const fetchDetails = async () => {
        setLoadingDetails(true);
        try {
          const pricesRef = collection(db, 'prices');
          
          // 1. Fetch Comparison Deals (other stores for same product)
          const compQuery = query(
            pricesRef,
            where('productId', '==', deal.productId),
            limit(10)
          );
          let compSnap;
          try {
            compSnap = await getDocs(compQuery);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, 'prices');
            return;
          }
          const compDeals = compSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as unknown as Deal))
            .filter(d => d.id !== deal.id);
          setComparisonDeals(compDeals);

          // 2. Fetch Price Insights (historical)
          const historyQuery = query(
            pricesRef,
            where('productId', '==', deal.productId),
            orderBy('extractedAt', 'desc'),
            limit(50)
          );
          let historySnap;
          try {
            historySnap = await getDocs(historyQuery);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, 'prices');
            return;
          }
          const prices = historySnap.docs.map(doc => doc.data().price as number);
          
          if (prices.length > 0) {
            const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
            const low = Math.min(...prices);
            const trend = prices.length > 1 ? ((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100 : 0;
            setPriceInsights({ avg, low, trend });
          }
        } catch (err) {
          console.error('Error fetching product details:', err);
        } finally {
          setLoadingDetails(false);
        }
      };
      fetchDetails();
    }
  }, [isExpanded, deal.productId, deal.id]);

  const discountPercent = deal.originalPrice 
    ? Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100) 
    : 0;

  // Smart Insight Logic
  const isCheapest = comparisonDeals.length > 0 ? deal.price <= Math.min(...comparisonDeals.map(d => d.price)) : true;
  const isBestTotal = comparisonDeals.length > 0 ? totalCost <= Math.min(...comparisonDeals.map(d => {
    const d_dist = d.distance || 0;
    const d_fuel = d_dist > 0 ? (d_dist * 2 * FUEL_CONSUMPTION / 100) * FUEL_PRICE : 0;
    return d.price + d_fuel;
  })) : true;

  const smartInsight = isBestTotal 
    ? "Best overall value (including travel)" 
    : isCheapest 
      ? "Cheapest product price" 
      : "Available at multiple stores";

  return (
    <div className={cn(
      "group bg-white rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl hover:border-zinc-300 transition-all overflow-hidden flex flex-col",
      layout === 'horizontal' && "sm:flex-row"
    )}>
      {/* Image Section */}
      <div className={cn(
        "relative bg-zinc-50 overflow-hidden",
        layout === 'vertical' ? "aspect-[4/3]" : "aspect-square sm:w-48"
      )}>
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
            <Store className="w-12 h-12 text-zinc-200" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {deal.isSpecial && (
            <span className="bg-orange-500 text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg">
              Special
            </span>
          )}
          {(discountPercent > 15 || (priceInsights && deal.price < priceInsights.avg * 0.85)) && (
            <span className="bg-emerald-500 text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Price Drop
            </span>
          )}
        </div>

        {/* Favorite Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsFavorite(!isFavorite); }}
          className={cn(
            "absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-md transition-all",
            isFavorite ? "bg-red-500 text-white" : "bg-white/80 text-zinc-400 hover:text-red-500"
          )}
        >
          <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
        </button>
      </div>

      {/* Details Section */}
      <div className="p-5 flex-grow flex flex-col">
        {/* Top Section */}
        <div className="mb-3">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
                {deal.brand || 'Local Brand'}
              </p>
              <h4 className="font-bold text-zinc-900 text-lg line-clamp-2 leading-tight">
                {deal.productName || 'Loading Product...'}
              </h4>
              <p className="text-xs font-medium text-zinc-500 mt-1">
                {deal.unit}
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-zinc-900">${deal.price.toFixed(2)}</span>
            {deal.originalPrice && (
              <span className="text-sm font-medium text-zinc-400 line-through">${deal.originalPrice.toFixed(2)}</span>
            )}
            {discountPercent > 0 && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                Save ${ (deal.originalPrice! - deal.price).toFixed(2) }
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">
            Unit Price: ${(deal.price / 1).toFixed(2)} / {deal.unit.split(' ')[0]}
          </p>
          
          {/* Deal Validity */}
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 w-fit px-2 py-0.5 rounded-md">
            <Clock className="w-3 h-3" />
            {deal.validityEnd 
              ? `Ends ${new Date(deal.validityEnd.seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` 
              : 'Valid until Sunday'}
          </div>
        </div>

        {/* Store + Location */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-50 rounded-2xl mb-4 border border-zinc-100">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-400 uppercase">Store</p>
            <p className="text-xs font-bold text-zinc-900 flex items-center gap-1">
              <Store className="w-3 h-3" />
              {deal.storeName || 'Supermarket'}
            </p>
          </div>
          {distance > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Travel</p>
              <p className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {distance.toFixed(1)} km ({travelTime} min)
              </p>
            </div>
          )}
          {distance > 0 && (
            <div className="col-span-2 pt-2 mt-1 border-t border-zinc-200/50 flex justify-between items-center">
              <p className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <Fuel className="w-3 h-3" />
                Est. Fuel: ${fuelCost.toFixed(2)}
              </p>
            <div className="group/tooltip relative flex items-center gap-1">
              <p className="text-[10px] font-black text-emerald-600 uppercase">
                Total: ${totalCost.toFixed(2)}
              </p>
              <Info className="w-3 h-3 text-zinc-300 cursor-help" />
              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-zinc-900 text-white text-[10px] rounded-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-50 shadow-xl">
                <p className="font-bold mb-1">True Price Calculation:</p>
                <p className="text-zinc-400">Includes product price, estimated fuel cost (${fuelCost.toFixed(2)}), and travel time ({travelTime} min).</p>
              </div>
            </div>
            </div>
          )}
        </div>

        {/* Smart Insight */}
        <div className="mb-4">
          <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            {smartInsight}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2">
          <div className="flex gap-2">
            <button 
              onClick={() => onAddToList?.(deal)}
              className="flex-grow flex items-center justify-center gap-2 bg-zinc-900 text-white py-3 rounded-2xl text-sm font-bold hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add to List
            </button>
            <button 
              onClick={() => onCompare?.(deal)}
              className="flex-grow flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              <ArrowRight className="w-4 h-4" />
              Compare
            </button>
            <button 
              onClick={() => setIsExpanded(true)}
              className="w-12 h-12 flex items-center justify-center bg-zinc-100 text-zinc-900 rounded-2xl hover:bg-zinc-200 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded View (Bottom Sheet Overlay) */}
      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 inset-x-0 bg-white rounded-t-[40px] z-[101] max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white/80 backdrop-blur-md p-4 flex justify-center border-b border-zinc-100">
                <div className="w-12 h-1.5 bg-zinc-200 rounded-full" />
              </div>
              
              <div className="p-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row gap-8 mb-10">
                  <div className="relative w-full md:w-64 aspect-square bg-zinc-50 rounded-3xl overflow-hidden border border-zinc-100">
                    {deal.productImageUrl ? (
                      <Image
                        src={deal.productImageUrl}
                        alt={deal.productName || ''}
                        fill
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Store className="w-20 h-20 text-zinc-200" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">
                          {deal.category || 'Grocery'} • {deal.brand || 'Local Brand'}
                        </p>
                        <h2 className="text-3xl font-black text-zinc-900 mb-2 leading-tight">
                          {deal.productName}
                        </h2>
                        <button 
                          onClick={() => {
                            onSearch?.(deal.productName || '');
                            setIsExpanded(false);
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-indigo-600 transition-colors"
                        >
                          <Search className="w-3 h-3" />
                          Search similar products
                        </button>
                      </div>
                      <button 
                        onClick={() => setIsFavorite(!isFavorite)}
                        className={cn(
                          "w-12 h-12 flex items-center justify-center rounded-2xl transition-all border",
                          isFavorite ? "bg-red-50 bg-red-500 text-white border-red-500" : "bg-white text-zinc-400 border-zinc-200 hover:border-red-500 hover:text-red-500"
                        )}
                      >
                        <Heart className={cn("w-6 h-6", isFavorite && "fill-current")} />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-zinc-900">${deal.price.toFixed(2)}</span>
                        {deal.originalPrice && (
                          <span className="text-xl font-medium text-zinc-400 line-through">${deal.originalPrice.toFixed(2)}</span>
                        )}
                      </div>
                      {discountPercent > 0 && (
                        <div className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-sm font-black shadow-lg shadow-emerald-500/20">
                          {discountPercent}% OFF
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 bg-zinc-100 px-4 py-2 rounded-2xl text-sm font-bold text-zinc-600">
                        <Clock className="w-4 h-4" />
                        Ends {deal.validityEnd ? new Date(deal.validityEnd.seconds * 1000).toLocaleDateString() : 'Sunday'}
                      </div>
                      <div className="flex items-center gap-2 bg-zinc-100 px-4 py-2 rounded-2xl text-sm font-bold text-zinc-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        In Stock
                      </div>
                    </div>
                  </div>
                </div>

                {/* Multi-Store Comparison */}
                <section className="mb-10">
                  <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-2">
                    <ArrowRight className="w-6 h-6 text-indigo-500" />
                    Multi-Store Comparison
                  </h3>
                  
                  <div className="overflow-hidden rounded-3xl border border-zinc-200">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Store</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Price</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Distance</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Fuel</th>
                          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        <tr className="bg-emerald-50/50">
                          <td className="px-6 py-4 font-bold text-zinc-900">
                            <div className="flex items-center gap-2">
                              {deal.storeName}
                              <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-md uppercase">Current</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-bold text-zinc-900">${deal.price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-zinc-500 text-sm">{distance > 0 ? `${distance.toFixed(1)} km` : '-'}</td>
                          <td className="px-6 py-4 text-zinc-500 text-sm">{distance > 0 ? `$${fuelCost.toFixed(2)}` : '-'}</td>
                          <td className="px-6 py-4 font-black text-emerald-600">${totalCost.toFixed(2)}</td>
                        </tr>
                        {comparisonDeals.map((comp, idx) => {
                          const d = comp.distance || 0;
                          const f = d > 0 ? (d * 2 * FUEL_CONSUMPTION / 100) * FUEL_PRICE : 0;
                          const t = comp.price + f;
                          return (
                            <tr key={idx}>
                              <td className="px-6 py-4 font-bold text-zinc-900">{comp.storeName || 'Other Store'}</td>
                              <td className="px-6 py-4 font-bold text-zinc-900">${comp.price.toFixed(2)}</td>
                              <td className="px-6 py-4 text-zinc-500 text-sm">{d > 0 ? `${d.toFixed(1)} km` : '-'}</td>
                              <td className="px-6 py-4 text-zinc-500 text-sm">{d > 0 ? `$${f.toFixed(2)}` : '-'}</td>
                              <td className="px-6 py-4 font-bold text-zinc-900">${t.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        {comparisonDeals.length === 0 && !loadingDetails && (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-zinc-400 text-sm italic">
                              No other stores found carrying this product.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 text-xs font-bold text-indigo-600 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Best overall: {deal.storeName} (lowest total cost including travel)
                  </p>
                </section>

                {/* Price Insights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                  <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100">
                    <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">Average Price</p>
                    <p className="text-2xl font-black text-zinc-900">
                      {priceInsights ? `$${priceInsights.avg.toFixed(2)}` : '...'}
                    </p>
                  </div>
                  <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100">
                    <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">Lowest Seen</p>
                    <p className="text-2xl font-black text-emerald-600">
                      {priceInsights ? `$${priceInsights.low.toFixed(2)}` : '...'}
                    </p>
                  </div>
                  <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100">
                    <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">Price Trend</p>
                    <div className="flex items-center gap-2">
                      {priceInsights && priceInsights.trend < 0 ? (
                        <TrendingDown className="w-6 h-6 text-emerald-500" />
                      ) : (
                        <TrendingUp className="w-6 h-6 text-orange-500" />
                      )}
                      <p className="text-2xl font-black text-zinc-900">
                        {priceInsights ? `${priceInsights.trend > 0 ? '+' : ''}${priceInsights.trend.toFixed(0)}%` : '...'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <section className="mb-10">
                  <h3 className="text-xl font-black text-zinc-900 mb-4">Product Details</h3>
                  <p className="text-zinc-600 leading-relaxed">
                    {deal.description || "High-quality product sourced from local suppliers. Perfect for your weekly grocery needs. Check the unit size carefully for best value comparison."}
                  </p>
                </section>

                {/* Footer Actions */}
                <div className="sticky bottom-0 bg-white/80 backdrop-blur-md pt-6 pb-2 flex gap-3">
                  <button 
                    onClick={() => onAddToList?.(deal)}
                    className="flex-grow flex items-center justify-center gap-2 bg-zinc-900 text-white py-4 rounded-[20px] text-sm font-black hover:bg-zinc-800 transition-all active:scale-95 shadow-xl shadow-zinc-900/20"
                  >
                    <Plus className="w-5 h-5" />
                    Add to List
                  </button>
                  <button 
                    onClick={() => {
                      onCompare?.(deal);
                      setIsExpanded(false);
                    }}
                    className="flex-grow flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-[20px] text-sm font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                  >
                    <ArrowRight className="w-5 h-5" />
                    Compare
                  </button>
                  <button 
                    onClick={() => setIsExpanded(false)}
                    className="px-6 flex items-center justify-center bg-zinc-100 text-zinc-900 rounded-[20px] text-sm font-black hover:bg-zinc-200 transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
