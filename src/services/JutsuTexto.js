// =====================================================================
// Textos simples dos jutsus para o jogador: categoria, nome fácil e
// "o que faz" em uma linha. Não muda regra nenhuma, só a apresentação.
// =====================================================================

export const CATEGORIAS_JUTSU = [
  { id: 'todos', rotulo: 'Todos', icone: '📜' },
  { id: 'ataque', rotulo: 'Ataque', icone: '⚔️' },
  { id: 'defesa', rotulo: 'Defesa', icone: '🛡️' },
  { id: 'cura', rotulo: 'Cura', icone: '💚' },
  { id: 'apoio', rotulo: 'Apoio', icone: '✨' },
];

const DEFESA_IDS = new Set(['barreira', 'pele_de_pedra', 'areia_especial']);
const RE_DEFESA = /barreira|armadura|escudo|defes|prote[gç]|kawarimi|substitui|domo|redoma|manto|casulo|prisma/i;
const RE_ATAQUE = /\bdano\b|ataque|acert|golpe|explos|atira|dispara|lança contra|corta/i;

/** Em que aba o jutsu aparece: ataque, defesa, cura ou apoio. */
export function categoriaJutsu(item) {
  const e = item?.efeito || {};
  if (e.cura || e.ganhoVit) return 'cura';
  if (DEFESA_IDS.has(e.id) || e.durezaCorpo || e.durezaBonus || e.bonusDefesa) return 'defesa';
  if (e.ataque || e.drenoHp || e.danoTexto || e.genjutsu) return 'ataque';
  if (e.dano != null && !e.tecnica) return 'ataque';
  const texto = `${e.nome || ''} ${e.resumo || ''}`;
  if (RE_DEFESA.test(e.nome || '')) return 'defesa';
  if (e.tecnica && RE_ATAQUE.test(texto)) return 'ataque';
  return 'apoio';
}

/**
 * Nome fácil: "Jiraiken (Punho de Mina Terrestre)" vira
 * { principal: 'Punho de Mina Terrestre', original: 'Jiraiken' }.
 */
export function nomeSimples(nome = '') {
  const m = String(nome).match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (!m) return { principal: nome, original: '' };
  const [, fora, dentro] = m;
  // Parênteses curtos com elemento ou observação ("(Youton)", "(Nv 5)") não viram nome principal.
  // Só vira nome principal quando o parêntese é uma tradução ("Punho de Mina Terrestre"), não uma observação.
  const d = dentro.trim();
  if (d.length < 6 || !/^[A-ZÁÉÍÓÚÂÊÔ]/.test(d) || !/\s/.test(d) || /^nv\s|^\d/i.test(d)) return { principal: nome, original: '' };
  return { principal: dentro.trim(), original: fora.trim() };
}

// Cabeçalhos copiados do livro ("Ação: Padrão Alcance: Toque ...") que atrapalham a leitura.
const RE_ROTULO = /(?<![A-Za-zÀ-ÿ])(?:Ação|Alcance|Alvos?|Área(?: do| de)? Efeito|Área|Duração|Dano|Custo(?: de [A-Za-zç]+)?|Selos de Mão|Pré-requisitos?|Tamanho|Dureza|Resistência|Evoluções)\s*:/gi;
const RE_INICIO = /(?:^|\s)(Você|O usuário|O personagem|O alvo|Esse|Este|Esta|Essa|Com |Através|Utilizando|Usando|Ao |Quando|Caso|Seus?|Suas?|Uma? |A partir|No turno|Trata-se|Cria|Lança|Atira|Invoca)/;

/** Separa em frases sem quebrar em "p. 112", "Nv. 3" ou números. */
const frases = (t) => t.replace(/\b(p|pág|Nv|nv|ex|máx|mín|aprox|req)\.\s?(?=\d|[a-z])/g, '$1․').match(/[^.!?]+[.!?]*/g)?.map((f) => f.replace(/․/g, '.').trim()).filter(Boolean) || [];

/** Tira as fichas técnicas do texto do livro e fica só com a explicação. */
export function limparTexto(texto = '') {
  let t = String(texto).replace(/\s+/g, ' ').trim();
  t = t.replace(/^\[[^\]]+\]\s*/, '').replace(/^-\s*\([^)]*\)\s*/, '');
  const limpas = [];
  frases(t).forEach((f) => {
    RE_ROTULO.lastIndex = 0;
    if (!RE_ROTULO.test(f)) { limpas.push(f); return; }
    // Frase com rótulos: aproveita só o que vem depois do último rótulo, a partir do começo da explicação.
    let ultimo = 0;
    RE_ROTULO.lastIndex = 0;
    let m;
    while ((m = RE_ROTULO.exec(f))) ultimo = m.index + m[0].length;
    const resto = f.slice(ultimo);
    const ini = resto.search(RE_INICIO);
    if (ini >= 0) limpas.push(resto.slice(ini).trim());
  });
  return limpas.join(' ').replace(/\s+/g, ' ').replace(/^[,.;:\s-]+/, '').trim();
}

/** "O que faz" em uma linha (até ~150 letras), cortando na frase. */
export function resumoCurto(efeito, max = 150) {
  const texto = limparTexto(efeito?.resumo || '') || String(efeito?.resumo || '').trim();
  if (!texto) return '';
  if (texto.length <= max) return texto;
  let saida = '';
  for (const f of frases(texto)) {
    if ((`${saida} ${f}`).length > max) break;
    saida = `${saida} ${f}`.trim();
  }
  if (!saida) saida = `${texto.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return saida;
}

/** Ordem para mostrar dentro de cada grupo: nível do efeito e depois nome. */
export const ordemJutsu = (a, b) => (a.efeito?.nivel || 0) - (b.efeito?.nivel || 0) || String(a.nome).localeCompare(String(b.nome));
