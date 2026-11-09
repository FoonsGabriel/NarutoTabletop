// =====================================================================
// Pré-requisitos das aptidões comuns — Livro Básico 4.1b, Pergaminho II (págs. 56–70).
//
// Cada aptidão tem uma lista de condições (todas precisam valer).
// Cada condição é uma lista de alternativas ("ou"): basta uma.
//   'atr:forca:3'      atributo (forca, destreza, agilidade, percepcao, inteligencia, vigor, espirito)
//   'per:medicina:7'   perícia (valor total)
//   'cmb:cc:12'        habilidade de combate (cc, cd, esq, lm)
//   'pod:doton:5'      poder no nível indicado
//   'apt:Reflexos'     outra aptidão
//   'cla:Hachimon'     clã ou Hijutsu (ex.: Hachimon Tonkou)
// Na criação do Genin (pág. 56) só vale aptidão gratuita cujo requisito um NC 4 alcance.
// =====================================================================

export const PRE_REQUISITOS = {
  Acuidade: [['atr:destreza:3']],
  Ambidestria: [['cmb:cc:12']],
  Arremessar: [['atr:forca:6'], ['apt:Lutador', 'apt:Guerreiro']],
  'Ataque Atordoante': [['atr:forca:12']],
  'Ataque em Movimento': [['atr:agilidade:4']],
  'Ataque Giratório': [['cmb:cc:8']],
  'Ataque Múltiplo': [['cmb:cc:11', 'cmb:cd:11']],
  'Ataque Poderoso': [['cmb:cc:7']],
  'Ataque Progressivo': [['atr:agilidade:14', 'pod:hachimon:6'], ['apt:Ataque Múltiplo']],
  Atirador: [['atr:destreza:12']],
  'Bloqueio Ambidestro': [['apt:Ambidestria']],
  'Chute Duplo': [['apt:Chute Giratório'], ['apt:Ataque Múltiplo']],
  'Chute Giratório': [['cmb:cc:10'], ['apt:Ataque Giratório']],
  'Chute Inverso': [['cmb:cc:14'], ['apt:Ponto Cego']],
  Clone: [['atr:espirito:6']],
  'Clone Perfeito': [['atr:espirito:16'], ['apt:Clone'], ['apt:Clone Verdadeiro']],
  'Clone Verdadeiro': [['atr:espirito:10'], ['apt:Clone']],
  'Combate Defensivo': [['cmb:cc:9']],
  Contragolpe: [['cmb:cc:12']],
  'Crítico Aprimorado': [['apt:Especialista'], ['cmb:cc:13', 'cmb:cd:13']],
  'Dano Extra': [['cmb:cc:18', 'cmb:cd:18']],
  'Derrubar Agressivo': [['apt:Lutador', 'apt:Guerreiro']],
  'Desarme Agressivo': [['apt:Lutador', 'apt:Guerreiro']],
  'Domínio da Terra': [['pod:doton:5']],
  'Domínio da Água': [['pod:suiton:5']],
  'Domínio do Fogo': [['pod:katon:5']],
  'Domínio do Raio': [['pod:raiton:5']],
  'Domínio do Vento': [['pod:fuuton:5']],
  'Domínio Ninpou': [['pod:ninpou:5', 'pod:hibon:5'], ['apt:Ponto Cego']],
  Fascinar: [['atr:inteligencia:4']],
  'Golpe Atemi': [['apt:Ataque Poderoso'], ['apt:Crítico Aprimorado']],
  'Golpe Caratê': [['cmb:cc:15'], ['apt:Especialista']],
  Guerreiro: [['atr:forca:10', 'atr:destreza:10']],
  'Ilusão Profunda': [['atr:inteligencia:5']],
  'Kyoudo Kyouka': [['atr:espirito:6'], ['pod:iryou:2']],
  'Mestre dos Selos': [['per:prestidigitacao:12'], ['apt:Ponto Cego']],
  'Mira Apurada': [['atr:destreza:12'], ['apt:Tiro Longo']],
  Mobilidade: [['atr:agilidade:3'], ['apt:Reflexos']],
  'Ninja Médico': [['per:medicina:7']],
  'Ponto Cego': [['atr:agilidade:6', 'per:prestidigitacao:6']],
  'Punho de Ferro': [['atr:forca:2']],
  Químico: [['atr:inteligencia:8']],
  'Retirada Rápida': [['atr:agilidade:10']],
  Rolamento: [['per:acrobacia:2'], ['apt:De Pé']],
  'Seguir Sombra': [['apt:Arremessar'], ['apt:Ataque em Movimento']],
  'Soco Agarrado': [['apt:Lutador']],
  'Soco em Gancho': [['cmb:cc:11'], ['apt:Ataque Múltiplo']],
  'Tiro Longo': [['atr:destreza:12']],
  'Tiro Preciso': [['atr:destreza:9']],
  Trespassar: [['cmb:cc:7']],
  Potencializar: [['atr:espirito:8', 'atr:inteligencia:8']],
  'Técnica Elevada': [['atr:inteligencia:6']],
  'Técnica Poderosa': [['atr:espirito:12', 'atr:inteligencia:12']],
  'Técnica Acelerada': [['atr:espirito:12', 'atr:inteligencia:12']],
  'Usar Armaduras Pesadas': [['atr:forca:10', 'atr:vigor:15']],
  Voadora: [['apt:Derrubar Agressivo'], ['apt:Ataque Poderoso']],
};

