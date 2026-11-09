// =====================================================================
// Jutsus no combate: transforma os efeitos escolhidos na ficha em ações do turno.
// Regras em data/Efeitos.js (Livro Básico págs. 86–113).
// =====================================================================

import { ELEMENTOS, evolucoesGanhas, findEfeito, parametros } from '../data/Efeitos';
import { findAptitude } from '../data/Aptidoes';
import { METROS_POR_BLOCO } from '../data/Armas';
import { expandirVersatilidade } from '../data/Efeitos';
import { APTIDOES_CLAS, PODERES_CLAS, PODERES_HIJUTSU, TAIJUTSUS, TECNICAS_APTIDOES, TECNICAS_MOKUTON, TECNICAS_PODERES } from '../data/Clas';

/** Jutsus da ficha: um por efeito escolhido (sem repetir as evoluções). */
export function jutsuList(character) {
  const data = character?.attributes || {};
  const espirito = Number(data.attributes?.espirito || 0);
  const inteligencia = Number(data.attributes?.inteligencia || 0);
  const vigorAttr = Number(data.attributes?.vigor || 0);
  // Kikai Ninpou e Kikaichuu usam Lidar com Animais no lugar do Espírito (pág. 147).
  const lidar = Number(data.skill_totals?.lidar_animais ?? 0);
  const aptIds = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])].map((a) => a?.id);
  // Controle Perfeito (pág. 244): Inteligência no lugar do Espírito em todos os parâmetros.
  const espParam = aptIds.includes('controle_perfeito') ? Math.max(espirito, inteligencia) : espirito;
  const capacidade = aptIds.includes('capacidade'); // Capacidade (pág. 243): +1 de dano base
  // Bônus de elemento vindos de aptidões (Elemento Natural: Suiton, Hijutsus pág. 9).
  const bonusElemento = {};
  APTIDOES_CLAS.filter((x) => aptIds.includes(x.id) && x.bonusElemento).forEach((x) => Object.entries(x.bonusElemento)
    .forEach(([el, v]) => { bonusElemento[el] = (bonusElemento[el] || 0) + v; }));
  const forcaAttr = Number(data.attributes?.forca || 0);
  const arte = Number(data.skill_totals?.arte ?? 0);
  const chaveDe = (el) => (el.chave === 'lidar_animais' ? lidar : el.chave === 'inteligencia' ? inteligencia : el.chave === 'forca' ? forcaAttr
    : el.chave === 'arte_ou_espirito' ? Math.max(arte, espParam) : espParam);
  const brutos = Array.isArray(data.powers_list) ? data.powers_list : [];
  // Versatilidade vira dois poderes no nível dela (pág. 242).
  const powers = brutos.flatMap((p) => (p.id === 'versatilidade' ? expandirVersatilidade(p) : [p]));
  const list = [];

  powers.forEach((item, powerIndex) => {
    const el = ELEMENTOS[item.id];
    if (!el) return;
    const esp = chaveDe(el);
    const nivelPoder = Number(item.level || 1);
    const escolhas = (Array.isArray(item.efeitos) ? item.efeitos : []).slice(0, nivelPoder);
    const nomes = Array.isArray(item.jutsus) ? item.jutsus : [];
    const evolucoes = evolucoesGanhas(escolhas);
    const seen = new Set();

    escolhas.forEach((id, slot) => {
      const efeito = findEfeito(id);
      if (!efeito || seen.has(id)) return;
      seen.add(id);
      const poderNome = item.versatil ? `${el.nome} Versátil` : (item.id === 'ninpou' || item.id === 'hibon_ninpou') && item.name ? item.name : el.nome;
      list.push({
        key: `${powerIndex}-${id}`,
        poderId: item.id,
        poderNome,
        efeito,
        nome: nomes[slot] || el.nomesPadrao?.[id] || `${poderNome}: ${efeito.nome}`,
        nivelPoder,
        nivelMin: Math.min(efeito.nivel, nivelPoder),
        evolucoes: evolucoes[id] || [],
        esp,
        capacidade: capacidade && !(el.exclusivos || []).includes(id),
        danoExtra: bonusElemento[item.id] || 0,
        hibon: el.hibon ? (Array.isArray(item.hibon) ? item.hibon : ['dano', 'dano']) : undefined,
      });
    });

    // Jiton: Canhão de Fuuton e Doton grátis, no nível do Jiton (Hijutsus pág. 53).
    (el.canhoesGratis || []).forEach((elementoId) => {
      if (list.some((j) => j.poderId === elementoId && j.efeito.id === 'canhao')) return;
      const canhao = findEfeito('canhao');
      list.push({
        key: `${powerIndex}-gratis-${elementoId}`,
        poderId: elementoId,
        poderNome: ELEMENTOS[elementoId].nome,
        efeito: canhao,
        nome: `${ELEMENTOS[elementoId].nome}: Canhão (${el.nome})`,
        nivelPoder,
        nivelMin: 1,
        evolucoes: [],
        esp: espirito,
      });
    });
  });

  const aptidoes = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])];
  const temApt = (nome) => aptidoes.some((a) => findAptitude(a.id)?.nome === nome);

  // Rasengan (pág. 121–123): as formas liberam pelo nível do poder e pelo Espírito.
  const rasengan = powers.find((p) => p.id === 'rasengan');
  if (rasengan) {
    const nivelPoder = Number(rasengan.level || 1);
    const expandido = temApt('Chakra Expandido') ? 2 : 0; // "ou Espírito −2 com Chakra Expandido"
    const formas = [
      ['rasengan_basico', true],
      ['rasengan_completo', nivelPoder >= 6 && espirito + expandido >= 14],
      ['oodama_rasengan', nivelPoder >= 7 && espirito + expandido >= 16 && temApt('Técnica Poderosa')],
    ];
    // Rasengan Elemental (pág. 123): Rasengan 9 + Katon, Raiton ou Fuuton no nível 2.
    const NOMES_ELEMENTAL = { katon: 'Enka Rasengan', raiton: 'Raiou Rasengan', fuuton: 'Rasen Shuriken' };
    if (nivelPoder >= 9) {
      Object.entries(NOMES_ELEMENTAL).forEach(([el, nome]) => {
        if (Number(powers.find((p) => p.id === el)?.level || 0) < 2) return;
        const efeito = findEfeito('rasengan_elemental');
        list.push({ key: `rasengan-elemental-${el}`, poderId: 'rasengan', elemento: el, poderNome: 'Rasengan', efeito, nome: `${nome} (${el[0].toUpperCase()}${el.slice(1)})`, nivelPoder, nivelMin: 9, evolucoes: [], esp: espirito, semMeta: true });
      });
    }
    formas.filter(([, ok]) => ok).forEach(([id]) => {
      const efeito = findEfeito(id);
      list.push({
        key: `rasengan-${id}`, poderId: 'rasengan', poderNome: 'Rasengan', efeito, nome: efeito.nome,
        nivelPoder, nivelMin: 1, evolucoes: [], esp: espirito, semMeta: true,
      });
    });
  }

  // Técnicas de clã (data/Clas.js): poderes restritos, Mokuton e aptidões com técnica.
  const tecnicaItem = (t, origem, nivelPoder, poderId, pagina) => ({
    key: `tec-${origem}-${t.nome}`,
    poderId,
    poderNome: origem,
    efeito: {
      ...t, // demais campos da técnica (data/Clas.js) passam direto
      id: `tec_${t.nome}`, nome: t.nome, nivel: t.nivel, pagina: t.pagina || pagina, acao: t.acao, alcance: t.alcance ?? 'pessoal',
      ataque: t.ataque || null, dano: t.dano ?? null, custo: t.custo, resumo: t.resumo, tecnica: true,
      fica: t.fica, modo: t.modo, tamanho: t.tamanho, tira: t.tira, custoVit: t.custoVit, ganhoChakra: t.ganhoChakra,
      aplica: t.aplica, duracaoAplica: t.duracaoAplica, drenoTurno: t.drenoTurno, penalidade: t.penalidade,
      turnosFica: t.turnosFica, drenoHp: t.drenoHp, danoBonus: t.danoBonus, fadiga: t.fadiga,
      genjutsu: t.genjutsu, ilusao: t.ilusao, porNivel: t.porNivel, porNivelTurnos: t.porNivelTurnos, turnosAplica: t.turnosAplica,
      imuneApt: t.imuneApt, imuneAte: t.imuneAte, semResistenciaNv: t.semResistenciaNv, notar: t.notar, camuflagemNv: t.camuflagemNv, adormecer: t.adormecer,
      kuchiyose: t.kuchiyose, umaPorCena: t.umaPorCena,
      modoEremita: t.modoEremita, senjutsu: t.senjutsu, bonusAtaque: t.bonusAtaque, bonusDefesa: t.bonusDefesa, ganhoVit: t.ganhoVit, resGenjutsu: t.resGenjutsu, portaoMin: t.portaoMin, deixaCaido: t.deixaCaido,
      forcaBonus: t.forcaBonus, forcaPorNivel: t.forcaPorNivel, requer: t.requer, danoTexto: t.danoTexto,
      difFascinar: t.difFascinar, kyoudo: t.kyoudo, durezaCorpo: t.durezaCorpo, durezaBonus: t.durezaBonus,
    },
    nome: t.nome,
    nivelPoder,
    nivelMin: Math.min(t.nivel, nivelPoder),
    evolucoes: [],
    esp: espirito,
    vigor: vigorAttr,
    int: inteligencia,
    semMeta: true,
  });
  powers.forEach((item) => {
    const poder = [...PODERES_CLAS, ...PODERES_HIJUTSU].find((p) => p.id === item.id);
    const tecnicas = poder?.tecnicas || (item.id === 'mokuton' ? TECNICAS_MOKUTON : []);
    const nivelPoder = Number(item.level || 1);
    tecnicas.filter((t) => t.nivel <= nivelPoder).forEach((t) => list.push(tecnicaItem(t, poder?.nome || 'Mokuton', nivelPoder, item.id, poder?.pagina || 178)));
  });
  const nivelDe = (id) => Number(powers.find((p) => p.id === id)?.level || 0);
  aptidoes.forEach((a) => {
    const info = APTIDOES_CLAS.find((x) => x.id === a.id);
    (info?.tecnicas || []).filter((t) => !t.minSuiton || nivelDe('suiton') >= t.minSuiton).forEach((t) => list.push(tecnicaItem(t, info.nome, 1, `apt_${info.id}`, info.pagina)));
  });

  // Fuuinjutsu e técnicas avançadas do Iryou (págs. 114–121), pelo nível do poder.
  powers.forEach((item) => {
    const lista = TECNICAS_PODERES[item.id];
    if (!lista) return;
    const nivelPoder = Number(item.level || 1);
    const nome = { fuuinjutsu: 'Fuuinjutsu', iryou_ninjutsu: 'Iryou Ninjutsu', hyouton: 'Hyouton' }[item.id] || item.id;
    lista.filter((t) => t.nivel <= nivelPoder).forEach((t) => list.push(tecnicaItem(t, nome, nivelPoder, item.id, { fuuinjutsu: 114, iryou_ninjutsu: 120, hyouton: 20 }[item.id])));
  });

  // Técnicas de aptidões comuns (Clone, Fascinar, Miragem, Kyoudo Kyouka…).
  TECNICAS_APTIDOES
    .filter((t) => temApt(t.aptidao) && (!t.poder || powers.some((p) => p.id === t.poder)))
    .forEach((t) => list.push(tecnicaItem(t, t.aptidao, 1, `apt_${t.aptidao}`, 76)));

  // Taijutsus (págs. 207–212): sem custo de pontos, basta ter as aptidões e o nível do Hachimon.
  const hachimon = Number(powers.find((p) => p.id === 'hachimon_tonkou')?.level || 0);
  TAIJUTSUS
    .filter((t) => t.aptidoes.every(temApt) && hachimon >= Number(t.hachimon || 0))
    .forEach((t) => list.push(tecnicaItem(
      { nivel: 1, nome: t.nome, acao: t.acao, custo: 0, resumo: `[Taijutsu rank ${t.rank}] ${t.resumo}`, portaoMin: t.portao, deixaCaido: t.deixaCaido },
      'Taijutsu', 1, `tai_${t.nome}`, 207,
    )));

  // Iryou Ninjutsu (pág. 120): cura por toque.
  const iryou = powers.find((p) => p.id === 'iryou_ninjutsu');
  if (iryou) {
    list.push({
      key: 'iryou-cura', poderId: 'iryou_ninjutsu', poderNome: 'Iryou Ninjutsu', efeito: findEfeito('cura_iryou'), nome: 'Iryou Ninjutsu: Cura',
      nivelPoder: Number(iryou.level || 1), nivelMin: 1, evolucoes: [], esp: espirito,
      medicina: Number(data.skill_totals?.medicina || 0),
    });
  }

  // Aptidão Kikaichuu: ataque básico dos insetos (até metade deles, pág. 143).
  const kStatus = kikaichuuStatus(data);
  if (aptidoes.some((a) => findAptitude(a.id)?.nome === 'Kikaichuu (Inseto Parasita Destruidor)') && kStatus.disponiveis > 0) {
    const status = kStatus;
    const total = status.disponiveis; // 1 por nível de Lidar com Animais, menos os perdidos
    list.unshift({
      key: 'kikaichuu-ataque',
      poderId: 'kikaichuu',
      poderNome: 'Kikaichuu',
      efeito: findEfeito('ataque_kikaichuu'),
      nome: 'Ataque de Kikaichuu',
      nivelPoder: Math.max(1, Math.floor(total / 2)),
      nivelMin: 1,
      evolucoes: [],
      esp: lidar,
      nota: `Você tem ${status.disponiveis} de ${status.total} kikaichuu (grupos de 100 insetos)${status.perdidos ? ` · ${status.perdidos} perdido(s), voltam em 2 dias` : ''}. O ataque usa até a metade.`,
    });
  }
  return list;
}

