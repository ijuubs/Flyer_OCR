'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, auth } from '@/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { extractFlyerData, FlyerExtractionResult, generateProductImage, ExtractedProduct } from '@/lib/gemini';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, Layers, ChevronRight, ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Helper to resize image from URL and convert to base64
const resizeImageFromUrl = (url: string, maxWidth = 1200, maxHeight = 1200): Promise<string> => {
  return new Promise((resolve, reject) => {
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
    img.src = url;
  });
};

// Helper to crop product image from flyer URL
const cropProductImageFromUrl = (url: string, box: { ymin: number, xmin: number, ymax: number, xmax: number }, maxWidth = 400, maxHeight = 400): Promise<string> => {
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
      let x = (box.xmin / 1000) * img.width;
      let y = (box.ymin / 1000) * img.height;
      let width = ((box.xmax - box.xmin) / 1000) * img.width;
      let height = ((box.ymax - box.ymin) / 1000) * img.height;

      // Add 5% padding around the box to ensure text isn't cut off
      const padX = width * 0.05;
      const padY = height * 0.05;
      
      x = Math.max(0, x - padX);
      y = Math.max(0, y - padY);
      width = Math.min(img.width - x, width + (padX * 2));
      height = Math.min(img.height - y, height + (padY * 2));

      // Resize if too large
      let finalWidth = width;
      let finalHeight = height;

      if (finalWidth > finalHeight) {
        if (finalWidth > maxWidth) {
          finalHeight *= maxWidth / finalWidth;
          finalWidth = maxWidth;
        }
      } else {
        if (finalHeight > maxHeight) {
          finalWidth *= maxHeight / finalHeight;
          finalHeight = maxHeight;
        }
      }

      // Set canvas size to cropped area
      canvas.width = Math.max(1, finalWidth);
      canvas.height = Math.max(1, finalHeight);

      // Draw cropped image
      ctx.drawImage(img, x, y, width, height, 0, 0, finalWidth, finalHeight);
      
      // Convert to small JPEG to save space in Firestore
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve('');
    img.src = url;
  });
};

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test successful");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}

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
  status: 'pending' | 'processing' | 'success' | 'error' | 'saving' | 'saved';
  progress: number;
  error?: string;
  result?: FlyerExtractionResult;
}

