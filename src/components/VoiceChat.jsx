import { useEffect, useState } from 'react';
import { voiceCall } from '../services/VoiceCall';

export default function VoiceChat({ roomId, playerId, playerName, isGM }) {
  const [voiceState, setVoiceState] = useState(voiceCall.getState());
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [volumeMenuUser, setVolumeMenuUser] = useState(null);

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
        </div>
      </div>
    </div>
  );
}
