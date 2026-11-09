import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formattedName = username.trim();

    try {
      if (isLogin) {
        // Busca o jogador direto na tabela
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('username', formattedName)
          .eq('password', password)
          .single();

        if (error || !data) throw new Error('Nome ou senha incorretos.');
        
        // Salva o ID do jogador no navegador pra usar no Lobby/Mapa
        localStorage.setItem('playerId', data.id);
        localStorage.setItem('playerName', data.username);
        
        navigate('/lobby');
      } else {
        // Verifica se o nome já existe
        const { data: existingUser } = await supabase
          .from('players')
          .select('id')
          .eq('username', formattedName)
          .single();

        if (existingUser) throw new Error('Esse nome já está em uso!');

        // Insere o novo jogador
        const { error } = await supabase
          .from('players')
          .insert([{ username: formattedName, password }]);

        if (error) throw error;
        
        alert('Conta criada! Pode entrar.');
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-800 p-8 rounded-lg shadow-xl border border-zinc-700">
        <h1 className="text-3xl font-bold text-center mb-6 text-red-500">
          Shinobi VTT
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Nome do Jogador</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 focus:outline-none focus:border-red-500 text-white"
              placeholder="Ex: Sasuke"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Senha da Mesa</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 focus:outline-none focus:border-red-500 text-white"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Carregando...' : (isLogin ? 'Entrar na Mesa' : 'Criar Personagem')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-400">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="hover:text-red-400 transition-colors underline"
          >
            {isLogin ? 'Primeira vez jogando? Registre-se' : 'Já tem ficha? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}