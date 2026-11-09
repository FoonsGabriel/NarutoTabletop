import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { patchSceneEnv } from '../services/SceneEnv';
import { uploadAudio } from '../services/Storage';
import { aplicarMusica, onMusica, setMudoMusica, setVolumeMusica } from '../services/Musica';
import { GRUPOS_MUSICA, MUSICAS_PRONTAS, nomeDaMusica } from '../data/Musicas';
import { uid } from '../services/Uid';

/**
 * 🎵 Música da mesa (Mestre). Toca para todo mundo, no mesmo ponto da faixa.
 *  - Trilhas prontas: arquivos da pasta src/assets/Musicas.
 *  - Enviadas: o Mestre sobe um arquivo de áudio (fica salvo na sala).
 */
export default function MusicPanel({ roomId }) {
  const [enviadas, setEnviadas] = useState([]);
  const [tocando, setTocando] = useState(null);
  const [som, setSom] = useState({ volume: 0.5, mudo: false });
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from('rooms').select('scene_env').eq('id', roomId).single().then(({ data }) => {
      const env = data?.scene_env || {};
      setEnviadas(Array.isArray(env.musicas) ? env.musicas : []);
      if (env.musica) setLoop(env.musica.loop !== false);
    });
  }, [roomId]);

  useEffect(() => onMusica((estado) => {
    setTocando(estado.tocando ? estado.url : null);
    setSom({ volume: estado.volume, mudo: estado.mudo });
  }), []);

  /** Grava a música na sala (todos recebem pelo Realtime) e já toca aqui. */
  const salvarMusica = async (musica) => {
    setError('');
    aplicarMusica(musica);
    const { error: saveError } = await patchSceneEnv(roomId, () => ({ musica }));
    if (saveError) setError(saveError.message);
  };

  const tocar = (faixa) => salvarMusica({ url: faixa.url, nome: faixa.nome, playing: true, startedAt: Date.now(), loop });
  const parar = () => salvarMusica({ playing: false, url: tocando || '', nome: '', loop });

  const alternarLoop = async () => {
    const next = !loop;
    setLoop(next);
    const { data } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const atual = data?.scene_env?.musica;
    if (atual?.playing) await salvarMusica({ ...atual, loop: next });
  };

  const enviar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|ogg|m4a|wav)$/i.test(file.name)) {
      setError('Escolha um arquivo de áudio (mp3, ogg, m4a ou wav).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Arquivo grande demais (máximo 25 MB). Use um mp3 menor.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const url = await uploadAudio(file);
      const faixa = { id: uid(), nome: nomeDaMusica(file.name) || 'Música', url };
      const { env, error: saveError } = await patchSceneEnv(roomId, (current) => ({ musicas: [...(current.musicas || []), faixa] }));
      if (saveError) throw saveError;
      setEnviadas(env.musicas);
    } catch (err) {
      setError(`Não foi possível enviar: ${err.message || err}`);
    }
    setBusy(false);
  };

  const remover = async (faixa) => {
    if (!window.confirm(`Tirar "${faixa.nome}" da lista?`)) return;
    const { env, error: saveError } = await patchSceneEnv(roomId, (current) => ({ musicas: (current.musicas || []).filter((m) => m.id !== faixa.id) }));
    if (saveError) { setError(saveError.message); return; }
    setEnviadas(env.musicas);
    if (tocando === faixa.url) parar();
  };

  const Linha = ({ faixa, removivel }) => (
    <li className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${tocando === faixa.url ? 'border-orange-600 bg-orange-950/40' : 'border-zinc-800 bg-zinc-900'}`}>
      <button type="button" onClick={() => (tocando === faixa.url ? parar() : tocar(faixa))}
        className={`w-7 shrink-0 rounded py-0.5 font-bold ${tocando === faixa.url ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-red-700'}`}
        title={tocando === faixa.url ? 'Parar' : 'Tocar para todos'}>
        {tocando === faixa.url ? '■' : '▶'}
      </button>
      <span className="min-w-0 flex-1 truncate text-zinc-100">{faixa.nome}</span>
      {removivel && <button type="button" onClick={() => remover(faixa)} className="px-1 text-zinc-500 hover:text-red-300" title="Tirar da lista">✕</button>}
    </li>
  );

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">🎵 Música</p>
        <div className="flex gap-1">
          <button type="button" onClick={alternarLoop} className={`rounded border px-2 py-0.5 text-[10px] font-bold ${loop ? 'border-sky-700 bg-sky-950/60 text-sky-200' : 'border-zinc-700 text-zinc-400'}`} title="Repetir a música quando acabar">
            🔁 {loop ? 'Repetir' : 'Uma vez'}
          </button>
          {tocando && <button type="button" onClick={parar} className="rounded border border-red-800 px-2 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-950/50">■ Parar</button>}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
        <button type="button" onClick={() => setMudoMusica(!som.mudo)} className="text-sm" title={som.mudo ? 'Ligar a música aqui' : 'Silenciar a música aqui'}>{som.mudo ? '🔇' : '🔊'}</button>
        <input type="range" min="0" max="1" step="0.05" value={som.volume} onChange={(e) => setVolumeMusica(e.target.value)} className="flex-1 accent-orange-500" aria-label="Volume da música" />
        <span className="w-9 text-right text-[10px] text-zinc-400">{som.mudo ? 'mudo' : `${Math.round(som.volume * 100)}%`}</span>
      </div>

      {GRUPOS_MUSICA.map(({ key, label }) => {
        const faixas = MUSICAS_PRONTAS.filter((f) => f.grupo === key);
        if (!faixas.length) return null;
        return (
          <details key={key} open={key === 'Combate'} className="rounded border border-zinc-800">
            <summary className="cursor-pointer px-2 py-1 text-[11px] font-bold text-zinc-300">{label} <span className="font-normal text-zinc-500">({faixas.length})</span></summary>
            <ul className="max-h-56 space-y-1 overflow-y-auto p-1">{faixas.map((f) => <Linha key={f.id} faixa={{ ...f, nome: f.titulo }} />)}</ul>
          </details>
        );
      })}

      <p className="text-[10px] text-zinc-500">Enviadas por você</p>
      {enviadas.length === 0 && <p className="text-[11px] text-zinc-600">Nenhuma ainda. Envie um mp3 do seu aparelho.</p>}
      <ul className="max-h-48 space-y-1 overflow-y-auto">{enviadas.map((f) => <Linha key={f.id} faixa={f} removivel />)}</ul>

      <input ref={fileRef} type="file" accept="audio/*,.mp3,.ogg,.m4a,.wav" className="hidden" onChange={enviar} />
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="w-full rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-200 hover:border-red-600 disabled:opacity-50">
        {busy ? 'Enviando…' : '⬆ Enviar música'}
      </button>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <p className="text-[10px] text-zinc-600">Todos ouvem juntos. O volume acima vale só para você; cada jogador ajusta o dele no botão 🎵 do mapa.</p>
    </section>
  );
}
