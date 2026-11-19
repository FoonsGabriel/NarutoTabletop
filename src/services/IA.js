// =====================================================================
// IA de apoio (PLANEJAMENTO-IA seções 1 e 5). Roda no PC do Gabriel
// (servidor-ia/, Ollama + livros) e chega aqui pelo túnel da Cloudflare.
//
// Endereço do servidor: variável VITE_IA_URL (no .env.local e na Vercel).
// Sem ela, ou com o PC desligado, o chatbot mostra "IA offline" e o resto do site funciona.
// =====================================================================

export const IA_URL = (import.meta.env?.VITE_IA_URL || '').replace(/\/+$/, '');
export const iaConfigurada = Boolean(IA_URL);

async function chamar(caminho, corpo, { tempo = 200000 } = {}) {
  if (!IA_URL) throw new Error('A IA ainda não foi ligada neste site.');
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempo);
  try {
    const r = await fetch(`${IA_URL}${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.detail || `A IA respondeu com erro (${r.status}).`);
    return dados;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A IA demorou demais para responder. Tente de novo.');
    if (e instanceof TypeError) throw new Error('IA offline: o PC servidor parece desligado.');
    throw e;
  } finally {
    clearTimeout(relogio);
  }
}

/** { ok, livros, fila, ... } — ou lança erro se estiver offline. */
export const saudeIA = () => chamar('/saude', null, { tempo: 6000 });

/** papel: 'mestre' | 'mesa' | 'geral' (prioridade na fila do PC). */
export const perguntarIA = ({ pergunta, papel = 'geral', historico = [] }) => chamar('/perguntar', { pergunta, papel, historico });

/** Sugestão de ficha (conferida no PC e de novo pela ficha do site). */
export const sugerirFichaIA = ({ descricao, nc = 4, papel = 'geral' }) => chamar('/ficha', { descricao, nc, papel });
