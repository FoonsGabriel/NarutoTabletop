import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate } from 'react-router-dom';
import FundoSessaoZero, { TrajetoMarcador } from '../components/FundoSessaoZero';

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

  // Visual Sessão Zero (mapa de batalha + ficha pautada). A lógica acima não mudou.
  const inputClass = 'w-full rounded-[3px] border-2 border-sz-tinta bg-white px-3 py-2.5 text-[17px] text-sz-tinta placeholder:text-slate-400 focus:border-sz-azul focus:outline-none';

  return (
    <FundoSessaoZero>
      <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1.15fr_1fr] md:gap-14 md:px-8">
        {/* Apresentação: o nome escrito no mapa */}
        <div>
          <h1 className="sz-marcador -rotate-3 text-[64px] leading-[0.9] text-sz-vermelho sm:text-[96px] lg:text-[112px]">
            Sessão<br />Zero
          </h1>
          <p className="mt-7 max-w-[30ch] text-lg leading-relaxed text-sz-suave sm:text-xl">
            Mesa virtual de RPG. Monte a ficha, abra o mapa e jogue com o seu grupo.
          </p>
          <TrajetoMarcador className="mt-8 hidden h-36 w-full max-w-md md:block" />
        </div>

        {/* Ficha de entrada */}
        <div className="sz-ficha w-full max-w-md rotate-1 justify-self-center px-6 pb-6 pt-5 md:justify-self-end sm:px-7">
          <div className="flex h-8 items-end gap-5" role="tablist" aria-label="Entrar ou criar conta">
            {[[true, 'Entrar'], [false, 'Criar conta']].map(([modo, rotulo]) => (
              <button key={rotulo} type="button" role="tab" aria-selected={isLogin === modo}
                onClick={() => { setIsLogin(modo); setError(''); }}
                className={`border-b-[3px] pb-0.5 text-lg font-bold transition-colors ${isLogin === modo ? 'border-sz-azul text-sz-tinta' : 'border-transparent text-slate-500 hover:text-sz-tinta'}`}>
                {rotulo}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="sz-nome" className="mb-1 block text-sm font-bold">Nome do jogador</label>
              <input
                id="sz-nome"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                placeholder="Ex.: Sasuke"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="sz-senha" className="mb-1 block text-sm font-bold">Senha</label>
              <input
                id="sz-senha"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {error && <p role="alert" className="rounded-[3px] border-2 border-sz-vermelho bg-white px-3 py-2 text-sm font-bold text-[#b42328]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[3px] bg-sz-azul px-4 py-3 text-lg font-bold text-white transition-colors hover:bg-[#255d94] disabled:opacity-60"
            >
              {loading ? 'Carregando…' : (isLogin ? 'Entrar' : 'Criar conta')}
            </button>
          </form>

          <p className="mt-4 text-[15px] text-slate-600">
            {isLogin ? 'Primeira vez? ' : 'Já tem conta? '}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-bold text-sz-azul underline underline-offset-2 hover:text-[#255d94]">
              {isLogin ? 'Criar uma conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </div>
    </FundoSessaoZero>
  );
}
