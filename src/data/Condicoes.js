// =====================================================================
// Condições prejudiciais (Livro Básico, págs. 275–278).
//
// Ficam em characters.active_modes, como os outros efeitos:
//   { id, name, turns, drain, condicao: '<id>' }
//   turns = null → dura até alguém tirar (o efeito que causou diz como).
//
// Regras gerais (pág. 276):
//  - várias condições: aplique todas; se uma é mais grave que a outra, só a mais grave;
//  - penalidades de precisão se somam, até −3 no mesmo teste;
//  - a penalidade não vale no teste para se livrar da própria condição.
//
// mods: penalidades de precisão (negativas) ou bônus
//   todos     → todo teste (ataque, defesa, perícia, atributo, iniciativa)
//   ataque    → testes de ataque
//   defesa    → testes de defesa e a Esquiva
//   cc        → só Combate Corporal (ataque corpo a corpo)
//   iniciativa
//   pericias  → testes de perícia e atributo (fora do combate direto)
// regras: o que muda no turno
//   semAcoes        → não faz ações (reações sim)
//   semNada         → nem reações (inconsciente / indefeso)
//   semMovimento    → perde a ação de Movimento (pode trocar a Padrão)
//   semAtaque       → não pode atacar
//   deslocamento    → multiplica o deslocamento (0.5 = metade, 0 = não sai do lugar)
//   autoSucesso     → ataques contra ele acertam sozinhos (indefeso)
//   desprevenido    → defesa −3 e perde bônus de Esquiva
//   falhaAtaque     → chance de errar por não enxergar (1d8 ≤ valor; cego = camuflagem total)
//   caido           → −3 na defesa contra corpo a corpo e área, +3 contra outros ataques à distância
// =====================================================================

