import { useEffect, useState } from 'react';
import { voiceCall } from '../services/VoiceCall';
import { supabase } from '../services/supabase/client';
import { activeMapId } from '../canvas/Spawn';
import { EFEITOS_MAPA, EFEITOS_VOZ } from '../services/VozEfeitos';
import AparelhosPanel from './AparelhosPanel.jsx';

const MODOS_MAPA = [
  { id: 'todos', label: 'Todos', dica: 'O efeito do mapa vale para a voz de todo mundo' },
  { id: 'mestre', label: 'Só o Mestre', dica: 'Só a voz do Mestre recebe o efeito do mapa' },
  { id: 'livre', label: 'Livre', dica: 'Sem efeito do mapa; cada jogador usa o efeito de voz que quiser' },
];

/**
 * Efeitos que valem para mim agora (seção 13 do planejamento):
 *  - ambiente: o do mapa, se o Mestre escolheu "Todos" (ou "Só o Mestre" e eu sou o Mestre);
 *  - voz: o que eu escolhi, se sou o Mestre, se o Mestre liberou, ou se o mapa está "Livre".
 */
export function efeitosDaMinhaVoz({ env, mapaId, isGM, escolhido }) {
  const mapa = (mapaId && env?.voz_mapas?.[mapaId]) || null;
  const ambiente = mapa?.efeito && (mapa.modo === 'todos' || (mapa.modo === 'mestre' && isGM)) ? mapa.efeito : '';
  const pode = Boolean(isGM || env?.voz_livre || mapa?.modo === 'livre');
  return { ambiente, voz: pode ? escolhido : 'normal', pode };
}

