import { useEffect, useRef, useState } from 'react';
import { iaConfigurada, perguntarIAEmPartes, saudeIA } from '../services/IA';

/**
 * Chatbot de regras (IA v1). Responde com os trechos dos livros e cita as páginas.
 * papel: 'mestre' | 'mesa' | 'geral' — o Mestre e quem está numa mesa passam na frente na fila.
 */
export default function Chatbot({ onClose, papel = 'geral', roomId = null }) {
  const [estado, setEstado] = useState(iaConfigurada ? 'verificando' : 'sem-ia'); // verificando | online | offline | sem-ia
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fim = useRef(null);

  useEffect(() => {
    if (!iaConfigurada) return;
    saudeIA().then((s) => setEstado(s.ok ? 'online' : 'offline')).catch(() => setEstado('offline'));
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [mensagens, pensando]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const enviar = async (e) => {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;
    const historico = mensagens.filter((m) => !m.erro).slice(-6).map((m) => ({ role: m.de === 'eu' ? 'user' : 'assistant', content: m.texto }));
    setMensagens((l) => [...l, { de: 'eu', texto: pergunta }]);
    setTexto('');
    setPensando(true);
    // A resposta vai aparecendo enquanto a IA escreve: a última mensagem é atualizada a cada pedaço.
    let comecou = false;
    const escrever = (texto, extra = {}) => {
      const primeira = !comecou;
      comecou = true;
      const nova = { de: 'ia', texto, ...extra };
      setMensagens((l) => (primeira ? [...l, nova] : [...l.slice(0, -1), nova]));
    };
    try {
      const r = await perguntarIAEmPartes({ pergunta, papel, historico, roomId }, (t) => escrever(t));
      escrever(r.resposta, { fontes: r.fontes || [] });
      setEstado('online');
    } catch (err) {
      escrever(err.message, { erro: true });
    }
    setPensando(false);
  };

  const aviso = {
    'sem-ia': 'O chatbot ainda não foi ligado neste site.',
    offline: 'IA offline: o PC servidor parece desligado. O resto do site funciona normalmente.',
    verificando: 'Conectando com a IA…',
  }[estado];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="chatbot-titulo" onClick={(e) => e.stopPropagation()}
        className="flex h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl sm:h-[75vh] sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <p id="chatbot-titulo" className="text-lg font-bold">💬 Dúvidas de regras</p>
            <p className="text-xs text-zinc-400">Responde com os livros do Shinobi no Sho e mostra as páginas.</p>
          </div>
          <button type="button" onClick={onClose} className="px-2 text-zinc-400 hover:text-white" aria-label="Fechar">✕</button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {aviso && <p className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">{aviso}</p>}
          {!mensagens.length && estado === 'online' && (
            <p className="text-sm text-zinc-400">Pergunte uma regra, por exemplo: “Como funciona o Kawarimi?” ou “Quanto custa subir um poder?”. O Mestre pode mudar regras na mesa dele.</p>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={m.de === 'eu' ? 'ml-8 text-right' : 'mr-4'}>
              <div className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-[15px] leading-relaxed ${m.de === 'eu' ? 'bg-red-700 text-zinc-50' : m.erro ? 'border border-red-800 bg-red-950/60 text-red-100' : 'bg-zinc-800 text-zinc-100'}`}>
                {m.de === 'ia' && !m.erro ? <TextoIA texto={m.texto} /> : m.texto}
              </div>
              {m.fontes?.length > 0 && (
                <p className="mt-1 text-xs text-zinc-400">Fontes: {m.fontes.map((f) => `${f.livro}, pág. ${f.pagina}`).join('; ')}</p>
              )}
            </div>
          ))}
          {pensando && mensagens[mensagens.length - 1]?.de === 'eu' && <p className="text-sm text-zinc-400">A IA está procurando nos livros…</p>}
          <div ref={fim} />
        </div>

        <form onSubmit={enviar} className="flex gap-2 border-t border-zinc-800 p-3">
          <label htmlFor="chatbot-pergunta" className="sr-only">Sua pergunta</label>
          <input id="chatbot-pergunta" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1200}
            disabled={estado === 'sem-ia'} placeholder="Escreva sua dúvida"
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none disabled:opacity-50" />
          <button type="submit" disabled={!texto.trim() || pensando || estado === 'sem-ia'}
            className="rounded-md bg-red-600 px-4 font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">Perguntar</button>
        </form>
      </div>
    </div>
  );
}

/** Mostra o negrito (**texto**) e os títulos (### texto) que a IA escreve, sem aparecer os asteriscos. */
function TextoIA({ texto }) {
  return texto.split('\n').map((linha, i, todas) => {
    const titulo = /^#{1,6}\s+/.test(linha);
    const limpa = linha.replace(/^#{1,6}\s+/, '');
    const partes = limpa.split(/\*\*(.+?)\*\*/g).map((p, j) => (j % 2 ? <strong key={j} className="font-bold text-zinc-50">{p}</strong> : p));
    return (
      <span key={i} className={titulo ? 'font-bold text-zinc-50' : undefined}>
        {partes}
        {i < todas.length - 1 && '\n'}
      </span>
    );
  });
}