export const CONDICOES = [
  { id: 'debilitado', nome: 'Debilitado', icone: '⬇️', mods: { todos: -1 },
    resumo: '−1 de precisão em todos os testes.' },
  { id: 'ataque_debilitado', nome: 'Ataque debilitado', icone: '🗡️', mods: { ataque: -1 },
    resumo: '−1 de precisão nos testes de ataque.' },
  { id: 'defesa_debilitada', nome: 'Defesa debilitada', icone: '🛡️', mods: { defesa: -1 },
    resumo: '−1 de precisão nas defesas e na Esquiva.' },
  { id: 'agarrado', nome: 'Agarrado', icone: '🤼', mods: { ataque: -1, defesa: -1 }, regras: { deslocamento: 0 },
    resumo: 'Preso pela manobra Agarrar: fica impedido (não sai do lugar, ataque e defesa −1).' },
  { id: 'amedrontado', nome: 'Amedrontado', icone: '😨', mods: { todos: -1 }, regras: { semAtaque: true }, grave: 'aterrorizado',
    resumo: 'Foge da fonte do medo (ou se encolhe). Debilitado e não pode atacar. Acaba longe da fonte do medo.' },
  { id: 'amputado', nome: 'Amputado', icone: '🦾',
    resumo: 'Sem um braço ou mão: não usa armas de duas mãos nem faz selos de mão (salvo Mestre dos Selos + Prestidigitação 14).' },
  { id: 'assustado', nome: 'Assustado', icone: '😟', grave: 'amedrontado',
    resumo: 'Se afasta da fonte do medo sem fugir do combate. Se não puder se afastar, fica debilitado.' },
  { id: 'aterrorizado', nome: 'Aterrorizado', icone: '😱', regras: { semAcoes: true }, grave: 'indefeso',
    resumo: 'Foge ou se encolhe e fica atordoado (só reações). Acaba longe da fonte do medo.' },
  { id: 'atordoado', nome: 'Atordoado', icone: '💫', regras: { semAcoes: true }, grave: 'indefeso',
    resumo: 'Não faz ações (nem livres), mas pode reagir, como Esquivar.' },
  { id: 'caido', nome: 'Caído', icone: '🛌', mods: { cc: -3 }, regras: { caido: true },
    resumo: 'Deitado: Combate Corporal −3 e defesa −3 contra corpo a corpo e área; +3 na defesa contra outros ataques à distância. Levantar = ação de Movimento.' },
  { id: 'cego', nome: 'Cego', icone: '🙈', regras: { falhaAtaque: 4, desprevenido: true },
    resumo: 'Não enxerga: seus ataques erram em 1d8 ≤ 4 (camuflagem total) e fica desprevenido contra quem não vê. Sem Procurar/Prontidão visuais.' },
  { id: 'confuso', nome: 'Confuso', icone: '🌀',
    resumo: 'Age ao acaso. Role 1d8: 1–2 foge · 3–4 ataca o mais próximo · 5–6 não faz nada · 7–8 age normal.' },
  { id: 'desprevenido', nome: 'Desprevenido', icone: '😶', regras: { desprevenido: true },
    resumo: 'Guarda baixa: defesa −3 e perde qualquer bônus de Esquiva.' },
  { id: 'estavel', nome: 'Estável', icone: '🩹',
    resumo: 'Entre −11 e −20 de Vitalidade, inconsciente, mas parou de sangrar (não perde mais Vit por turno).' },
  { id: 'exausto', nome: 'Exausto', icone: '🥵', mods: { ataque: -3, defesa: -3 }, regras: { deslocamento: 0.5 }, grave: 'inconsciente',
    resumo: 'Lento, ataque −3 e defesa −3. Se sofrer de novo (ou ficar fatigado), desmaia.' },
  { id: 'fascinado', nome: 'Fascinado', icone: '✨', regras: { semAcoes: true },
    resumo: 'Só presta atenção ao efeito. Qualquer ameaça dá novo teste; um ataque quebra o fascínio na hora.' },
  { id: 'fatigado', nome: 'Fatigado', icone: '😮‍💨', mods: { ataque: -1, defesa: -1 }, regras: { deslocamento: 0.5 }, grave: 'exausto',
    resumo: 'Lento, ataque −1 e defesa −1. Se sofrer de novo, fica exausto.' },
  { id: 'fintado', nome: 'Fintado', icone: '🎭', mods: { defesa: -2 },
    resumo: 'Enganado por uma finta: defesa −2 contra o próximo ataque de quem fintou (até o fim do próximo turno dele).' },
  { id: 'impedido', nome: 'Impedido', icone: '⛓️', mods: { ataque: -1, defesa: -1 }, regras: { deslocamento: 0 }, grave: 'indefeso',
    resumo: 'Não sai do lugar. Ataque e defesa −1; contra ataques em área não usa Esquiva nem Antecipar (defesa fixa 9).' },
  { id: 'inconsciente', nome: 'Inconsciente', icone: '💤', regras: { semNada: true, autoSucesso: true },
    resumo: 'Indefeso: não faz nenhuma ação, nem mental. Ataques contra ele acertam sozinhos.' },
  { id: 'indefeso', nome: 'Indefeso / Paralisado', icone: '🧊', regras: { semNada: true, autoSucesso: true },
    resumo: 'Não age nem se defende (só tenta se livrar do efeito). Ataques acertam sozinhos; pode sofrer golpe de misericórdia.' },
  { id: 'lento', nome: 'Lento', icone: '🐢', regras: { deslocamento: 0.5 }, grave: 'fatigado',
    resumo: 'Anda metade do deslocamento e não pode usar Corrida nem Investida.' },
  { id: 'ofuscado', nome: 'Ofuscado', icone: '😵‍💫', mods: { ataque: -1, pericias: -1 },
    resumo: 'Visão prejudicada: ataque −1 e −1 em perícias e atributos que precisem da visão.' },
  { id: 'sufocando', nome: 'Sufocando', icone: '🫧',
    resumo: 'Sem respirar: teste de Vigor por turno (ação livre), +1 nível de dificuldade a cada turno. Falhou: dano fixo (= NC se o efeito não disser). Em 0 de Vit desmaia.' },
  { id: 'surdo', nome: 'Surdo', icone: '🔇', mods: { iniciativa: -3 },
    resumo: 'Não escuta: iniciativa −3 e sem Procurar/Prontidão auditivos.' },
  { id: 'tonto', nome: 'Tonto', icone: '🥴', regras: { semMovimento: true }, grave: 'atordoado',
    resumo: 'Perde a ação de Movimento (ainda pode trocar a Padrão por Movimento ou Parcial).' },
];