/** Parâmetros do jutsu num nível usado. */
export function jutsuParams(jutsu, nivelUsado, { semChakra = false } = {}) {
  return parametros(jutsu.poderId, jutsu.efeito, nivelUsado, {
    esp: jutsu.esp,
    int: jutsu.int,
    vigor: jutsu.vigor,
    hibon: jutsu.hibon,
    capacidade: jutsu.capacidade,
    danoExtra: jutsu.danoExtra,
    nivelPoder: jutsu.nivelPoder,
    evolucoes: jutsu.evolucoes,
    semChakra,
  });
}

/**
 * "Modo" de ataque no mesmo formato das armas (services/Attack.js).
 * profile = combatProfile do atacante.
 */
export function jutsuMode(jutsu, params, profile, { inimigoColado = false } = {}) {
  const teste = params.teste; // 'cd' à distância, 'cc' no toque
  const avisos = [];
  let precisao = Number(profile.combat?.[teste] || 0);
  // Técnica lenta (Kage Shibari, pág. 169): −3 se o alvo estiver vendo.
  if (jutsu.efeito.penalidade) {
    precisao -= Number(jutsu.efeito.penalidade);
    avisos.push(`Técnica lenta: −${jutsu.efeito.penalidade} (alvo vendo)`);
  }
  // Pág. 87: poder à distância com inimigo no alcance corpo a corpo → −3 no CD.
  if (teste === 'cd' && inimigoColado) {
    precisao -= 3;
    avisos.push('Inimigo colado: −3 no CD');
  }
  const alcanceBlocos = jutsu.efeito.alcance === 'toque'
    ? 1
    : Math.max(1, Math.floor(params.alcanceM / METROS_POR_BLOCO));
  return {
    tipo: teste,
    rotulo: teste === 'cc' ? 'Toque (CC)' : 'À distância (CD)',
    precisao,
    danoBase: Number(params.dano || 0),
    critico: 15,
    alcanceBlocos,
    avisos,
    jutsu: true,
  };
}

