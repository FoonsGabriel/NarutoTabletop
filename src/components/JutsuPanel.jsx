import { useMemo, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { buildRollRow, rollDice } from '../services/Rolls';
import { ACTION_TYPES, slotsFor, useAction as registerAction } from '../services/Combat';
import { applySituation, combatProfile, extraHits, forecast, resolveAttack } from '../services/Attack';
import { jutsuDefenses, jutsuList, jutsuMode, jutsuParams } from '../services/Jutsus';
import { ELEMENTOS, acoesDoEfeito, confrontoElemental, elementoNoTexto } from '../data/Efeitos';
import { fxFor } from '../canvas/AttackFx';
import { uid } from '../services/Uid';
import { trackedUpdate } from '../services/Undo';
import { playSound } from '../services/Sfx';
import { findCondicao, novaCondicao } from '../data/Condicoes';

const DEFENSES = [
  { key: 'esquiva', label: 'Esquiva' },
  { key: 'bloqueio', label: 'Bloquear' },
  { key: 'antecipar', label: 'Antecipar' },
];
const pct = (v) => `${Math.round(v * 100)}%`;

// Efeitos pessoais que ficam ativos (viram um "modo" na ficha até o jogador desligar).
const FICA_ATIVO = new Set(['energizar', 'criar_arma', 'afiar', 'arma_eletrica', 'pele_de_pedra', 'imergir']);

/**
 * Jutsus no menu de turno (Livro Básico págs. 86–113).
 *   escolhe o jutsu → nível usado → mira (1 alvo, vários na área ou em cadeia) → previsão → rola.
 *   Efeitos sem dano automático (Barreira, Restringente…): gasta chakra e ação e mostra os valores.
 */
export default function JutsuPanel({
  roomId, playerId, playerName, actor, profile, engineRef, actorTokenId, actionState, strict, isGM, autoDamage,
  currentCombatant, onActionsSaved, onTriggerRoll, applyResult, postChat, broadcastFx, sendPending, isFlanked, askDefense, playAnim, onClose,
}) {
  const jutsus = useMemo(() => jutsuList(actor), [actor]);
  const [step, setStep] = useState('list'); // list | config | targeting | forecast | result
  const [jutsu, setJutsu] = useState(null);
  const [nivel, setNivel] = useState(1);
  const [semChakra, setSemChakra] = useState(false);
  const [targets, setTargets] = useState([]); // [{ token, character, flanked, defense }]
  const [pickedIds, setPickedIds] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  // Meta-aptidões (pág. 69 e 74): gastam a ação de Movimento, só em técnica com custo ≥ 1,
  // uma por vez, nunca em técnica de ação completa nem em efeitos de dano corporal (Energizar).
  const aptIds = [...(actor.attributes?.aptidoes_gratuitas_list || []), ...(actor.attributes?.aptidoes_extra_list || [])].map((item) => item?.id);
  const [meta, setMeta] = useState('');
  const baseParams = jutsu ? jutsuParams(jutsu, nivel, { semChakra }) : null;
  // Combo de Elementos (pág. 90): Esp ou Int 12 + Técnica Acelerada; 2 efeitos de Ninpou de
  // elementos diferentes (sem exclusivos), ação padrão, com dano, níveis com diferença ≤ 1.
  // Sozinho é ação completa; paga o custo dos dois; parâmetros só do principal.
  const [combo, setCombo] = useState('');
  const atrAtor = actor.attributes?.attributes || {};
  const exclusivo = (j) => (ELEMENTOS[j.poderId]?.exclusivos || []).includes(j.efeito.id);
  const comboBase = (j) => Boolean(j && ELEMENTOS[j.poderId] && !ELEMENTOS[j.poderId].interno && !j.efeito.tecnica && j.efeito.ataque
    && (j.efeito.acao || 'padrao') === 'padrao' && !j.efeito.acaoUso && j.efeito.dano && !exclusivo(j));
  const podeCombo = Boolean(jutsu) && aptIds.includes('tecnica_acelerada')
    && Math.max(Number(atrAtor.espirito || 0), Number(atrAtor.inteligencia || 0)) >= 12 && comboBase(jutsu);
  const comboOpcoes = podeCombo ? jutsus.filter((j) => comboBase(j) && j.poderId !== jutsu.poderId
    && (j.poderId !== 'ninpou' || jutsu.poderId !== 'ninpou') && Math.abs(j.efeito.nivel - jutsu.efeito.nivel) <= 1) : [];
  const comboJutsu = comboOpcoes.find((j) => j.key === combo) || null;
  const custoCombo = comboJutsu ? jutsuParams(comboJutsu, comboJutsu.efeito.nivel).custo : 0;
  const metaPermitida = !comboJutsu && Boolean(baseParams && jutsu) && baseParams.custo >= 1 && jutsu.efeito.id !== 'energizar'
    && !jutsu.semMeta && !acoesDoEfeito(jutsu.efeito).includes('completa');
  const metaOpcoes = metaPermitida ? [
    ...(aptIds.includes('potencializar') ? [
      jutsu.efeito.area && baseParams.tamanhoM ? ['pot_area', `Potencializar: dobrar a área (${baseParams.tamanhoM} → ${baseParams.tamanhoM * 2} m)`] : null,
      baseParams.teste === 'cd' && baseParams.alcanceM ? ['pot_alcance', `Potencializar: dobrar o alcance (${baseParams.alcanceM} → ${baseParams.alcanceM * 2} m)`] : null,
      baseParams.dano != null ? ['pot_dano', `Potencializar: +1 de dano base (${baseParams.dano} → ${baseParams.dano + 1})`] : null,
    ] : []),
    aptIds.includes('tecnica_poderosa') && baseParams.dano != null && jutsu.efeito.ataque ? ['poderosa', 'Técnica Poderosa: +0,5 no grau de dano'] : null,
  ].filter(Boolean) : [];
  const metaValida = metaOpcoes.some(([key]) => key === meta) ? meta : '';
  const comParams = baseParams && comboJutsu ? { ...baseParams, custo: baseParams.custo + custoCombo } : baseParams;
  const params = comParams && metaValida.startsWith('pot_') ? {
    ...comParams,
    ...(metaValida === 'pot_area' ? { tamanhoM: baseParams.tamanhoM * 2 } : {}),
    ...(metaValida === 'pot_alcance' ? { alcanceM: baseParams.alcanceM * 2 } : {}),
    ...(metaValida === 'pot_dano' ? { dano: baseParams.dano + 1 } : {}),
  } : comParams;
  // Ações do jutsu: as do efeito + Movimento se usar meta-aptidão.
  const acoesUsadas = (efeito) => (comboJutsu && efeito === jutsu?.efeito
    ? ['completa']
    : [...acoesDoEfeito(efeito), ...(metaValida && efeito === jutsu?.efeito ? ['movimento'] : [])]);
  const chakra = Number(actor.chakra_current ?? 0);

  // Algum inimigo colado em quem usa o jutsu? (pág. 87: −3 no CD)
  const inimigoColado = useMemo(() => {
    const engine = engineRef.current;
    const me = engine?.tokens[actorTokenId];
    if (!me) return false;
    const g = engine.gridSize || 64;
    const cell = (t) => ({ c: Math.floor(t.container.x / g), r: Math.floor(t.container.y / g) });
    const a = cell(me);
    const mySide = Boolean(engine.characters[me.data.character_id]?.is_npc);
    return Object.values(engine.tokens).some((t) => {
      if (t === me || t.mode === 'prop' || !t.data.character_id) return false;
      const c = cell(t);
      const other = engine.characters[t.data.character_id];
      return other && Boolean(other.is_npc) !== mySide && Math.max(Math.abs(a.c - c.c), Math.abs(a.r - c.r)) <= 1;
    });
  }, [engineRef, actorTokenId, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const modo = jutsu && params && jutsu.efeito.ataque ? jutsuMode(jutsu, params, profile, { inimigoColado }) : null;

  const actionsOk = (efeito) => {
    if (!strict) return true;
    let state = actionState;
    return acoesUsadas(efeito).every((type) => {
      if (slotsFor(type, state) === null) return false;
      state = registerAction(type, state, true);
      return true;
    });
  };

  const choose = (item) => {
    setJutsu(item);
    setNivel(item.nivelPoder);
    setSemChakra(false);
    setMeta('');
    setTargets([]);
    setPickedIds([]);
    setStep('config');
  };

  /** Paga ação e chakra. Retorna false se não pôde. */
  const pay = async () => {
    const { data: fresh } = await supabase.from('characters').select('chakra_current, active_modes').eq('id', actor.id).single();
    const current = Number(fresh?.chakra_current ?? chakra);
    if (strict && params.custo > current) {
      alert(`Chakra insuficiente: precisa de ${params.custo}, tem ${current}.`);
      return false;
    }
    // Senjutsu (pág. 239): cada bônus gasta 1 ponto de Chakra Senjutsu.
    const eremita = (fresh?.active_modes || []).find((m) => m.modoEremita);
    if (jutsu.efeito.senjutsu && strict && !(Number(eremita?.pontos || 0) > 0)) {
      alert('Sem pontos de Chakra Senjutsu: entre no Modo Eremita primeiro.');
      return false;
    }
    if (jutsu.efeito.senjutsu && jutsu.efeito.fica && (fresh?.active_modes || []).some((m) => m.name === jutsu.efeito.fica)) {
      alert('Esse bônus de Senjutsu já está ativo (não acumula).');
      return false;
    }
    if (jutsu.efeito.modoEremita && strict && Number(eremita?.pontos || 0) > 0) {
      alert('Ainda tem Chakra Senjutsu: só recarrega quando todos os pontos forem gastos.');
      return false;
    }
    // Taijutsus do Hachimon (págs. 209–212): o portão exigido precisa estar aberto.
    if (jutsu.efeito.portaoMin && strict) {
      const aberto = Math.max(0, ...(fresh?.active_modes || []).map((m) => Number(m.portao || 0)));
      if (aberto < jutsu.efeito.portaoMin) {
        alert(`${jutsu.nome} precisa de pelo menos o ${jutsu.efeito.portaoMin}º portão do Hachimon aberto.`);
        return false;
      }
    }
    // Modos em sequência (Jinchuuriki: Presença → Manto → Modo Bijuu, pág. 214).
    if (jutsu.efeito.requer && strict) {
      const re = new RegExp(`^(${jutsu.efeito.requer})`, 'i');
      if (!(fresh?.active_modes || []).some((m) => re.test(m.name || ''))) {
        alert(`${jutsu.nome}: precisa antes de ${jutsu.efeito.requer.replace(/[()^]/g, '').replace(/\|/g, ' ou ')} ativo.`);
        return false;
      }
    }
    // Kuchiyose (pág. 224): uma vez por cena.
    if (jutsu.efeito.umaPorCena && strict && (fresh?.active_modes || []).some((m) => m.name === jutsu.efeito.umaPorCena)) {
      alert(`${jutsu.nome} já foi usado nesta cena.`);
      return false;
    }
    let next = actionState;
    for (const type of acoesUsadas(jutsu.efeito)) {
      next = registerAction(type, next, strict);
      if (!next) {
        alert(`Sem ação ${ACTION_TYPES[type]?.label || type} disponível nesta rodada.`);
        return false;
      }
    }
    await onActionsSaved(currentCombatant, next);
    const patch = { chakra_current: current - params.custo };
    const ef = jutsu.efeito;
    let modes = Array.isArray(fresh?.active_modes) ? fresh.active_modes : [];
    if (FICA_ATIVO.has(ef.id)) {
      modes = [...modes, { id: uid(), name: `${ef.nome} (${jutsu.poderNome})`, turns: null, drain: { chakra: 0, hp: 0 } }];
      patch.active_modes = modes;
    }
    if (ef.modoEremita) {
      modes = [...modes.filter((m) => !m.modoEremita), { id: uid(), name: `Modo Eremita (${jutsu.nivelPoder} pts)`, turns: null, drain: { chakra: 0, hp: 0 }, modoEremita: true, pontos: Number(jutsu.nivelPoder) }];
      patch.active_modes = modes;
    }
    if (ef.senjutsu) {
      const atual = modes.find((m) => m.modoEremita);
      const resto = Number(atual?.pontos || 0) - 1;
      modes = modes.filter((m) => !m.modoEremita);
      if (atual && resto > 0) modes = [...modes, { ...atual, pontos: resto, name: `Modo Eremita (${resto} pts)` }];
      patch.active_modes = modes;
    }
    if (ef.umaPorCena) {
      modes = [...modes, { id: uid(), name: ef.umaPorCena, turns: null, drain: { chakra: 0, hp: 0 }, cena: true }];
      patch.active_modes = modes;
    }
    // Técnicas de clã (data/Clas.js): modo ativo, dreno por turno, tamanho, Vitalidade/chakra.
    if (ef.tecnica) {
      const porNivel = (v) => (v === 'nivel' ? nivel : v === 'dobroNivel' ? 2 * nivel : v === 'meioNivel' ? Math.ceil(nivel / 2) : Number(v || 0));
      if (ef.tira) {
        const re = new RegExp(`^(${ef.tira})`, 'i');
        const fechados = modes.filter((m) => re.test(m.name || ''));
        modes = modes.filter((m) => !re.test(m.name || ''));
        // Hachimon (pág. 203): fechar os portões deixa fatigado 4 turnos, −1 por nível acima do portão.
        if (ef.fadiga && fechados.length) {
          const portao = Math.max(...fechados.map((m) => Number(m.portao || 1)));
          modes = [...modes, novaCondicao('fatigado', Math.max(1, 4 - (jutsu.nivelPoder - portao)), uid)];
        }
      }
      if (ef.fica) {
        const condicao = ef.modo === 'acelerado' ? 'acelerado' : ef.modo === 'superAcelerado' ? 'super_acelerado' : undefined;
        modes = [...modes.filter((m) => m.name !== ef.fica), {
          id: uid(), name: ef.fica, turns: ef.turnosFica ?? null,
          drain: { chakra: porNivel(ef.drenoTurno), hp: porNivel(ef.drenoHp) },
          ...(ef.modo && !condicao ? { [ef.modo]: true } : {}),
          ...(condicao ? { condicao } : {}),
          ...(ef.danoBonus ? { danoBonus: porNivel(ef.danoBonus) } : {}),
          ...(ef.bonusAtaque ? { bonusAtaque: ef.bonusAtaque } : {}),
          ...(ef.forcaBonus || ef.forcaPorNivel ? { forcaBonus: ef.forcaBonus || [...ef.forcaPorNivel].reverse().find(([nv]) => nivel >= nv)?.[1] || 0 } : {}),
          ...(ef.resGenjutsu ? { resGenjutsu: ef.resGenjutsu } : {}),
          ...(ef.kyoudo ? { kyoudo: true } : {}),
          ...(ef.durezaCorpo ? { durezaCorpo: ef.durezaCorpo } : {}),
          ...(ef.juuinka ? bonusJuuinka() : {}),
          ...(ef.durezaBonus ? { durezaBonus: ef.durezaBonus } : {}),
          ...(ef.bonusDefesa ? { bonusDefesa: ef.bonusDefesa } : {}),
          ...(ef.turnosFica ? { portao: ef.nivel } : {}),
          // Magen: Falsa Posição (pág. 237) — camuflagem parcial (2) ou total (4) a partir do Nv 7.
          ...(ef.camuflagemNv ? { camuflagem: [...ef.camuflagemNv].reverse().find(([nv]) => jutsu.nivelPoder >= nv)?.[1] || 2 } : {}),
        }];
        // O dano do portão entra já ao abrir (pág. 203).
        if (ef.drenoHp) {
          const { data: me } = await supabase.from('characters').select('hp_current').eq('id', actor.id).single();
          patch.hp_current = Number(me?.hp_current ?? 0) - porNivel(ef.drenoHp);
        }
      }
      if (ef.tira || ef.fica) patch.active_modes = modes;
      if (ef.tamanho !== undefined) {
        const overrides = { ...(actor.overrides || {}) };
        if (ef.tamanho) overrides.tamanho = ef.tamanho; else delete overrides.tamanho;
        patch.overrides = overrides;
      }
      if (ef.custoVit) {
        const { data: me } = await supabase.from('characters').select('hp_current').eq('id', actor.id).single();
        patch.hp_current = Number(me?.hp_current ?? 0) - ef.custoVit;
      }
      if (ef.ganhoVit) {
        const { data: me } = await supabase.from('characters').select('hp_current').eq('id', actor.id).single();
        patch.hp_current = Math.min(Number(actor.hp_max || 0) || Infinity, Number(me?.hp_current ?? 0) + ef.ganhoVit);
      }
      if (ef.ganhoChakra) {
        const ganho = ef.ganhoChakra === 'tresPorNivel' ? 3 * nivel : Number(ef.ganhoChakra);
        patch.chakra_current = Math.min(Number(actor.chakra_max || 0) || Infinity, patch.chakra_current + ganho);
      }
    }
    const { error } = await trackedUpdate(actor.id, patch, `${actor.name}: ${jutsu.nome} (−${params.custo} CK)`);
    if (error) alert('Erro ao gastar o chakra: ' + error.message);
    return true;
  };

  // ---------- Iryou Ninjutsu: cura por toque (pág. 120) ----------
  const [patientId, setPatientId] = useState('');
  const patients = useMemo(() => {
    const engine = engineRef.current;
    const me = engine?.tokens[actorTokenId];
    if (!me || !jutsu?.efeito.cura) return [];
    const g = engine.gridSize || 64;
    const cell = (t) => ({ c: Math.floor(t.container.x / g), r: Math.floor(t.container.y / g) });
    const a = cell(me);
    return Object.values(engine.tokens)
      .filter((t) => t.data.character_id && t.mode !== 'prop')
      .filter((t) => { const c = cell(t); return Math.max(Math.abs(a.c - c.c), Math.abs(a.r - c.r)) <= 1; })
      .map((t) => ({ tokenId: t.data.id, characterId: t.data.character_id, name: engine.characters[t.data.character_id]?.name || t.data.name, self: t === me }));
  }, [engineRef, actorTokenId, jutsu, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const patient = patients.find((p) => p.tokenId === patientId) || patients.find((p) => p.self) || patients[0] || null;

  /** Vitalidade recuperada por turno de tratamento. */
  const healAmount = (self) => {
    const medApts = [...(actor.attributes?.aptidoes_gratuitas_list || []), ...(actor.attributes?.aptidoes_extra_list || [])]
      .filter((item) => /medicina/i.test(item?.complemento || ''))
      .map((item) => item.id);
    const bonus = (medApts.includes('perito') ? 1 : 0) + (medApts.includes('pericia_inata') ? 1 : 0);
    const total = nivel + Math.ceil(Number(jutsu?.medicina || 0) / 2) + bonus;
    return self && nivel < 4 ? Math.ceil(total / 2) : total; // em si mesmo: metade até o nível 4
  };

  const useHeal = async () => {
    if (busy || !patient) return;
    setBusy(true);
    if (await pay()) {
      const { data: target } = await supabase.from('characters').select('hp_current, hp_max, active_modes, name').eq('id', patient.characterId).single();
      const amount = healAmount(patient.self);
      const before = Number(target?.hp_current ?? 0);
      const after = Math.min(Number(target?.hp_max ?? before + amount), before + amount);
      const modes = Array.isArray(target?.active_modes) ? target.active_modes : [];
      const stillBleeding = modes.filter((m) => !/^sangrando/i.test(m.name || ''));
      const curouSangue = stillBleeding.length !== modes.length;
      await trackedUpdate(patient.characterId, { hp_current: after, active_modes: stillBleeding }, `${target?.name || patient.name}: cura +${after - before} VIT`);
      broadcastFx({ tokenId: patient.tokenId, text: `+${after - before}`, color: 0x4ade80 });
      playSound('cura');
      await postChat(`💚 ${actor.name} usou Iryou Ninjutsu (Nv ${nivel}) em ${target?.name || patient.name}: +${after - before} de Vitalidade (${before} → ${after})${curouSangue ? ', sangramento curado' : ''}. Para continuar o tratamento, repita no próximo turno (os dois parados).`);
      setResult({ support: true });
      setStep('result');
    }
    setBusy(false);
  };

  // ---------- Uso sem teste automático ----------
  const useSupport = async () => {
    if (busy) return;
    setBusy(true);
    if (await pay()) {
      const parts = [`custo ${params.custo} chakra`];
      if (jutsu.efeito.tecnica) {
        if (jutsu.efeito.custoVit) parts.push(`−${jutsu.efeito.custoVit} Vit`);
        if (jutsu.efeito.ganhoChakra) parts.push(`+${jutsu.efeito.ganhoChakra === 'tresPorNivel' ? 3 * nivel : jutsu.efeito.ganhoChakra} chakra`);
        if (params.alcanceM) parts.push(`alcance ${params.alcanceM} m`);
        if (jutsu.efeito.danoTexto) parts.push(`dano base ${jutsu.efeito.danoTexto === 'triploNivel' ? 3 * nivel : 2 * nivel}`);
        if (jutsu.efeito.kuchiyose) parts.push(`invoca 1 criatura de NC até ${2 * nivel} ou 2 de NC até ${Math.max(1, 2 * nivel - 2)} — Mestre, coloque a invocação no mapa (painel de PdMs)`);
        await postChat(`🌀 ${actor.name} usou ${jutsu.nome} (${jutsu.poderNome}) — ${parts.join(' · ')}. ${jutsu.efeito.resumo}`);
        setResult({ support: true });
        setStep('result');
        setBusy(false);
        return;
      }
      if (params.dano != null) parts.push(`dano base ${params.dano}`);
      parts.push(`Dif ${params.dif}`, `dureza ${params.dureza}`);
      if (params.alcanceM) parts.push(`alcance ${params.alcanceM} m`);
      if (jutsu.efeito.area) parts.push(`área: ${jutsu.efeito.area} (até ${params.tamanhoM} m)`);
      await postChat(`🌀 ${actor.name} usou ${jutsu.nome} (Nv ${nivel}) — ${parts.join(' · ')}. ${jutsu.efeito.resumo}`);
      setResult({ support: true });
      setStep('result');
    }
    setBusy(false);
  };

  // Juuinka (Hijutsus pág. 56): os 2 bônus escolhidos ficam no complemento da aptidão Juuinka - Ichi.
  const bonusJuuinka = () => {
    const lista = [...(actor.attributes?.aptidoes_gratuitas_list || []), ...(actor.attributes?.aptidoes_extra_list || [])];
    const texto = String(lista.find((a) => a?.id === 'juuinka_ichi')?.complemento || '').toLowerCase();
    return {
      ...(/for[cç]a/.test(texto) ? { forcaBonus: 4 } : {}),
      ...(/dano/.test(texto) ? { danoBonus: 2 } : {}),
      ...(/ataque/.test(texto) ? { bonusAtaque: 1 } : {}),
      ...(/defesa/.test(texto) ? { bonusDefesa: 1 } : {}),
      ...(/dureza/.test(texto) ? { durezaBonus: 1 } : {}),
    };
  };

  // ---------- Genjutsu do Magen (págs. 233–238): sem teste de precisão, o alvo resiste com Inteligência ----------
  const ehGenjutsu = Boolean(jutsu?.efeito.genjutsu);
  const intDe = (c) => Number(c?.attributes?.attributes?.inteligencia ?? c?.attributes?.npc?.atributos?.inteligencia ?? 0);
  const difGenjutsu = (alvo) => {
    // Ilusão Fluida (pág. 238): usa a Int do alvo se a sua for pelo menos o dobro do Magen.
    const aptsAtor = [...(actor?.attributes?.aptidoes_gratuitas_list || []), ...(actor?.attributes?.aptidoes_extra_list || [])].map((a) => a?.id);
    // Ilusão Profunda (pág. 64): +1 na Dif de Fascinar e Magen.
    const profunda = aptsAtor.includes('ilusao_profunda') ? 1 : 0;
    if (jutsu.efeito.difFascinar) return 6 + intDe(actor) + profunda; // Fascinar (pág. 80)
    const fluida = alvo && aptsAtor.includes('ilusao_fluida') && intDe(actor) >= 2 * Number(jutsu.nivelPoder);
    const base = 9 + Number(jutsu.nivelPoder) + Math.ceil((fluida ? Math.max(intDe(alvo), intDe(actor)) : intDe(actor)) / 2);
    // Hachimon aberto (pág. 203): reduz a Dif de resistência a genjutsus.
    const reducao = (Array.isArray(alvo?.active_modes) ? alvo.active_modes : []).reduce((max, m) => Math.max(max, Number(m.resGenjutsu || 0)), 0);
    return base + profunda + (alvo?.attributes?.npc?.type === 'capanga' ? 3 : 0) - reducao;
  };
  const efeitosGenjutsu = () => {
    const ef = jutsu.efeito;
    const nv = Number(jutsu.nivelPoder);
    const conds = [...(ef.porNivel || [])].reverse().find(([n]) => nv >= n)?.[1] || ef.ilusao || [];
    const turnosEvo = [...(ef.porNivelTurnos || [])].reverse().find(([n]) => nv >= n)?.[1];
    const turnos = turnosEvo ?? ef.turnosAplica ?? (ef.genjutsu === 'aflicao' ? 2 : null); // Aflição: 2 turnos; Compulsão: até se libertar
    return { conds, turnos };
  };

  const startGenjutsu = () => {
    if (!actorTokenId) { alert('O token deste personagem não está no mapa.'); return; }
    if (!actionsOk(jutsu.efeito)) { alert('Sem a ação necessária nesta rodada.'); return; }
    if (strict && params.custo > chakra) { alert(`Chakra insuficiente: precisa de ${params.custo}, tem ${chakra}.`); return; }
    setStep('targeting');
    engineRef.current?.startTargeting({
      attackerTokenId: actorTokenId,
      rangeBlocks: Math.max(1, Math.floor(params.alcanceM / 2)),
      multi: false,
      selected: [],
      isValid: (tokenData) => Boolean(tokenData.character_id) && tokenData.id !== actorTokenId,
      onToggle: () => {},
      onPick: (tokenData) => launchGenjutsu(tokenData),
      onCancel: () => setStep('config'),
    });
  };

  const launchGenjutsu = async (tokenData) => {
    if (busy) return;
    setBusy(true);
    const { data: alvo } = await supabase.from('characters').select('*').eq('id', tokenData.character_id).single();
    if (!alvo) { setBusy(false); setStep('config'); return; }
    if (!(await pay())) { setBusy(false); setStep('config'); return; }
    const ef = jutsu.efeito;
    const dif = difGenjutsu(alvo);
    const precisao = intDe(alvo);
    const aptAlvo = [...(alvo.attributes?.aptidoes_gratuitas_list || []), ...(alvo.attributes?.aptidoes_extra_list || [])].map((a) => String(a?.nome || a?.name || ''));
    const imune = ef.imuneApt && Number(jutsu.nivelPoder) < Number(ef.imuneAte || 99) && aptAlvo.some((n) => n.toLowerCase() === ef.imuneApt.toLowerCase());
    const semResistencia = ef.semResistenciaNv && Number(jutsu.nivelPoder) >= ef.semResistenciaNv;
    const dados = rollDice(2, 8);
    const soma = dados[0] + dados[1];
    const total = soma + precisao;
    // 15–16 é sempre sucesso e 2–3 sempre falha (pág. 250).
    const resistiu = !semResistencia && (soma >= 15 || (soma > 3 && total >= dif));
    const label = `${alvo.name} resiste a ${jutsu.nome} (Inteligência)`;
    const row = buildRollRow({ roomId, playerId, playerName, label, sides: 8, dice: dados, modifier: precisao });
    onTriggerRoll?.({ label, formula: row.formula, sides: 8, rolls: dados, finalResult: row.total, playerName: row.player_name });
    await supabase.from('room_rolls').insert(row);
    broadcastFx({ tokenId: actorTokenId, text: jutsu.nome, color: 0xa855f7 });

    let texto;
    if (imune) {
      texto = `${alvo.name} tem ${ef.imuneApt}: imune a ${jutsu.nome}.`;
    } else if (resistiu) {
      texto = `${alvo.name} resistiu: ${dados.join('+')} + ${precisao} = ${total} contra ${dif}.`;
      broadcastFx({ tokenId: tokenData.id, text: 'Resistiu!', color: 0xd4d4d8 });
    } else {
      const { conds, turnos } = efeitosGenjutsu();
      const atuais = Array.isArray(alvo.active_modes) ? alvo.active_modes : [];
      // Sobreposição (pág. 235): um genjutsu novo cancela o anterior na mesma vítima.
      const semAnterior = atuais.filter((m) => !m.genjutsu);
      const novos = conds.map((id) => ({ ...novaCondicao(id, turnos, uid), name: `${findCondicao(id).nome} (${jutsu.nome})`, genjutsu: ef.genjutsu, difGenjutsu: dif }));
      if (ef.adormecer) novos.push({ id: uid(), name: `Adormecendo (${jutsu.nome}): inconsciente ao fim`, turns: turnos, drain: { chakra: 0, hp: 0 }, genjutsu: ef.genjutsu });
      if (novos.length) await trackedUpdate(alvo.id, { active_modes: [...semAnterior, ...novos] }, `${alvo.name}: ${jutsu.nome}`);
      const nomes = conds.map((id) => findCondicao(id).nome.toLowerCase()).join(' e ');
      const duracao = turnos ? ` por ${turnos} turno(s)` : ef.genjutsu === 'compulsao' ? ' até se libertar' : '';
      texto = `${alvo.name} ${semResistencia ? 'não pode resistir' : `falhou (${dados.join('+')} + ${precisao} = ${total} contra ${dif})`}${nomes ? `: fica ${nomes}${duracao}` : ''}.`;
      broadcastFx({ tokenId: tokenData.id, text: 'Iludido!', color: 0xa855f7 });
    }
    const dica = ef.genjutsu === 'compulsao' || ef.genjutsu === 'fantasma'
      ? ' A partir do 2º turno, a vítima pode tentar Notar Genjutsu (Inteligência, Dif −1, −1 por tentativa).'
      : '';
    await postChat(`🌀 ${actor.name} usou ${jutsu.poderNome === 'Fascinar' ? '' : 'Magen: '}${jutsu.nome} (${params.custo} chakra) em ${alvo.name} — ${texto}${dica} ${ef.resumo}`);
    setResult({ dice: dados, total, outcomes: [{ id: uid(), targetName: alvo.name, hit: !resistiu && !imune, applied: true, dano: 0, extra: ` · ${texto}`, reason: texto }] });
    setStep('result');
    setBusy(false);
  };

  // ---------- Mira ----------
  const multi = jutsu?.efeito.ataque === 'area' || jutsu?.efeito.ataque === 'cadeia';
  const maxTargets = jutsu?.efeito.ataque === 'cadeia' ? 1 + params.alvosExtras : 99;

  const loadTarget = async (tokenData) => {
    const { data } = await supabase.from('characters').select('*').eq('id', tokenData.character_id).single();
    return data ? { token: tokenData, character: data, flanked: isFlanked(tokenData.id), defense: 'esquiva' } : null;
  };

  const startTargeting = () => {
    if (!actorTokenId) { alert('O token deste personagem não está no mapa.'); return; }
    if (!actionsOk(jutsu.efeito)) { alert('Sem a ação necessária nesta rodada.'); return; }
    if (strict && params.custo > chakra) { alert(`Chakra insuficiente: precisa de ${params.custo}, tem ${chakra}.`); return; }
    setStep('targeting');
    engineRef.current?.startTargeting({
      attackerTokenId: actorTokenId,
      rangeBlocks: modo.alcanceBlocos,
      multi,
      selected: pickedIds,
      isValid: (tokenData) => Boolean(tokenData.character_id) && tokenData.id !== actorTokenId,
      onToggle: (ids) => setPickedIds(ids.slice(0, maxTargets)),
      onPick: async (tokenData) => {
        const t = await loadTarget(tokenData);
        if (!t) { setStep('config'); return; }
        setTargets([t]);
        setStep('forecast');
      },
      onCancel: () => setStep('config'),
    });
  };

  const confirmTargets = async () => {
    engineRef.current?.cancelTargeting();
    const tokens = engineRef.current?.tokens || {};
    const loaded = (await Promise.all(pickedIds.map((id) => (tokens[id] ? loadTarget(tokens[id].data) : null)))).filter(Boolean);
    if (!loaded.length) { setStep('config'); return; }
    setTargets(loaded);
    setStep('forecast');
  };

  // ---------- Previsão por alvo ----------
  const situations = useMemo(() => {
    if (!modo || !targets.length) return [];
    return targets.map((t) => {
      const targetProfile = combatProfile(t.character);
      const sit = applySituation(profile, modo, targetProfile, { flanked: t.flanked });
      const def = jutsuDefenses(jutsu, sit.target, t.character);
      const defense = def.target.defenses.bloqueio.possivel || t.defense !== 'bloqueio' ? t.defense : 'esquiva';
      const f = forecast({ modo: sit.modo, maxGrau: profile.maxGrau, target: def.target, defense });
      // Confronto de Elementos (pág. 89): o alvo tem uma técnica ativa de elemento rival?
      const confrontos = (Array.isArray(t.character.active_modes) ? t.character.active_modes : [])
        .map((m) => confrontoElemental(jutsu?.elemento || jutsu?.poderId, elementoNoTexto(m.name)))
        .filter(Boolean)
        .map((c) => c.texto);
      return { ...t, defense, modo: sit.modo, targetProfile: def.target, notes: [...sit.notes, ...def.notes, ...new Set(confrontos)], f };
    });
  }, [modo, targets, profile, jutsu]);

  const setDefense = (index, defense) => setTargets((list) => list.map((t, i) => (i === index ? { ...t, defense } : t)));

  // ---------- Resolver ----------
  const launch = async () => {
    if (busy || !situations.length) return;
    setBusy(true);
    if (!(await pay())) { setBusy(false); return; }

    // Cada alvo escolhe a própria defesa (ou a escolha da previsão, se eu controlo o alvo).
    setStep('waiting');
    const chosen = await Promise.all(situations.map((s) => askDefense({
      targetCharacter: s.character,
      attackerName: actor.name,
      attackName: jutsu.nome,
      chosen: s.defense,
      options: DEFENSES.map((d) => {
        const possivel = d.key !== 'bloqueio' || s.targetProfile.defenses.bloqueio.possivel;
        const f = possivel ? forecast({ modo: s.modo, maxGrau: profile.maxGrau, target: s.targetProfile, defense: d.key }) : null;
        return { key: d.key, label: d.label, possivel, hit: f ? f.hit : 1 };
      }),
    })));

    const dice = rollDice(2, 8);
    const label = `${jutsu.nome} (Nv ${nivel})`;
    const row = buildRollRow({ roomId, playerId, playerName, label, sides: 8, dice, modifier: modo.precisao });
    onTriggerRoll?.({ label, formula: row.formula, sides: 8, rolls: dice, finalResult: row.total, playerName: row.player_name });
    await supabase.from('room_rolls').insert(row);
    broadcastFx({ tokenId: actorTokenId, text: jutsu.efeito.nome, color: 0x60a5fa });

    const outcomes = [];
    const ricochete9 = jutsu.efeito.id === 'ricochete' && jutsu.evolucoes.some((e) => e.nivel === 9);
    for (let i = 0; i < situations.length; i += 1) {
      const s = { ...situations[i], defense: chosen[i] };
      const bonusCadeia = ricochete9 ? Math.min(5, i) : 0;
      const mode = bonusCadeia ? { ...s.modo, danoBase: s.modo.danoBase + bonusCadeia } : s.modo;
      const res = resolveAttack({ modo: mode, maxGrau: profile.maxGrau, target: s.targetProfile, defense: s.defense, presetDice: dice });
      let dano = res.dano;
      let extra = '';
      if (res.hit && params.testesExtras) {
        const rolls = extraHits({ modo: mode, defense: s.defense, defenseTotal: res.defenseTotal, vezes: params.testesExtras });
        const acertos = rolls.filter((r) => r.hit).length;
        if (acertos) dano = (mode.danoBase + acertos) * res.grau;
        extra = ` · testes extras ${rolls.map((r) => `${r.total}${r.hit ? '✓' : '✗'}`).join(' ')} (+${acertos} de dano base)`;
      }
      // Rasengan Elemental: Dano Irresistível — grau mínimo 2 no alvo direto (pág. 123).
      if (jutsu.efeito.grauMinimo && res.hit && res.grau && res.grau < jutsu.efeito.grauMinimo) {
        dano = Math.ceil((dano / res.grau) * jutsu.efeito.grauMinimo);
        extra += ` · Dano Irresistível (grau ${jutsu.efeito.grauMinimo})`;
      }
      // Técnica Poderosa (pág. 74): grau +0,5, arredondando o dano para cima.
      if ((metaValida === 'poderosa' || jutsu.efeito.tecnicaPoderosa) && res.hit && res.grau) {
        dano = Math.ceil((dano / res.grau) * (res.grau + 0.5));
        extra += ` · Técnica Poderosa (grau ${res.grau + 0.5})`;
      }
      const full = {
        ...res, dano, id: uid(), attackerName: actor.name, targetName: s.character.name,
        targetCharacterId: s.character.id, targetTokenId: s.token.id, attackerTokenId: actorTokenId, weapon: jutsu.nome, danoBase: mode.danoBase,
        drenar: res.hit ? params.drena : 0, // Kikai Ninpou / Kikaichuu: chakra drenado do alvo
      };
      // Dokujutsu (pág. 201): ao ferir, o veneno escolhido entra (resistência 8 + Venefício).
      if (ELEMENTOS[jutsu.poderId]?.veneno && res.hit && dano > 0) {
        extra += ` · se usou veneno: resistência Dif ${8 + Number(actor.attributes?.skill_totals?.veneficio || 0)}`;
      }
      outcomes.push({ ...full, extra, defense: s.defense });
      if (!res.hit && jutsu.efeito.ataque === 'cadeia') break; // Ricochete para no primeiro que se defende
    }

    // Animação para todos (o jutsu "chega" antes do dano aparecer).
    await playAnim?.({
      from: actorTokenId,
      to: outcomes.map((o) => o.targetTokenId),
      ...fxFor({ poderId: jutsu.poderId, efeitoId: jutsu.efeito.id, ataque: jutsu.efeito.ataque, elemento: jutsu.elemento }),
      hit: outcomes.map((o) => o.hit),
    });

    for (const o of outcomes) {
      if (!o.hit) {
        broadcastFx({ tokenId: o.targetTokenId, text: o.falhaCritica ? 'Falha crítica!' : o.defense === 'esquiva' ? 'Esquivou!' : o.defense === 'bloqueio' ? 'Bloqueou!' : 'Antecipou!', color: 0xd4d4d8 });
      } else if (autoDamage || isGM) {
        const update = await applyResult(o);
        o.hpAfter = update?.hpAfter;
        o.applied = Boolean(update);
      } else {
        sendPending(o);
      }
    }

    // Técnicas que prendem (Kage Shibari, Kongou Fuusa…): quem foi acertado recebe a condição.
    if (jutsu.efeito.aplica) {
      const turnos = jutsu.efeito.duracaoAplica === 'shibari'
        ? Math.min(6, 1 + nivel) // Kage Shibari: 1 + nível de turnos, máx. 6 (pág. 169)
        : Number(jutsu.efeito.duracaoAplica) || null;
      for (const o of outcomes.filter((x) => x.hit)) {
        const { data: alvo } = await supabase.from('characters').select('active_modes, name').eq('id', o.targetCharacterId).single();
        const atuais = Array.isArray(alvo?.active_modes) ? alvo.active_modes : [];
        await trackedUpdate(o.targetCharacterId, { active_modes: [...atuais, { ...novaCondicao(jutsu.efeito.aplica, turnos, uid), name: `${findCondicao(jutsu.efeito.aplica).nome} (${jutsu.nome})` }] }, `${o.targetName}: ${jutsu.nome}`);
        o.extra = `${o.extra || ''} · ${findCondicao(jutsu.efeito.aplica).nome.toLowerCase()}${turnos ? ` por ${turnos} turno(s)` : ''}`;
      }
    }

    // Rasengan Elemental: explosão de 10 m em volta do alvo e dano colateral em quem usou (pág. 123).
    let explosao = '';
    if (jutsu.efeito.explosaoM && outcomes.some((o) => o.hit)) {
      const engine = engineRef.current;
      const g = engine?.gridSize || 64;
      const raio = (jutsu.efeito.explosaoM / 2) * g; // 2 m por bloco
      const alvo = engine?.tokens[outcomes[0].targetTokenId];
      if (alvo) {
        const pegos = Object.values(engine.tokens)
          .filter((t) => t !== alvo && t.data.id !== actorTokenId && t.data.character_id && t.mode !== 'prop')
          .filter((t) => Math.hypot(t.container.x - alvo.container.x, t.container.y - alvo.container.y) <= raio + g / 2)
          .map((t) => engine.characters[t.data.character_id]?.name || t.data.name);
        explosao = pegos.length ? ` 💥 A explosão (10 m) também atinge: ${pegos.join(', ')} — cada um se defende de um ataque com dano base ${params.dano}.` : ' 💥 A explosão (10 m) não pegou mais ninguém.';
      }
    }
    if (jutsu.efeito.colateral && params.dano) {
      const { data: me } = await supabase.from('characters').select('hp_current, hp_max').eq('id', actor.id).single();
      const before = Number(me?.hp_current ?? 0);
      const after = Math.max(0, before - params.dano);
      await trackedUpdate(actor.id, { hp_current: after }, `${actor.name}: dano colateral do ${jutsu.nome} (−${params.dano})`);
      broadcastFx({ tokenId: actorTokenId, text: `−${params.dano}`, color: 0xff4444 });
      explosao += ` Dano colateral em ${actor.name}: −${params.dano} (Vitalidade ${before} → ${after}).`;
    }

    const resumo = outcomes.map((o) => `${o.targetName}: ${o.hit ? `${o.reason}${o.dano ? ` Grau ${o.grau} → ${o.dano}` : ''}${o.drenar ? ` · drena ${o.drenar} de chakra` : ''}${o.extra}` : o.reason}`).join(' | ');
    const comboTxt = comboJutsu ? ` Combo com ${comboJutsu.nome}: soma o efeito dele (${comboJutsu.efeito.resumo || comboJutsu.efeito.nome}); resistências separadas.` : '';
    await postChat(`🌀 ${actor.name} usou ${jutsu.nome}${comboJutsu ? ` + ${comboJutsu.efeito.nome}` : ''} (Nv ${nivel}, ${params.custo} chakra): [${dice.join(', ')}]+${modo.precisao}. ${resumo}${comboTxt}${!autoDamage && !isGM && outcomes.some((o) => o.hit) ? ' (aguardando o Mestre)' : ''}${explosao}`);
    setResult({ dice, total: dice[0] + dice[1] + modo.precisao, outcomes });
    setStep('result');
    setBusy(false);
  };

  // ---------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------

  if (step === 'list') {
    return (
      <div className="space-y-1">
        <Back onClick={onClose} />
        {jutsus.map((item) => {
          const p = jutsuParams(item, item.nivelPoder);
          const ok = actionsOk(item.efeito);
          return (
            <button key={item.key} type="button" onClick={() => choose(item)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left hover:border-sky-500">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">🌀 {item.nome}</span>
                <span className="block truncate text-[11px] text-zinc-400">
                  {item.efeito.nome} · {acoesDoEfeito(item.efeito).map((a) => ACTION_TYPES[a]?.label).join(' + ')}{!ok ? ' (sem ação)' : ''}{item.efeito.area ? ` · ${item.efeito.area}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-black text-sky-300">{p.custo} CK</span>
                <span className="block text-[11px] text-zinc-400">{p.dano != null ? `dano ${p.dano}` : p.drena ? `drena ${p.drena}` : 'suporte'}</span>
              </span>
            </button>
          );
        })}
        {!jutsus.length && (
          <p className="rounded border border-zinc-800 p-2 text-xs text-zinc-500">
            Nenhum jutsu na ficha. Na aba Aptidões e Poderes, adicione Ninpou ou um elemento e escolha os efeitos de cada nível.
          </p>
        )}
      </div>
    );
  }

  if (step === 'config' && jutsu && params) {
    const niveis = Array.from({ length: jutsu.nivelPoder - jutsu.nivelMin + 1 }, (_, i) => jutsu.nivelMin + i);
    const canFree = jutsu.efeito.id === 'canhao' && jutsu.nivelPoder >= 2;
    return (
      <div className="space-y-2">
        <Back onClick={() => setStep('list')} />
        <div className="rounded-lg border border-sky-800 bg-sky-950/30 p-2">
          <p className="text-sm font-black text-sky-200">{jutsu.nome}</p>
          <p className="text-[11px] text-zinc-400">{jutsu.efeito.nome} · {jutsu.poderNome}{jutsu.efeito.tecnica ? '' : ` ${jutsu.nivelPoder}`}{jutsu.efeito.pagina ? ` · pág. ${jutsu.efeito.pagina}` : ''}</p>
          <p className="mt-1 text-[11px] text-zinc-300">{jutsu.efeito.resumo}</p>
          {jutsu.evolucoes.map((e) => <p key={e.nivel} className="text-[11px] text-emerald-300">↑ Nv {e.nivel}: {e.texto}</p>)}
          {(jutsu.nota || ELEMENTOS[jutsu.poderId]?.nota) && <p className="text-[11px] text-amber-200">{jutsu.nota || ELEMENTOS[jutsu.poderId].nota}</p>}
          {params.drena > 0 && <p className="text-[11px] font-bold text-violet-300">Ao acertar: drena {params.drena} de chakra do alvo.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-bold text-zinc-400">{jutsu.efeito.rotuloNivel || 'Nível usado'}:</span>
          {niveis.map((n) => (
            <button key={n} type="button" onClick={() => setNivel(n)}
              className={`rounded border px-2 py-0.5 text-xs font-bold ${nivel === n ? 'border-sky-500 bg-sky-800 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>{n}</button>
          ))}
          {canFree && (
            <label className="ml-2 flex items-center gap-1 text-[11px] text-zinc-400" title="Pág. 95: sem custo de chakra, dano pela metade">
              <input type="checkbox" checked={semChakra} onChange={(e) => setSemChakra(e.target.checked)} /> Sem chakra (½ dano)
            </label>
          )}
        </div>
        {comboOpcoes.length > 0 && (
          <label className="block text-[11px] text-zinc-400" title="Combo de Elementos (pág. 90): precisa da aprovação do Mestre; ação completa sozinho">
            🔥💧 Combo de elementos <span className="text-zinc-600">(ação completa · paga os dois)</span>
            <select value={comboJutsu ? combo : ''} onChange={(e) => setCombo(e.target.value)}
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100">
              <option value="">Não usar</option>
              {comboOpcoes.map((j) => <option key={j.key} value={j.key}>+ {j.nome} (+{jutsuParams(j, j.efeito.nivel).custo} CK)</option>)}
            </select>
            {comboJutsu && <span className="text-[10px] text-amber-200">O {comboJutsu.efeito.nome} só soma o efeito dele; dano, alcance e Dif são do principal. Cada efeito pede o seu teste de resistência.</span>}
          </label>
        )}
        {metaOpcoes.length > 0 && (
          <label className="block text-[11px] text-zinc-400" title="Meta-aptidão (pág. 69): gasta a ação de Movimento; uma por técnica">
            ⚡ Meta-aptidão <span className="text-zinc-600">(+ ação de Movimento)</span>
            <select value={metaValida} onChange={(e) => setMeta(e.target.value)}
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100">
              <option value="">Não usar</option>
              {metaOpcoes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        )}

        <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
          <Stat label="Custo" value={`${params.custo} CK`} warn={params.custo > chakra} sub={`tem ${chakra}`} />
          {jutsu.efeito.tecnica
            ? <Stat label="Ação" value={ACTION_TYPES[jutsu.efeito.acao]?.label || jutsu.efeito.acao} sub={jutsu.efeito.custoVit ? `−${jutsu.efeito.custoVit} Vit` : jutsu.efeito.ganhoChakra ? `+${jutsu.efeito.ganhoChakra === 'tresPorNivel' ? 3 * nivel : jutsu.efeito.ganhoChakra} CK` : ''} />
            : <Stat label={params.dano != null ? 'Dano base' : params.drena ? 'Drena' : 'Dif padrão'} value={params.dano != null ? params.dano : params.drena ? `${params.drena} CK` : params.dif} />}
          <Stat label="Alcance" value={jutsu.efeito.alcance === 'toque' ? 'Toque' : jutsu.efeito.alcance === 'pessoal' ? 'Pessoal' : `${params.alcanceM} m`} sub={modo ? `${modo.alcanceBlocos} bl.` : ''} />
          {modo && <Stat label="Teste" value={`2d8+${modo.precisao}`} sub={modo.rotulo} />}
          {jutsu.efeito.id !== 'ataque_kikaichuu' && !jutsu.efeito.tecnica && <Stat label="Dif / Dureza" value={`${params.dif} / ${params.dureza}`} />}
          {jutsu.efeito.area && <Stat label="Área" value={`${params.tamanhoM} m`} sub={jutsu.efeito.area} />}
        </div>
        {modo?.avisos.map((a) => <p key={a} className="text-[11px] font-bold text-amber-300">⚠ {a}</p>)}

        {jutsu.efeito.cura ? (
          <div className="space-y-1">
            <label className="block text-[11px] text-zinc-400">
              Paciente (encostado em você)
              <select value={patient?.tokenId || ''} onChange={(e) => setPatientId(e.target.value)}
                className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100">
                {patients.map((p) => <option key={p.tokenId} value={p.tokenId}>{p.name}{p.self ? ' (você)' : ''}</option>)}
              </select>
            </label>
            {patient && <p className="text-[11px] text-emerald-300">Recupera {healAmount(patient.self)} de Vitalidade neste turno{patient.self && nivel < 4 ? ' (metade: em si mesmo até o Nv 4)' : ''}.</p>}
            <button type="button" disabled={busy || !patient} onClick={useHeal} className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-black hover:bg-emerald-600 disabled:opacity-50">
              💚 Curar (gasta {params.custo} chakra e a ação Padrão)
            </button>
          </div>
        ) : ehGenjutsu && jutsu.efeito.genjutsu !== 'fantasma' || jutsu.efeito.notar ? (
          <div className="space-y-1">
            <p className="text-[11px] text-purple-300">O alvo testa Inteligência contra Dif {difGenjutsu(null)}{jutsu.efeito.difFascinar ? '' : ' (+3 se for capanga)'}. Sem teste de precisão.</p>
            <button type="button" onClick={startGenjutsu} className="w-full rounded-lg bg-purple-700 py-2 text-sm font-black hover:bg-purple-600">
              👁️ Escolher o alvo da ilusão
            </button>
          </div>
        ) : modo ? (
          <button type="button" onClick={startTargeting} className="w-full rounded-lg bg-sky-700 py-2 text-sm font-black hover:bg-sky-600">
            🎯 {multi ? (jutsu.efeito.ataque === 'cadeia' ? `Escolher até ${maxTargets} alvos (em ordem)` : 'Escolher os alvos na área') : 'Escolher o alvo'}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={useSupport} className="w-full rounded-lg bg-sky-700 py-2 text-sm font-black hover:bg-sky-600 disabled:opacity-50">
            🌀 Usar (gasta {params.custo} chakra e a ação)
          </button>
        )}
      </div>
    );
  }

  if (step === 'targeting') {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          <b className="text-amber-300">{multi ? 'Toque nos alvos' : 'Escolha o alvo'} no mapa.</b>{' '}
          <span className="text-zinc-400">
            Vermelho = alcance ({modo?.alcanceBlocos ?? Math.max(1, Math.floor((params?.alcanceM || 0) / 2))} bl.).
            {jutsu.efeito.area ? ` Marque quem está na área (${jutsu.efeito.area}, até ${params.tamanhoM} m).` : ''}
            {jutsu.efeito.ataque === 'cadeia' ? ` Na ordem dos saltos, até ${maxTargets}, a até 10 m um do outro.` : ''}
          </span>
        </p>
        <div className="flex gap-2">
          {multi && (
            <button type="button" disabled={!pickedIds.length} onClick={confirmTargets} className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-black hover:bg-emerald-600 disabled:opacity-40">
              ✓ Confirmar {pickedIds.length} alvo{pickedIds.length === 1 ? '' : 's'}
            </button>
          )}
          <button type="button" onClick={() => { engineRef.current?.cancelTargeting(); setStep('config'); }} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white">Cancelar</button>
        </div>
      </div>
    );
  }

  if (step === 'forecast') {
    return (
      <div className="space-y-2">
        <Back onClick={() => setStep('config')} />
        <p className="text-xs text-zinc-400">
          <b className="text-sky-200">{jutsu.nome}</b> · Nv {nivel} · 2d8+{modo.precisao} · dano base {modo.danoBase} · {params.custo} chakra
          {situations.length > 1 ? ' · um teste só, cada alvo se defende' : ''}
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {situations.map((s, index) => {
            const hp = Number(s.character.hp_current ?? s.character.hp_max ?? 0);
            return (
              <div key={s.token.id} className="rounded-lg border border-red-900 bg-red-950/30 p-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-bold text-red-200">{index + 1}. {s.character.name}</span>
                  <span className="shrink-0 text-zinc-300">acerto <b>{pct(s.f.hit)}</b> · crít {pct(s.f.crit)} · {hp} → {hp - s.f.likelyDamage}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {DEFENSES.map((d) => {
                    const disabled = d.key === 'bloqueio' && !s.targetProfile.defenses.bloqueio.possivel;
                    return (
                      <button key={d.key} type="button" disabled={disabled} onClick={() => setDefense(index, d.key)}
                        className={`rounded border py-0.5 text-[11px] font-bold disabled:opacity-30 ${s.defense === d.key ? 'border-red-500 bg-red-900/60' : 'border-zinc-700 text-zinc-400'}`}>{d.label}</button>
                    );
                  })}
                </div>
                {s.notes.length > 0 && <p className="mt-1 text-[10px] text-violet-300">{s.notes.join(' · ')}</p>}
              </div>
            );
          })}
        </div>
        <button type="button" disabled={busy} onClick={launch} className="w-full rounded-lg bg-red-700 py-2 text-sm font-black hover:bg-red-600 disabled:opacity-50">
          🌀 Lançar {jutsu.efeito.nome}
        </button>
      </div>
    );
  }

  if (step === 'waiting') {
    return <p className="text-center text-xs text-zinc-400">Rolando {jutsu?.nome}…</p>;
  }

  if (step === 'result' && result) {
    return (
      <div className="space-y-2">
        {result.support ? (
          <p className="rounded-lg border border-sky-800 bg-sky-950/30 p-3 text-sm">{jutsu.nome} usado. Os valores foram para o chat.</p>
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
            <p className="text-xs text-zinc-400">Dados [{result.dice.join(', ')}] → {result.total}</p>
            {result.outcomes.map((o) => (
              <p key={o.id} className={o.critico ? 'text-amber-300' : o.hit ? 'text-red-300' : 'text-zinc-400'}>
                <b>{o.targetName}:</b> {o.hit ? `${o.dano ? `Grau ${o.grau} → ${o.dano} de dano` : 'Acertou'}${o.drenar ? ` · −${o.drenar} de chakra` : ''}${o.extra}` : o.reason}
                {o.hit && !o.applied && !isGM && !autoDamage ? ' (aguardando o Mestre)' : ''}
              </p>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="w-full rounded-lg bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700">OK</button>
      </div>
    );
  }

  return null;
}

function Back({ onClick }) {
  return <button type="button" onClick={onClick} className="mb-1 text-xs font-bold text-zinc-400 hover:text-white">← Voltar</button>;
}

function Stat({ label, value, sub, warn = false }) {
  return (
    <div className={`rounded border px-1 py-1 ${warn ? 'border-amber-700 bg-amber-950/40' : 'border-zinc-800 bg-zinc-900'}`}>
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-black">{value}</p>
      {sub && <p className="truncate text-[9px] text-zinc-500">{sub}</p>}
    </div>
  );
}