export default function OCRProcessor() {
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
  }, []);

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

  const updateResult = (fileId: string, updatedResult: FlyerExtractionResult) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, result: updatedResult } : f));
  };

  const updateProduct = (fileId: string, productIdx: number, updatedProduct: Partial<ExtractedProduct>) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId && f.result) {
        const newProducts = [...f.result.products];
        newProducts[productIdx] = { ...newProducts[productIdx], ...updatedProduct };
        return { ...f, result: { ...f.result, products: newProducts } };
      }
      return f;
    }));
  };

  const extractData = async (fileItem: ProcessingFile) => {
    if (fileItem.status === 'success' || fileItem.status === 'processing' || fileItem.status === 'saved') return;

    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'processing', progress: 10 } : f));

    try {
      const base64DataUrl = await fileToBase64(fileItem.file);
      const base64 = base64DataUrl.split(',')[1];
      const mimeType = fileItem.file.type;
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 30 } : f));
      
      const extraction = await extractFlyerData(base64, mimeType);
      console.log('Extraction successful:', extraction);
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'success', 
        progress: 100, 
        result: extraction 
      } : f));
      
      // Auto-expand the first successful extraction if nothing is expanded
      if (!expandedId) setExpandedId(fileItem.id);
      
    } catch (err: unknown) {
      console.error('Extraction error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract data';
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'error', 
        error: errorMessage
      } : f));
    }
  };

  const saveToFirestore = async (fileItem: ProcessingFile) => {
    if (!fileItem.result || fileItem.status === 'saving' || fileItem.status === 'saved') return;
    if (!auth.currentUser) {
      alert("You must be logged in to save data.");
      return;
    }

    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'saving', progress: 0 } : f));
    
    try {
      const extraction = fileItem.result;
      const validation = validateFlyerData(extraction);
      
      // Resize flyer for storage using the preview URL
      const resizedBase64 = await resizeImageFromUrl(fileItem.preview);
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 20 } : f));

      // 1. Find or create store
      let storeId = '';
      const storesRef = collection(db, 'stores');
      const storeQuery = query(storesRef, where('name', '==', extraction.storeName));
      
      let storeSnap;
      try {
        storeSnap = await getDocs(storeQuery);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'stores');
        return; // handleFirestoreError throws, but for TS
      }

      if (storeSnap.empty) {
        let newStore;
        try {
          newStore = await addDoc(storesRef, {
            name: extraction.storeName,
            location: extraction.location || '',
            openingHours: extraction.openingHours || '',
            createdAt: serverTimestamp(),
            needsReview: !validation.isValid,
            validationErrors: validation.errors
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'stores');
          return;
        }
        storeId = newStore.id;
      } else {
        storeId = storeSnap.docs[0].id;
      }

      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 40 } : f));

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
          createdBy: auth.currentUser?.uid,
          needsReview: !validation.isValid,
          validationErrors: validation.errors
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'flyers');
        return;
      }

      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: 60 } : f));

      // 3. Process products and prices
      const totalProducts = extraction.products.length;
      let processedCount = 0;

      for (const prod of extraction.products) {
        let productId = '';
        const productsRef = collection(db, 'products');
        const productQuery = query(productsRef, where('name', '==', prod.name));
        let productSnap;
        try {
          productSnap = await getDocs(productQuery);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'products');
          continue; // Skip this product if fetch fails
        }

        // Crop product image if bounding box exists using the preview URL
        let productImageUrl = '';
        if (prod.boundingBox) {
          productImageUrl = await cropProductImageFromUrl(fileItem.preview, prod.boundingBox);
        }

        if (productSnap.empty) {
          // Generate AI placeholder image for new product
          let aiPlaceholderUrl = await generateProductImage(
            prod.canonicalName || prod.name, 
            prod.category || 'Other',
            prod.imageDescription
          );

          // Resize AI image to ensure it's small
          if (aiPlaceholderUrl.startsWith('data:')) {
            aiPlaceholderUrl = await resizeImageFromUrl(aiPlaceholderUrl, 400, 400);
          }

          let newProduct;
          try {
            newProduct = await addDoc(productsRef, {
              name: prod.name,
              canonicalName: prod.canonicalName || prod.name,
              category: prod.category || 'Other',
              brand: prod.brand || '',
              lastPrice: prod.price,
              previousPrice: prod.price,
              priceChange: 0,
              lastStoreId: storeId,
              productImageUrl: aiPlaceholderUrl,
              createdAt: serverTimestamp(),
              createdBy: auth.currentUser?.uid,
              needsReview: !validation.isValid || !prod.boundingBox,
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, 'products');
            continue;
          }
          productId = newProduct.id;
        } else {
          productId = productSnap.docs[0].id;
          const existingData = productSnap.docs[0].data();
          const previousPrice = existingData.lastPrice;
          const priceChange = previousPrice ? ((prod.price - previousPrice) / previousPrice) * 100 : 0;

          let updatedImageUrl = existingData.productImageUrl;
          if (!updatedImageUrl) {
            updatedImageUrl = await generateProductImage(
              prod.canonicalName || prod.name, 
              prod.category || 'Other',
              prod.imageDescription
            );
            
            // Resize AI image to ensure it's small
            if (updatedImageUrl.startsWith('data:')) {
              updatedImageUrl = await resizeImageFromUrl(updatedImageUrl, 400, 400);
            }
          }

          try {
            await updateDoc(doc(db, 'products', productId), {
              previousPrice: previousPrice,
              lastPrice: prod.price,
              priceChange: priceChange,
              lastStoreId: storeId,
              productImageUrl: updatedImageUrl,
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `products/${productId}`);
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
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'prices');
        }

        processedCount++;
        const currentProgress = 60 + (processedCount / totalProducts) * 40;
        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, progress: currentProgress } : f));
      }

      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'saved', 
        progress: 100 
      } : f));

    } catch (err: unknown) {
      console.error('Saving error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Save failed';
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'error', 
        error: errorMessage
      } : f));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    for (const fileItem of pendingFiles) {
      await extractData(fileItem);
    }
    setIsProcessingAll(false);
  };

  const saveAll = async () => {
    setIsProcessingAll(true);
    const readyFiles = files.filter(f => f.status === 'success');
    for (const fileItem of readyFiles) {
      await saveToFirestore(fileItem);
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
          <div className="flex items-center gap-3">
            {files.some(f => f.status === 'pending' || f.status === 'error') && (
              <button
                onClick={processAll}
                disabled={isProcessingAll}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {isProcessingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Extract All
              </button>
            )}
            {files.some(f => f.status === 'success') && (
              <button
                onClick={saveAll}
                disabled={isProcessingAll}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {isProcessingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Save All Reviewed
              </button>
            )}
          </div>
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
                        {fileItem.status === 'pending' && "Ready to extract"}
                        {fileItem.status === 'processing' && `Analyzing... ${fileItem.progress}%`}
                        {fileItem.status === 'success' && "Review Required"}
                        {fileItem.status === 'saving' && `Saving... ${Math.round(fileItem.progress)}%`}
                        {fileItem.status === 'saved' && "Successfully Saved"}
                        {fileItem.status === 'error' && fileItem.error}
                      </span>
                      {(fileItem.status === 'success' || fileItem.status === 'saved' || fileItem.status === 'saving') && (
                        <button 
                          onClick={() => setExpandedId(expandedId === fileItem.id ? null : fileItem.id)}
                          className="text-xs font-semibold text-zinc-900 flex items-center gap-1 hover:underline"
                        >
                          {expandedId === fileItem.id ? "Hide Details" : "Review & Edit"}
                          {expandedId === fileItem.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                      {fileItem.status === 'pending' && (
                        <button 
                          onClick={() => extractData(fileItem)}
                          className="text-xs font-bold text-zinc-900 uppercase tracking-tight hover:underline"
                        >
                          Extract Now
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
                      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                        <div className="flex-grow space-y-3 w-full">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Store Name</label>
                            <input 
                              type="text" 
                              value={fileItem.result.storeName}
                              onChange={(e) => updateResult(fileItem.id, { ...fileItem.result!, storeName: e.target.value })}
                              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Location</label>
                              <input 
                                type="text" 
                                value={fileItem.result.location || ''}
                                onChange={(e) => updateResult(fileItem.id, { ...fileItem.result!, location: e.target.value })}
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Validity End</label>
                              <input 
                                type="text" 
                                value={fileItem.result.validityEnd || ''}
                                onChange={(e) => updateResult(fileItem.id, { ...fileItem.result!, validityEnd: e.target.value })}
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                                placeholder="YYYY-MM-DD"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase">Products Found</p>
                            <p className="text-2xl font-black text-zinc-900">{fileItem.result.products.length}</p>
                          </div>
                          {fileItem.status === 'success' && (
                            <button
                              onClick={() => saveToFirestore(fileItem)}
                              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              Save to Database
                            </button>
                          )}
                          {fileItem.status === 'saved' && (
                            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold flex items-center gap-2 border border-emerald-100">
                              <CheckCircle2 className="w-4 h-4" />
                              Saved Successfully
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Product List</h5>
                        {fileItem.result.products.map((prod, idx) => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-3 rounded-xl border border-zinc-200 shadow-sm items-center">
                            <div className="md:col-span-5">
                              <input 
                                type="text" 
                                value={prod.name}
                                onChange={(e) => updateProduct(fileItem.id, idx, { name: e.target.value })}
                                className="w-full text-sm font-bold text-zinc-900 border-none p-0 focus:ring-0"
                              />
                              <div className="flex items-center gap-2 mt-1">
                                <select 
                                  value={prod.category || 'Other'}
                                  onChange={(e) => updateProduct(fileItem.id, idx, { category: e.target.value })}
                                  className="text-[10px] font-black text-zinc-400 uppercase tracking-wider bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-zinc-600"
                                >
                                  {['Dairy', 'Meat', 'Pantry', 'Household', 'Produce', 'Frozen', 'Beverages', 'Snacks', 'Other'].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                {prod.boundingBox ? (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">IMAGE OK</span>
                                ) : (
                                  <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-bold">NO IMAGE</span>
                                )}
                              </div>
                            </div>
                            <div className="md:col-span-3">
                              <div className="flex items-center gap-1">
                                <span className="text-zinc-400 text-sm font-bold">$</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={prod.price}
                                  onChange={(e) => updateProduct(fileItem.id, idx, { price: parseFloat(e.target.value) || 0 })}
                                  className="w-20 text-lg font-black text-zinc-900 border-none p-0 focus:ring-0"
                                />
                              </div>
                            </div>
                            <div className="md:col-span-3">
                              <input 
                                type="text" 
                                value={prod.unit || ''}
                                onChange={(e) => updateProduct(fileItem.id, idx, { unit: e.target.value })}
                                className="w-full text-xs text-zinc-500 border-none p-0 focus:ring-0"
                                placeholder="Unit (e.g. 1kg, 500ml)"
                              />
                            </div>
                            <div className="md:col-span-1 flex justify-end">
                              <button 
                                onClick={() => {
                                  const newProducts = [...fileItem.result!.products];
                                  newProducts.splice(idx, 1);
                                  updateResult(fileItem.id, { ...fileItem.result!, products: newProducts });
                                }}
                                className="p-1.5 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        
                        <button 
                          onClick={() => {
                            const newProduct = { name: 'New Product', price: 0, unit: '', isSpecial: false, category: 'Other' };
                            updateResult(fileItem.id, { ...fileItem.result!, products: [...fileItem.result!.products, newProduct as ExtractedProduct] });
                          }}
                          className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400 text-sm font-bold hover:border-zinc-300 hover:text-zinc-500 transition-all flex items-center justify-center gap-2"
                        >
                          + Add Product Manually
                        </button>
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
