import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bloodIntensity } from '../canvas/Blood.js';
import { supabase } from '../services/supabase/client';
import { buildRollRow, rollDice } from '../services/Rolls';
import { ACTION_TYPES, actionsForRound, freeSlots, perdaPorCondicao, slotsFor, useAction as registerAction } from '../services/Combat';
import { condicoesDe, limitesDoTurno, novaCondicao, podeKawarimi } from '../data/Condicoes';
import { applySituation, combatProfile, damageUpdate, forecast, resolveAttack, vitalityState } from '../services/Attack';
import { deslocamentoBlocos, movementBudget } from '../services/Movement';
import { jutsuList } from '../services/Jutsus';
import JutsuPanel from './JutsuPanel.jsx';
import ManobrasPanel from './ManobrasPanel.jsx';
import { fxFor } from '../canvas/AttackFx';
import { uid } from '../services/Uid';
import { trackedUpdate } from '../services/Undo';

const DEFENSES = [
  { key: 'esquiva', label: 'Esquiva', hint: 'Sem teste: precisa tirar 9 + ESQ do alvo' },
  { key: 'bloqueio', label: 'Bloquear', hint: 'Teste resistido contra 2d8 + CC' },
  { key: 'antecipar', label: 'Antecipar', hint: 'Teste resistido contra 2d8 + LM' },
];

const pct = (value) => `${Math.round(value * 100)}%`;

/**
 * Menu de turno (estilo Pokémon / Fire Emblem), por cima do mapa.
 * Aparece para quem está no turno (e para o Mestre, que também age pelos NPCs).
 *
 *   Atacar → escolhe a arma → mira no mapa (alcance em vermelho) → previsão
 *   (chance de acertar, crítico, dano) → rola → o Mestre confirma (ou aplica sozinho).
 */
