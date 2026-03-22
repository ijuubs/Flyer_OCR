'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, getDocs, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { Search, TrendingUp, ShoppingBag, Store, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  lastPrice: number;
}

interface PriceRecord {
  price: number;
  extractedAt: Timestamp;
  storeId: string;
  storeName?: string;
}

export default function PriceDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [stores, setStores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stores
        const storesSnap = await getDocs(collection(db, 'stores'));
        const storesMap: Record<string, string> = {};
        storesSnap.forEach(doc => storesMap[doc.id] = doc.data().name);
        setStores(storesMap);

        // Fetch products
        const productsSnap = await getDocs(query(collection(db, 'products'), orderBy('name')));
        const productsList: Product[] = [];
        productsSnap.forEach(doc => productsList.push({ id: doc.id, ...doc.data() } as Product));
        setProducts(productsList);
        
        if (productsList.length > 0) {
          setSelectedProduct(productsList[0]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;

    const fetchHistory = async () => {
      try {
        const pricesRef = collection(db, 'prices');
        const q = query(
          pricesRef,
          where('productId', '==', selectedProduct.id),
          orderBy('extractedAt', 'asc')
        );
        const snap = await getDocs(q);
        const records: any[] = [];
        snap.forEach(doc => {
          const data = doc.data();
          records.push({
            date: format(data.extractedAt.toDate(), 'MMM dd'),
            price: data.price,
            store: stores[data.storeId] || 'Unknown Store',
          });
        });
        setHistory(records);
      } catch (error) {
        console.error('Error fetching history:', error);
      }
    };
    fetchHistory();
  }, [selectedProduct, stores]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar: Product List */}
      <div className="lg:col-span-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
          <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Products ({filteredProducts.length})
            </h3>
          </div>
          <div className="divide-y divide-zinc-50">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className={`w-full text-left p-4 transition-colors hover:bg-zinc-50 ${
                  selectedProduct?.id === product.id ? 'bg-zinc-50 border-l-4 border-zinc-900' : ''
                }`}
              >
                <p className="font-medium text-zinc-900 text-sm">{product.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-zinc-500">{product.category}</span>
                  <span className="text-sm font-bold text-zinc-900">${product.lastPrice.toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content: Analysis */}
      <div className="lg:col-span-8 space-y-6">
        {selectedProduct ? (
          <>
            {/* Header Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Current Price</p>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-zinc-900">${selectedProduct.lastPrice.toFixed(2)}</span>
                  <div className="flex items-center text-emerald-600 text-xs font-medium mb-1">
                    <ArrowDownRight className="w-3 h-3" />
                    5% vs avg
                  </div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Best Store</p>
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-zinc-400" />
                  <span className="text-lg font-bold text-zinc-900">RB Patel</span>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Price Volatility</p>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-zinc-400" />
                  <span className="text-lg font-bold text-zinc-900">Low</span>
                </div>
              </div>
            </div>

            {/* Price Trend Chart */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-zinc-900">Price Trend: {selectedProduct.name}</h3>
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-xs font-medium bg-zinc-900 text-white rounded-lg">6 Months</button>
                  <button className="px-3 py-1 text-xs font-medium bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200">All Time</button>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#94a3b8' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#94a3b8' }} 
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontSize: '12px', fontWeight: '600' }}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#18181b" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#18181b', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      name="Price ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Store Comparison */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="font-bold text-zinc-900 mb-6">Store Comparison</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history.slice(-5)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="store" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar 
                      dataKey="price" 
                      fill="#18181b" 
                      radius={[6, 6, 0, 0]} 
                      barSize={40}
                      name="Price ($)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
            <ShoppingBag className="w-12 h-12 text-zinc-300 mb-4" />
            <p className="text-zinc-500 font-medium">Select a product to view analysis</p>
          </div>
        )}
      </div>
    </div>
  );
}
