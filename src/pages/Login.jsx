import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate } from 'react-router-dom';
import FundoShinobi, { Shuriken } from '../sistemas/shinobi/components/FundoShinobi';

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

  const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none';

  return (
    <FundoShinobi>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:justify-between lg:gap-16">
        {/* Apresentação */}
        <div className="max-w-lg text-center lg:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-800/70 bg-red-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-red-300">
            <Shuriken className="h-3.5 w-3.5 text-red-400" /> Naruto · Shinobi no Sho
          </div>
          <h1 className="titulo-shinobi text-6xl leading-none text-red-500 sm:text-7xl">Shinobi VTT</h1>
          <p className="mt-4 text-lg font-semibold text-zinc-200">A mesa virtual da sua campanha ninja.</p>
          <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-zinc-300 lg:mx-0">
            <li className="flex gap-2"><span>📋</span><span>Ficha com as regras do livro: clãs, poderes e jutsus.</span></li>
            <li className="flex gap-2"><span>⚔️</span><span>Combate por turnos com dano, chakra e defesas automáticos.</span></li>
            <li className="flex gap-2"><span>🗺️</span><span>Mapa, clima, música e voz junto com o seu grupo.</span></li>
          </ul>
        </div>

        {/* Cartão de entrada */}
        <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-6 shadow-2xl shadow-black/60 backdrop-blur sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-zinc-950 p-1">
            {[[true, 'Entrar'], [false, 'Criar conta']].map(([modo, rotulo]) => (
              <button key={rotulo} type="button" onClick={() => { setIsLogin(modo); setError(''); }}
                className={`rounded-md py-2 text-sm font-black transition-colors ${isLogin === modo ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
                {rotulo}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-black">{isLogin ? 'Bem-vindo de volta, shinobi' : 'Primeira vez na mesa?'}</h2>
          <p className="mb-5 mt-1 text-sm text-zinc-400">{isLogin ? 'Entre com o seu nome e senha.' : 'Escolha um nome e uma senha para a sua conta.'}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-zinc-300">Nome do Jogador</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                placeholder="Ex: Sasuke"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-zinc-300">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {error && <p className="rounded-lg border border-red-800 bg-red-950/50 p-2 text-center text-sm text-red-200">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-base font-black text-white shadow-lg shadow-red-900/40 transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? 'Carregando...' : (isLogin ? 'Entrar na Mesa' : 'Criar conta')}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-zinc-500">
            {isLogin ? 'Ainda não tem conta? ' : 'Já tem conta? '}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-bold text-red-400 underline-offset-2 hover:underline">
              {isLogin ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </div>
    </FundoShinobi>
  );
}
