'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, auth, OperationType, handleFirestoreError } from '@/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { extractFlyerData, FlyerExtractionResult, ExtractedProduct } from '@/lib/gemini';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function OCRProcessor() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<FlyerExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
      setResult(null);
      setError(null);
      setSuccess(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    multiple: false,
  });

  const processFlyer = async () => {
    if (!file || !preview) return;
    setProcessing(true);
    setError(null);

    try {
      const base64 = preview.split(',')[1];
      const mimeType = file.type;
      
      const extraction = await extractFlyerData(base64, mimeType);
      setResult(extraction);

      // Save to Firestore
      if (auth.currentUser) {
        // 1. Find or create store
        let storeId = '';
        const storesRef = collection(db, 'stores');
        const storeQuery = query(storesRef, where('name', '==', extraction.storeName));
        const storeSnap = await getDocs(storeQuery);

        if (storeSnap.empty) {
          const newStore = await addDoc(storesRef, {
            name: extraction.storeName,
            location: extraction.location || '',
            openingHours: extraction.openingHours || '',
            createdAt: serverTimestamp(),
          });
          storeId = newStore.id;
        } else {
          storeId = storeSnap.docs[0].id;
        }

        // 2. Create flyer record
        const flyerRef = await addDoc(collection(db, 'flyers'), {
          storeId,
          uploadDate: serverTimestamp(),
          validityStart: extraction.validityStart || null,
          validityEnd: extraction.validityEnd || null,
          imageUrl: preview, // In a real app, upload to storage first
          processed: true,
          createdBy: auth.currentUser.uid,
        });

        // 3. Process products and prices
        for (const prod of extraction.products) {
          // Find or create product
          let productId = '';
          const productsRef = collection(db, 'products');
          const productQuery = query(productsRef, where('name', '==', prod.name));
          const productSnap = await getDocs(productQuery);

          if (productSnap.empty) {
            const newProduct = await addDoc(productsRef, {
              name: prod.name,
              category: prod.category || 'General',
              brand: prod.brand || '',
              lastPrice: prod.price,
              lastStoreId: storeId,
              createdAt: serverTimestamp(),
            });
            productId = newProduct.id;
          } else {
            productId = productSnap.docs[0].id;
            await updateDoc(doc(db, 'products', productId), {
              lastPrice: prod.price,
              lastStoreId: storeId,
              updatedAt: serverTimestamp(),
            });
          }

          // Create price record
          await addDoc(collection(db, 'prices'), {
            productId,
            flyerId: flyerRef.id,
            storeId,
            price: prod.price,
            unit: prod.unit || '',
            originalPrice: prod.originalPrice || null,
            isSpecial: prod.isSpecial || false,
            extractedAt: serverTimestamp(),
          });
        }
        setSuccess(true);
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError('Failed to process flyer. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-zinc-500" />
          Upload Supermarket Flyer
        </h2>
        
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all",
            isDragActive ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400",
            preview ? "p-4" : "p-10"
          )}
        >
          <input {...getInputProps()} />
          {preview ? (
            <div className="relative w-full max-w-md aspect-[3/4] rounded-lg overflow-hidden border border-zinc-200">
              <img src={preview} alt="Flyer preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <p className="text-white text-sm font-medium">Click to change image</p>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-6 h-6 text-zinc-500" />
              </div>
              <p className="text-zinc-900 font-medium">Click or drag flyer image here</p>
              <p className="text-zinc-500 text-sm mt-1">Supports JPEG, PNG, WebP</p>
            </div>
          )}
        </div>

        {file && !processing && !success && (
          <button
            onClick={processFlyer}
            className="w-full mt-6 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
          >
            <Loader2 className={cn("w-4 h-4 animate-spin", !processing && "hidden")} />
            {processing ? "Processing with AI..." : "Extract Product Details"}
          </button>
        )}

        {processing && (
          <div className="mt-6 p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-zinc-900 animate-spin" />
            <div>
              <p className="text-sm font-medium text-zinc-900">AI is analyzing the flyer...</p>
              <p className="text-xs text-zinc-500">This may take up to 30 seconds</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <p className="text-sm font-medium">Flyer processed and data saved successfully!</p>
          </div>
        )}
      </div>

      {result && (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold text-zinc-900">{result.storeName}</h3>
              {result.location && <p className="text-zinc-500 text-sm">{result.location}</p>}
            </div>
            {(result.validityStart || result.validityEnd) && (
              <div className="text-right">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Validity</p>
                <p className="text-sm font-medium text-zinc-700">
                  {result.validityStart ? new Date(result.validityStart).toLocaleDateString() : 'N/A'} - {result.validityEnd ? new Date(result.validityEnd).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Product</th>
                  <th className="py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Price</th>
                  <th className="py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Unit</th>
                  <th className="py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {result.products.map((prod, idx) => (
                  <tr key={idx} className="group hover:bg-zinc-50/50 transition-colors">
                    <td className="py-4">
                      <p className="font-medium text-zinc-900">{prod.name}</p>
                      {prod.brand && <p className="text-xs text-zinc-500">{prod.brand}</p>}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900">${prod.price.toFixed(2)}</span>
                        {prod.originalPrice && (
                          <span className="text-xs text-zinc-400 line-through">${prod.originalPrice.toFixed(2)}</span>
                        )}
                        {prod.isSpecial && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded uppercase">Special</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-sm text-zinc-600">{prod.unit}</td>
                    <td className="py-4">
                      <span className="px-2 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-full">
                        {prod.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