export default function TurnMenu({ roomId, playerName, playerId, isGM, engineRef, combatState, currentCombatant, onActionsSaved, onTriggerRoll }) {
  const [actor, setActor] = useState(null);           // ficha de quem está no turno
  const [step, setStep] = useState('menu');           // menu | attacks | targeting | forecast | waiting | result
  const [attack, setAttack] = useState(null);         // { key, nome, modo }
  const [target, setTarget] = useState(null);         // { token, character }
  const [defense, setDefense] = useState('esquiva');
  // Manobras junto do ataque (págs. 261–265): { defensiva, investida, furtivo, misericordia }
  const [opcoes, setOpcoes] = useState({});
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState([]);         // (Mestre) ataques esperando confirmação
  const [autoDamage, setAutoDamage] = useState(false);
  const [defenderChoice, setDefenderChoice] = useState(true); // defensor escolhe a própria defesa
  const [defenseRequests, setDefenseRequests] = useState([]); // pedidos que EU preciso responder
  const [waiting, setWaiting] = useState([]);                 // pedidos que EU fiz e aguardo
  const resolversRef = useRef(new Map());
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const channelRef = useRef(null);

  // ---------- Quem age agora ----------
  useEffect(() => {
    let active = true;
    setStep('menu');
    setResult(null);
    setTarget(null);
    setAttack(null);
    setOpcoes({});
    engineRef.current?.cancelTargeting();
    if (!combatState.active || !currentCombatant?.character_id) {
      setActor(null);
      return undefined;
    }
    supabase.from('characters').select('*').eq('id', currentCombatant.character_id).single()
      .then(({ data }) => { if (active) setActor(data || null); });
    return () => { active = false; };
  }, [combatState.active, currentCombatant?.id, currentCombatant?.character_id, engineRef]);

  // Ficha de quem age muda no meio do turno (condição aplicada, dano, chakra): acompanha pelo mapa.
  useEffect(() => {
    if (!actor?.id) return undefined;
    const onChange = (event) => {
      if (event.detail && event.detail !== actor.id) return;
      const fresh = engineRef.current?.characters?.[actor.id];
      if (fresh && fresh !== actor) setActor((current) => (current?.id === fresh.id ? { ...current, ...fresh } : current));
    };
    window.addEventListener('vtt:character', onChange);
    return () => window.removeEventListener('vtt:character', onChange);
  }, [actor, engineRef]);

  const canAct = Boolean(actor && combatState.active && (isGM || actor.owner_id === playerId));
  const profile = useMemo(() => (actor ? combatProfile(actor) : null), [actor]);
  // Condições prejudiciais do personagem do turno (págs. 275–278).
  const condicoes = useMemo(() => condicoesDe(actor), [actor]);
  const limites = useMemo(() => limitesDoTurno(condicoes), [condicoes]);
  const actionState = perdaPorCondicao(actionsForRound(currentCombatant?.actions, combatState.round), limites);
  const free = freeSlots(actionState);
  // Regras do livro valem para todos, inclusive o Mestre controlando inimigos.
  const strict = Boolean(combatState.strict);
  const canStandard = (!strict || slotsFor('padrao', actionState) !== null) && !(strict && limites.semAtaque);

  // ---------- Configuração: o dano entra sozinho ou o Mestre confirma ----------
  useEffect(() => {
    supabase.from('rooms').select('hud_settings').eq('id', roomId).single()
      .then(({ data }) => {
        setAutoDamage(Boolean(data?.hud_settings?.auto_damage));
        setDefenderChoice(data?.hud_settings?.defender_choice !== false);
      });
  }, [roomId]);

  const toggleAutoDamage = async () => {
    const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
    const next = { ...(data?.hud_settings || {}), auto_damage: !autoDamage };
    setAutoDamage(!autoDamage);
    channelRef.current?.send({ type: 'broadcast', event: 'config', payload: { autoDamage: !autoDamage } });
    await supabase.from('rooms').update({ hud_settings: next }).eq('id', roomId);
  };

  // ---------- Canal ao vivo: pedidos para o Mestre e efeitos no mapa ----------
  const showFx = useCallback(({ tokenId, text, color, blood }) => {
    if (text) engineRef.current?.showFloatingText(tokenId, text, color);
    // Sangue: quanto mais dano em relação à Vitalidade do alvo, mais sangue.
    if (blood?.intensity > 0) engineRef.current?.blood?.splash(tokenId, blood);
  }, [engineRef]);

  useEffect(() => {
    const channel = supabase.channel(`attacks_${roomId}`)
      .on('broadcast', { event: 'fx' }, ({ payload }) => showFx(payload))
      .on('broadcast', { event: 'anim' }, ({ payload }) => engineRef.current?.playAttack(payload))
      .on('broadcast', { event: 'config' }, ({ payload }) => setAutoDamage(Boolean(payload.autoDamage)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setAutoDamage(Boolean(payload.new?.hud_settings?.auto_damage));
        setDefenderChoice(payload.new?.hud_settings?.defender_choice !== false);
      })
      // Defensor escolhe a defesa: pedido (para quem controla o alvo) e resposta (para quem ataca).
      .on('broadcast', { event: 'defense_request' }, ({ payload }) => {
        const mine = payload.decider === 'gm' ? isGM : payload.decider === playerId;
        if (mine) setDefenseRequests((list) => [...list.filter((r) => r.id !== payload.id), payload]);
      })
      .on('broadcast', { event: 'defense_reply' }, ({ payload }) => {
        resolversRef.current.get(payload.id)?.(payload.defense);
      })
      .on('broadcast', { event: 'pending' }, ({ payload }) => {
        if (isGM) setPending((list) => [...list.filter((p) => p.id !== payload.id), payload]);
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [roomId, isGM, playerId, showFx]);

  /**
   * Pede a defesa para quem controla o alvo (pág. 255: a reação é do defensor).
   * options: [{ key, label, possivel, hit }] · chosen: a escolha da previsão (vale se eu mesmo decido).
   * Sem resposta em 30 s (ou se o atacante não quiser esperar): a melhor defesa possível.
   */
  const askDefense = useCallback(({ targetCharacter, attackerName, attackName, options, chosen }) => {
    const possible = options.filter((o) => o.possivel);
    // Kawarimi (1×/cena) só entra se o defensor escolher; a "melhor" automática não gasta.
    const best = [...possible].filter((o) => o.key !== 'kawarimi').sort((a, b) => a.hit - b.hit)[0]?.key || 'esquiva';
    const decider = targetCharacter.is_npc ? 'gm' : targetCharacter.owner_id;
    const iDecide = !defenderChoice || !decider || (decider === 'gm' ? isGM : decider === playerId);
    if (iDecide) return Promise.resolve(chosen || best);

    const id = uid();
    const expiresAt = Date.now() + 30000;
    return new Promise((resolve) => {
      const finish = (defense) => {
        if (!resolversRef.current.has(id)) return;
        resolversRef.current.delete(id);
        clearTimeout(timer);
        setWaiting((list) => list.filter((w) => w.id !== id));
        resolve(possible.some((o) => o.key === defense) ? defense : best);
      };
      const timer = setTimeout(() => finish(best), 30000);
      resolversRef.current.set(id, finish);
      setWaiting((list) => [...list, { id, targetName: targetCharacter.name, best, expiresAt }]);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'defense_request',
        payload: { id, decider, attackerName, attackName, targetName: targetCharacter.name, options, expiresAt },
      });
    });
  }, [defenderChoice, isGM, playerId]);

  const answerDefense = (request, defense) => {
    setDefenseRequests((list) => list.filter((r) => r.id !== request.id));
    channelRef.current?.send({ type: 'broadcast', event: 'defense_reply', payload: { id: request.id, defense } });
  };

  const skipWaiting = () => {
    waiting.forEach((w) => resolversRef.current.get(w.id)?.(w.best));
  };

  const broadcastFx = (fx) => {
    showFx(fx);
    channelRef.current?.send({ type: 'broadcast', event: 'fx', payload: fx });
  };

  /** Animação do ataque para todos; espera o golpe "chegar" antes de mostrar o dano. */
  const playAnim = async (anim) => {
    if (!anim.from || !anim.to?.length) return;
    engineRef.current?.playAttack(anim);
    channelRef.current?.send({ type: 'broadcast', event: 'anim', payload: anim });
    // Espera a animação "chegar" no alvo antes de mostrar o dano.
    const WAIT = { enxame: 1000, raio: 200, corte_jutsu: 280, golpe: 560, corte: 380, estocada: 320, pancada: 520, arremesso: 450, flecha: 380, explosao: 560 };
    const wait = WAIT[anim.shape] ?? 560;
    await new Promise((resolve) => setTimeout(resolve, wait + (anim.to.length - 1) * 160));
  };

  const postChat = (message) => supabase.from('room_messages').insert({ room_id: roomId, player_name: '⚔️ Combate', message, is_roll: true });

  // ---------- Fluxo do ataque ----------
  const actorTokenId = useMemo(() => {
    if (!currentCombatant) return null;
    if (currentCombatant.token_id) return currentCombatant.token_id;
    const tokens = Object.values(engineRef.current?.tokens || {});
    return tokens.find((t) => t.data.character_id === currentCombatant.character_id)?.data.id || null;
  }, [currentCombatant, engineRef]);

  /**
   * Flanquear (pág. 263): atacante e um aliado em lados opostos do alvo, os dois colados nele.
   * Só vale para quem está flanqueando, e só corpo a corpo.
   */
  const isFlanked = (targetTokenId) => {
    const engine = engineRef.current;
    const g = engine?.gridSize || 64;
    const attackerToken = engine?.tokens[actorTokenId];
    const targetToken = engine?.tokens[targetTokenId];
    if (!attackerToken || !targetToken) return false;
    const cell = (t) => ({ c: Math.floor(t.container.x / g), r: Math.floor(t.container.y / g) });
    const a = cell(attackerToken);
    const t = cell(targetToken);
    if (Math.max(Math.abs(a.c - t.c), Math.abs(a.r - t.r)) !== 1) return false;
    const opposite = { c: 2 * t.c - a.c, r: 2 * t.r - a.r };
    const sideOf = (token) => Boolean(engine.characters[token.data.character_id]?.is_npc);
    const mySide = sideOf(attackerToken);
    return Object.values(engine.tokens).some((token) => {
      if (token === attackerToken || token === targetToken || token.mode === 'prop' || !token.data.character_id) return false;
      const c = cell(token);
      return c.c === opposite.c && c.r === opposite.r && sideOf(token) === mySide;
    });
  };

  const chooseAttack = (option) => {
    if (!actorTokenId) {
      alert('O token deste personagem não está no mapa.');
      return;
    }
    setAttack(option);
    setStep('targeting');
    engineRef.current?.startTargeting({
      attackerTokenId: actorTokenId,
      rangeBlocks: option.modo.alcanceBlocos || 1,
      isValid: (tokenData) => Boolean(tokenData.character_id) && tokenData.id !== actorTokenId,
      onPick: async (tokenData) => {
        const { data } = await supabase.from('characters').select('*').eq('id', tokenData.character_id).single();
        if (!data) { setStep('attacks'); return; }
        setTarget({ token: tokenData, character: data, flanked: isFlanked(tokenData.id) });
        setDefense('esquiva');
        setStep('forecast');
      },
      onCancel: () => setStep('attacks'),
    });
  };

  // Ficha do alvo já com tamanho e flanquear aplicados.
  const aptIds = useMemo(() => {
    const sheet = actor?.attributes || {};
    return [...(sheet.aptidoes_gratuitas_list || []), ...(sheet.aptidoes_extra_list || [])].map((a) => a?.id);
  }, [actor]);
  const alvoIndefeso = Boolean(target && limitesDoTurno(condicoesDe(target.character)).autoSucesso);
  const situation = useMemo(() => {
    if (!attack || !target || !profile) return null;
    const cc = attack.modo.tipo === 'cc';
    const defensivaApt = aptIds.includes('combate_defensivo');
    // Cobertura parcial do alvo (pág. 273): +3 na defesa = −3 no ataque.
    const bonusAtaque = (opcoes.defensiva && cc ? (defensivaApt ? -2 : -3) : 0) + (opcoes.investida && cc ? 1 : 0) + (opcoes.cobertura ? -3 : 0);
    return applySituation(profile, attack.modo, combatProfile(target.character), {
      flanked: target.flanked,
      bonusAtaque,
      desprevenido: Boolean(opcoes.furtivo),
      autoCritico: Boolean(opcoes.misericordia && alvoIndefeso),
    });
  }, [attack, target, profile, opcoes, aptIds, alvoIndefeso]);
  const targetProfile = situation?.target || null;
  const forecasts = useMemo(() => {
    if (!situation) return null;
    return Object.fromEntries(DEFENSES.map((d) => [d.key, forecast({ modo: situation.modo, maxGrau: profile.maxGrau, target: situation.target, defense: d.key })]));
  }, [situation, profile]);

  const applyResult = async (res) => {
    const { data: fresh } = await supabase.from('characters').select('*').eq('id', res.targetCharacterId).single();
    if (!fresh) return null;
    const update = damageUpdate(fresh, res.dano, { critico: res.critico });
    // Kikai Ninpou / Kikaichuu: drena chakra do alvo (pode ficar abaixo de zero, pág. 144).
    const drenar = Number(res.drenar || 0);
    const chakraBefore = Number(fresh.chakra_current ?? 0);
    if (drenar) update.patch.chakra_current = chakraBefore - drenar;
    const what = [res.dano ? `−${res.dano} VIT` : null, drenar ? `−${drenar} CK` : null].filter(Boolean).join(' ') || 'sem dano';
    const { error } = await trackedUpdate(fresh.id, update.patch, `${fresh.name}: ${what}`);
    if (error) { alert('Erro ao aplicar o dano: ' + error.message); return null; }
    const state = vitalityState(update.hpAfter);
    const parts = [];
    if (res.dano) parts.push(`${res.critico ? 'CRÍTICO ' : ''}−${res.dano}`);
    if (drenar) parts.push(`−${drenar} CK`);
    const lost = Math.max(0, update.hpBefore - update.hpAfter);
    const intensity = bloodIntensity(lost, fresh.hp_max, { critico: res.critico, caiu: update.hpBefore > 0 && update.hpAfter <= 0 });
    const blood = intensity > 0 ? { intensity, critico: Boolean(res.critico), fromTokenId: res.attackerTokenId || null } : null;
    if (parts.length) broadcastFx({ tokenId: res.targetTokenId, text: parts.join(' '), color: res.critico ? 0xfacc15 : res.dano ? 0xff4444 : 0xa78bfa, blood });
    const msg = [];
    if (res.dano) msg.push(`${res.dano} de dano${update.absorbed ? ` (${update.absorbed} na armadura)` : ''}. Vitalidade ${update.hpBefore} → ${update.hpAfter}${state ? ` · ${state}` : ''}${res.critico ? ' · sangrando' : ''}`);
    if (drenar) msg.push(`${drenar} de chakra drenado. Chakra ${chakraBefore} → ${chakraBefore - drenar}${chakraBefore - drenar < 0 ? ' (abaixo de zero: risco de morte, pág. 144)' : ''}`);
    await postChat(`${res.attackerName} → ${res.targetName}: ${msg.join(' · ') || 'sem dano'}.`);
    return update;
  };

  const doAttack = async () => {
    if (!attack || !target || !profile || !targetProfile || busy) return;
    setBusy(true);

    // Golpear e Lançar Projétil são ações Padrão (págs. 263–264).
    // Investida e Golpe de Misericórdia são ações Completas (Padrão + Movimento).
    const completa = (opcoes.investida && attack.modo.tipo === 'cc') || (opcoes.misericordia && alvoIndefeso);
    let nextActions = registerAction('padrao', actionState, strict);
    if (nextActions && completa && freeSlots(nextActions).includes('movimento')) {
      // Investida: a corrida até o alvo usa o Movimento (se ainda não andou).
      nextActions = { ...nextActions, log: [...nextActions.log, { type: 'movimento', slots: ['movimento'], blocks: 0 }] };
    } else if (nextActions && opcoes.misericordia && alvoIndefeso && strict && !freeSlots(actionState).includes('movimento')) {
      alert('Golpe de misericórdia é uma ação Completa: precisa da Padrão e do Movimento livres.');
      setBusy(false);
      return;
    }
    if (!nextActions) {
      alert('Sem ação Padrão disponível nesta rodada.');
      setBusy(false);
      return;
    }
    await onActionsSaved(currentCombatant, nextActions);
    await aplicarPosturas();
    // Kyoudo Kyouka: o chakra concentrado é liberado no golpe, acertando ou não (pág. 80).
    if (attack.modo.consomeModo) {
      const { data: eu } = await supabase.from('characters').select('active_modes').eq('id', actor.id).single();
      const restantes = (eu?.active_modes || []).filter((m) => !m[attack.modo.consomeModo]);
      await trackedUpdate(actor.id, { active_modes: restantes }, `${actor.name}: ${attack.nome}`);
    }

    setStep('waiting');
    const usedDefense = await askDefense({
      targetCharacter: target.character,
      attackerName: actor.name,
      attackName: attack.nome,
      chosen: defense,
      options: [
        ...DEFENSES.map((d) => ({ key: d.key, label: d.label, possivel: d.key !== 'bloqueio' || (targetProfile.defenses.bloqueio.possivel && !attack.modo.semBloqueio), hit: forecasts[d.key].hit })),
        { key: 'kawarimi', label: 'Kawarimi', possivel: podeKawarimi(target.character).ok && !opcoes.misericordia, hit: 0 },
      ],
    });

    // Kawarimi no Jutsu (pág. 125): ninguém rola; o golpe acerta um tronco.
    let res;
    if (usedDefense === 'kawarimi' && await gastarKawarimi(target.character)) {
      res = { attackDice: [0, 0], attackTotal: 0, defenseRolls: [], defenseTotal: null, hit: false, critico: false, falhaCritica: false, grau: 0, dano: 0, reason: `Kawarimi! ${target.character.name} trocou de lugar com um tronco e pode andar até o deslocamento dele.`, kawarimi: true };
    } else {
      res = resolveAttack({ modo: situation.modo, maxGrau: profile.maxGrau, target: targetProfile, defense: usedDefense === 'kawarimi' ? 'esquiva' : usedDefense });
    }
    const playing = playAnim({ from: actorTokenId, to: [target.token.id], ...fxFor({ tipo: attack.modo.tipo, arma: attack.arma }), hit: [res.hit] });
    const label = `Ataque: ${attack.nome} → ${target.character.name}`;
    if (!res.kawarimi) {
      const row = buildRollRow({ roomId, playerId, playerName, label, sides: 8, dice: res.attackDice, modifier: situation.modo.precisao });
      onTriggerRoll?.({ label, formula: row.formula, sides: 8, rolls: res.attackDice, finalResult: row.total, playerName: row.player_name });
      await supabase.from('room_rolls').insert(row);
    }
    const last = res.defenseRolls[res.defenseRolls.length - 1];
    if (last) {
      const defLabel = `Defesa (${usedDefense === 'bloqueio' ? 'Bloquear' : 'Antecipar'}): ${target.character.name}`;
      await supabase.from('room_rolls').insert(buildRollRow({ roomId, playerId, playerName: target.character.name, label: defLabel, sides: 8, dice: last.dice, modifier: usedDefense === 'bloqueio' ? targetProfile.defenses.bloqueio.precisao : targetProfile.defenses.antecipar.precisao }));
    }

    await playing;
    const full = {
      ...res,
      id: uid(),
      attackerName: actor.name,
      targetName: target.character.name,
      targetCharacterId: target.character.id,
      targetTokenId: target.token.id,
      attackerTokenId: actorTokenId,
      weapon: attack.nome,
      danoBase: attack.modo.danoBase,
    };

    if (!res.hit) {
      broadcastFx({ tokenId: target.token.id, text: res.kawarimi ? 'Kawarimi!' : res.falhaCritica ? 'Falha crítica!' : usedDefense === 'esquiva' ? 'Esquivou!' : usedDefense === 'bloqueio' ? 'Bloqueou!' : 'Antecipou!', color: 0xd4d4d8 });
      await postChat(`${actor.name} atacou ${target.character.name} com ${attack.nome}: ${res.reason}`);
      setResult({ ...full, applied: true });
    } else if (autoDamage || isGM) {
      await postChat(`${actor.name} atacou ${target.character.name} com ${attack.nome}: ${res.reason} Grau ${res.grau}.`);
      const update = await applyResult(full);
      if (opcoes.misericordia && alvoIndefeso) await testeMisericordia(target.character);
      setResult({ ...full, applied: Boolean(update), hpAfter: update?.hpAfter });
    } else {
      // O Mestre confirma antes de mexer na Vitalidade.
      await postChat(`${actor.name} atacou ${target.character.name} com ${attack.nome}: ${res.reason} Grau ${res.grau} → ${res.dano} de dano (aguardando o Mestre).`);
      channelRef.current?.send({ type: 'broadcast', event: 'pending', payload: full });
      setResult({ ...full, applied: false });
    }
    setStep('result');
    setBusy(false);
  };

  /** Kawarimi: 1 de chakra e a ação de Movimento do defensor nesta rodada; marca o uso na cena. */
  async function gastarKawarimi(defensor) {
    const { data: fresh } = await supabase.from('characters').select('chakra_current, active_modes, name').eq('id', defensor.id).single();
    if (!fresh || Number(fresh.chakra_current ?? 0) < 1) return false;
    const { data: linha } = await supabase.from('room_combat').select('id, actions').eq('room_id', roomId).eq('character_id', defensor.id).maybeSingle();
    if (linha && strict) {
      const next = registerAction('movimento', actionsForRound(linha.actions, combatState.round), true);
      if (!next) {
        await postChat(`${fresh.name} não tem ação de Movimento sobrando para o Kawarimi.`);
        return false;
      }
      await supabase.from('room_combat').update({ actions: next }).eq('id', linha.id);
    }
    const modes = Array.isArray(fresh.active_modes) ? fresh.active_modes : [];
    await trackedUpdate(defensor.id, {
      chakra_current: Number(fresh.chakra_current) - 1,
      active_modes: [...modes, { id: uid(), name: 'Kawarimi usado (cena)', turns: null, drain: { chakra: 0, hp: 0 }, kawarimi: true }],
    }, `${fresh.name}: Kawarimi`);
    return true;
  }

  /** Depois de atacar: posturas que ficam até o próximo turno de quem atacou. */
  async function aplicarPosturas() {
    const cc = attack?.modo.tipo === 'cc';
    const novas = [];
    if (opcoes.defensiva && cc) novas.push(aptIds.includes('combate_defensivo') ? 'defensiva_apt' : 'defensiva');
    if (opcoes.investida && cc) novas.push('investida');
    if (!novas.length) return;
    const { data: fresh } = await supabase.from('characters').select('active_modes').eq('id', actor.id).single();
    const modes = (Array.isArray(fresh?.active_modes) ? fresh.active_modes : []).filter((m) => !novas.includes(m.condicao));
    await trackedUpdate(actor.id, { active_modes: [...modes, ...novas.map((id) => novaCondicao(id, 1, uid))] }, `${actor.name}: ${novas.join(', ')}`);
  }

  /** Golpe de misericórdia (pág. 263): a vítima testa Vigor (dif 10) ou morre/desmaia. Capangas não testam. */
  async function testeMisericordia(alvo) {
    const capanga = alvo.attributes?.npc?.type === 'capanga';
    if (capanga) {
      await postChat(`Golpe de misericórdia: ${alvo.name} (capanga) não tem direito ao teste — morre ou desmaia, à escolha de ${actor.name}.`);
      return;
    }
    const vigor = Number(alvo.attributes?.attributes?.vigor || 0);
    const dados = rollDice(2, 8);
    const soma = dados[0] + dados[1];
    const ok = soma >= 15 || (soma > 3 && soma + vigor >= 10);
    await postChat(`Golpe de misericórdia: ${alvo.name} testa Vigor ${dados.join('+')} + ${vigor} = ${soma + vigor} contra 10 → ${ok ? 'resistiu' : `falhou: morre ou desmaia, à escolha de ${actor.name}`}.`);
  }

  const resetFlow = () => {
    setOpcoes({});
    engineRef.current?.cancelTargeting();
    setStep('menu');
    setAttack(null);
    setTarget(null);
    setResult(null);
  };

  // ---------- Mestre: confirmar ataques dos jogadores ----------
  const resolvePending = async (item, dano) => {
    setPending((list) => list.filter((p) => p.id !== item.id));
    if (dano === null) {
      await postChat(`O Mestre anulou o dano de ${item.attackerName} em ${item.targetName}.`);
      return;
    }
    await applyResult({ ...item, dano });
  };

  // ---------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------

  const gmPending = (defenseRequests.length > 0 || (isGM && pending.length > 0)) && (
    <div className="pointer-events-auto absolute right-16 top-2 z-30 w-72 max-w-[calc(100%-5rem)] space-y-2">
      {defenseRequests.map((request) => (
        <DefenseRequestCard key={request.id} request={request} onAnswer={answerDefense}
          onExpire={() => setDefenseRequests((list) => list.filter((r) => r.id !== request.id))} />
      ))}
      {isGM && pending.map((item) => <PendingCard key={item.id} item={item} onResolve={resolvePending} />)}
    </div>
  );

  if (!canAct || !profile) return gmPending || null;

  const deslocBlocks = deslocamentoBlocos(actor);
  const jutsuCount = jutsuList(actor).length;
  const moveLeft = movementBudget(actionState, deslocBlocks).total;

  return (
    <>
      {gmPending}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-2 md:pl-[calc(var(--vtt-left,0px)+0.5rem)] md:pr-[calc(var(--vtt-right,0px)+0.5rem)]">
        <div className="pointer-events-auto w-full max-w-xl rounded-xl border-2 border-zinc-700 bg-zinc-950/95 text-zinc-100 shadow-[0_10px_40px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(236,106,15,0.5)] backdrop-blur">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Turno de</p>
              <p className="titulo-shinobi truncate text-xl leading-tight text-zinc-50">{actor.name}</p>
            </div>
            <div className="flex items-center gap-1">
              {['padrao', 'movimento', 'parcial'].map((slot) => (
                <span key={slot} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${free.includes(slot) ? 'bg-emerald-900/60 text-emerald-200' : 'bg-zinc-800 text-zinc-600 line-through'}`}>
                  {ACTION_TYPES[slot].label}
                </span>
              ))}
              {isGM && (
                <button type="button" onClick={toggleAutoDamage} title="Quando um jogador acerta: o dano entra sozinho ou você confirma antes"
                  className={`ml-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${autoDamage ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'}`}>
                  {autoDamage ? 'Dano automático' : 'Mestre confirma'}
                </button>
              )}
              <button type="button" onClick={() => setMinimized(!minimized)} className="ml-1 px-1 text-zinc-400 hover:text-white" title={minimized ? 'Abrir' : 'Minimizar'}>{minimized ? '▲' : '▼'}</button>
            </div>
          </div>

          {!minimized && <div className="max-h-[60dvh] overflow-y-auto p-3">
            {waiting.length > 0 && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-700 bg-amber-950/40 p-2 text-xs">
                <span>🛡️ Esperando a defesa de <b>{waiting.map((w) => w.targetName).join(', ')}</b>… <Countdown until={Math.max(...waiting.map((w) => w.expiresAt))} /></span>
                <button type="button" onClick={skipWaiting} className="shrink-0 rounded border border-amber-600 px-2 py-1 font-bold text-amber-200 hover:bg-amber-900/50">Usar a melhor</button>
              </div>
            )}
            {step === 'menu' && condicoes.length > 0 && (
              <div className="mb-2 rounded-lg border border-red-800/70 bg-red-950/40 p-2 text-[11px] text-red-100">
                <p className="font-bold">{condicoes.map((c) => `${c.icone} ${c.nome}`).join(' · ')}</p>
                {limites.semAcoes && <p>Sem ações neste turno (só reações, como Esquivar).</p>}
                {!limites.semAcoes && limites.semMovimento && <p>Perdeu a ação de Movimento (pode trocar a Padrão por Movimento).</p>}
                {limites.semAtaque && <p>Não pode atacar.</p>}
                {limites.deslocamento === 0 && <p>Não pode sair do lugar.</p>}
                {limites.deslocamento > 0 && limites.deslocamento < 1 && <p>Anda metade do deslocamento.</p>}
                <p className="text-red-200/60">Penalidades já entram nos testes (máx. −3 por teste).</p>
              </div>
            )}
            {step === 'menu' && (
              <div className="grid grid-cols-2 gap-2">
                <BigButton icon="⚔️" label="Atacar" sub={limites.semAtaque && strict ? `${limites.motivo}: não ataca` : canStandard ? 'Ação Padrão' : 'Sem ação Padrão'} disabled={!canStandard} onClick={() => setStep('attacks')} />
                <BigButton icon="👣" label="Mover" sub={strict ? `Até ${moveLeft} blocos` : `${deslocBlocks} bl. por Movimento`}
                  onClick={() => alert(`Arraste ${actor.name} no mapa, ou toque nele e marque o caminho bloco a bloco.\n\nDeslocamento: ${deslocBlocks} blocos por ação de Movimento${strict ? ` · restam ${moveLeft} nesta rodada.` : '.'}`)} />
                <BigButton icon="🌀" label="Jutsus" sub={`${jutsuCount} na ficha · Chakra ${actor.chakra_current ?? 0}`} disabled={!jutsuCount} onClick={() => setStep('jutsus')} />
                <BigButton icon="🥷" label="Manobras" sub="Fintar, Agarrar, Defesa total…" onClick={() => setStep('manobras')} />
              </div>
            )}

            {step === 'manobras' && (
              <ManobrasPanel
                actor={actor}
                profile={profile}
                engineRef={engineRef}
                actionState={actionState}
                strict={strict}
                currentCombatant={currentCombatant}
                onActionsSaved={onActionsSaved}
                postChat={postChat}
                onBack={resetFlow}
              />
            )}

            {step === 'jutsus' && (
              <JutsuPanel
                roomId={roomId}
                playerId={playerId}
                playerName={playerName}
                actor={actor}
                profile={profile}
                engineRef={engineRef}
                actorTokenId={actorTokenId}
                actionState={actionState}
                strict={strict}
                isGM={isGM}
                autoDamage={autoDamage}
                currentCombatant={currentCombatant}
                onActionsSaved={onActionsSaved}
                onTriggerRoll={onTriggerRoll}
                applyResult={applyResult}
                postChat={postChat}
                broadcastFx={broadcastFx}
                sendPending={(full) => channelRef.current?.send({ type: 'broadcast', event: 'pending', payload: full })}
                isFlanked={isFlanked}
                askDefense={askDefense}
                playAnim={playAnim}
                onClose={async () => {
                  engineRef.current?.cancelTargeting();
                  // Recarrega a ficha (chakra gasto, modos ativos).
                  const { data } = await supabase.from('characters').select('*').eq('id', actor.id).single();
                  if (data) setActor(data);
                  setStep('menu');
                }}
              />
            )}

            {step === 'attacks' && (
              <div className="space-y-1">
                <BackButton onClick={resetFlow} />
                {profile.attacks.map((option) => (
                  <button key={option.key} type="button" onClick={() => chooseAttack(option)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left hover:border-red-600">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">⚔️ {option.nome}</span>
                      <span className="block truncate text-[11px] text-zinc-400">{option.modo.rotulo} · alcance {option.modo.alcanceBlocos} bl.{option.modo.avisos?.length ? ` · ⚠ ${option.modo.avisos[0]}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black text-red-300">2d8+{option.modo.precisao}</span>
                      <span className="block text-[11px] text-zinc-400">dano base {option.modo.danoBase}</span>
                    </span>
                  </button>
                ))}
                {!profile.attacks.length && <p className="text-xs text-zinc-500">Nenhum ataque na ficha. Adicione armas na aba Equipamento.</p>}
              </div>
            )}

            {step === 'targeting' && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm"><b className="text-amber-300">Escolha o alvo no mapa.</b> <span className="text-zinc-400">Blocos vermelhos = alcance de {attack?.nome} ({attack?.modo.alcanceBlocos} bl.).</span></p>
                <button type="button" onClick={() => { engineRef.current?.cancelTargeting(); setStep('attacks'); }} className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-white">Cancelar</button>
              </div>
            )}

            {step === 'forecast' && forecasts && (
              <>
              <OpcoesAtaque
                opcoes={opcoes}
                onChange={setOpcoes}
                cc={attack.modo.tipo === 'cc'}
                alvoIndefeso={alvoIndefeso}
                movimentoLivre={freeSlots(actionState).includes('movimento')}
                combateDefensivo={aptIds.includes('combate_defensivo')}
              />
              <Forecast
                attackerName={actor.name}
                attack={{ ...attack, modo: situation.modo }}
                notes={situation.notes}
                target={target}
                targetProfile={targetProfile}
                forecasts={forecasts}
                defense={defense}
                onDefense={setDefense}
                busy={busy}
                onConfirm={doAttack}
                onBack={() => chooseAttack(attack)}
              />
              </>
            )}

            {step === 'waiting' && !waiting.length && <p className="text-center text-xs text-zinc-400">Rolando o ataque…</p>}

            {step === 'result' && result && (
              <div className="space-y-2">
                <div className={`rounded-lg border p-3 ${result.critico ? 'border-amber-600 bg-amber-950/40' : result.hit ? 'border-red-800 bg-red-950/30' : 'border-zinc-700 bg-zinc-900'}`}>
                  {!result.kawarimi && <p className="text-xs text-zinc-400">Dados [{result.attackDice.join(', ')}] → {result.attackTotal}</p>}
                  <p className="text-sm font-bold">{result.reason}</p>
                  {result.hit && <p className="mt-1 text-lg">Grau {result.grau}: <b className="text-red-300">{result.dano}</b> de dano</p>}
                  {result.hit && !result.applied && <p className="text-xs text-amber-300">Aguardando o Mestre confirmar o dano.</p>}
                  {result.hit && result.applied && result.hpAfter != null && <p className="text-xs text-zinc-400">{result.targetName} ficou com {result.hpAfter} de Vitalidade.</p>}
                </div>
                <button type="button" onClick={resetFlow} className="w-full rounded-lg bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700">OK</button>
              </div>
            )}
          </div>}
        </div>
      </div>
    </>
  );
}

/** Manobras que vão junto com o ataque (págs. 261–265). */
function OpcoesAtaque({ opcoes, onChange, cc, alvoIndefeso, movimentoLivre, combateDefensivo }) {
  const itens = [
    cc && { key: 'defensiva', label: 'Lutar na defensiva', dica: `${combateDefensivo ? '−2' : '−3'} no ataque, ${combateDefensivo ? '+3' : '+2'} de Esquiva até seu próximo turno` },
    cc && { key: 'investida', label: 'Investida', dica: 'Ação Completa: corre em linha reta (mín. 3 m) e ataca com +1; −1 na defesa até seu próximo turno', aviso: !movimentoLivre ? 'você já usou o Movimento: conta como a corrida' : '' },
    { key: 'furtivo', label: 'Ataque furtivo', dica: 'Venceu Furtividade contra o alvo: ele fica desprevenido (−3 na defesa, sem bônus de Esquiva)' },
    { key: 'cobertura', label: 'Alvo com cobertura parcial', dica: 'Atrás de árvore, pilastra ou criatura maior desde antes do ataque: +3 na defesa dele (cobertura total: projéteis e golpes não passam)' },
    alvoIndefeso && { key: 'misericordia', label: 'Golpe de misericórdia', dica: 'Ação Completa contra alvo indefeso: crítico automático; depois ele testa Vigor 10 ou morre/desmaia' },
  ].filter(Boolean);
  return (
    <div className="mb-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-[11px]">
      <p className="font-bold text-zinc-400">Manobras (opcional)</p>
      {itens.map((item) => (
        <label key={item.key} className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-orange-500" checked={Boolean(opcoes[item.key])}
            onChange={(e) => onChange({ ...opcoes, [item.key]: e.target.checked, ...(item.key === 'defensiva' && e.target.checked ? { investida: false } : {}), ...(item.key === 'investida' && e.target.checked ? { defensiva: false } : {}) })} />
          <span><b className="text-zinc-100">{item.label}</b> <span className="text-zinc-400">— {item.dica}</span>{item.aviso && opcoes[item.key] ? <span className="text-amber-300"> ({item.aviso})</span> : null}</span>
        </label>
      ))}
    </div>
  );
}

/** Contagem regressiva em segundos. */
function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-amber-300">{Math.max(0, Math.ceil((until - now) / 1000))}s</span>;
}

/** Card para quem controla o alvo escolher a defesa. */
function DefenseRequestCard({ request, onAnswer, onExpire }) {
  useEffect(() => {
    const timer = setTimeout(onExpire, Math.max(0, request.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [request.expiresAt, onExpire]);

  return (
    <div className="rounded-xl border-2 border-amber-500 bg-zinc-950/95 p-3 text-zinc-100 shadow-2xl">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">🛡️ Defenda-se! <Countdown until={request.expiresAt} /></p>
      <p className="text-sm"><b>{request.attackerName}</b> ataca <b>{request.targetName}</b> com {request.attackName}.</p>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {request.options.map((o) => (
          <button key={o.key} type="button" disabled={!o.possivel} onClick={() => onAnswer(request, o.key)}
            title={o.possivel ? `Chance de ser acertado: ${pct(o.hit)}` : 'Não dá para usar contra este ataque'}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-1 py-1.5 text-center hover:border-amber-500 disabled:opacity-30">
            <span className="block text-xs font-black">{o.label}</span>
            <span className="block text-[10px] text-zinc-400">{o.possivel ? `acerta ${pct(o.hit)}` : '—'}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">Sem resposta, entra a defesa com menor chance de ser acertado.</p>
    </div>
  );
}

function BigButton({ icon, label, sub, disabled = false, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex items-center gap-3 rounded-lg border-2 border-zinc-700 bg-zinc-900 px-3 py-3 text-left transition hover:border-red-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35">
      <span className="text-2xl">{icon}</span>
      <span>
        <span className="block text-base font-black">{label}</span>
        <span className="block text-[11px] text-zinc-400">{sub}</span>
      </span>
    </button>
  );
}

function BackButton({ onClick }) {
  return <button type="button" onClick={onClick} className="mb-1 text-xs font-bold text-zinc-400 hover:text-white">← Voltar</button>;
}

/** Previsão do ataque, lado a lado (atacante × alvo). */
function Forecast({ attackerName, attack, notes = [], target, targetProfile, forecasts, defense, onDefense, busy, onConfirm, onBack }) {
  const f = forecasts[defense];
  const hp = Number(target.character.hp_current ?? target.character.hp_max ?? 0);
  const hpMax = Number(target.character.hp_max || hp || 1);
  const after = hp - f.likelyDamage;
  const canBlock = targetProfile.defenses.bloqueio.possivel && !attack?.modo.semBloqueio;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-sky-800 bg-sky-950/40 p-2">
          <p className="truncate font-black text-sky-200">{attackerName}</p>
          <p className="text-zinc-400">{attack.nome} · {attack.modo.rotulo}</p>
          <p>Precisão <b>2d8+{attack.modo.precisao}</b></p>
          <p>Dano base <b>{attack.modo.danoBase}</b></p>
        </div>
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-2">
          <p className="truncate font-black text-red-200">{target.character.name}</p>
          <p className="text-zinc-400">Vitalidade {hp}/{hpMax}</p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, (Math.max(0, after) / hpMax) * 100))}%` }} />
          </div>
          <p className="mt-0.5">Se acertar (grau {f.likelyGrade}): <b>{hp} → {after}</b></p>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {notes.map((note) => <span key={note} className="rounded bg-violet-950/60 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">{note}</span>)}
        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Defesa do alvo</p>
        <div className="grid grid-cols-3 gap-1">
          {DEFENSES.map((d) => {
            const disabled = d.key === 'bloqueio' && !canBlock;
            return (
              <button key={d.key} type="button" disabled={disabled} title={disabled ? 'Precisa de arma ou manopla para bloquear' : d.hint} onClick={() => onDefense(d.key)}
                className={`rounded border px-1 py-1.5 text-center text-xs ${defense === d.key ? 'border-amber-500 bg-amber-950/50 text-amber-100' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'} disabled:opacity-30`}>
                <span className="block font-bold">{d.label}</span>
                <span className="block text-[10px] text-zinc-400">{d.key === 'esquiva' ? `Dif ${targetProfile.defenses.esquiva.dificuldade}` : `2d8+${d.key === 'bloqueio' ? targetProfile.defenses.bloqueio.precisao : targetProfile.defenses.antecipar.precisao}`}</span>
                <span className="block font-black">{pct(forecasts[d.key].hit)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <Stat label="Acertar" value={pct(f.hit)} />
        <Stat label="Crítico" value={pct(f.crit)} />
        <Stat label="Dano médio" value={f.expected.toFixed(1)} />
      </div>
      <p className="text-[10px] text-zinc-500">
        Dano por grau: {[1, 2, 3, 4].map((g) => `${g}×=${f.damageOf(g)}`).join(' · ')}. Falha crítica (2 ou 3 nos dados): {pct(f.fumble)}.
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="rounded-lg border border-zinc-700 px-3 text-sm text-zinc-300 hover:text-white">← Outro alvo</button>
        <button type="button" onClick={onConfirm} disabled={busy} className="flex-1 rounded-lg bg-red-700 py-2.5 text-base font-black text-white hover:bg-red-600 disabled:opacity-50">
          {busy ? 'Rolando…' : '⚔️ Atacar!'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 py-1">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}

/** Card do Mestre: confirmar (ou mudar) o dano que um jogador causou. */
function PendingCard({ item, onResolve }) {
  const [value, setValue] = useState(item.dano);
  return (
    <div className="rounded-lg border-2 border-amber-600 bg-zinc-950/95 p-3 text-xs text-zinc-100 shadow-2xl">
      <p className="font-black text-amber-300">Confirmar dano</p>
      <p><b>{item.attackerName}</b> → <b>{item.targetName}</b> ({item.weapon})</p>
      <p className="text-zinc-400">Dados [{item.attackDice.join(', ')}] → {item.attackTotal} · Grau {item.grau}{item.critico ? ' · CRÍTICO (sangrando)' : ''}</p>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-zinc-400">Dano</label>
        <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))}
          className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm font-bold text-white" />
        <button type="button" onClick={() => onResolve(item, value)} className="flex-1 rounded bg-emerald-700 py-1.5 font-bold text-white hover:bg-emerald-600">Aplicar</button>
        <button type="button" onClick={() => onResolve(item, null)} className="rounded border border-zinc-700 px-2 py-1.5 text-zinc-300 hover:text-white">Anular</button>
      </div>
    </div>
  );
}
