import { useEffect, useRef, useState } from 'react';

/**
 * Menu ☰ das telas fora da mesa (escolha do sistema e lobby). Muda conforme a tela:
 * quem chama passa os itens (PLANEJAMENTO-IA seção 10 — "um só menu hambúrguer").
 *
 * itens: [{ id, label, icone, onClick, desabilitado, dica }]
 * tema:  'sz' (Sessão Zero) ou 'shinobi'
 */
export default function MenuSessao({ itens, tema = 'shinobi' }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const sz = tema === 'sz';
  const botao = sz
    ? 'border-2 border-sz-grade text-sz-texto hover:border-sz-suave'
    : 'border border-zinc-700 text-zinc-200 hover:border-zinc-500';
  const painel = sz
    ? 'bg-sz-ficha text-sz-tinta shadow-[0_18px_40px_rgba(0,0,0,0.45)]'
    : 'border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl';
  const item = sz ? 'hover:bg-sz-pauta/50' : 'hover:bg-zinc-800';

  return (
    <div ref={caixa} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-haspopup="menu"
        className={`rounded-md px-3 py-1.5 text-lg leading-none ${botao}`} title="Menu">
        {aberto ? '✕' : '☰'}
      </button>
      {aberto && (
        <div role="menu" className={`absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md py-1 ${painel}`}>
          {itens.map((it) => (
            <button key={it.id} type="button" role="menuitem" disabled={it.desabilitado} title={it.dica}
              onClick={() => { setAberto(false); it.onClick?.(); }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${item}`}>
              <span className="w-5 text-center" aria-hidden="true">{it.icone}</span>
              <span className="flex-1">{it.label}</span>
              {it.extra && <span className="text-xs font-normal opacity-70">{it.extra}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