/**
 * Defesas do alvo contra o jutsu (pág. 87):
 *  - em área ou Raio: sem Bloqueio;
 *  - outros: Bloqueio só com arma especial ou arma de Energizar/Criar Arma ativa.
 */
export function jutsuDefenses(jutsu, targetProfile, targetCharacter) {
  const area = jutsu.efeito.ataque === 'area';
  const modes = Array.isArray(targetCharacter?.active_modes) ? targetCharacter.active_modes : [];
  const armaDeTecnica = modes.some((m) => /energizar|criar arma|arma el[eé]trica|afiar/i.test(m.name || ''));
  const semBloqueioPoder = ELEMENTOS[jutsu.poderId]?.semBloqueio;
  const bloqueio = !area && !jutsu.efeito.semBloqueio && !semBloqueioPoder && armaDeTecnica && targetProfile.defenses.bloqueio.possivel;
  const notes = [];
  if (semBloqueioPoder) notes.push('Insetos: não dá para Bloquear');
  else if (area) notes.push('Ataque em área: não dá para Bloquear');
  else if (jutsu.poderId === 'rasengan') notes.push('Rasengan destrói a arma comum usada para Bloquear (a defesa falha)');
  else if (jutsu.efeito.semBloqueio) notes.push(`${jutsu.efeito.nome}: não dá para Bloquear`);
  else if (!armaDeTecnica) notes.push('Bloquear técnica só com arma especial ou Energizar');
  return {
    target: { ...targetProfile, defenses: { ...targetProfile.defenses, bloqueio: { ...targetProfile.defenses.bloqueio, possivel: bloqueio } } },
    notes,
  };
}

// ---------------------------------------------------------------------
// Contador de Kikaichuu (Clã Aburame, págs. 142–143)
// Total = 1 kikaichuu (100 insetos) por nível de Lidar com Animais.
// Cada um destruído/perdido volta sozinho em 2 dias (reprodução dos insetos).
// attributes.kikaichuu_perdas = [momento da perda (ms), ...]
// ---------------------------------------------------------------------
export const DOIS_DIAS = 2 * 24 * 60 * 60 * 1000;

export function kikaichuuStatus(data, now = Date.now()) {
  const total = Math.max(0, Number(data?.skill_totals?.lidar_animais || 0));
  const perdas = (data?.kikaichuu_perdas || []).filter((t) => now - Number(t) < DOIS_DIAS);
  const proxima = perdas.length ? Math.min(...perdas) + DOIS_DIAS : null;
  return { total, perdidos: perdas.length, disponiveis: Math.max(0, total - perdas.length), perdas, proxima };
}
