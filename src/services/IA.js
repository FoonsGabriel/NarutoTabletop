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
    // Respostas longas chegam com espaços antes do JSON (para o túnel não cortar); JSON.parse aceita.
    const dados = await r.text().then((t) => JSON.parse(t.trim() || '{}')).catch(() => ({}));
    if (dados.erro) throw new Error(dados.erro);
    if (!r.ok) {
      // O FastAPI manda "detail" como texto ou como lista de erros de validação.
      const d = dados.detail;
      const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x?.msg).filter(Boolean).join(' ') : '';
      throw new Error(msg || `A IA respondeu com erro (${r.status}).`);
    }
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
/**
 * Ajuda aos poucos na ficha: manda como a ficha está + o pedido; volta só o que mudaria.
 * ficha: { nome, cla, vila, conceito, historia, atributos, pericias, aptidoes_gratuitas, aptidoes_extra, poderes }
 * limites: { atributos, pericias, poder, min_atributo, max_atributo, max_pericia, pericias_disponiveis }
 * Resposta: { mudancas, explicacao, avisos, nomes }
 */
export const ajudarFichaIA = ({ pedido, ficha, limites, nc = 4, papel = 'geral', livre = false }) =>
  chamar('/ficha/ajudar', { pedido, ficha, limites, nc, papel, livre }, { tempo: 600000 });

/** livre: o Mestre marcou "Liberar regras" na ficha (pode misturar poderes de clãs diferentes). */
export const sugerirFichaIA = ({ descricao, nc = 4, papel = 'geral', livre = false }) => chamar('/ficha', { descricao, nc, papel, livre });

/**
 * Igual a perguntarIA, mas a resposta vai chegando aos pedaços: aoEscrever(textoAtéAgora) é chamado
 * a cada pedaço. Devolve { resposta, fontes }. Se o PC estiver com o servidor antigo, cai no perguntarIA.
 */
export async function perguntarIAEmPartes({ pergunta, papel = 'geral', historico = [] }, aoEscrever) {
  if (!IA_URL) throw new Error('A IA ainda não foi ligada neste site.');
  const controle = new AbortController();
  let relogio = setTimeout(() => controle.abort(), 60000); // tempo até começar a escrever
  try {
    const r = await fetch(`${IA_URL}/perguntar/partes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta, papel, historico }),
      signal: controle.signal,
    });
    if (r.status === 404) return perguntarIA({ pergunta, papel, historico });
    if (!r.ok || !r.body) {
      const dados = await r.json().catch(() => ({}));
      const d = dados.detail;
      throw new Error((typeof d === 'string' && d) || `A IA respondeu com erro (${r.status}).`);
    }
    const leitor = r.body.getReader();
    const decodificador = new TextDecoder();
    let sobra = '';
    let resposta = '';
    let fontes = [];
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      clearTimeout(relogio);
      relogio = setTimeout(() => controle.abort(), 60000); // parou de escrever por 1 min = desiste
      sobra += decodificador.decode(value, { stream: true });
      const linhas = sobra.split('\n');
      sobra = linhas.pop();
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        const d = JSON.parse(linha);
        if (d.erro) throw new Error(d.erro);
        if (d.t) {
          resposta += d.t;
          aoEscrever?.(resposta);
        }
        if (d.fim) fontes = d.fontes || [];
      }
    }
    return { resposta: resposta.trim(), fontes };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A IA demorou demais para responder. Tente de novo.');
    if (e instanceof TypeError) throw new Error('IA offline: o PC servidor parece desligado.');
    throw e;
  } finally {
    clearTimeout(relogio);
  }
}
