'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, auth } from '@/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { extractFlyerData, FlyerExtractionResult } from '@/lib/gemini';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, Layers, ChevronRight, ChevronDown, ShieldCheck, ShieldAlert, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';

// Helper to resize image and convert to base64
const resizeAndBase64 = (file: File, maxWidth = 1200, maxHeight = 1200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // 0.6 quality to save space
      };
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file for resizing'));
    reader.readAsDataURL(file);
  });
};

// Helper to crop product image from flyer
const cropProductImage = (base64Flyer: string, box: { ymin: number, xmin: number, ymax: number, xmax: number }): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      // Normalized coordinates 0-1000 from Gemini
      const x = (box.xmin / 1000) * img.width;
      const y = (box.ymin / 1000) * img.height;
      const width = ((box.xmax - box.xmin) / 1000) * img.width;
      const height = ((box.ymax - box.ymin) / 1000) * img.height;

      // Set canvas size to cropped area
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      // Draw cropped image
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      
      // Convert to small JPEG to save space in Firestore
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = base64Flyer.startsWith('data:') ? base64Flyer : `data:image/jpeg;base64,${base64Flyer}`;
  });
};

// Validation function for extracted data
const validateFlyerData = (data: FlyerExtractionResult) => {
  const errors: string[] = [];
  if (!data.storeName) errors.push('Missing store name');
  if (data.products.length === 0) errors.push('No products extracted');
  
  data.products.forEach((p, i) => {
    if (!p.name) errors.push(`Product ${i+1}: Missing name`);
    if (p.price <= 0) errors.push(`Product ${i+1}: Invalid price ($${p.price})`);
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ProcessingFile {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  error?: string;
  result?: FlyerExtractionResult;
}

export default function OCRProcessor() {
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    multiple: true,
    noClick: false,
    noKeyboard: false
  });

  const removeFile = (id: string) => {
    setFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      const removed = prev.find(f => f.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
  };

  const processSingleFile = async (fileItem: ProcessingFile) => {
    if (fileItem.status === 'success' || fileItem.status === 'processing') return;

    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'processing', progress: 10 } : f));

    try {
      const base64 = await fileToBase64(fileItem.file);
      const mimeType = fileItem.file.type;
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 20 } : f));
      
      // Resize flyer for storage
      const resizedBase64 = await resizeAndBase64(fileItem.file);
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 30 } : f));
      
      const extraction = await extractFlyerData(base64, mimeType);
      const validation = validateFlyerData(extraction);
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 60 } : f));

      if (auth.currentUser) {
        // 1. Find or create store
        let storeId = '';
        const storesRef = collection(db, 'stores');
        const storeQuery = query(storesRef, where('name', '==', extraction.storeName));
        
        let storeSnap;
        try {
          storeSnap = await getDocs(storeQuery);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'stores');
          return;
        }

        if (storeSnap.empty) {
          try {
            const newStore = await addDoc(storesRef, {
              name: extraction.storeName,
              location: extraction.location || '',
              openingHours: extraction.openingHours || '',
              createdAt: serverTimestamp(),
              needsReview: !validation.isValid,
              validationErrors: validation.errors
            });
            storeId = newStore.id;
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'stores');
            return;
          }
        } else {
          storeId = storeSnap.docs[0].id;
        }

        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 70 } : f));

        // 2. Create flyer record
        let flyerRef;
        try {
          flyerRef = await addDoc(collection(db, 'flyers'), {
            storeId,
            uploadDate: serverTimestamp(),
            validityStart: extraction.validityStart || null,
            validityEnd: extraction.validityEnd || null,
            imageUrl: resizedBase64,
            processed: true,
            createdBy: auth.currentUser.uid,
            needsReview: !validation.isValid,
            validationErrors: validation.errors
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'flyers');
          return;
        }

        // 3. Process products and prices in parallel
        await Promise.all(extraction.products.map(async (prod) => {
          let productId = '';
          const productsRef = collection(db, 'products');
          const productQuery = query(productsRef, where('name', '==', prod.name));
          
          let productSnap;
          try {
            productSnap = await getDocs(productQuery);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, 'products');
            return;
          }

          // Crop product image if bounding box exists
          let productImageUrl = '';
          if (prod.boundingBox) {
            productImageUrl = await cropProductImage(base64, prod.boundingBox);
          }

          if (productSnap.empty) {
            try {
              const newProduct = await addDoc(productsRef, {
                name: prod.name,
                canonicalName: prod.canonicalName || prod.name,
                category: prod.category || 'General',
                brand: prod.brand || '',
                lastPrice: prod.price,
                previousPrice: prod.price,
                priceChange: 0,
                lastStoreId: storeId,
                productImageUrl,
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser?.uid,
                needsReview: !validation.isValid || !prod.boundingBox,
              });
              productId = newProduct.id;
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, 'products');
              return;
            }
          } else {
            productId = productSnap.docs[0].id;
            const existingData = productSnap.docs[0].data();
            const previousPrice = existingData.lastPrice;
            const priceChange = previousPrice ? ((prod.price - previousPrice) / previousPrice) * 100 : 0;

            try {
              await updateDoc(doc(db, 'products', productId), {
                previousPrice: previousPrice,
                lastPrice: prod.price,
                priceChange: priceChange,
                lastStoreId: storeId,
                productImageUrl: productImageUrl || existingData.productImageUrl,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
            }
          }

          try {
            await addDoc(collection(db, 'prices'), {
              productId,
              flyerId: flyerRef.id,
              storeId,
              storeName: extraction.storeName,
              storeLocation: extraction.location || '',
              productName: prod.name,
              price: prod.price,
              unit: prod.unit || '',
              originalPrice: prod.originalPrice || null,
              isSpecial: prod.isSpecial || false,
              productImageUrl,
              boundingBox: prod.boundingBox || null,
              extractedAt: serverTimestamp(),
              createdBy: auth.currentUser?.uid,
              needsReview: !validation.isValid || !prod.boundingBox,
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'prices');
          }
        }));
      }

      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'success', 
        progress: 100, 
        result: extraction 
      } : f));
    } catch (err: any) {
      console.error('Processing error:', err);
      if (err instanceof Error) {
        console.error('Error stack:', err.stack);
      }
      
      let errorMessage = 'Failed to extract data';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object') {
        // Handle ProgressEvent or other browser events
        if (err.type === 'error' && err.target instanceof FileReader) {
          errorMessage = 'File reading failed';
        } else if (err.isTrusted) {
          errorMessage = 'Browser security or network error occurred';
        } else {
          try {
            errorMessage = JSON.stringify(err);
          } catch {
            errorMessage = 'An unknown error occurred during processing';
          }
        }
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'error', 
        error: errorMessage
      } : f));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read file for processing'));
    });
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    
    // Process sequentially to avoid rate limits
    for (const fileItem of pendingFiles) {
      await processSingleFile(fileItem);
    }
    setIsProcessingAll(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Upload Zone */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-zinc-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-zinc-500" />
            Bulk Flyer Upload
          </h2>
          {files.length > 0 && (
            <button
              onClick={processAll}
              disabled={isProcessingAll || files.every(f => f.status === 'success')}
              className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isProcessingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isProcessingAll ? "Processing Queue..." : "Process All Files"}
            </button>
          )}
        </div>
        
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all",
            isDragActive ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
          )}
        >
          <input {...getInputProps()} multiple />
          <div className="text-center">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-zinc-900 font-medium">Click or drag multiple flyers here</p>
            <p className="text-zinc-500 text-sm mt-1">Supports JPEG, PNG, WebP (Hold Shift/Ctrl to select multiple)</p>
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {files.map((fileItem) => (
            <motion.div
              key={fileItem.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-16 rounded-lg overflow-hidden border border-zinc-100 flex-shrink-0 relative">
                  <Image 
                    src={fileItem.preview} 
                    alt="Preview" 
                    fill 
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                <div className="flex-grow min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{fileItem.file.name}</p>
                    <div className="flex items-center gap-2">
                      {fileItem.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {fileItem.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {fileItem.status === 'processing' && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
                      <button 
                        onClick={() => removeFile(fileItem.id)}
                        className="p-1 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <motion.div 
                      className={cn(
                        "h-full transition-all duration-500",
                        fileItem.status === 'error' ? "bg-red-500" : 
                        fileItem.status === 'success' ? "bg-emerald-500" : "bg-zinc-900"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${fileItem.progress}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      {fileItem.status === 'pending' && "Ready to process"}
                      {fileItem.status === 'processing' && `Analyzing... ${fileItem.progress}%`}
                      {fileItem.status === 'success' && "Extraction Complete"}
                      {fileItem.status === 'error' && fileItem.error}
                    </span>
                    {fileItem.status === 'success' && (
                      <button 
                        onClick={() => setExpandedId(expandedId === fileItem.id ? null : fileItem.id)}
                        className="text-xs font-semibold text-zinc-900 flex items-center gap-1 hover:underline"
                      >
                        {expandedId === fileItem.id ? "Hide Details" : "View Details"}
                        {expandedId === fileItem.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Result */}
              <AnimatePresence>
                {expandedId === fileItem.id && fileItem.result && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-100 bg-zinc-50/50"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-lg font-bold text-zinc-900">{fileItem.result.storeName}</h4>
                          <p className="text-xs text-zinc-500">{fileItem.result.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase">Products Found</p>
                          <p className="text-lg font-bold text-zinc-900">{fileItem.result.products.length}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {fileItem.result.products.slice(0, 5).map((prod, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-zinc-100">
                            {prod.boundingBox && (
                              <div className="w-10 h-10 rounded bg-zinc-50 flex items-center justify-center overflow-hidden border border-zinc-100">
                                <ImageIcon className="w-4 h-4 text-zinc-300" />
                              </div>
                            )}
                            <div className="flex-grow">
                              <p className="text-sm font-medium text-zinc-700">{prod.name}</p>
                              <p className="text-[10px] text-zinc-400 uppercase font-bold">{prod.category}</p>
                            </div>
                            <span className="font-bold text-zinc-900">${prod.price.toFixed(2)}</span>
                          </div>
                        ))}
                        {fileItem.result.products.length > 5 && (
                          <p className="text-center text-xs text-zinc-400 pt-2">
                            + {fileItem.result.products.length - 5} more products extracted
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {files.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
            <FileText className="w-12 h-12 text-zinc-300 mb-4" />
            <p className="text-zinc-500 font-medium">No files uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
