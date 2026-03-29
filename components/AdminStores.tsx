'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, Timestamp } from 'firebase/firestore';
import { Store, MapPin, Edit2, Trash2, Plus, Save, X, Loader2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface StoreData {
  id: string;
  name: string;
  location?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  lastUpdated?: Timestamp;
}

export default function AdminStores() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StoreData>>({});
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoreData[];
      setStores(storesData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (store: StoreData) => {
    setEditingId(store.id);
    setEditForm(store);
  };

  const handleSave = async (id: string) => {
    try {
      const storeRef = doc(db, 'stores', id);
      await updateDoc(storeRef, {
        ...editForm,
        lastUpdated: Timestamp.now()
      });
      setEditingId(null);
    } catch (error) {
      console.error('Error updating store:', error);
      alert('Failed to update store');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this store? This will not delete associated prices but may break links.')) return;
    try {
      await deleteDoc(doc(db, 'stores', id));
    } catch (error) {
      console.error('Error deleting store:', error);
      alert('Failed to delete store');
    }
  };

  const handleAdd = async () => {
    if (!editForm.name) return;
    try {
      await addDoc(collection(db, 'stores'), {
        ...editForm,
        lastUpdated: Timestamp.now()
      });
      setIsAdding(false);
      setEditForm({});
    } catch (error) {
      console.error('Error adding store:', error);
      alert('Failed to add store');
    }
  };

  const filteredStores = stores.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.city || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
          />
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditForm({ name: '', city: '', address: '' });
          }}
          className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Store
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-[32px] space-y-4"
            >
              <h4 className="font-black text-emerald-900 uppercase tracking-widest text-xs">New Store</h4>
              <input
                autoFocus
                placeholder="Store Name (e.g. New World IML)"
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-white border border-emerald-100 rounded-xl p-3 text-sm focus:outline-none"
              />
              <input
                placeholder="City (e.g. Suva)"
                value={editForm.city || ''}
                onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                className="w-full bg-white border border-emerald-100 rounded-xl p-3 text-sm focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={editForm.latitude || ''}
                  onChange={e => setEditForm({ ...editForm, latitude: parseFloat(e.target.value) })}
                  className="w-full bg-white border border-emerald-100 rounded-xl p-3 text-sm focus:outline-none"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={editForm.longitude || ''}
                  onChange={e => setEditForm({ ...editForm, longitude: parseFloat(e.target.value) })}
                  className="w-full bg-white border border-emerald-100 rounded-xl p-3 text-sm focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAdd} className="flex-grow bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs">Save</button>
                <button onClick={() => setIsAdding(false)} className="bg-white text-zinc-500 px-4 py-3 rounded-xl font-bold text-xs border border-emerald-100">Cancel</button>
              </div>
            </motion.div>
          )}

          {filteredStores.map((store) => (
            <motion.div
              key={store.id}
              layout
              className={cn(
                "bg-white p-6 rounded-[32px] border transition-all group",
                editingId === store.id ? "border-zinc-900 ring-4 ring-zinc-900/5" : "border-zinc-100 hover:border-zinc-200"
              )}
            >
              {editingId === store.id ? (
                <div className="space-y-3">
                  <input
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-sm font-bold"
                  />
                  <input
                    placeholder="City"
                    value={editForm.city || ''}
                    onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-sm"
                  />
                  <input
                    placeholder="Address"
                    value={editForm.address || ''}
                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Lat"
                      value={editForm.latitude || ''}
                      onChange={e => setEditForm({ ...editForm, latitude: parseFloat(e.target.value) })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Lng"
                      value={editForm.longitude || ''}
                      onChange={e => setEditForm({ ...editForm, longitude: parseFloat(e.target.value) })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleSave(store.id)} className="flex-grow bg-zinc-900 text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2">
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="bg-zinc-100 text-zinc-500 px-3 py-2 rounded-lg font-bold text-xs">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start h-full">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-400 group-hover:text-zinc-900 transition-colors">
                        <Store className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-zinc-900">{store.name}</h4>
                    </div>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-1 mt-auto">
                      <MapPin className="w-3 h-3" />
                      {store.city || 'Location Pending'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(store)} className="p-2 bg-zinc-50 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(store.id)} className="p-2 bg-red-50 text-red-300 hover:text-red-500 hover:bg-red-100 rounded-lg transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredStores.length === 0 && !isAdding && (
        <div className="py-20 text-center bg-zinc-50 rounded-[40px] border border-dashed border-zinc-200">
          <Store className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <p className="text-zinc-400 font-medium">No stores found matching your search.</p>
        </div>
      )}
    </div>
  );
}
