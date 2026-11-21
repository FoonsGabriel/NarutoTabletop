import { useEffect, useRef, useState } from 'react';
import {
  onGravacao, podeGravar, podeGravarQualquerTela, gravarTelaLive,
  qualquerTelaPasso1, qualquerTelaPasso2, cancelarEscolha, pararGravacao,
} from '../services/Gravacao';

/**
 * Botão de gravação do Mestre (Modo live parte 4). Aparece na barra de cima da mesa e nos
 * controles da tela de gravação; os dois mostram a mesma gravação.
 */
export default function BotaoGravar({ engineRef, gmId, gmNome, obterLayout }) {
  const [g, setG] = useState({ estado: 'parado' });
  const [menu, setMenu] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const caixaRef = useRef(null);

  useEffect(() => onGravacao(setG), []);
  useEffect(() => {
    if (g.estado !== 'gravando') return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [g.estado]);
  // Fecha o menu clicando fora.
  useEffect(() => {
    if (!menu) return undefined;
    const fora = (ev) => { if (!caixaRef.current?.contains(ev.target)) setMenu(false); };
    window.addEventListener('pointerdown', fora);
    return () => window.removeEventListener('pointerdown', fora);
  }, [menu]);

  if (!podeGravar()) return null;

  const s = Math.max(0, Math.floor((agora - (g.inicio || agora)) / 1000));
  const dois = (n) => String(n).padStart(2, '0');
  const relogio = `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`;

  return (
    <div ref={caixaRef} className="relative shrink-0 text-sm">
      {g.estado === 'parado' && (
        <button type="button" onClick={() => setMenu((m) => !m)} title="Gravar a sessão em vídeo"
          className="rounded border border-red-700 bg-red-950/60 px-3 py-1.5 font-bold text-red-200 hover:bg-red-900/60">
          ⏺ Gravar
        </button>
      )}
      {g.estado === 'escolhendo' && (
        <span className="flex gap-1">
          <button type="button" onClick={qualquerTelaPasso2} title="O navegador vai perguntar o que gravar: deixe marcado o áudio"
            className="rounded border border-red-600 bg-red-700 px-3 py-1.5 font-bold text-white">🎥 Escolher o que gravar</button>
          <button type="button" onClick={cancelarEscolha} className="rounded border border-zinc-700 px-2 py-1.5 text-zinc-300">✕</button>
        </span>
      )}
      {g.estado === 'gravando' && (
        <button type="button" onClick={pararGravacao}
          title={g.modo === 'live' ? 'Gravando só a tela de gravação (pode usar a mesa normal)' : 'Gravando a tela escolhida'}
          className="flex items-center gap-1.5 rounded border border-red-600 bg-red-700 px-3 py-1.5 font-bold text-white">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
          ⏹ Parar e salvar · <span className="tabular-nums">{relogio}</span>
        </button>
      )}
      {g.estado === 'salvando' && <span className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300">Salvando…</span>}

      {menu && g.estado === 'parado' && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-left shadow-2xl">
          <button type="button" onClick={() => { setMenu(false); gravarTelaLive({ engineRef, gmId, gmNome, obterLayout }); }}
            className="w-full rounded p-2 text-left hover:bg-zinc-800">
            <b className="block text-zinc-100">🎬 Só a tela de gravação</b>
            <span className="text-xs text-zinc-400">Grava câmeras, mesa e personagens. Você pode voltar à tela normal e usar a mesa: suas trocas de tela não aparecem no vídeo.</span>
          </button>
          {podeGravarQualquerTela() && (
            <button type="button" onClick={() => { setMenu(false); qualquerTelaPasso1(); }}
              className="mt-1 w-full rounded p-2 text-left hover:bg-zinc-800">
              <b className="block text-zinc-100">🖥️ Qualquer tela</b>
              <span className="text-xs text-zinc-400">Grava o que você escolher (esta aba, uma janela ou a tela inteira), do jeito que estiver aparecendo.</span>
            </button>
          )}
          <p className="mt-1 px-2 text-[11px] text-zinc-500">Primeiro você escolhe onde salvar o vídeo; ele vai sendo salvo enquanto grava.</p>
        </div>
      )}
      {g.aviso && g.estado !== 'gravando' && !menu && (
        <p className="absolute right-0 top-full z-50 mt-1 w-72 rounded bg-zinc-950/95 p-1.5 text-right text-[11px] text-zinc-300">{g.aviso}</p>
      )}
      {g.aviso && g.estado === 'gravando' && (
        <p className="absolute right-0 top-full z-50 mt-1 w-72 rounded bg-zinc-950/95 p-1.5 text-right text-[11px] text-amber-300">{g.aviso}</p>
      )}
    </div>
  );
}
