import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { User, ClipboardList, Search, LogOut } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('edit'); // 'edit' o 'search'
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Revisa si hay sesión activa al cargar
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  const login = () => supabase.auth.signInWithOAuth({ provider: 'google' });
  const logout = () => supabase.auth.signOut();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h1 className="text-3xl font-bold mb-6 text-blue-600">Mi Álbum Online</h1>
        <button onClick={login} className="bg-white border p-3 rounded-lg shadow hover:bg-gray-50 flex items-center gap-2">
          <img src="https://www.google.com/favicon.ico" className="w-5" alt="G" />
          Entrar con Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Menu Superior */}
      <nav className="bg-blue-600 text-white p-4 sticky top-0 z-10 flex justify-between items-center shadow-lg">
        <div className="flex gap-6">
          <button onClick={() => setView('edit')} className={`flex items-center gap-2 ${view === 'edit' ? 'underline font-bold' : ''}`}>
            <ClipboardList size={20} /> Mis Estampas
          </button>
          <button onClick={() => setView('search')} className={`flex items-center gap-2 ${view === 'search' ? 'underline font-bold' : ''}`}>
            <Search size={20} /> Encontrar
          </button>
        </div>
        <button onClick={logout} className="text-blue-100"><LogOut size={20} /></button>
      </nav>

      <div className="max-w-4xl mx-auto p-4">
        {view === 'edit' ? <StickerEditor userId={session.user.id} /> : <MatchFinder userId={session.user.id} />}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTE: EDITOR DE ESTAMPAS ---
function StickerEditor({ userId }) {
  const [data, setData] = useState({});
  const totalStickers = 900;

  const toggleMissing = async (num, currentVal) => {
    const newVal = !currentVal;
    await supabase.from('user_stickers').upsert({ user_id: userId, sticker_number: num, is_missing: newVal });
    setData({ ...data, [num]: { ...data[num], is_missing: newVal } });
  };

  const updateRepeated = async (num, count) => {
    await supabase.from('user_stickers').upsert({ user_id: userId, sticker_number: num, repeated_count: count });
    setData({ ...data, [num]: { ...data[num], repeated_count: count } });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {Array.from({ length: totalStickers }, (_, i) => i + 1).map(num => (
        <div key={num} className="bg-white p-3 rounded-xl shadow-sm border border-gray-200">
          <span className="text-xl font-black text-gray-400">#{num}</span>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={data[num]?.is_missing || false} onChange={() => toggleMissing(num, data[num]?.is_missing)} />
              ¿Me falta?
            </label>
            <input 
              type="number" min="0" placeholder="Reps" 
              className="w-full text-xs border rounded p-1"
              value={data[num]?.repeated_count || 0}
              onChange={(e) => updateRepeated(num, parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- SUB-COMPONENTE: ENCONTRAR INTERCAMBIOS ---
function EncontrarIntercambios({ userId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Nuevo: Para saber si algo truena

  const buscarMatch = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Mis datos
      const { data: misDatos, error: err1 } = await supabase
        .from('user_stickers')
        .select('*')
        .eq('user_id', userId);

      if (err1) throw new Error("Error leyendo mis datos");

      const misFaltantes = misDatos.filter(s => s.is_missing).map(s => Number(s.sticker_number));
      const misRepetidas = misDatos.filter(s => s.repeated_count > 0).map(s => Number(s.sticker_number));

      // 2. Datos de otros
      const { data: otrosDatos, error: err2 } = await supabase
        .from('user_stickers')
        .select('*')
        .neq('user_id', userId);

      if (err2) throw new Error("Error leyendo otros datos");

      // 3. Cruce
      const sugerencias = {};
      otrosDatos.forEach(reg => {
        const otroId = reg.user_id;
        const n = Number(reg.sticker_number);
        if (!sugerencias[otroId]) sugerencias[otroId] = { tieneParaMi: [], yoTengoParaEl: [] };

        if (reg.repeated_count > 0 && misFaltantes.includes(n)) {
          sugerencias[otroId].tieneParaMi.push(n);
        }
        if (reg.is_missing && misRepetidas.includes(n)) {
          sugerencias[otroId].yoTengoParaEl.push(n);
        }
      });

      const listaFinal = Object.entries(sugerencias)
        .map(([id, info]) => ({ id, ...info }))
        .filter(m => m.tieneParaMi.length > 0 || m.yoTengoParaEl.length > 0);

      setMatches(listaFinal);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-3xl min-h-[200px]">
      <button 
        onClick={buscarMatch}
        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl mb-4 shadow-lg active:scale-95 transition-all"
      >
        {loading ? "⌛ Buscando..." : "🔎 Buscar Intercambios"}
      </button>

      {/* ERROR VISIBLE */}
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-xl mb-4 text-sm font-bold">
          ⚠️ Error técnico: {error}
        </div>
      )}

      {/* LEYENDA SI NO HAY COINCIDENCIAS */}
      {matches.length === 0 && !loading && !error && (
        <div className="text-center p-10 border-2 border-dashed border-gray-200 rounded-3xl">
          <p className="text-gray-400 font-medium">No se encontraron cambios.</p>
          <p className="text-gray-300 text-xs mt-2">Prueba marcando más repetidas o dile a un amigo que se registre.</p>
        </div>
      )}

      {/* LISTA DE RESULTADOS */}
      <div className="space-y-4">
        {matches.map(m => (
          <div key={m.id} className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-3 tracking-widest">Candidato: {m.id.slice(0, 8)}</h4>
            <div className="space-y-3">
              <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                <p className="text-[10px] font-bold text-green-600 mb-1">🎁 TE DA:</p>
                <div className="flex flex-wrap gap-1">
                  {m.tieneParaMi.map(n => <span key={n} className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-bold">#{n}</span>)}
                </div>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <p className="text-[10px] font-bold text-blue-600 mb-1">🤝 TÚ LE DAS:</p>
                <div className="flex flex-wrap gap-1">
                  {m.yoTengoParaEl.map(n => <span key={n} className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded font-bold">#{n}</span>)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
