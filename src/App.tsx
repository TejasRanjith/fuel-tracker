import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Save, History, Plus, Trash2, Fuel, Gauge, IndianRupee, ChevronRight, Upload, X, Check, Loader2, Info, Cloud, CloudOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, Timestamp } from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Types ---
interface FuelEntry {
  id: string;
  date: string;
  odometer: number;
  fuelAmount: number; // Liters
  price: number; // Total cost
  station?: string;
  // Computed fields (not stored in DB usually, but calculated on load)
  mileage?: number; 
  distance?: number; 
}

// --- Main Application ---
export default function App() {
  const [view, setView] = useState<'home' | 'add'>('home');
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loadingOCR, setLoadingOCR] = useState(false);
  const [tesseractLoaded, setTesseractLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // 1. Authentication
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Data from Firestore
  useEffect(() => {
    if (!user) return;

    // Path: /artifacts/{appId}/users/{userId}/fuel_logs
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'fuel_logs');

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FuelEntry[];

      // Sort by odometer descending (newest first)
      const sorted = rawEntries.sort((a, b) => b.odometer - a.odometer);

      // Calculate Mileage on the fly
      const computedEntries = sorted.map((e, index) => {
        if (index === sorted.length - 1) return { ...e, distance: 0, mileage: 0 };
        
        const prev = sorted[index + 1];
        const distance = e.odometer - prev.odometer;
        const mileage = distance > 0 && e.fuelAmount > 0 
          ? parseFloat((distance / e.fuelAmount).toFixed(2)) 
          : 0;
        
        return { ...e, distance, mileage };
      });

      setEntries(computedEntries);
      setLoadingData(false);
    }, (error) => {
      console.error("Error fetching data:", error);
      setLoadingData(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Tesseract
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => setTesseractLoaded(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSaveEntry = async (entry: Partial<FuelEntry>) => {
    if (!user) return;
    
    try {
      // We only save the raw data to Firestore
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'fuel_logs'), {
        date: entry.date,
        odometer: entry.odometer,
        fuelAmount: entry.fuelAmount,
        price: entry.price,
        station: entry.station || ''
      });
      setView('home');
    } catch (e) {
      console.error("Error saving entry:", e);
      alert("Failed to save to cloud. Check connection.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'fuel_logs', id));
    } catch (e) {
      console.error("Error deleting:", e);
      alert("Failed to delete.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-indigo-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <Fuel className="h-6 w-6" />
            <h1 className="text-xl font-bold tracking-tight">FuelTrack<span className="text-indigo-200">AI</span></h1>
          </div>
          <div className="flex items-center gap-3">
             {/* Cloud Status Indicator */}
             {user ? (
               <Cloud className="h-4 w-4 text-indigo-300" title="Syncing to Cloud" />
             ) : (
               <CloudOff className="h-4 w-4 text-rose-300" title="Offline" />
             )}
            {view === 'add' && (
              <button 
                onClick={() => setView('home')}
                className="p-1 hover:bg-indigo-500 rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mb-2 text-indigo-500" />
            <p>Syncing your history...</p>
          </div>
        ) : view === 'home' ? (
          <Dashboard entries={entries} onAdd={() => setView('add')} onDelete={handleDelete} />
        ) : (
          <AddEntryForm 
            onSave={handleSaveEntry} 
            loadingOCR={loadingOCR} 
            setLoadingOCR={setLoadingOCR}
            isTesseractReady={tesseractLoaded}
          />
        )}
      </main>

      {/* FAB for Home View */}
      {view === 'home' && !loadingData && (
        <button
          onClick={() => setView('add')}
          className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 active:scale-95 transition-all z-20"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

// --- Dashboard Component ---
const Dashboard = ({ entries, onAdd, onDelete }: { entries: FuelEntry[], onAdd: () => void, onDelete: (id: string) => void }) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (entries.length < 2) return null;
    const totalDist = entries[0].odometer - entries[entries.length - 1].odometer;
    
    // Average calculation
    const validMileages = entries.filter(e => e.mileage && e.mileage > 0).map(e => e.mileage || 0);
    const avgMileage = validMileages.length ? (validMileages.reduce((a, b) => a + b, 0) / validMileages.length).toFixed(1) : '0';
    
    return {
      totalDist,
      avgMileage,
      lastMileage: entries[0].mileage?.toFixed(1) || '0'
    };
  }, [entries]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-24">
          <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold tracking-wider">
            <Gauge className="h-4 w-4" /> Avg Mileage
          </div>
          <div className="text-2xl font-black text-indigo-600">
            {stats ? stats.avgMileage : '--'} <span className="text-sm font-normal text-slate-400">km/L</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-24">
          <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold tracking-wider">
            <History className="h-4 w-4" /> Last Run
          </div>
          <div className="text-2xl font-black text-emerald-600">
             {stats ? stats.lastMileage : '--'} <span className="text-sm font-normal text-slate-400">km/L</span>
          </div>
        </div>
      </div>

      {/* List */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          History <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{entries.length} entries</span>
        </h2>
        
        {entries.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
            <Fuel className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500">No logs yet.</p>
            <p className="text-sm text-slate-400">Tap the + button to add your first fill-up.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group relative overflow-hidden">
                <div>
                  <div className="font-bold text-slate-800 text-lg">{entry.odometer.toLocaleString()} km</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                    <span>{new Date(entry.date).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-medium text-slate-600">₹{entry.price}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {entry.mileage ? (
                    <div className="text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded-lg text-sm mb-1">
                      {entry.mileage} km/L
                    </div>
                  ) : (
                    <div className="text-slate-300 text-xs italic mb-1">First Log</div>
                  )}
                  <div className="text-xs text-slate-400">{entry.fuelAmount} L</div>
                </div>

                {/* Delete Actions */}
                <div className="ml-3">
                  {confirmDeleteId === entry.id ? (
                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-4">
                      <button 
                        onClick={() => { onDelete(entry.id); setConfirmDeleteId(null); }} 
                        className="p-2 text-white bg-rose-500 hover:bg-rose-600 rounded-full shadow-sm"
                        title="Confirm Delete"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(null)} 
                        className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmDeleteId(entry.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Add Entry Form with OCR ---
const AddEntryForm = ({ 
  onSave, 
  loadingOCR, 
  setLoadingOCR,
  isTesseractReady 
}: { 
  onSave: (e: Partial<FuelEntry>) => void, 
  loadingOCR: boolean, 
  setLoadingOCR: (b: boolean) => void,
  isTesseractReady: boolean 
}) => {
  const [formData, setFormData] = useState({
    odometer: '',
    price: '',
    fuelAmount: ''
  });
  const [detectedNumbers, setDetectedNumbers] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    if (!isTesseractReady) {
      alert("OCR Engine is still loading, please wait a moment.");
      return;
    }

    setLoadingOCR(true);
    setDetectedNumbers([]);

    try {
      // @ts-ignore
      const worker = await window.Tesseract.createWorker('eng');
      const ret = await worker.recognize(file);
      await worker.terminate();

      const text = ret.data.text;
      const numbers = text.match(/[\d,]+(\.\d+)?/g);
      
      if (numbers) {
        const cleanNumbers = numbers.map(n => n.replace(/,/g, '')).filter(n => !isNaN(parseFloat(n)) && parseFloat(n) > 0);
        const unique = Array.from(new Set(cleanNumbers)).sort((a, b) => parseFloat(b) - parseFloat(a));
        setDetectedNumbers(unique);
      } else {
        alert("No clear numbers detected.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to read image.");
    } finally {
      setLoadingOCR(false);
    }
  };

  const assignValue = (val: string, field: 'odometer' | 'price' | 'fuelAmount') => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.odometer || !formData.fuelAmount || !formData.price) {
      alert("Please fill in all fields");
      return;
    }
    
    onSave({
      date: new Date().toISOString(),
      odometer: parseFloat(formData.odometer),
      price: parseFloat(formData.price),
      fuelAmount: parseFloat(formData.fuelAmount)
    });
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white p-6 rounded-3xl shadow-lg border border-indigo-50">
        
        {/* OCR Section */}
        <div className="mb-8">
          <label className="block w-full cursor-pointer group">
             <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <div className={`
              relative overflow-hidden rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 
              flex flex-col items-center justify-center py-8 px-4 text-center transition-all
              ${loadingOCR ? 'opacity-75 cursor-wait' : 'hover:bg-indigo-50 hover:border-indigo-400'}
            `}>
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                  <div className="relative z-10 bg-white/90 p-2 rounded-full shadow-sm mb-2">
                    <Camera className="h-6 w-6 text-indigo-600" />
                  </div>
                  <span className="relative z-10 text-sm font-medium text-indigo-900">
                    {loadingOCR ? 'Analyzing Image...' : 'Tap to retake'}
                  </span>
                </>
              ) : (
                <>
                  <div className="bg-white p-3 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                    <Camera className="h-6 w-6 text-indigo-600" />
                  </div>
                  <span className="text-sm font-semibold text-indigo-900">Scan Meter or Pump</span>
                  <span className="text-xs text-indigo-400 mt-1">Supports Odometer & Fuel Receipt</span>
                </>
              )}
              
              {loadingOCR && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
                  <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                </div>
              )}
            </div>
          </label>

          {/* Detected Numbers Chips */}
          {detectedNumbers.length > 0 && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Tap number to assign</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {detectedNumbers.map((num, idx) => (
                  <div key={idx} className="group relative">
                    <button type="button" className="bg-slate-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-700 active:scale-95 transition-all">
                      {num}
                    </button>
                    {/* Tooltip menu for assignment */}
                    <div className="absolute -bottom-10 left-0 bg-white shadow-xl rounded-lg flex overflow-hidden border border-slate-100 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                      <button type="button" onClick={() => assignValue(num, 'odometer')} className="p-2 hover:bg-indigo-50 text-indigo-600" title="Odometer"><Gauge className="h-4 w-4"/></button>
                      <button type="button" onClick={() => assignValue(num, 'fuelAmount')} className="p-2 hover:bg-emerald-50 text-emerald-600" title="Fuel"><Fuel className="h-4 w-4"/></button>
                      <button type="button" onClick={() => assignValue(num, 'price')} className="p-2 hover:bg-amber-50 text-amber-600" title="Price"><IndianRupee className="h-4 w-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Odometer Reading</label>
              <div className="relative">
                <Gauge className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="number"
                  step="0.1"
                  value={formData.odometer}
                  onChange={e => setFormData({...formData, odometer: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-lg"
                  placeholder="e.g. 12500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fuel (Liters)</label>
                <div className="relative">
                  <Fuel className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={formData.fuelAmount}
                    onChange={e => setFormData({...formData, fuelAmount: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all font-mono text-lg"
                    placeholder="e.g. 2.50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Cost</label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all font-mono text-lg"
                    placeholder="e.g. 250"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Save className="h-5 w-5" />
            Save to Cloud
          </button>
        </form>
      </div>
    </div>
  );
};