// Posturas das manobras (págs. 263–265): duram até o próximo turno de quem usou.
//   esquiva / antecipar → bônus só nessa defesa (o limite de −3 vale só para penalidades)
export const POSTURAS = [
  { id: 'defensiva', nome: 'Lutando na defensiva', icone: '🛡️', postura: true, mods: { esquiva: 2 },
    resumo: 'Atacou na defensiva: +2 de Esquiva até o próximo turno (Combate Defensivo: +3).' },
  { id: 'defensiva_apt', nome: 'Lutando na defensiva', icone: '🛡️', postura: true, mods: { esquiva: 3 },
    resumo: 'Combate Defensivo: +3 de Esquiva até o próximo turno.' },
  { id: 'defesa_total', nome: 'Defesa total', icone: '🧱', postura: true, mods: { esquiva: 3, antecipar: 3 }, regras: { semAtaque: true },
    resumo: '+3 na Esquiva e no Antecipar até o próximo turno. Não ataca e só anda com Passo Seguro.' },
  { id: 'investida', nome: 'Investida', icone: '🐗', postura: true, mods: { defesa: -1 },
    resumo: 'Guarda aberta depois da Investida: −1 na defesa até o próximo turno.' },
  { id: 'acelerado', nome: 'Acelerado', icone: '⚡', postura: true, mods: { iniciativa: 2 },
    resumo: '+2 de iniciativa, Agilidade dobrada no deslocamento e finta acelerada (finta como ação livre ao se deslocar) — pág. 205.' },
  { id: 'super_acelerado', nome: 'Super acelerado', icone: '⚡⚡', postura: true, mods: { iniciativa: 4 },
    resumo: '+4 de iniciativa, Agilidade dobrada no deslocamento; todos os inimigos ficam fintados (menos os super acelerados) — pág. 205.' },
  { id: 'segurando', nome: 'Segurando alguém', icone: '✊', postura: true, regras: { deslocamento: 0.5 },
    resumo: 'Mantendo um Agarrar: lento, mãos ocupadas, gasta a ação Padrão para manter. Se for atacado, conta como impedido.' },
];

const BY_ID = Object.fromEntries([...CONDICOES, ...POSTURAS].map((c) => [c.id, c]));
export const findCondicao = (id) => BY_ID[id] || null;

/** Condições ativas do personagem (já tirando as menos graves, pág. 276). */
export function condicoesDe(character) {
  const modes = Array.isArray(character?.active_modes) ? character.active_modes : [];
  const ids = new Set(modes.map((m) => m.condicao).filter((id) => BY_ID[id]));
  // Vitalidade 0 ou menos também conta (págs. 258–259).
  const hp = Number(character?.hp_current ?? 1);
  if (character && hp <= -1) ids.add('inconsciente');
  else if (character && hp === 0 && Number(character.hp_max || 0) > 0) ids.add('indefeso'); // 0: fora de combate, indefeso, consciente
  // Sem chakra (pág. 260): exausto até recuperar pelo menos 1 ponto.
  if (character && Number(character.chakra_max || 0) > 0 && Number(character.chakra_current ?? 1) <= 0) ids.add('exausto');
  // Se uma condição mais grave da mesma cadeia está presente, a menos grave não vale.
  return [...ids]
    .filter((id) => {
      let next = BY_ID[id]?.grave;
      while (next) {
        if (ids.has(next)) return false;
        next = BY_ID[next]?.grave;
      }
      return true;
    })
    .map((id) => BY_ID[id]);
}

