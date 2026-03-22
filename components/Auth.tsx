'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { auth } from '@/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export default function Auth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) return <div className="animate-pulse h-10 w-32 bg-zinc-200 rounded-lg"></div>;

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm font-medium"
      >
        <LogIn className="w-4 h-4" />
        Sign In with Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        {user.photoURL ? (
          <div className="relative w-8 h-8">
            <Image 
              src={user.photoURL} 
              alt={user.displayName || ''} 
              fill 
              className="rounded-full border border-zinc-200 object-cover" 
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200">
            <UserIcon className="w-4 h-4 text-zinc-500" />
          </div>
        )}
        <span className="text-sm font-medium text-zinc-700 hidden sm:inline">{user.displayName}</span>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 transition-colors text-sm font-medium"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}
