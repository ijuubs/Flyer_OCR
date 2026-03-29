'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, where, getDocs, Timestamp } from 'firebase/firestore';
import { Database, Search, Edit2, Trash2, Save, Loader2, ShoppingBasket, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ProductData {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  lastPrice?: number;
  lastUpdated?: Timestamp;
}

interface PriceRecord {
  id: string;
  price: number;
  originalPrice?: number;
  storeName: string;
  extractedAt: Timestamp;
  isSpecial?: boolean;
}

export default function AdminDatabase() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProductData>>({});
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductData[];
      setProducts(productsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (viewingHistoryId) {
      const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
          const q = query(
            collection(db, 'prices'),
            where('productId', '==', viewingHistoryId),
            orderBy('extractedAt', 'desc'),
            limit(20)
          );
          const snap = await getDocs(q);
          const history = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as PriceRecord[];
          setPriceHistory(history);
        } catch (error) {
          console.error('Error fetching price history:', error);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [viewingHistoryId]);

  const handleEdit = (product: ProductData) => {
    setEditingId(product.id);
    setEditForm(product);
  };

  const handleSave = async (id: string) => {
    try {
      const productRef = doc(db, 'products', id);
      await updateDoc(productRef, {
        ...editForm,
        lastUpdated: Timestamp.now()
      });
      setEditingId(null);
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product? This will not delete price records but they will be orphaned.')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search products by name, brand or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
          />
        </div>
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Showing {filteredProducts.length} products
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className={cn(
              "bg-white p-6 rounded-[32px] border transition-all group",
              editingId === product.id ? "border-zinc-900 ring-4 ring-zinc-900/5" : "border-zinc-100 hover:border-zinc-200"
            )}
          >
            {editingId === product.id ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Product Name</label>
                  <input
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Brand</label>
                  <input
                    value={editForm.brand || ''}
                    onChange={e => setEditForm({ ...editForm, brand: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Category</label>
                  <input
                    value={editForm.category || ''}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm"
                  />
                </div>
                <div className="md:col-span-3 flex gap-2 pt-2">
                  <button onClick={() => handleSave(product.id)} className="flex-grow bg-zinc-900 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                  <button onClick={() => setEditingId(null)} className="bg-zinc-100 text-zinc-500 px-6 py-3 rounded-xl font-bold text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="relative w-20 h-20 bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 flex-shrink-0">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} fill className="object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-200">
                      <ShoppingBasket className="w-8 h-8" />
                    </div>
                  )}
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                      {product.brand || 'Local'}
                    </span>
                    <span className="text-[10px] font-black text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                      {product.category || 'General'}
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-zinc-900">{product.name}</h4>
                  <p className="text-xs text-zinc-400 font-medium">
                    Last price: <span className="text-zinc-900 font-bold">${product.lastPrice?.toFixed(2) || 'N/A'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setViewingHistoryId(viewingHistoryId === product.id ? null : product.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all",
                      viewingHistoryId === product.id ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                    )}
                  >
                    <History className="w-4 h-4" />
                    History
                  </button>
                  <button onClick={() => handleEdit(product)} className="p-2.5 bg-zinc-50 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(product.id)} className="p-2.5 bg-red-50 text-red-300 hover:text-red-500 hover:bg-red-100 rounded-xl transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Price History Sub-panel */}
            <AnimatePresence>
              {viewingHistoryId === product.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 pt-6 border-t border-zinc-100 space-y-4">
                    <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Price Records</h5>
                    {loadingHistory ? (
                      <div className="flex items-center gap-2 text-zinc-400 text-xs py-4">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading history...
                      </div>
                    ) : priceHistory.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {priceHistory.map((record) => (
                          <div key={record.id} className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-lg font-black text-zinc-900">${record.price.toFixed(2)}</span>
                              {record.originalPrice && record.originalPrice > record.price && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  -{Math.round((1 - record.price / record.originalPrice) * 100)}%
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-zinc-900 truncate">{record.storeName}</p>
                            <p className="text-[10px] font-medium text-zinc-400">
                              {record.extractedAt?.toDate().toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic py-4">No price records found for this product.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="py-20 text-center bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
          <Database className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <p className="text-zinc-400 font-medium">No products found matching your search.</p>
        </div>
      )}
    </div>
  );
}
