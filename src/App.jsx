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

  const buscarMatch = async () => {
    setLoading(true);
    
    // 1. Traer mis datos
    const { data: misDatos } = await supabase
      .from('user_stickers')
      .select('*')
      .eq('user_id', userId);

    const misFaltantes = misDatos.filter(s => s.is_missing).map(s => s.sticker_number);
    const misRepetidas = misDatos.filter(s => s.repeated_count > 0).map(s => s.sticker_number);

    // 2. Traer datos de los DEMÁS (que tengan lo que me falta o necesiten lo que tengo)
    const { data: otrosDatos, error } = await supabase
      .from('user_stickers')
      .select('user_id, sticker_number, is_missing, repeated_count')
      .neq('user_id', userId); // No compararme conmigo mismo

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    // 3. Lógica de cruce
    // Agrupamos por usuario para ver quién es el mejor "match"
    const sugerencias = {};

    otrosDatos.forEach(registro => {
      const otroId = registro.user_id;
      if (!sugerencias[otroId]) sugerencias[otroId] = { tieneParaMi: [], yoTengoParaEl: [] };

      // ¿Él tiene una que me falta? (Él la tiene repetida y a mí me falta)
      if (registro.repeated_count > 0 && misFaltantes.includes(registro.sticker_number)) {
        sugerencias[otroId].tieneParaMi.push(registro.sticker_number);
      }

      // ¿Yo tengo una que a él le falta? (Yo la tengo repetida y a él le falta)
      if (registro.is_missing && misRepetidas.includes(registro.sticker_number)) {
        sugerencias[otroId].yoTengoParaEl.push(registro.sticker_number);
      }
    });

    // Convertir a lista y filtrar solo los que tienen al menos un intercambio posible
    const listaMatches = Object.entries(sugerencias)
      .map(([id, info]) => ({ id, ...info }))
      .filter(m => m.tieneParaMi.length > 0 || m.yoTengoParaEl.length > 0);

    setMatches(listaMatches);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button 
        onClick={buscarMatch}
        disabled={loading}
        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition"
      >
        {loading ? "Buscando coincidencias..." : "🔎 ¡Encontrar Intercambios ahora!"}
      </button>

      <div className="space-y-3">
        {matches.length === 0 && !loading && (
          <p className="text-center text-gray-500 text-sm">No hay propuestas aún. ¡Dile a tus amigos que se registren!</p>
        )}
        
        {matches.map(match => (
          <div key={match.id} className="bg-white p-4 rounded-2xl border-2 border-indigo-100 shadow-sm">
            <h3 className="font-bold text-indigo-900 mb-2">Usuario: {match.id.slice(0, 5)}...</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-green-50 p-2 rounded-lg">
                <p className="text-green-700 font-bold">Te puede dar:</p>
                <p className="text-green-600 font-mono">{match.tieneParaMi.join(', ') || 'Nada'}</p>
              </div>
              <div className="bg-blue-50 p-2 rounded-lg">
                <p className="text-blue-700 font-bold">Le puedes dar:</p>
                <p className="text-blue-600 font-mono">{match.yoTengoParaEl.join(', ') || 'Nada'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