const LIMITE = -3; // limite de penalidade num mesmo teste (pág. 276)
const somar = (lista, chaves) => {
  const total = lista.reduce((acc, c) => acc + chaves.reduce((s, k) => s + Number(c.mods?.[k] || 0), 0), 0);
  return Math.max(LIMITE, total);
};

/** Penalidade no teste de ataque (tipo: 'cc' | 'cd' | 'jutsu'). */
export const penalidadeAtaque = (lista, tipo) => somar(lista, tipo === 'cc' ? ['todos', 'ataque', 'cc'] : ['todos', 'ataque']);

/** Bônus de postura por tipo de defesa (Lutar na Defensiva, Defesa Total). */
export const bonusDefesa = (lista, chave) => lista.reduce((acc, c) => acc + Math.max(0, Number(c.mods?.[chave] || 0)), 0);

/** Penalidade na defesa contra um ataque (tipo do ataque, se é em área). */
export function penalidadeDefesa(lista, { tipo, area = false } = {}) {
  let total = lista.reduce((acc, c) => acc + Number(c.mods?.todos || 0) + Math.min(0, Number(c.mods?.defesa || 0)), 0);
  if (lista.some((c) => c.regras?.desprevenido)) total -= 3;
  const caido = lista.some((c) => c.regras?.caido);
  if (caido && (tipo === 'cc' || area)) total -= 3;
  total = Math.max(LIMITE, total);
  if (caido && tipo === 'cd' && !area) total += 3; // cobertura parcial contra outros ataques à distância
  return total;
}

export const penalidadeIniciativa = (lista) => somar(lista, ['todos', 'iniciativa']);

/** O que a pessoa pode fazer no turno. */
export function limitesDoTurno(lista) {
  const r = (k) => lista.some((c) => c.regras?.[k]);
  const fator = lista.reduce((min, c) => (c.regras?.deslocamento != null ? Math.min(min, c.regras.deslocamento) : min), 1);
  const motivo = (k) => lista.find((c) => c.regras?.[k])?.nome || '';
  return {
    semNada: r('semNada'),
    semAcoes: r('semAcoes') || r('semNada'),
    semMovimento: r('semMovimento'),
    semAtaque: r('semAtaque'),
    deslocamento: fator,
    autoSucesso: r('autoSucesso'),
    falhaAtaque: lista.reduce((max, c) => Math.max(max, Number(c.regras?.falhaAtaque || 0)), 0),
    motivo: motivo('semNada') || motivo('semAcoes') || motivo('semMovimento') || motivo('semAtaque'),
  };
}

/** Cria a entrada em active_modes. */
/** Kawarimi no Jutsu (pág. 125): 1×/cena, 1 de chakra, não vale desprevenido, fintado, agarrado ou impedido. */
export function podeKawarimi(character) {
  const modes = Array.isArray(character?.active_modes) ? character.active_modes : [];
  if (modes.some((m) => m.kawarimi)) return { ok: false, motivo: 'já usou nesta cena' };
  if (Number(character?.chakra_current ?? 0) < 1) return { ok: false, motivo: 'sem chakra' };
  const bloqueia = condicoesDe(character).find((c) => ['desprevenido', 'fintado', 'agarrado', 'impedido'].includes(c.id) || c.regras?.semNada || c.regras?.desprevenido || c.regras?.deslocamento === 0);
  if (bloqueia) return { ok: false, motivo: bloqueia.nome.toLowerCase() };
  return { ok: true, motivo: '' };
}

export const novaCondicao = (id, turns = null, uid) => {
  const c = BY_ID[id];
  return { id: uid(), name: c.nome, turns, drain: { chakra: 0, hp: 0 }, condicao: id };
};
