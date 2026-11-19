import { useEffect, useRef, useState } from 'react';
import { lerAparelhos, salvarAparelhos, voiceCall } from '../services/VoiceCall';

/**
 * Configurar câmera, fone e microfone (seção 14): escolher os aparelhos e testar
 * se o site está pegando os certos — ver a câmera, ver o microfone mexer e tocar um som no fone.
 * Fica tudo só neste aparelho. Nada roda depois de fechar.
 */
export default function AparelhosPanel({ onClose }) {
  const [lista, setLista] = useState({ mic: [], fone: [], camera: [] });
  const [escolha, setEscolha] = useState(() => ({ mic: '', fone: '', camera: '', ...lerAparelhos() }));
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const videoRef = useRef(null);
  const testes = useRef({ mic: null, cam: null, ctx: null, raf: 0 });
  const podeEscolherFone = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  // Pede permissão uma vez (sem ela o navegador não mostra o nome dos aparelhos) e lista.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const md = navigator.mediaDevices;
        if (!md?.enumerateDevices) throw new Error('Este navegador não deixa escolher aparelhos (precisa de HTTPS).');
        let s = null;
        try { s = await md.getUserMedia({ audio: true, video: true }); } catch {
          try { s = await md.getUserMedia({ audio: true }); } catch { /* sem permissão: lista sem nomes */ }
        }
        s?.getTracks().forEach((t) => t.stop());
        const todos = await md.enumerateDevices();
        if (!ativo) return;
        const nome = (d, i, tipo) => d.label || `${tipo} ${i + 1}`;
        setLista({
          mic: todos.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, nome: nome(d, i, 'Microfone') })),
          fone: todos.filter((d) => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId, nome: nome(d, i, 'Saída') })),
          camera: todos.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, nome: nome(d, i, 'Câmera') })),
        });
      } catch (e) {
        if (ativo) setErro(e.message || String(e));
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Teste do microfone: barrinha que mexe com a voz (só enquanto o painel está aberto).
  useEffect(() => {
    let parar = false;
    const t = testes.current;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: escolha.mic ? { deviceId: { exact: escolha.mic } } : true });
        if (parar) { s.getTracks().forEach((x) => x.stop()); return; }
        t.mic = s;
        const AC = window.AudioContext || window.webkitAudioContext;
        t.ctx = new AC();
        const an = t.ctx.createAnalyser();
        an.fftSize = 512;
        t.ctx.createMediaStreamSource(s).connect(an);
        const dados = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(dados);
          let pico = 0;
          for (let i = 0; i < dados.length; i += 1) pico = Math.max(pico, Math.abs(dados[i] - 128));
          setNivel(Math.min(1, pico / 64));
          t.raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setNivel(0);
      }
    })();
    return () => {
      parar = true;
      cancelAnimationFrame(t.raf);
      t.mic?.getTracks().forEach((x) => x.stop());
      t.mic = null;
      try { t.ctx?.close(); } catch { /* já fechado */ }
      t.ctx = null;
    };
  }, [escolha.mic]);

  // Teste da câmera: mostra a imagem.
  useEffect(() => {
    let parar = false;
    const t = testes.current;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: escolha.camera ? { deviceId: { exact: escolha.camera } } : true });
        if (parar) { s.getTracks().forEach((x) => x.stop()); return; }
        t.cam = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch {
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    })();
    return () => {
      parar = true;
      t.cam?.getTracks().forEach((x) => x.stop());
      t.cam = null;
    };
  }, [escolha.camera]);

  /** Bip curto no fone escolhido. */
  const tocarTeste = async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const destino = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    osc.connect(g).connect(destino);
    const audio = new Audio();
    audio.srcObject = destino.stream;
    if (escolha.fone && audio.setSinkId) await audio.setSinkId(escolha.fone).catch(() => {});
    await audio.play().catch(() => {});
    osc.start();
    osc.stop(ctx.currentTime + 0.85);
    setTimeout(() => { audio.pause(); ctx.close(); }, 1000);
  };

  const salvar = async () => {
    setErro('');
    const antes = lerAparelhos();
    salvarAparelhos(escolha);
    try {
      if ((antes.mic || '') !== (escolha.mic || '')) await voiceCall.trocarMicrofone(escolha.mic);
      if ((antes.fone || '') !== (escolha.fone || '')) voiceCall.trocarFone(escolha.fone);
      if ((antes.camera || '') !== (escolha.camera || '') && voiceCall.cameraOn) {
        voiceCall.desligarCamera();
        await voiceCall.ligarCamera();
      }
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro('Não deu para trocar: ' + (e.message || e));
    }
  };


  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-sm space-y-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-black">⚙️ Câmera, fone e microfone</p>
          <button type="button" onClick={onClose} className="px-1 text-zinc-500 hover:text-white">✕</button>
        </div>

        <Escolher escolha={escolha} setEscolha={setEscolha} campo="mic" rotulo="🎙️ Microfone" itens={lista.mic} />
        <div className="h-2 overflow-hidden rounded bg-zinc-800" title="Fale: a barra tem que mexer">
          <div className={`h-full transition-[width] duration-75 ${nivel > 0.05 ? 'bg-emerald-500' : 'bg-zinc-600'}`} style={{ width: `${Math.round(nivel * 100)}%` }} />
        </div>
        <p className="text-[10px] text-zinc-500">Fale alguma coisa: a barra verde tem que mexer.</p>

        {podeEscolherFone
          ? <Escolher escolha={escolha} setEscolha={setEscolha} campo="fone" rotulo="🎧 Fone / alto-falante" itens={lista.fone} />
          : <p className="text-[11px] text-zinc-400">🎧 Este navegador usa a saída de som do sistema (escolha o fone nas configurações do aparelho).</p>}
        <button type="button" onClick={tocarTeste} className="w-full rounded border border-zinc-700 py-1 text-xs font-bold text-zinc-200 hover:border-zinc-500">🔊 Tocar som de teste</button>

        <Escolher escolha={escolha} setEscolha={setEscolha} campo="camera" rotulo="📷 Câmera" itens={lista.camera} />
        <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full -scale-x-100 rounded border border-zinc-800 bg-black object-cover" />
        {!lista.camera.length && <p className="text-[10px] text-zinc-500">Nenhuma câmera encontrada (ou sem permissão).</p>}

        {erro && <p className="text-[11px] text-red-400">{erro}</p>}
        <button type="button" onClick={salvar} className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-black hover:bg-emerald-600">{salvo ? '✓ Salvo' : 'Usar estes aparelhos'}</button>
      </div>
    </div>
  );
}

function Escolher({ campo, rotulo, itens, escolha, setEscolha }) {
  return (
    <label className="block text-[11px] font-bold text-zinc-400">
      {rotulo}
      <select value={escolha[campo] || ''} onChange={(e) => setEscolha((x) => ({ ...x, [campo]: e.target.value }))}
        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-normal text-zinc-100">
        <option value="">Padrão do aparelho</option>
        {itens.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
      </select>
    </label>
  );
}
