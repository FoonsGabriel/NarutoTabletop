// =====================================================================
// IA de apoio (PLANEJAMENTO-IA seções 1 e 5). Roda no PC do Gabriel
// (servidor-ia/, Ollama + livros) e chega aqui pelo túnel da Cloudflare.
//
// Endereço do servidor: o PC grava o endereço do túnel no Supabase (tabela ia_endereco) toda vez
// que abre; o site lê de lá. VITE_IA_URL (no .env.local e na Vercel) fica só como reserva.
// Com o PC desligado, o chatbot mostra "IA offline" e o resto do site funciona.
// =====================================================================
import { supabase } from './supabase/client';

const limpar = (u) => (u || '').replace(/\/+$/, '');
const RESERVA = limpar(import.meta.env?.VITE_IA_URL);
let endereco = RESERVA;
let lido = false;
let lendo = null;

/** Endereço atual da IA (lê do Supabase na 1ª vez, ou de novo com renovar=true). */
async function enderecoIA(renovar = false) {
  if (lido && !renovar) return endereco;
  lendo ??= supabase.from('ia_endereco').select('url').eq('id', 1).maybeSingle()
    .then(({ data }) => { if (data?.url) endereco = limpar(data.url); })
    .catch(() => {})
    .finally(() => { lido = true; lendo = null; });
  await lendo;
  return endereco;
}

/** fetch no servidor da IA. Se a conexão falhar, relê o endereço (o PC pode ter reiniciado) e tenta 1 vez. */
async function buscarIA(caminho, opcoes) {
  const base = await enderecoIA();
  if (!base) throw new Error('A IA ainda não foi ligada neste site.');
  try {
    return await fetch(`${base}${caminho}`, opcoes);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    const novo = await enderecoIA(true);
    if (!novo || novo === base) throw e;
    return fetch(`${novo}${caminho}`, opcoes);
  }
}

// A IA pode estar ligada mesmo sem VITE_IA_URL (o endereço vem do Supabase); quem diz se está online é o /saude.
export const iaConfigurada = true;

async function chamar(caminho, corpo, { tempo = 200000 } = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempo);
  try {
    const r = await buscarIA(caminho, {
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
export const perguntarIA = ({ pergunta, papel = 'geral', historico = [], roomId = null, jogadorId = null }) =>
  chamar('/perguntar', { pergunta, papel, historico, room_id: roomId, jogador_id: jogadorId });

/** Sugestão de ficha (conferida no PC e de novo pela ficha do site). */
/**
 * Ajuda aos poucos na ficha: manda como a ficha está + o pedido; volta só o que mudaria.
 * ficha: { nome, cla, vila, conceito, historia, atributos, pericias, aptidoes_gratuitas, aptidoes_extra, poderes }
 * limites: { atributos, pericias, poder, min_atributo, max_atributo, max_pericia, pericias_disponiveis }
 * Resposta: { mudancas, explicacao, avisos, nomes }
 */
export const ajudarFichaIA = ({ pedido, ficha, limites, nc = 4, papel = 'geral', livre = false, liberados = [] }) =>
  chamar('/ficha/ajudar', { pedido, ficha, limites, nc, papel, livre, liberados }, { tempo: 600000 });

/**
 * Regras da mesa: transforma o que o Mestre escreveu numa regra pronta para conferir.
 * Resposta: { texto, tipo: 'livre' | 'liberar', itens: [{ id, nome }], personagem_id, explicacao }
 */
export const interpretarRegraIA = ({ texto, personagens = [] }) =>
  chamar('/regras/interpretar', { texto, personagens, papel: 'mestre' }, { tempo: 300000 });

/** livre: o Mestre marcou "Liberar regras" na ficha (pode misturar poderes de clãs diferentes). */
export const sugerirFichaIA = ({ descricao, nc = 4, papel = 'geral', livre = false }) => chamar('/ficha', { descricao, nc, papel, livre });

/**
 * Igual a perguntarIA, mas a resposta vai chegando aos pedaços: aoEscrever(textoAtéAgora) é chamado
 * a cada pedaço. Devolve { resposta, fontes }. Se o PC estiver com o servidor antigo, cai no perguntarIA.
 */
export async function perguntarIAEmPartes({ pergunta, papel = 'geral', historico = [], roomId = null, jogadorId = null }, aoEscrever) {
  const controle = new AbortController();
  let relogio = setTimeout(() => controle.abort(), 60000); // tempo até começar a escrever
  try {
    const r = await buscarIA('/perguntar/partes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta, papel, historico, room_id: roomId, jogador_id: jogadorId }),
      signal: controle.signal,
    });
    if (r.status === 404) return perguntarIA({ pergunta, papel, historico, roomId, jogadorId });
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
