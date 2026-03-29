'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from 'firebase/firestore';
import { TrendingDown, TrendingUp, Brain, ShoppingBasket, Zap, AlertCircle, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { getGeminiAI } from "@/lib/gemini";
import { handleFirestoreError, OperationType } from '@/lib/error-handler';

interface TrendItem {
  id: string;
  name: string;
  change: number;
  currentPrice: number;
  previousPrice: number;
  unit: string;
  category: string;
}

export default function Trends() {
  const [priceDrops, setPriceDrops] = useState<TrendItem[]>([]);
  const [priceIncreases, setPriceIncreases] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealOfTheWeek, setDealOfTheWeek] = useState<{ name: string, discount: number } | null>(null);
  const [smartSummary, setSmartSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [stats, setStats] = useState({
    bestStore: 'Loading...',
    avoidProduct: 'None',
    avoidChange: 0,
    totalDeals: 0,
    avgSavings: 0,
    topCategory: 'General'
  });

  const summaryGenerated = useRef(false);

  useEffect(() => {
    const productsRef = collection(db, 'products');
    
    // Fetch products with significant price changes
    const q = query(
      productsRef, 
      where('priceChange', '!=', 0),
      orderBy('priceChange', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const allTrends: TrendItem[] = snapshot.docs.map(doc => {
        const data = doc.data() as {
          name: string;
          priceChange?: number;
          lastPrice: number;
          previousPrice?: number;
          unit?: string;
          category?: string;
        };
        return {
          id: doc.id,
          name: data.name,
          change: data.priceChange || 0,
          currentPrice: data.lastPrice,
          previousPrice: data.previousPrice || data.lastPrice,
          unit: data.unit || '',
          category: data.category || 'General'
        };
      });

      const drops = allTrends
        .filter(t => t.change < 0)
        .sort((a, b) => a.change - b.change) // Most negative first
        .slice(0, 5);

      const increases = allTrends
        .filter(t => t.change > 0)
        .sort((a, b) => b.change - a.change) // Most positive first
        .slice(0, 5);

      setPriceDrops(drops);
      setPriceIncreases(increases);
      
      // Update Deal of the Week if we found a drop
      if (drops.length > 0) {
        setDealOfTheWeek({
          name: drops[0].name,
          discount: Math.abs(Math.round(drops[0].change))
        });
      }

      if (increases.length > 0) {
        setStats(prev => ({
          ...prev,
          avoidProduct: increases[0].name,
          avoidChange: Math.round(increases[0].change)
        }));
      }

      // Calculate average savings
      if (drops.length > 0) {
        const avg = drops.reduce((acc, curr) => acc + Math.abs(curr.change), 0) / drops.length;
        setStats(prev => ({ ...prev, avgSavings: Math.round(avg) }));
      }

      setLoading(false);
      
      // Generate Smart Summary if we have data and haven't generated it yet
      if (allTrends.length > 0 && !summaryGenerated.current) {
        summaryGenerated.current = true;
        generateSmartSummary(allTrends);
      }
    }, (error) => {
      console.error("Error fetching trends:", error);
      setLoading(false);
    });

    // Fetch best store and additional deals from prices
    const fetchAdditionalInsights = async () => {
      try {
        const pricesRef = collection(db, 'prices');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // 1. Fetch best store
        const qDeals = query(
          pricesRef,
          where('isSpecial', '==', true),
          where('extractedAt', '>=', sevenDaysAgo)
        );
        
        let dealsSnap;
        try {
          dealsSnap = await getDocs(qDeals);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'prices');
          return;
        }
        setStats(prev => ({ ...prev, totalDeals: dealsSnap.size }));

        if (!dealsSnap.empty) {
          const storeCounts: { [key: string]: { count: number, name: string } } = {};
          let bestPriceDeal: { name: string, discount: number } | null = null;
          const categoryCounts: { [key: string]: number } = {};

          // Collect all storeIds that are missing names
          const missingStoreIds = new Set<string>();

          dealsSnap.docs.forEach(doc => {
            const data = doc.data() as {
              storeId: string;
              storeName?: string;
              category?: string;
              originalPrice?: number;
              price?: number;
              productName: string;
            };
            
            // Track store counts
            const storeId = data.storeId;
            const storeName = data.storeName;
            
            if (!storeName) {
              missingStoreIds.add(storeId);
            }

            if (!storeCounts[storeId]) {
              storeCounts[storeId] = { count: 0, name: storeName || 'Loading...' };
            }
            storeCounts[storeId].count++;

            // Track category counts for more insights
            const category = data.category || 'General';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;

            // Track best deal from originalPrice vs price
            if (data.originalPrice && data.price) {
              const discount = Math.round(((data.originalPrice - data.price) / data.originalPrice) * 100);
              if (!bestPriceDeal || discount > bestPriceDeal.discount) {
                bestPriceDeal = { name: data.productName, discount };
              }
            }
          });

          // Fetch missing store names
          if (missingStoreIds.size > 0) {
            const storesRef = collection(db, 'stores');
            // Firestore 'in' query limit is 10, but we'll just fetch them one by one or use a simpler approach
            // For now, we'll just fetch all if it's a small number or just handle it gracefully
            for (const storeId of Array.from(missingStoreIds)) {
              try {
                let storeDoc;
                try {
                  storeDoc = await getDocs(query(storesRef, where('__name__', '==', storeId)));
                } catch (e) {
                  handleFirestoreError(e, OperationType.GET, `stores/${storeId}`);
                  continue;
                }
                if (storeDoc && !storeDoc.empty) {
                  const sName = storeDoc.docs[0].data().name;
                  if (storeCounts[storeId]) {
                    storeCounts[storeId].name = sName;
                  }
                }
              } catch (error) {
                console.error(`Error fetching store ${storeId}:`, error);
              }
            }
          }

          // Update Deal of the Week if this is better than what we have from products
          if (bestPriceDeal) {
            setDealOfTheWeek(prev => {
              if (!prev || (bestPriceDeal && bestPriceDeal.discount > prev.discount)) {
                return bestPriceDeal;
              }
              return prev;
            });
          }

          const sortedStores = Object.values(storeCounts).sort((a, b) => b.count - a.count);
          if (sortedStores.length > 0) {
            const topStore = sortedStores[0].name === 'Loading...' ? 'Unknown Store' : sortedStores[0].name;
            setStats(prev => ({ ...prev, bestStore: topStore }));
          }

          const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
          if (sortedCategories.length > 0) {
            setStats(prev => ({ ...prev, topCategory: sortedCategories[0][0] }));
          }
        } else {
          // Fallback to first store if no special deals found
          let storesSnap;
          try {
            storesSnap = await getDocs(collection(db, 'stores'));
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, 'stores');
            return;
          }
          if (storesSnap && !storesSnap.empty) {
            setStats(prev => ({ ...prev, bestStore: storesSnap.docs[0].data().name }));
          }
        }
      } catch (err) {
        console.error("Error fetching additional insights:", err);
      }
    };
    fetchAdditionalInsights();

    return () => unsubscribe();
  }, []);

  const generateSmartSummary = async (trends: TrendItem[]) => {
    setIsGeneratingSummary(true);
    try {
      const ai = getGeminiAI();
      const prompt = `Analyze these grocery price trends in Fiji and provide a concise, 2-sentence "Smart Summary" for consumers. 
      Highlight the biggest opportunities for savings and any categories to be cautious about.
      Trends: ${JSON.stringify(trends.map(t => ({ name: t.name, change: t.change, category: t.category })))}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      if (response.text) {
        setSmartSummary(response.text);
      }
    } catch (err) {
      console.error("Error generating summary:", err);
      setSmartSummary("Prices are fluctuating this week. Focus on meat and dairy for the best discounts, while some pantry staples have seen slight increases.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Smart Insights Hero */}
      <section className="relative rounded-[40px] bg-zinc-900 p-8 md:p-12 text-white overflow-hidden shadow-2xl shadow-zinc-900/40">
        {/* Background Atmosphere (Recipe 7) */}
        <div className="absolute inset-0 z-0 opacity-40">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/20 blur-[100px] rounded-full translate-y-1/4 -translate-x-1/4" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Brain className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl font-black font-display tracking-tight">Smart Insights</h2>
              </div>
              <div className="space-y-4">
                {isGeneratingSummary ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-white/10 rounded-full w-full animate-pulse" />
                    <div className="h-4 bg-white/10 rounded-full w-3/4 animate-pulse" />
                  </div>
                ) : (
                  <p className="text-lg text-zinc-300 font-medium leading-relaxed italic border-l-2 border-emerald-500/50 pl-6">
                    &quot;{smartSummary || "Analyzing the latest market data to find your best savings..."}&quot;
                  </p>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-xl text-center">
                <div className="text-emerald-400 font-black text-2xl mb-1">{stats.avgSavings}%</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Avg. Savings</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-xl text-center">
                <div className="text-indigo-400 font-black text-2xl mb-1">{stats.totalDeals}</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Deals</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-md hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3 text-emerald-400 mb-4">
                <div className="w-8 h-8 bg-emerald-400/10 rounded-full flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Deal of the Week</span>
              </div>
              <p className="text-xl font-bold mb-2">
                {dealOfTheWeek ? dealOfTheWeek.name : "Checking..."}
              </p>
              <p className="text-sm text-zinc-400 font-medium leading-snug">
                {dealOfTheWeek 
                  ? `Massive ${dealOfTheWeek.discount}% drop. Best time to stock up.`
                  : "Scanning for the best deals in your area."}
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-md hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3 text-orange-400 mb-4">
                <div className="w-8 h-8 bg-orange-400/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Market Alert</span>
              </div>
              <p className="text-xl font-bold mb-2 truncate">{stats.avoidProduct}</p>
              <p className="text-sm text-zinc-400 font-medium leading-snug">
                {stats.avoidChange > 0 
                  ? `Prices surged by ${stats.avoidChange}%. We recommend waiting if possible.`
                  : "No major price hikes detected this week."}
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-md hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3 text-indigo-400 mb-4">
                <div className="w-8 h-8 bg-indigo-400/10 rounded-full flex items-center justify-center">
                  <Store className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Top Rated Store</span>
              </div>
              <p className="text-xl font-bold mb-2 truncate">
                {stats.bestStore === 'Loading...' ? 'Scanning...' : stats.bestStore}
              </p>
              <p className="text-sm text-zinc-400 font-medium leading-snug">
                {stats.bestStore === 'Loading...' 
                  ? "Identifying the most competitive store in Fiji..." 
                  : `Currently offering the highest volume of verified discounts across the islands.`}
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-md hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3 text-emerald-400 mb-4">
                <div className="w-8 h-8 bg-emerald-400/10 rounded-full flex items-center justify-center">
                  <ShoppingBasket className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Hot Category</span>
              </div>
              <p className="text-xl font-bold mb-2 truncate">{stats.topCategory}</p>
              <p className="text-sm text-zinc-400 font-medium leading-snug">
                This category has the most active deals this week. Great time to restock!
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Price Drops */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-emerald-500" />
              📉 Price Drops This Week
            </h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
              ))
            ) : priceDrops.length === 0 ? (
              <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No significant price drops detected yet.</p>
              </div>
            ) : (
              priceDrops.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-zinc-900">{item.name}</h4>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-emerald-600 font-black">
                      <TrendingDown className="w-3 h-3" />
                      {Math.abs(Math.round(item.change))}%
                    </div>
                    <div className="text-lg font-black text-zinc-900">${item.currentPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Price Increases */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              📈 Price Increases
            </h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array(2).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
              ))
            ) : priceIncreases.length === 0 ? (
              <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No major price increases detected.</p>
              </div>
            ) : (
              priceIncreases.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-zinc-900">{item.name}</h4>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-orange-600 font-black">
                      <TrendingUp className="w-3 h-3" />
                      {Math.round(item.change)}%
                    </div>
                    <div className="text-lg font-black text-zinc-900">${item.currentPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
