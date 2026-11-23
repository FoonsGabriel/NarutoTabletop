import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { voiceCall } from '../services/VoiceCall';

/**
 * 📶 Medir conexão (ideia guardada em 19/11, feita em 21/11): mede o atraso REAL deste aparelho.
 *  - Banco: quanto demora uma leitura no Supabase (mover token, salvar ficha passam por aqui).
 *  - Tempo real: ida e volta de um aviso pelo canal ao vivo (pings, defesa, música).
 *  - Voz/câmera: ida e volta até cada pessoa da chamada (conexão direta).
 * Só roda quando a pessoa clica; não grava nada.
 */
const mediana = (lista) => {
  const v = lista.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null;
};
const cor = (ms) => (ms == null ? 'text-zinc-500' : ms < 150 ? 'text-emerald-300' : ms < 400 ? 'text-amber-300' : 'text-red-300');
const texto = (ms) => (ms == null ? '—' : `${ms} ms`);

async function medirBanco(roomId) {
  const tempos = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    const { error } = await supabase.from('rooms').select('id').eq('id', roomId).limit(1);
    if (!error) tempos.push(performance.now() - t0);
  }
  return mediana(tempos);
}

function medirTempoReal(roomId) {
  return new Promise((resolve) => {
    const tempos = [];
    const canal = supabase.channel(`medir_${roomId}_${Math.random().toString(36).slice(2, 8)}`, { config: { broadcast: { self: true } } });
    const fim = () => { try { supabase.removeChannel(canal); } catch { /* já saiu */ } resolve(mediana(tempos)); };
    const limite = setTimeout(fim, 8000);
    canal.on('broadcast', { event: 'ping' }, ({ payload }) => {
      tempos.push(performance.now() - payload.t);
      if (tempos.length >= 5) { clearTimeout(limite); fim(); }
    });
    canal.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      for (let i = 0; i < 5; i += 1) setTimeout(() => canal.send({ type: 'broadcast', event: 'ping', payload: { t: performance.now() } }), i * 300);
    });
  });
}

async function medirVoz() {
  const lista = [];
  for (const [id, peer] of voiceCall.peers || []) {
    try {
      const stats = await peer.pc.getStats();
      let rtt = null;
      stats.forEach((s) => {
        if (s.type === 'candidate-pair' && (s.nominated || s.selected) && s.state === 'succeeded' && s.currentRoundTripTime != null) {
          rtt = s.currentRoundTripTime * 1000;
        }
      });
      lista.push({ nome: voiceCall.participants.get(id)?.name || 'Alguém', ms: rtt == null ? null : Math.round(rtt) });
    } catch { /* conexão fechando */ }
  }
  return lista;
}

export default function MedirConexao({ roomId }) {
  const [estado, setEstado] = useState({ medindo: false, r: null });

  const medir = async () => {
    setEstado({ medindo: true, r: null });
    const [banco, tempoReal, voz] = await Promise.all([medirBanco(roomId), medirTempoReal(roomId), medirVoz()]);
    setEstado({ medindo: false, r: { banco, tempoReal, voz } });
  };

  const r = estado.r;
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={medir} disabled={estado.medindo}
        title="Mede o atraso real da sua internet até o site, o tempo real e a chamada de voz (não grava nada)"
        className="rounded border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-left text-[11px] font-bold text-zinc-300 hover:text-white disabled:opacity-60">
        📶 {estado.medindo ? 'Medindo…' : 'Medir conexão'}
      </button>
      {r && (
        <div className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[11px] leading-5 text-zinc-300">
          <p>Banco (mover, salvar): <b className={cor(r.banco)}>{texto(r.banco)}</b></p>
          <p>Tempo real (avisos): <b className={cor(r.tempoReal)}>{texto(r.tempoReal)}</b></p>
          {r.voz.length > 0
            ? r.voz.map((v) => <p key={v.nome}>Voz até {v.nome}: <b className={cor(v.ms)}>{texto(v.ms)}</b></p>)
            : <p className="text-zinc-500">Voz: entre na chamada para medir.</p>}
          <p className="text-[10px] text-zinc-500">Verde: ótimo · amarelo: dá para jogar · vermelho: lento</p>
        </div>
      )}
    </div>
  );
}
