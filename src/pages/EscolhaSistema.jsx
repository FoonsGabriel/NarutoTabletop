import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SISTEMAS } from '../sistemas/Sistemas';

/**
 * Escolha do sistema (PLANEJAMENTO-IA seção 10 — tela 2).
 * Shinobi no Sho disponível; Tormenta20 "em breve"; "Adicionar sistema" ainda não existe.
 * O visual definitivo (marca Sessão Zero) vem na etapa de design.
 */
export default function EscolhaSistema() {
  const navigate = useNavigate();
  const [aviso, setAviso] = useState('');
  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName');

  useEffect(() => {
    if (!playerId) navigate('/'); // sem login, volta para a tela de entrar
  }, [playerId, navigate]);

  const sair = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500">Sessão Zero</p>
            <h1 className="text-2xl font-black sm:text-3xl">Olá{playerName ? `, ${playerName}` : ''}! Qual sistema vamos jogar?</h1>
          </div>
          <button type="button" onClick={sair} className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 hover:border-zinc-500 hover:text-white">Sair</button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {SISTEMAS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!s.disponivel}
              onClick={() => navigate(`/lobby/${s.id}`)}
              className="group flex min-h-[8rem] flex-col justify-between rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div>
                <p className="text-lg font-black">{s.nome}</p>
                <p className="mt-1 text-sm text-zinc-400">{s.resumo}</p>
              </div>
              <span className={`mt-3 self-start rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${s.disponivel ? 'bg-amber-500 text-black' : 'bg-zinc-700 text-zinc-300'}`}>
                {s.disponivel ? 'Jogar' : 'Em breve'}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setAviso('Adicionar um sistema novo ainda não está disponível. Em breve!')}
            className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 p-4 text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="mt-1 text-sm font-bold">Adicionar sistema</span>
          </button>
        </div>

        {aviso && (
          <p role="status" className="mt-4 rounded-lg border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">{aviso}</p>
        )}
      </div>
    </div>
  );
}
