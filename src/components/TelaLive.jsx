import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { voiceCall } from '../services/VoiceCall';
import { supabase } from '../services/supabase/client';
import BotaoGravar from './BotaoGravar.jsx';
import {
  LAYOUT_LIVE_PADRAO, VISUAL_ETAPA, CORTES, ESCORRIDOS, GOTAS, RACHADURAS,
  etapaMachucado, formaCorte, viradaCortes, personagensDaLive, colunasLive, MODELOS_LIVE,
} from '../services/Live';

/**
 * Tela de gravação (Modo live, PLANEJAMENTO 21/11): a mesa de um lado; câmera do Mestre e os
 * personagens (câmera do jogador, retrato, nome, Vida e Chakra) do outro. Sem botões nem menus:
 * os únicos controles aparecem só ao passar o mouse no canto (e não vão para a gravação).
 *
 * O mapa continua sendo o mesmo canvas da mesa; o Room só muda o lugar e o tamanho dele
 * (ver LAYOUT_LIVE_PADRAO).
 */

export { LAYOUT_LIVE_PADRAO, etapaMachucado };

const caixa = (r) => ({ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });

export default function TelaLive({
  engineRef, gmId, gmNome = 'Mestre', isGM, roomId, liveTodos, onSair,
  layout = LAYOUT_LIVE_PADRAO, onRascunho, obterLayout,
}) {
  const [voz, setVoz] = useState(voiceCall.getState());
  const [personagens, setPersonagens] = useState([]);
  const [arrumando, setArrumando] = useState(false);
  const raizRef = useRef(null);

  // Na tela de gravação os vídeos precisam chegar (no celular ficam desligados até pedir) e em
  // qualidade melhor: o Mestre pede a alta (para gravar), os jogadores a média.
  useEffect(() => {
    const antes = voiceCall.pedidoVideo;
    const hdAntes = voiceCall.pedidoHD || 0;
    voiceCall.setQuerVideo(true);
    voiceCall.setQuerHD(isGM ? 2 : 1);
    const sair = voiceCall.onStateChange(setVoz);
    return () => { sair?.(); voiceCall.setQuerVideo(antes); voiceCall.setQuerHD(hdAntes); };
  }, [isGM]);

  // Personagens dos jogadores (não NPC, dono que não é o Mestre). Atualiza quando a ficha muda
  // e, por garantia, a cada 3 s (barato: só lê o que o mapa já tem em memória).
  useEffect(() => {
    const ler = () => {
      const lista = personagensDaLive(engineRef.current, gmId);
      setPersonagens((atual) => (JSON.stringify(atual) === JSON.stringify(lista) ? atual : lista));
    };
    ler();
    window.addEventListener('vtt:character', ler);
    const relogio = setInterval(ler, 3000);
    return () => { window.removeEventListener('vtt:character', ler); clearInterval(relogio); };
  }, [engineRef, gmId]);

  const participantes = Object.fromEntries((voz.participants || []).map((p) => [p.id, p]));
  const videoDe = (pessoa) => {
    if (!pessoa) return null;
    if (pessoa === voiceCall.playerId) return voz.cameraOn ? voz.camStream : null;
    return participantes[pessoa]?.camera ? (voz.videos || []).find((v) => v.id === pessoa)?.stream || null : null;
  };

  const alternarTodos = async () => {
    const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
    await supabase.from('rooms').update({ hud_settings: { ...(data?.hud_settings || {}), live_todos: !liveTodos } }).eq('id', roomId);
  };

  const colunas = colunasLive(personagens.length, layout.personagens);

  return (
    <div ref={raizRef} className="pointer-events-none absolute inset-0 z-30 bg-zinc-950">
      {/* Câmera do Mestre */}
      <div style={caixa(layout.mestre)} className="pointer-events-auto overflow-hidden rounded-lg border-2 border-zinc-800 bg-zinc-900">
        <Video stream={videoDe(gmId)} espelhar={gmId === voiceCall.playerId} />
        {!videoDe(gmId) && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-500">Câmera do Mestre desligada</p>}
        <span className="titulo-shinobi absolute bottom-2 left-3 text-2xl text-zinc-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{gmNome}</span>
      </div>

      {/* Personagens */}
      <div style={{ ...caixa(layout.personagens), display: 'grid', gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, gap: '0.5rem' }}>
        {personagens.map((p) => <CartaoPersonagem key={p.id} p={p} stream={videoDe(p.dono)} falando={participantes[p.dono]?.speaking}
          espelhar={p.dono === voiceCall.playerId} />)}
        {!personagens.length && <p className="self-center text-center text-sm text-zinc-500">Nenhum personagem de jogador nesta mesa.</p>}
      </div>

      {/* Controles: só aparecem passando o mouse no canto de cima (fora da gravação). */}
      <div className="pointer-events-auto absolute right-0 top-0 z-40 p-2 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <div className="flex flex-wrap justify-end gap-1 rounded-lg border border-zinc-700 bg-zinc-950/95 p-1.5 text-xs font-bold shadow-xl">
          {isGM && <BotaoGravar engineRef={engineRef} gmId={gmId} gmNome={gmNome} obterLayout={obterLayout} />}
          {isGM && (
            <button type="button" onClick={() => { onRascunho?.(layout); setArrumando(true); }}
              title="Mudar o lugar e o tamanho da câmera do Mestre, do mapa e dos personagens (vale para todos e para a gravação)"
              className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:text-white">✏️ Arrumar</button>
          )}
          {isGM && (
            <button type="button" onClick={alternarTodos} title="Todos os jogadores passam a ver esta tela (cada um pode voltar à normal)"
              className={`rounded border px-2 py-1 ${liveTodos ? 'border-emerald-600 bg-emerald-950/60 text-emerald-200' : 'border-zinc-700 text-zinc-300'}`}>
              {liveTodos ? '👥 Todos estão vendo' : '👥 Mostrar para todos'}
            </button>
          )}
          <button type="button" onClick={onSair} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:text-white">↩ Tela normal</button>
        </div>
      </div>

      {arrumando && (
        <EditorLayout raizRef={raizRef} layout={layout} onMudar={(l) => onRascunho?.(l)}
          onSalvar={async () => {
            const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
            const { error } = await supabase.from('rooms').update({ hud_settings: { ...(data?.hud_settings || {}), live_layout: layout } }).eq('id', roomId);
            if (error) return `Não deu para salvar: ${error.message}`;
            onRascunho?.(null);
            setArrumando(false);
            return '';
          }}
          onCancelar={() => { onRascunho?.(null); setArrumando(false); }} />
      )}
    </div>
  );
}

/**
 * Modo live parte 3: o Mestre arruma a tela de gravação — escolhe um modelo pronto e ajusta
 * arrastando cada quadro (meio = mover, canto de baixo à direita = tamanho). Fica por cima de
 * tudo (inclusive do mapa) numa camada própria; ao salvar, vale para todos e para a gravação.
 */
const NOMES_QUADRO = { mestre: '🎥 Câmera do Mestre', mapa: '🗺️ Mapa', personagens: '👥 Personagens' };
const PASSO = 0.5; // arredonda para meio por cento (fica fácil alinhar)
const arred = (v) => Math.round(v / PASSO) * PASSO;

function EditorLayout({ raizRef, layout, onMudar, onSalvar, onCancelar }) {
  const [area, setArea] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const arrasto = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Camada do editor no mesmo lugar da tela de gravação.
  useEffect(() => {
    const medir = () => { const r = raizRef.current?.getBoundingClientRect(); if (r) setArea({ left: r.left, top: r.top, width: r.width, height: r.height }); };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [raizRef]);

  useEffect(() => {
    const mover = (ev) => {
      const a = arrasto.current;
      if (!a || !area) return;
      const dx = ((ev.clientX - a.px) / area.width) * 100;
      const dy = ((ev.clientY - a.py) / area.height) * 100;
      const r = { ...a.inicio };
      if (a.tipo === 'mover') {
        r.x = arred(Math.min(100 - r.w, Math.max(0, a.inicio.x + dx)));
        r.y = arred(Math.min(100 - r.h, Math.max(0, a.inicio.y + dy)));
      } else {
        r.w = arred(Math.min(100 - r.x, Math.max(8, a.inicio.w + dx)));
        r.h = arred(Math.min(100 - r.y, Math.max(8, a.inicio.h + dy)));
      }
      onMudar({ ...layoutRef.current, [a.quadro]: r });
    };
    const soltar = () => { arrasto.current = null; };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
  }, [area, onMudar]);

  const pegar = (ev, quadro, tipo) => {
    ev.preventDefault();
    ev.stopPropagation();
    arrasto.current = { quadro, tipo, px: ev.clientX, py: ev.clientY, inicio: { ...layout[quadro] } };
  };

  if (!area) return null;
  return createPortal(
    <div className="fixed z-[70] select-none" style={area}>
      <div className="absolute inset-0 bg-black/20" />
      {Object.keys(NOMES_QUADRO).map((q) => {
        const r = layout[q];
        return (
          <div key={q} onPointerDown={(ev) => pegar(ev, q, 'mover')}
            className="absolute cursor-move rounded-lg border-2 border-dashed border-amber-400 bg-amber-400/10 touch-none"
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}>
            <span className="absolute left-2 top-2 rounded bg-zinc-950/90 px-2 py-1 text-xs font-bold text-amber-200">
              {NOMES_QUADRO[q]} · {Math.round(r.w)}×{Math.round(r.h)}%
            </span>
            <span onPointerDown={(ev) => pegar(ev, q, 'tamanho')} title="Arraste para mudar o tamanho"
              className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-sm border-2 border-zinc-950 bg-amber-400 touch-none" />
          </div>
        );
      })}

      <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950/95 p-1.5 text-xs font-bold shadow-2xl">
        <span className="px-1 text-zinc-400">Modelos:</span>
        {MODELOS_LIVE.map((m) => (
          <button key={m.id} type="button" onClick={() => onMudar(m.layout)}
            className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-amber-500">{m.nome}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-700" />
        <button type="button" disabled={salvando}
          onClick={async () => { setSalvando(true); setErro(await onSalvar()); setSalvando(false); }}
          className="rounded border border-emerald-600 bg-emerald-800 px-2 py-1 text-white disabled:opacity-50">
          {salvando ? 'Salvando…' : '✔ Salvar'}
        </button>
        <button type="button" onClick={onCancelar} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300">Cancelar</button>
        {erro && <span className="w-full text-center text-red-300">{erro}</span>}
        <span className="w-full text-center text-[11px] font-normal text-zinc-400">
          Arraste o quadro para mover · puxe o quadradinho do canto para mudar o tamanho · ao salvar, vale para todos e para a gravação
        </span>
      </div>
    </div>,
    document.body,
  );
}

function CartaoPersonagem({ p, stream, falando, espelhar }) {
  return (
    <div className={`relative min-h-0 overflow-hidden rounded-lg border-2 bg-zinc-900 ${falando ? 'border-emerald-400' : 'border-zinc-800'}`}>
      {stream
        ? <Video stream={stream} espelhar={espelhar} />
        : <img src={p.retrato} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm" />}
      {/* Retrato + nome + Vida/Chakra embaixo, como na live de exemplo */}
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-8">
        <RetratoMachucado id={p.id} retrato={p.retrato} vida={p.vida} vidaMax={p.vidaMax} />
        <div className="min-w-0 flex-1">
          <p className="titulo-shinobi truncate text-xl leading-tight text-zinc-50 drop-shadow lg:text-2xl">{p.nome}</p>
          <Barra valor={p.vida} max={p.vidaMax} cor="bg-red-600" rotulo="❤" />
          <Barra valor={p.chakra} max={p.chakraMax} cor="bg-sky-500" rotulo="🔷" />
        </div>
      </div>
    </div>
  );
}

function RetratoMachucado({ id, retrato, vida, vidaMax }) {
  const etapa = etapaMachucado(vida, vidaMax);
  const v = VISUAL_ETAPA[etapa];
  // Cada personagem tem os cortes num ângulo diferente (fixo pelo id), para não ficarem iguais.
  const { giro, espelho } = viradaCortes(id);

  return (
    <div className="relative h-16 w-16 shrink-0 lg:h-20 lg:w-20"
      style={{ filter: etapa === 4 ? 'grayscale(1) contrast(1.1)' : 'none', transition: 'filter 0.8s' }}>
      <div className="absolute inset-0 overflow-hidden rounded-full border-2 bg-zinc-800"
        style={{ borderColor: v.aro, transition: 'border-color 0.8s' }}>
        <img src={retrato} alt="" className="h-full w-full object-cover" style={{ filter: v.filtro, transition: 'filter 0.8s' }} />
        {/* Vermelho vindo das bordas */}
        <div className="absolute inset-0" style={{
          background: `radial-gradient(circle, transparent 40%, rgba(127,29,29,${v.vermelho}) 100%)`,
          transition: 'background 0.8s',
        }} />
        {etapa > 0 && (
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <g transform={`rotate(${giro} 50 50) translate(50 50) scale(${espelho} 1) translate(-50 -50)`}>
              {CORTES.filter((c) => etapa >= c.desde).map((c, i) => (
                <g key={i}>
                  <path d={formaCorte(c, 4)} fill="#450a0a" opacity="0.8" />
                  <path d={formaCorte(c, 2.2)} fill="#b91c1c" />
                  <path d={formaCorte(c, 0.7)} fill="#fecaca" opacity="0.5" />
                </g>
              ))}
            </g>
            {/* Sangue escorrendo e gotas (sem girar: sangue sempre desce) */}
            {ESCORRIDOS.filter((e) => etapa >= e.desde).map((e, i) => (
              <g key={i} fill="#991b1b">
                <path d={`M${e.x} ${e.y} v${e.h}`} stroke="#991b1b" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
                <circle cx={e.x} cy={e.y + e.h + 0.6} r="1.6" />
              </g>
            ))}
            {GOTAS.filter((g) => etapa >= g.desde).map((g, i) => (
              <circle key={i} cx={g.x} cy={g.y} r={g.r} fill="#7f1d1d" opacity="0.9" />
            ))}
          </svg>
        )}
      </div>
      {/* Aro rachado (por cima da borda) */}
      {etapa >= 2 && (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {RACHADURAS.filter((r) => etapa >= r.desde).map((r, i) => (
            <g key={i} fill="none" strokeLinejoin="round" strokeLinecap="round">
              <polyline points={r.pts} stroke="#000" strokeWidth="2.4" opacity="0.7" />
              <polyline points={r.pts} stroke="#e4e4e7" strokeWidth="0.9" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function Barra({ valor, max, cor, rotulo }) {
  const pct = Math.max(0, Math.min(100, (valor / max) * 100));
  return (
    <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-zinc-200">
      <span className="w-4 text-center">{rotulo}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full ${cor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right tabular-nums">{valor}/{max}</span>
    </div>
  );
}

function Video({ stream, espelhar }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  if (!stream) return null;
  return <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover ${espelhar ? '-scale-x-100' : ''}`} />;
}