const NOMES = {
  forca: 'Força', destreza: 'Destreza', agilidade: 'Agilidade', percepcao: 'Percepção',
  inteligencia: 'Inteligência', vigor: 'Vigor', espirito: 'Espírito',
  cc: 'Combate Corporal', cd: 'Combate à Distância', esq: 'Esquiva', lm: 'Ler Movimento',
  medicina: 'Medicina', prestidigitacao: 'Prestidigitação', acrobacia: 'Acrobacia',
  doton: 'Doton', suiton: 'Suiton', katon: 'Katon', raiton: 'Raiton', fuuton: 'Fuuton',
  ninpou: 'Ninpou', hibon: 'Hibon Ninpou', iryou: 'Iryou Ninjutsu', hachimon: 'Hachimon Tonkou',
};

const norm = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * ctx: { attributes, skills, combat, aptitudes: [nomes], powers: [{ id, level }], clan }
 * Retorna as condições que faltam, em texto simples (vazio = cumpre tudo).
 */
export function missingPrereqs(nomeAptidao, ctx) {
  const regras = PRE_REQUISITOS[nomeAptidao];
  if (!regras) return [];
  const powerLevel = (key) => Math.max(0, ...(ctx.powers || [])
    .filter((p) => norm(p.id).includes(key) || norm(p.name).includes(key))
    .map((p) => Number(p.level || 0)));
  const check = (alt) => {
    const [tipo, chave, valor] = alt.split(':');
    const v = Number(valor);
    if (tipo === 'atr') return Number(ctx.attributes?.[chave] || 0) >= v;
    if (tipo === 'per') return Number(ctx.skills?.[chave] || 0) >= v;
    if (tipo === 'cmb') return Number(ctx.combat?.[chave] || 0) >= v;
    if (tipo === 'pod') return powerLevel(chave) >= v;
    if (tipo === 'apt') return (ctx.aptitudes || []).includes(chave);
    if (tipo === 'cla') return norm(ctx.clan).includes(norm(chave));
    return true;
  };
  const describe = (alt) => {
    const [tipo, chave, valor] = alt.split(':');
    if (tipo === 'apt' || tipo === 'cla') return chave;
    return `${NOMES[chave] || chave} ${valor}`;
  };
  return regras.filter((grupo) => !grupo.some(check)).map((grupo) => grupo.map(describe).join(' ou '));
}
