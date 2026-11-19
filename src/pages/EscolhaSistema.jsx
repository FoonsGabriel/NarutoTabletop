import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SISTEMAS } from '../sistemas/Sistemas';
import FundoSessaoZero from '../components/FundoSessaoZero';
import MenuSessao from '../components/MenuSessao';

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
    <FundoSessaoZero>
      <div className="mx-auto max-w-4xl px-5 py-6 sm:py-8">
        <header className="flex items-center gap-4">
          <MenuSessao tema="sz" itens={[
            // Só o Shinobi tem fichas por enquanto; com mais sistemas, esta tela lista as de todos.
            { id: 'fichas', icone: '📋', label: 'Minhas fichas', onClick: () => navigate('/fichas/shinobi') },
            { id: 'chatbot', icone: '💬', label: 'Chatbot', extra: 'em breve', desabilitado: true, dica: 'Chega com a IA' },
            { id: 'sair', icone: '🚪', label: 'Sair', onClick: sair },
          ]} />
          <span className="sz-marcador -rotate-2 text-3xl text-sz-vermelho">Sessão Zero</span>
        </header>

        <h1 className="mt-10 text-3xl font-bold leading-tight sm:mt-14 sm:text-4xl">
          {playerName ? `${playerName}, qual sistema vamos jogar hoje?` : 'Qual sistema vamos jogar hoje?'}
        </h1>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SISTEMAS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              disabled={!s.disponivel}
              onClick={() => navigate(`/lobby/${s.id}`)}
              aria-describedby={s.disponivel ? undefined : `breve-${s.id}`}
              className={`sz-ficha flex min-h-[10rem] flex-col px-6 pb-5 pt-4 text-left transition-transform ${i % 2 ? 'rotate-1' : '-rotate-1'} enabled:hover:-translate-y-1 enabled:hover:rotate-0 disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <span className="flex h-9 items-end text-xl font-bold">{s.nome}</span>
              <span className="mt-4 text-[17px] leading-8 text-slate-600">{s.resumo}</span>
              <span className="mt-auto pt-3">
                {s.disponivel
                  ? <span className="inline-block rounded-[3px] bg-sz-azul px-4 py-1.5 text-base font-bold text-white">Jogar</span>
                  : <span id={`breve-${s.id}`} className="sz-marcador inline-block -rotate-2 text-xl text-sz-vermelho">Em breve</span>}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setAviso('Adicionar um sistema novo ainda não está disponível.')}
            className="flex min-h-[10rem] flex-col items-center justify-center rounded-[3px] border-[3px] border-dashed border-sz-verde/70 p-4 text-sz-suave transition-colors hover:border-sz-verde hover:text-white"
          >
            <span className="sz-marcador text-4xl leading-none text-sz-verde">+</span>
            <span className="mt-2 text-base font-bold">Adicionar sistema</span>
          </button>
        </div>

        {aviso && (
          <p role="status" className="mt-6 max-w-md rounded-[3px] border-2 border-sz-vermelho/70 bg-sz-mapa px-3 py-2 text-[15px] text-sz-texto">{aviso}</p>
        )}
      </div>
    </FundoSessaoZero>
  );
}