export default function VoiceChat({ roomId, playerId, playerName, isGM }) {
  const [voiceState, setVoiceState] = useState(voiceCall.getState());
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [volumeMenuUser, setVolumeMenuUser] = useState(null);
  const [env, setEnv] = useState(null); // rooms.scene_env (voz_mapas, voz_livre)
  const [mapaId, setMapaId] = useState(() => activeMapId());
  const [escolhido, setEscolhido] = useState('normal');
  const [painelVoz, setPainelVoz] = useState(false);
  const [aparelhos, setAparelhos] = useState(false); // painel Configurar câmera/fone/microfone

  // Configuração de voz da sala (e do mapa em uso), ao vivo.
  useEffect(() => {
    let ativo = true;
    supabase.from('rooms').select('scene_env').eq('id', roomId).single().then(({ data }) => { if (ativo) setEnv(data?.scene_env || {}); });
    const onEnv = (e) => setEnv((atual) => ({ ...(atual || {}), ...(e.detail || {}) }));
    const onMapa = (e) => setMapaId(e.detail?.id ?? activeMapId());
    window.addEventListener('vtt:scene-env', onEnv);
    window.addEventListener('vtt:active-map', onMapa);
    return () => { ativo = false; window.removeEventListener('vtt:scene-env', onEnv); window.removeEventListener('vtt:active-map', onMapa); };
  }, [roomId]);

  const efeitos = efeitosDaMinhaVoz({ env, mapaId: mapaId || env?.active_map_id, isGM, escolhido });
  useEffect(() => {
    voiceCall.setEfeitos({ voz: efeitos.voz, ambiente: efeitos.ambiente });
  }, [efeitos.voz, efeitos.ambiente]);

  /** Mestre: grava a voz da sala/mapa lendo a sala de novo (não apaga o que outros painéis salvaram). */
  const salvarVoz = async (mudar) => {
    const { data } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const atual = data?.scene_env || {};
    const proximo = { ...atual, ...mudar(atual) };
    setEnv(proximo);
    const { error } = await supabase.from('rooms').update({ scene_env: proximo }).eq('id', roomId);
    if (error) setErr('Erro ao salvar a voz: ' + error.message);
  };
  const mapaAtual = mapaId || env?.active_map_id || '';
  const vozMapa = (mapaAtual && env?.voz_mapas?.[mapaAtual]) || { efeito: '', modo: 'todos' };
  const mudarMapa = (campo, valor) => salvarVoz((atual) => ({
    voz_mapas: { ...(atual.voz_mapas || {}), [mapaAtual]: { ...{ efeito: '', modo: 'todos' }, ...(atual.voz_mapas?.[mapaAtual] || {}), [campo]: valor } },
  }));

  useEffect(() => {
    const unsub = voiceCall.onStateChange(setVoiceState);
    return () => {
      unsub();
      voiceCall.leave();
    };
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setErr('');
    try {
      await voiceCall.join({ roomId, playerId, playerName });
      setExpanded(true);
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? 'Permissão de microfone negada no navegador.' : `Erro: ${e.message || e}`);
    }
    setBusy(false);
  };

  const handleDisconnect = () => {
    voiceCall.leave();
    setExpanded(false);
    setVolumeMenuUser(null);
  };

  const participants = voiceState.participants || [];

  if (!voiceState.isConnected) {
    return (
      <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={handleConnect}
          disabled={busy}
          title="Entrar na chamada de voz da mesa (estilo Discord)"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-zinc-950/90 px-3 py-1.5 text-xs font-bold text-emerald-300 shadow-xl backdrop-blur transition hover:bg-emerald-950/80 hover:text-white hover:border-emerald-500 disabled:opacity-50"
        >
          <span className="text-sm">🎙️</span>
          <span>{busy ? 'Conectando…' : 'Entrar na Voz'}</span>
        </button>
        <button type="button" onClick={() => setAparelhos(true)} title="Configurar câmera, fone e microfone"
          className="rounded-lg border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-[11px] font-bold text-zinc-300 hover:text-white">⚙️ Aparelhos</button>
        {aparelhos && <AparelhosPanel onClose={() => setAparelhos(false)} />}
        {err && <span className="rounded bg-red-950/90 px-2 py-0.5 text-[10px] text-red-300 border border-red-800">{err}</span>}
      </div>
    );
  }

  return (
    <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1">
      {/* Barra principal compacta / expandida */}
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur min-w-[15rem] max-w-[20rem]">
        {/* Cabeçalho da chamada */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-emerald-400">Voz Conectada</span>
            <span className="text-[10px] text-zinc-500">({participants.length})</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="px-1 text-zinc-400 hover:text-white text-xs"
              title={expanded ? 'Minimizar participantes' : 'Ver participantes'}
            >
              {expanded ? '▲' : '▼'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="rounded bg-red-950/80 border border-red-800 px-1.5 py-0.5 text-[10px] font-bold text-red-200 hover:bg-red-800 hover:text-white"
              title="Desconectar da chamada"
            >
              📞 Desconectar
            </button>
          </div>
        </div>

        {/* Lista de participantes (quando expandido) */}
        {expanded && (
          <div className="space-y-1 max-h-48 overflow-y-auto mb-2 pr-1">
            {participants.map((user) => {
              const speaking = user.speaking;
              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors ${
                    speaking ? 'bg-emerald-950/40 border border-emerald-600/60' : 'bg-zinc-900/60 border border-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Avatar com anel luminoso de voz estilo Discord */}
                    <div
                      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-200 transition-all ${
                        speaking ? 'ring-2 ring-emerald-400 shadow-[0_0_10px_#10b981]' : ''
                      }`}
                    >
                      {user.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate text-zinc-200 font-medium text-[11px]">
                      {user.name} {user.isSelf && <span className="text-[9px] text-zinc-500 font-normal">(Você)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {user.speaking && <span className="text-[10px] font-bold text-emerald-400 animate-pulse">Falando</span>}
                    {user.muted && <span title="Microfone mutado" className="text-zinc-500 text-[11px]">🔇</span>}
                    {user.deafened && <span title="Áudio desativado" className="text-red-400 text-[11px]">🎧</span>}
                    {!user.isSelf && (
                      <button
                        type="button"
                        onClick={() => setVolumeMenuUser(volumeMenuUser === user.id ? null : user.id)}
                        className="text-zinc-400 hover:text-white text-[10px] px-1"
                        title="Ajustar volume individual"
                      >
                        🔊
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Menu de volume individual */}
        {volumeMenuUser && (() => {
          const target = participants.find((p) => p.id === volumeMenuUser);
          if (!target) return null;
          return (
            <div className="rounded border border-zinc-700 bg-zinc-900 p-2 mb-2 text-xs">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>Volume de <b>{target.name}</b></span>
                <span>{Math.round((target.volume ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={target.volume ?? 1}
                onChange={(e) => voiceCall.setPeerVolume(target.id, e.target.value)}
                className="w-full accent-emerald-500"
              />
            </div>
          );
        })()}

        {err && <p className="mb-1 rounded border border-red-800 bg-red-950/80 px-2 py-0.5 text-[10px] text-red-300">{err}</p>}
        {aparelhos && <AparelhosPanel onClose={() => setAparelhos(false)} />}
        {/* 🎭 Modificador de voz: troca com um clique */}
        {!efeitos.pode && !isGM && efeitos.ambiente && (
          <p className="mb-1.5 rounded border border-violet-800 bg-violet-950/50 px-2 py-1 text-[11px] text-violet-200">
            🎭 Voz do mapa: {EFEITOS_MAPA.find((e) => e.id === efeitos.ambiente)?.label} (o Mestre ligou)
          </p>
        )}
        {(efeitos.pode || isGM) && (
          <div className="mb-1.5">
            <button type="button" onClick={() => setPainelVoz((v) => !v)}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-bold ${efeitos.voz !== 'normal' || efeitos.ambiente ? 'bg-violet-950/70 text-violet-200 border border-violet-700' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>
              <span>🎭 Voz: {EFEITOS_VOZ.find((e) => e.id === efeitos.voz)?.label || 'Normal'}{efeitos.ambiente ? ` + ${EFEITOS_MAPA.find((e) => e.id === efeitos.ambiente)?.label}` : ''}</span>
              <span>{painelVoz ? '▲' : '▼'}</span>
            </button>
            {painelVoz && (
              <div className="mt-1 space-y-1.5">
                {efeitos.pode && (
                  <div className="grid grid-cols-4 gap-1">
                    {EFEITOS_VOZ.map((e) => (
                      <button key={e.id} type="button" onClick={() => setEscolhido(e.id)} title={e.dica || e.label}
                        className={`rounded border px-1 py-1 text-[10px] font-bold leading-tight ${escolhido === e.id ? 'border-violet-500 bg-violet-900/70 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'}`}>
                        <span className="block text-sm">{e.icone}</span>{e.label}
                      </button>
                    ))}
                  </div>
                )}
                {isGM && (
                  <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/70 p-1.5 text-[10px]">
                    <label className="flex items-center gap-1.5 text-zinc-300">
                      <input type="checkbox" checked={Boolean(env?.voz_livre)} onChange={(e) => salvarVoz(() => ({ voz_livre: e.target.checked }))} />
                      Jogadores podem usar efeitos de voz
                    </label>
                    {mapaAtual ? (
                      <>
                        <p className="font-bold text-zinc-400">Voz neste mapa</p>
                        <select value={vozMapa.efeito || ''} onChange={(e) => mudarMapa('efeito', e.target.value)}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-[11px] text-zinc-100">
                          {EFEITOS_MAPA.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                        </select>
                        <div className="grid grid-cols-3 gap-1">
                          {MODOS_MAPA.map((m) => (
                            <button key={m.id} type="button" title={m.dica} onClick={() => mudarMapa('modo', m.id)}
                              className={`rounded border py-0.5 font-bold ${vozMapa.modo === m.id ? 'border-violet-500 bg-violet-900/60 text-white' : 'border-zinc-700 text-zinc-400'}`}>{m.label}</button>
                          ))}
                        </div>
                      </>
                    ) : <p className="text-zinc-500">Salve o mapa na Biblioteca de mapas para definir a voz dele.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Barra de Controles rápidos (Microfone / Ensurdecer / Desconectar) */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => voiceCall.toggleMute()}
            className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-[11px] font-bold transition ${
              voiceState.isMuted
                ? 'bg-red-950/80 border border-red-700 text-red-300'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title={voiceState.isMuted ? 'Desmutar microfone' : 'Mutar microfone'}
          >
            <span>{voiceState.isMuted ? '🔇' : '🎙️'}</span>
            <span>{voiceState.isMuted ? 'Mudo' : 'Voz'}</span>
          </button>

          <button
            type="button"
            onClick={() => voiceCall.toggleDeafen()}
            className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-[11px] font-bold transition ${
              voiceState.isDeafened
                ? 'bg-red-950/80 border border-red-700 text-red-300'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title={voiceState.isDeafened ? 'Ativar som dos outros' : 'Ensurdecer (desativar áudio)'}
          >
            <span>{voiceState.isDeafened ? '🔕' : '🎧'}</span>
            <span>{voiceState.isDeafened ? 'Surdo' : 'Áudio'}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              setErr('');
              try {
                if (voiceState.cameraOn) voiceCall.desligarCamera();
                else await voiceCall.ligarCamera();
              } catch (e) {
                setErr(e.name === 'NotAllowedError' ? 'Permissão de câmera negada no navegador.' : `Câmera: ${e.message || e}`);
              }
            }}
            className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-[11px] font-bold transition ${
              voiceState.cameraOn ? 'bg-sky-900/80 border border-sky-600 text-sky-100' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title={voiceState.cameraOn ? 'Desligar a sua câmera' : 'Ligar a sua câmera'}
          >
            <span>📷</span>
            <span>{voiceState.cameraOn ? 'Câm. on' : 'Câmera'}</span>
          </button>

          <button type="button" onClick={() => setAparelhos(true)} title="Configurar câmera, fone e microfone"
            className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700">⚙️</button>
        </div>
      </div>
    </div>
  );
}
