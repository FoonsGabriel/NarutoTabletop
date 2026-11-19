import { useEffect, useRef, useState } from 'react';
import { voiceCall } from '../services/VoiceCall';

/**
 * Câmeras da mesa (PLANEJAMENTO-IA seção 14).
 *  - PC: todas lado a lado, num canto da tela.
 *  - Celular: escondidas atrás do botão "📹 Câmeras"; até tocar, o celular não baixa os vídeos.
 *  - O Mestre pode desligar a câmera dos outros; cada um liga/desliga a sua no painel de voz.
 */
export default function CamerasMesa({ isGM }) {
  const [estado, setEstado] = useState(voiceCall.getState());
  const [aberto, setAberto] = useState(() => voiceCall.querVideo);
  useEffect(() => voiceCall.onStateChange(setEstado), []);

  if (!estado.isConnected) return null;

  const nomes = Object.fromEntries((estado.participants || []).map((p) => [p.id, p]));
  const outros = (estado.videos || []).filter((v) => nomes[v.id]?.camera);
  const total = outros.length + (estado.cameraOn ? 1 : 0);
  if (!total) return null;

  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    voiceCall.setQuerVideo(proximo); // fechado = não baixa vídeo (economiza dados e bateria)
  };

  return (
    // No celular fica no alto, abaixo de Ficha/Combate/Dados (o menu do turno ocupa a parte de baixo).
    <div className="pointer-events-auto absolute right-2 top-56 z-20 flex flex-col-reverse items-end gap-1 md:bottom-2 md:top-auto md:flex-col">
      {aberto && (
        <div className="flex max-w-[calc(100vw-1rem)] flex-wrap justify-end gap-1 md:max-w-[50vw]">
          {estado.cameraOn && <Quadro stream={estado.camStream} nome="Você" espelhar />}
          {outros.map((v) => (
            <Quadro key={v.id} stream={v.stream} nome={nomes[v.id]?.name || 'Ninja'} falando={nomes[v.id]?.speaking}
              onDesligar={isGM ? () => voiceCall.pedirDesligarCamera(v.id) : null} />
          ))}
        </div>
      )}
      <button type="button" onClick={alternar}
        className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${aberto ? 'border-zinc-700 bg-zinc-900/80 text-zinc-300' : 'border-sky-600 bg-sky-950/80 text-sky-100'}`}>
        📹 {aberto ? 'Esconder câmeras' : `Câmeras (${total})`}
      </button>
    </div>
  );
}

function Quadro({ stream, nome, falando, espelhar, onDesligar }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className={`relative h-[72px] w-24 overflow-hidden rounded-md border-2 bg-zinc-950 md:h-[90px] md:w-[120px] ${falando ? 'border-emerald-400' : 'border-zinc-700'}`}>
      <video ref={ref} autoPlay playsInline muted className={`h-full w-full object-cover ${espelhar ? '-scale-x-100' : ''}`} />
      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 text-[10px] font-bold text-white">{nome}</span>
      {onDesligar && (
        <button type="button" onClick={onDesligar} title="Desligar a câmera desta pessoa"
          className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-zinc-300 hover:text-red-400">✕</button>
      )}
    </div>
  );
}
