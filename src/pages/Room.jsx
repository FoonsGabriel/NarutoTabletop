import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase/client';
import { buildRollRow, rollDice } from '../services/Rolls';
import { actionsForRound, initiativeBonus, perdaPorCondicao, rollTiebreak } from '../services/Combat';
import { deslocamentoBlocos, movementBudget, spendMovement } from '../services/Movement';
import { condicoesDe, limitesDoTurno } from '../data/Condicoes';
import { isNpcInstance } from '../services/Npc';
import { patchFog } from '../services/SceneEnv';
import { CanvasEngine } from '../canvas/Engine.js';
import Sidebar from '../components/Sidebar.jsx';
import DiceRollerAnimation from '../components/DiceRollerAnimation.jsx';
import AppearanceEditor from '../components/AppearanceEditor.jsx';
import TurnMenu from '../components/TurnMenu.jsx';
import TokenCard from '../components/TokenCard.jsx';
import GmAdjust from '../components/GmAdjust.jsx';
import UndoButton from '../components/UndoButton.jsx';
import InitiativeBar from '../components/InitiativeBar.jsx';
import { initUndo } from '../services/Undo';
import { getSfxVolume, isMuted, onMuteChange, setMuted, setSfxVolume } from '../services/Sfx';
import { aplicarMusica, encerrarMusica, liberarMusica, onMusica, setMudoMusica, setVolumeMusica } from '../services/Musica';

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [roomData, setRoomData] = useState(null);
  const [editingToken, setEditingToken] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [deletingToken, setDeletingToken] = useState(false);
  const [adjustCharacter, setAdjustCharacter] = useState(null); // Ajustes do Mestre (tamanho, deslocamento)
  const [activeRollAnimation, setActiveRollAnimation] = useState(null);

  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName') || 'Mestre';

  const isGM = Boolean(roomData && playerId && roomData.gm_id === playerId);

  // ---------------- Combate (para destacar no mapa quem está na vez) ----------------
  const [combatState, setCombatState] = useState({ active: false, turn: null, round: 0, strict: true });
  // Movimento em blocos: o mapa consulta o estado do combate por aqui (sempre o mais novo).
  const moveCtxRef = useRef({ combatState: { active: false }, combatants: [] });
  const [selectedToken, setSelectedToken] = useState(null); // card do personagem tocado no mapa
  // Painel lateral (Chat, Dados, Ficha…): no celular começa fechado e abre por cima do mapa.
  const [panelOpen, setPanelOpen] = useState(false); // menu ☰ (Chat, Ambientação, Tokens, Regras)
  const [unread, setUnread] = useState(0);              // mensagens novas com o menu fechado
  const [dangerZone, setDangerZone] = useState(false);
  const [slowHint, setSlowHint] = useState(null); // FPS baixo: sugere o modo leve
  const [lowPower, setLowPower] = useState(() => {
    try { return window.localStorage.getItem('vtt_modo_leve') === '1'; } catch { return false; }
  });
  const [combatants, setCombatants] = useState([]);
  const turnTargetRef = useRef(null);
  const groundKeyRef = useRef(''); // qual mapa está carregado (para trocar ao vivo)

  // Desfazer do Mestre: ouve as ações de combate de todos na sala.
  useEffect(() => initUndo(id), [id]);

  useEffect(() => {
    let active = true;

    const loadCombatants = async () => {
      const { data } = await supabase.from('room_combat').select('*').eq('room_id', id);
      if (active) setCombatants(data || []);
    };

    supabase
      .from('rooms')
      .select('combat_active, combat_turn, combat_round, combat_strict, scene_env')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (active && data) setCombatState({ active: data.combat_active, turn: data.combat_turn, round: data.combat_round || 0, strict: data.combat_strict ?? true });
        if (active) aplicarMusica(data?.scene_env?.musica); // entrou na sala: já cai na música certa
      });
    loadCombatants();

    const channel = supabase
      .channel(`room_combat_map_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, (payload) => {
        setCombatState({ active: payload.new.combat_active, turn: payload.new.combat_turn, round: payload.new.combat_round || 0, strict: payload.new.combat_strict ?? true });
        engineRef.current?.setHud(payload.new.hud_settings); // Mestre mudou a visibilidade do HUD
        engineRef.current?.setSceneEnv(payload.new.scene_env); // clima e horário
        aplicarMusica(payload.new.scene_env?.musica);           // música da mesa

        // Mestre trocou o mapa (imagem única ou pedaços): recarrega só o chão, sem reiniciar a sala.
        const groundKey = JSON.stringify([payload.new.map_url, payload.new.map_layout]);
        if (groundKey !== groundKeyRef.current) {
          groundKeyRef.current = groundKey;
          engineRef.current?.reloadGround(payload.new);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_combat', filter: `room_id=eq.${id}` }, loadCombatants)
      // Exclusões chegam só com o id (sem room_id), então o filtro por sala as descartaria.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_combat' }, (payload) => {
        setCombatants((list) => list.filter((c) => c.id !== payload.old.id));
      })
      .subscribe();

    // Celular: o som só pode tocar depois de um toque na tela.
    window.addEventListener('pointerdown', liberarMusica);

    return () => {
      active = false;
      window.removeEventListener('pointerdown', liberarMusica);
      encerrarMusica();
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    moveCtxRef.current = { combatState, combatants };
  }, [combatState, combatants]);

  const currentCombatant = useMemo(
    () => (combatState.active ? combatants.find((c) => c.id === combatState.turn) ?? null : null),
    [combatState, combatants]
  );

  // Anel dourado no token de quem está na vez.
  useEffect(() => {
    turnTargetRef.current = currentCombatant
      ? { characterId: currentCombatant.character_id, tokenId: currentCombatant.token_id }
      : null;
    engineRef.current?.setTurnHighlight(turnTargetRef.current);
  }, [currentCombatant]);

  // Carrega os dados da mesa.
  useEffect(() => {
    if (!playerId) {
      navigate('/');
      return;
    }

    let cancelled = false;

    const loadRoom = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (error || !data) {
        alert('Mesa não encontrada: ' + (error?.message || ''));
        navigate('/lobby');
        return;
      }

      setRoomData(data);
    };

    loadRoom();

    return () => {
      cancelled = true;
    };
  }, [id, playerId, navigate]);

  // Inicializa o mapa e a sincronização em tempo real (tokens + fichas).
  useEffect(() => {
    if (!canvasRef.current || !roomData) return undefined;

    let isMounted = true;
    let channel = null;
    let marksChannel = null;

    const gmMode = roomData.gm_id === playerId;

    const engine = new CanvasEngine(canvasRef.current);
    engineRef.current = engine;
    engine.setTurnHighlight(turnTargetRef.current); // mantém o destaque se o mapa for recriado
    engine.setHud(roomData.hud_settings, gmMode);     // o que os jogadores veem acima dos tokens
    groundKeyRef.current = JSON.stringify([roomData.map_url, roomData.map_layout]);

    // Mestre move tudo; jogador só move tokens ligados à própria ficha.
    engine.canMoveToken = (tokenData) => {
      if (gmMode) return true;
      const owner = engine.characters[tokenData.character_id]?.owner_id;
      return Boolean(owner) && owner === playerId;
    };

    // Movimento em blocos (págs. 255 e 262): no combate, quem está no turno anda até o
    // deslocamento de cada ação de Movimento (a Padrão pode virar Movimento).
    // Regras do livro: trava no limite para todos, inclusive o Mestre (inimigos também
    // só andam na vez deles). Narrativo: mostra e registra, sem travar.
    engine.moveRules = (tokenData) => {
      const { combatState: cs, combatants: list } = moveCtxRef.current;
      if (!cs.active || tokenData.sprite?.mode === 'prop') return null;
      const combatant = list.find((c) => c.token_id === tokenData.id)
        || (tokenData.character_id ? list.find((c) => c.character_id === tokenData.character_id && !c.token_id) : null);
      if (!combatant) return null; // fora do combate: movimento livre

      const isTurn = combatant.id === cs.turn;
      const enforce = Boolean(cs.strict);
      if (!isTurn && enforce) return { canMove: false, reason: 'Ainda não é o turno deste personagem.' };
      if (!isTurn) return null; // narrativo fora do turno: livre, sem gastar ação

      const character = engine.characters[tokenData.character_id];
      const deslocBlocks = deslocamentoBlocos(character);
      const limites = limitesDoTurno(condicoesDe(character));
      if (enforce && deslocBlocks <= 0) return { canMove: false, reason: 'Impedido: não pode sair do lugar (condição).' };
      if (enforce && limites.semAcoes) return { canMove: false, reason: `${limites.motivo}: sem ações neste turno.` };
      const state = perdaPorCondicao(actionsForRound(combatant.actions, cs.round), limites);
      const budget = movementBudget(state, deslocBlocks);
      if (enforce && budget.total <= 0) return { canMove: false, reason: 'Sem ações de movimento nesta rodada.' };

      return {
        deslocBlocks,
        remaining: enforce ? budget.total : Infinity,
        strict: enforce,
        commit: async (blocks) => {
          const next = spendMovement(state, blocks, deslocBlocks, enforce);
          if (!next) return;
          setCombatants((rows) => rows.map((c) => (c.id === combatant.id ? { ...c, actions: next } : c)));
          const { error } = await supabase.from('room_combat').update({ actions: next }).eq('id', combatant.id);
          if (error) console.error('Erro ao registrar o movimento:', error);
        },
      };
    };

    // Pontos de luz: o painel de Cenário (aba Mestre) conversa com o mapa por eventos da janela.
    const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
    engine.onPlaceLight = (position) => emit('vtt:light-placed', position);
    engine.onMoveLight = (lightId, position) => emit('vtt:light-moved', { id: lightId, ...position });
    engine.onSelectLight = (lightId) => emit('vtt:light-selected', { id: lightId });
    // O Mestre vê a mudança de clima/luz na hora, sem esperar o Realtime voltar.
    const handleLocalEnv = (event) => engine.setSceneEnv(event.detail);
    const handleLightEdit = (event) => engine.setLightEditing(event.detail);
    window.addEventListener('vtt:scene-env-local', handleLocalEnv);
    window.addEventListener('vtt:light-edit', handleLightEdit);
    // Terreno difícil: o Mestre pinta no mapa e o painel de Ambientação salva.
    engine.onTerrainChange = (cells) => emit('vtt:terrain-painted', { cells });
    const handleTerrainEdit = (event) => engine.setTerrainEditing(event.detail);
    window.addEventListener('vtt:terrain-edit', handleTerrainEdit);

    // Névoa de guerra: os personagens dos jogadores descobrem o mapa; o Mestre salva.
    engine.isVisionToken = (tokenData) => {
      if (tokenData.sprite?.mode === 'prop') return false;
      const owner = engine.characters[tokenData.character_id]?.owner_id;
      return Boolean(owner) && owner !== roomData.gm_id;
    };
    engine.onFogChange = async (key, cells) => {
      const { error } = await patchFog(id, key, { cells });
      if (error) console.error('Erro ao salvar a névoa:', error);
    };
    const handleFogEdit = (event) => engine.setFogEditing(event.detail);
    window.addEventListener('vtt:fog-edit', handleFogEdit);

    // Desempenho: se ficar lento por alguns segundos, sugere o modo leve.
    engine.onSlow = (fps) => { if (isMounted) setSlowHint(fps); };

    // Toque/clique num token: abre o card do personagem.
    engine.onTokenTap = (tokenData) => {
      if (isMounted) setSelectedToken(tokenData);
    };

    // O menu só abre em tokens que o usuário pode controlar.
    engine.onTokenContextMenu = (tokenData, position) => {
      if (!isMounted) return;

      setContextMenu({
        token: tokenData,
        x: position.x,
        y: position.y,
      });
    };

    const loadInitialData = async () => {
      // Fichas primeiro: os tokens vinculados leem o HP delas.
      const [charactersResult, tokensResult] = await Promise.all([
        supabase.from('characters').select('*').eq('room_id', id),
        supabase.from('map_tokens').select('*').eq('room_id', id),
      ]);

      if (!isMounted) return;

      if (charactersResult.error) {
        console.error('Erro ao carregar fichas:', charactersResult.error);
      } else {
        engine.setCharacters(charactersResult.data);
      }

      if (tokensResult.error) {
        console.error('Erro ao carregar tokens do mapa:', tokensResult.error);
      } else {
        (tokensResult.data || []).forEach((token) => engine.upsertToken(token));

        // A câmera começa no seu personagem (no celular a tela é pequena).
        const mine = (tokensResult.data || []).find((token) => {
          const owner = engine.characters[token.character_id]?.owner_id;
          return owner && owner === playerId;
        });
        if (mine) engine.centerOn(Number(mine.x), Number(mine.y));
      }
    };

    const initEngine = async () => {
      try {
        await engine.init(roomData);

        if (!isMounted) return;

        // Marcadores (📍 ping e seta): cada um com a sua cor, o nome aparece junto.
        if (engine.marks) {
          const CORES = [0x38bdf8, 0x4ade80, 0xf472b6, 0xfacc15, 0xa78bfa, 0x2dd4bf];
          const hash = [...String(playerId)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
          engine.marks.color = gmMode ? 0xff8a2b : CORES[hash % CORES.length];
          engine.marks.name = gmMode ? 'Mestre' : playerName;
          marksChannel = supabase
            .channel(`marks_${id}`, { config: { broadcast: { self: false } } })
            .on('broadcast', { event: 'mark' }, ({ payload }) => payload && engine.marks?.add(payload))
            .subscribe();
          engine.marks.onMark = (mark) => marksChannel?.send({ type: 'broadcast', event: 'mark', payload: mark });
        }

        // Conecta o Realtime antes de buscar os dados existentes,
        // para não perder alterações feitas nesse meio-tempo.
        channel = supabase
          .channel(`room_${id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'map_tokens',
              filter: `room_id=eq.${id}`,
            },
            (payload) => {
              if (!isMounted || !engineRef.current) return;

              if (payload.eventType === 'DELETE') {
                engineRef.current.removeToken(payload.old.id);
              } else {
                engineRef.current.upsertToken(payload.new);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'characters',
              filter: `room_id=eq.${id}`,
            },
            (payload) => {
              if (!isMounted || !engineRef.current) return;

              if (payload.eventType === 'DELETE') {
                engineRef.current.removeCharacter(payload.old.id);
              } else {
                engineRef.current.upsertCharacter(payload.new);
              }
            }
          )
          // Exclusões chegam só com o id (sem room_id), então o filtro por sala as descartaria.
          // Escutamos sem filtro; ids de outras salas são simplesmente ignorados.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'map_tokens' }, (payload) => {
            if (isMounted) engineRef.current?.removeToken(payload.old.id);
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'characters' }, (payload) => {
            if (isMounted) engineRef.current?.removeCharacter(payload.old.id);
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED' && isMounted) loadInitialData();
          });
      } catch (error) {
        console.error('Erro ao iniciar o mapa:', error);

        if (isMounted) {
          alert('Não foi possível iniciar o mapa: ' + error.message);
        }
      }
    };

    initEngine();

    return () => {
      isMounted = false;
      window.removeEventListener('vtt:scene-env-local', handleLocalEnv);
      window.removeEventListener('vtt:light-edit', handleLightEdit);
      window.removeEventListener('vtt:terrain-edit', handleTerrainEdit);
      window.removeEventListener('vtt:fog-edit', handleFogEdit);

      if (channel) {
        supabase.removeChannel(channel);
      }
      if (marksChannel) supabase.removeChannel(marksChannel);

      engine.destroy();

      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [roomData, id, playerId]);

  // Envio de mapa (somente Mestre).
  // Salva as alterações do token.
  // Token vinculado → altera a FICHA. Token avulso → altera o próprio token.
  const handleSaveToken = async (event) => {
    event.preventDefault();

    if (!editingToken?.id) return;

    // 1) Aparência no mapa (sprite), se mudou.
    const original = engineRef.current?.tokens[editingToken.id]?.data;
    const nextSprite = editingToken.sprite || {};
    if (JSON.stringify(original?.sprite || {}) !== JSON.stringify(nextSprite)) {
      const { data: tokenRow, error: spriteError } = await supabase
        .from('map_tokens')
        .update({ sprite: nextSprite })
        .eq('id', editingToken.id)
        .select('*')
        .single();

      if (spriteError) {
        alert('Erro ao salvar a aparência: ' + spriteError.message);
        return;
      }
      engineRef.current?.upsertToken(tokenRow);
    }

    // 2) Item de cenário: só tem nome.
    if (nextSprite.mode === 'prop') {
      const { data: propRow, error: propError } = await supabase
        .from('map_tokens')
        .update({ name: editingToken.name?.trim() || 'Item' })
        .eq('id', editingToken.id)
        .select('*')
        .single();
      if (propError) alert('Erro ao salvar: ' + propError.message);
      else engineRef.current?.upsertToken(propRow);
      setEditingToken(null);
      return;
    }

    const hp = Math.max(0, Number(editingToken.hp || 0));

    if (editingToken.character) {
      const character = editingToken.character;
      const chakra = Math.max(0, Number(editingToken.chakra || 0));

      const { data, error } = await supabase
        .from('characters')
        .update({
          hp_current: Math.min(hp, character.hp_max),
          chakra_current: Math.min(chakra, character.chakra_max),
        })
        .eq('id', character.id)
        .select('*')
        .single();

      if (error) {
        alert('Erro ao salvar a ficha: ' + error.message);
        return;
      }

      engineRef.current?.upsertCharacter(data);
      setEditingToken(null);
      return;
    }

    const { data, error } = await supabase
      .from('map_tokens')
      .update({
        name: editingToken.name?.trim() || 'Token',
        hp,
        hp_current: hp,
      })
      .eq('id', editingToken.id)
      .eq('room_id', id)
      .select('*')
      .single();

    if (error) {
      alert('Erro ao salvar token: ' + error.message);
      return;
    }

    if (data) {
      engineRef.current?.upsertToken(data);
    }

    setEditingToken(null);
  };

  // Remove um token do mapa (a ficha, se houver, continua existindo).
  const handleDeleteToken = async (token = editingToken) => {
    if (!token?.id || deletingToken) return;

    const tokenName =
      engineRef.current?.characters[token.character_id]?.name || token.name || 'este token';

    if (!window.confirm(`Tirar "${tokenName}" do mapa?`)) {
      return;
    }

    setDeletingToken(true);

    const { data, error } = await supabase
      .from('map_tokens')
      .delete()
      .eq('id', token.id)
      .eq('room_id', id)
      .select('id');

    setDeletingToken(false);

    if (error) {
      alert('Não foi possível apagar o token: ' + error.message);
      return;
    }

    // "0 linhas apagadas" pode significar que o token JÁ tinha sido apagado
    // (clique duplo, outra aba, Realtime). Só é erro se ele ainda existir.
    if (!data?.length) {
      const { data: stillThere } = await supabase
        .from('map_tokens')
        .select('id')
        .eq('id', token.id)
        .maybeSingle();

      if (stillThere) {
        alert(
          'O banco não apagou o token. ' +
          'Verifique a permissão DELETE da tabela map_tokens.'
        );
        return;
      }
    }

    engineRef.current?.removeToken(token.id);

    // Cópia de NPC gerada pelo painel do Mestre: apaga a ficha junto (o modelo continua).
    const character = engineRef.current?.characters[token.character_id];
    if (isNpcInstance(character)) {
      const { error: characterError } = await supabase.from('characters').delete().eq('id', character.id);
      if (characterError) console.error('Erro ao apagar a cópia do NPC:', characterError);
    }

    setEditingToken(null);
    setContextMenu(null);
  };

  // Ações do menu de contexto.
  const handleContextAction = (action) => {
    if (!contextMenu?.token) return;

    const token = contextMenu.token;
    setContextMenu(null);

    if (action === 'adjust') {
      const character = engineRef.current?.characters[token.character_id];
      if (character) setAdjustCharacter(character);
      return;
    }

    if (action === 'edit') {
      const character = engineRef.current?.characters[token.character_id] ?? null;

      setEditingToken(
        character
          ? {
              ...token,
              character,
              name: character.name,
              hp: character.hp_current,
              chakra: character.chakra_current,
            }
          : {
              ...token,
              character: null,
              hp: token.hp_current ?? token.hp ?? 100,
            }
      );
    }

    if (action === 'delete') {
      handleDeleteToken(token);
    }

    if (action === 'combat') {
      addTokenToCombat(token);
    }
  };

  const isTokenInCombat = (token) =>
    combatants.some(
      (c) => c.token_id === token.id || (token.character_id && c.character_id === token.character_id)
    );

  /**
   * Mestre coloca um token no combate: rola 1d8 + bônus (rolagem secreta),
   * registra no histórico e entra na fila de turnos ligado ao token.
   */
  const addTokenToCombat = async (token) => {
    const character = engineRef.current?.characters[token.character_id] ?? null;
    const name = character?.name || token.name || 'Token';

    let bonus = initiativeBonus(character);
    if (!character) {
      const answer = window.prompt(`Bônus de iniciativa de "${name}" (Agilidade + Prontidão):`, '0');
      if (answer === null) return;
      bonus = Number(answer) || 0;
    }

    const dice = rollDice(1, 8);
    const row = buildRollRow({
      roomId: id,
      playerId,
      playerName,
      label: `Iniciativa · ${name}`,
      sides: 8,
      dice,
      modifier: bonus,
      isSecret: true,
    });

    setActiveRollAnimation({
      label: `🔒 ${row.label}`,
      formula: row.formula,
      sides: 8,
      rolls: dice,
      finalResult: row.total,
      playerName: row.player_name,
    });

    const { error: rollError } = await supabase.from('room_rolls').insert(row);
    if (rollError) console.error('Erro ao salvar rolagem:', rollError);

    const { error } = await supabase.from('room_combat').insert({
      room_id: id,
      token_id: token.id,
      character_id: token.character_id || null,
      character_name: name,
      initiative: row.total,
      init_bonus: bonus,
      tiebreak: rollTiebreak(),
      is_npc: !character || Boolean(character.is_npc),
      added_by: playerId,
    });

    if (error) {
      alert(
        error.code === '23505'
          ? `${name} já está no combate.`
          : 'Erro ao colocar no combate: ' + error.message
      );
    }
  };

  const contextMenuName = contextMenu
    ? engineRef.current?.characters[contextMenu.token.character_id]?.name ||
      contextMenu.token.name ||
      'Token'
    : '';

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-zinc-950 text-white">

      {/* Barra superior */}
      <div className="faixa-bandana z-40 flex h-12 shrink-0 items-center justify-between gap-2 px-2 md:h-14 md:px-4">

        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            title={panelOpen ? 'Fechar o menu' : 'Menu: Chat, Ambientação, Tokens e Regras'}
            className={`relative shrink-0 rounded border px-2.5 py-1.5 text-sm font-bold ${panelOpen ? 'border-red-700 bg-red-950/60 text-red-200' : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
          >
            {panelOpen ? '✕' : '☰'}
            {!panelOpen && unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-[10px] leading-[1.1rem] text-white">{unread > 9 ? '9+' : unread}</span>
            )}
          </button>

          <h1 className="titulo-shinobi flex min-w-0 items-center gap-2 truncate text-xl text-red-500 md:text-2xl">
            <Shuriken className="h-5 w-5 shrink-0 text-zinc-300 md:h-6 md:w-6" />
            <span className="truncate">{roomData ? roomData.name : 'Carregando Mesa...'}</span>
            {isGM && (
              <span className="shrink-0 rounded border border-red-800 bg-red-950/70 px-2 py-0.5 align-middle font-sans text-xs font-black tracking-wider text-red-300" style={{ textShadow: 'none' }}>
                MESTRE
              </span>
            )}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isGM && <UndoButton />}
          <button
            onClick={() => navigate('/lobby')}
            className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-700 md:px-4 md:py-2"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Mapa (os painéis ficam por cima dele) */}
      <div className="relative flex flex-1 overflow-hidden">
        <InitiativeBar combatants={combatants} combatState={combatState} engineRef={engineRef} />

        <div className="relative h-full flex-1">
          <div ref={canvasRef} className="absolute inset-0" />
          {selectedToken && (
            <TokenCard
              key={selectedToken.id}
              tokenData={selectedToken}
              engineRef={engineRef}
              isGM={isGM}
              playerId={playerId}
              playerName={playerName}
              roomId={id}
              onClose={() => setSelectedToken(null)}
            />
          )}
          <TurnMenu
            roomId={id}
            playerId={playerId}
            playerName={playerName}
            isGM={isGM}
            engineRef={engineRef}
            combatState={combatState}
            currentCombatant={currentCombatant}
            onTriggerRoll={setActiveRollAnimation}
            onActionsSaved={async (combatant, next) => {
              setCombatants((rows) => rows.map((c) => (c.id === combatant.id ? { ...c, actions: next } : c)));
              const { error } = await supabase.from('room_combat').update({ actions: next }).eq('id', combatant.id);
              if (error) console.error('Erro ao registrar a ação:', error);
            }}
          />
          <button
            type="button"
            onClick={() => { const next = !lowPower; setLowPower(next); engineRef.current?.setLowPower(next); }}
            title="Menos efeitos e 30 quadros por segundo, para máquinas fracas (vale só neste aparelho)"
            className={`absolute bottom-2 left-2 z-10 rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${lowPower ? 'border-amber-600 bg-amber-950/70 text-amber-200' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
          >
            ⚡<span className="hidden sm:inline"> Modo leve:</span><span className="sm:hidden"> Leve</span> {lowPower ? 'ligado' : 'desligado'}
          </button>
          {slowHint && !lowPower && (
            <div className={`absolute left-1/2 ${combatState.active ? 'top-16' : 'top-2'} z-30 flex w-max max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-600 bg-zinc-950/95 px-2 py-1.5 text-[11px] text-amber-100 shadow-xl`}>
              <span>🐢 Está lento por aqui ({slowHint} FPS).</span>
              <button type="button" onClick={() => { setLowPower(true); engineRef.current?.setLowPower(true); setSlowHint(null); }}
                className="rounded bg-amber-600 px-2 py-0.5 font-bold text-black hover:bg-amber-500">Ligar modo leve</button>
              <button type="button" onClick={() => setSlowHint(null)} className="px-1 text-zinc-400 hover:text-white" title="Fechar">✕</button>
            </div>
          )}
          <button
            type="button"
            onClick={() => { const next = !dangerZone; setDangerZone(next); engineRef.current?.setDangerZone(next); }}
            title="Mostra onde os inimigos conseguem atacar no próximo turno (andar + atacar). Vermelho: corpo a corpo. Laranja: à distância."
            className={`absolute bottom-10 left-2 z-10 rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${dangerZone ? 'border-red-600 bg-red-950/70 text-red-200' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
          >
            ☠️<span className="hidden sm:inline"> Zona de perigo:</span><span className="sm:hidden"> Perigo</span> {dangerZone ? 'ligada' : 'desligada'}
          </button>
          <SoundToggle />
          <MusicToggle />
          <MarkToggle engineRef={engineRef} />

          <Sidebar
            roomId={id}
            playerId={playerId}
            playerName={playerName}
            isGM={isGM}
            onTriggerRoll={setActiveRollAnimation}
            menuOpen={panelOpen}
            onCloseMenu={() => setPanelOpen(false)}
            onUnreadChange={setUnread}
          />
        </div>

      </div>

      {adjustCharacter && (
        <GmAdjust
          character={adjustCharacter}
          onClose={() => setAdjustCharacter(null)}
          onSaved={(updated) => engineRef.current?.upsertCharacter(updated)}
        />
      )}

      {/* Menu de contexto do token */}
      {contextMenu && (
        <>
          <button
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu(null);
            }}
          />

          <div
            className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 190),
              top: Math.min(contextMenu.y, window.innerHeight - 200),
            }}
          >
            <p className="border-b border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-400">
              {contextMenuName}
            </p>

            <button
              onClick={() => handleContextAction('edit')}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
            >
              ✏️ Editar
            </button>

            {isGM && contextMenu.token.character_id && engineRef.current?.characters[contextMenu.token.character_id] && (
              <button
                onClick={() => handleContextAction('adjust')}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
              >
                ⚙️ Tamanho e deslocamento
              </button>
            )}

            {isGM && combatState.active && contextMenu.token.sprite?.mode !== 'prop' && !isTokenInCombat(contextMenu.token) && (
              <button
                onClick={() => handleContextAction('combat')}
                className="block w-full px-3 py-2 text-left text-sm text-amber-300 hover:bg-amber-950/40"
              >
                ⚔️ Entrar no combate
              </button>
            )}

            <button
              onClick={() => handleContextAction('delete')}
              disabled={deletingToken}
              className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/60 disabled:opacity-50"
            >
              🗑️ Tirar do mapa
            </button>
          </div>
        </>
      )}

      {/* Janela de edição */}
      {editingToken && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">

          <div className="max-h-[92vh] w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">

            <h2 className="mb-1 text-xl font-bold text-red-500">
              {editingToken.character ? editingToken.character.name : 'Editar token'}
            </h2>

            {editingToken.character && (
              <p className="text-xs text-zinc-500">
                Token ligado à ficha: as alterações vão direto para a ficha.
              </p>
            )}

            <form
              onSubmit={handleSaveToken}
              className="mt-4 flex flex-col gap-4"
            >

              {!editingToken.character && (
                <div>
                  <label className="mb-1 block text-sm text-zinc-400">
                    Nome
                  </label>

                  <input
                    type="text"
                    value={editingToken.name || ''}
                    onChange={(event) =>
                      setEditingToken({
                        ...editingToken,
                        name: event.target.value,
                      })
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
              )}

              {editingToken.sprite?.mode !== 'prop' && (
              <div>
                <label className="mb-1 block text-sm text-zinc-400">
                  {editingToken.character
                    ? `Vitalidade (máx. ${editingToken.character.hp_max})`
                    : 'HP Atual'}
                </label>

                <input
                  type="number"
                  min="0"
                  value={editingToken.hp ?? ''}
                  onChange={(event) =>
                    setEditingToken({
                      ...editingToken,
                      hp: event.target.value,
                    })
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              )}

              {editingToken.character && (
                <div>
                  <label className="mb-1 block text-sm text-zinc-400">
                    Chakra (máx. {editingToken.character.chakra_max})
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={editingToken.chakra ?? ''}
                    onChange={(event) =>
                      setEditingToken({
                        ...editingToken,
                        chakra: event.target.value,
                      })
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
              )}

              <AppearanceEditor
                value={editingToken.sprite}
                isProp={editingToken.sprite?.mode === 'prop'}
                onChange={(sprite) => setEditingToken({ ...editingToken, sprite })}
              />

              <div className="mt-2 flex gap-2">

                <button
                  type="submit"
                  className="flex-1 rounded bg-green-600 py-2 font-bold transition-colors hover:bg-green-700"
                >
                  Salvar
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteToken(editingToken)}
                  disabled={deletingToken}
                  className="flex-1 rounded border border-red-700 bg-red-900 py-2 font-bold transition-colors hover:bg-red-800 disabled:opacity-50"
                >
                  {deletingToken ? 'Tirando...' : 'Tirar do mapa'}
                </button>

              </div>

              <button
                type="button"
                onClick={() => setEditingToken(null)}
                className="mt-1 text-sm text-zinc-500 hover:text-white"
              >
                Cancelar
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Animação dos dados */}
      {activeRollAnimation && (
        <DiceRollerAnimation
          rollData={activeRollAnimation}
          onFinish={() => setActiveRollAnimation(null)}
        />
      )}

    </div>
  );
}

/** Shuriken desenhada à mão (ícone do cabeçalho). */
function Shuriken({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M12 1.5l2.1 7.2 7.2-2.1-5.1 5.4 5.1 5.4-7.2-2.1L12 22.5l-2.1-7.2-7.2 2.1 5.1-5.4-5.1-5.4 7.2 2.1z" />
      <circle cx="12" cy="12" r="2.2" fill="#120e0b" />
    </svg>
  );
}

/** Liga/desliga os sons de combate (vale só neste aparelho). */
function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted());
  const [volume, setVolume] = useState(getSfxVolume());
  const [aberto, setAberto] = useState(false);
  useEffect(() => onMuteChange((m) => { setMutedState(m); setVolume(getSfxVolume()); }), []);
  return (
    <div className="absolute bottom-[4.5rem] left-2 z-10 flex items-center gap-1">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        title="Sons de golpes e jutsus (só neste aparelho)"
        className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${muted ? 'border-zinc-700 bg-zinc-900/70 text-zinc-500' : 'border-sky-700 bg-sky-950/60 text-sky-200'}`}
      >
        {muted ? '🔇' : '🔊'}<span className="hidden sm:inline"> Som:</span> {muted ? 'mudo' : `${Math.round(volume * 100)}%`}
      </button>
      {aberto && (
        <div className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/90 px-2 py-1 backdrop-blur">
          <button type="button" onClick={() => setMuted(!muted)} className="text-sm" title={muted ? 'Ligar os efeitos' : 'Silenciar os efeitos'}>{muted ? '🔇' : '🔊'}</button>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setSfxVolume(e.target.value)} className="w-24 accent-sky-500" aria-label="Volume dos efeitos" />
        </div>
      )}
    </div>
  );
}

/** 🎵 Música da mesa: mostra o que toca; cada um ajusta o próprio volume. */
function MusicToggle() {
  const [estado, setEstado] = useState(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => onMusica(setEstado), []);
  if (!estado?.tocando) return null;
  return (
    <div className="absolute bottom-[8.5rem] left-2 z-10 flex flex-col items-start gap-1">
      {aberto && (
        <div className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/90 px-2 py-1.5 backdrop-blur">
          <button type="button" onClick={() => setMudoMusica(!estado.mudo)} className="text-sm" title={estado.mudo ? 'Ligar a música' : 'Silenciar a música'}>{estado.mudo ? '🔇' : '🔊'}</button>
          <input type="range" min="0" max="1" step="0.05" value={estado.volume} onChange={(e) => setVolumeMusica(e.target.value)} className="w-24 accent-orange-500" aria-label="Volume da música" />
        </div>
      )}
      <button
        type="button"
        onClick={() => (estado.bloqueado ? liberarMusica() : setAberto(!aberto))}
        title="Música da mesa (volume só neste aparelho)"
        className={`max-w-[11rem] truncate rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${estado.bloqueado ? 'animate-pulse border-orange-500 bg-orange-950/80 text-orange-100' : estado.mudo ? 'border-zinc-700 bg-zinc-900/70 text-zinc-500' : 'border-orange-700 bg-orange-950/60 text-orange-200'}`}
      >
        {estado.bloqueado ? '🎵 Toque para ouvir' : `🎵 ${estado.mudo ? 'mudo' : `${Math.round(estado.volume * 100)}%`} · ${estado.nome}`}
      </button>
    </div>
  );
}

/** 📍 Marcar: tocar no mapa = ping, arrastar = seta (todos veem). Toque duplo faz ping sem ligar. */
function MarkToggle({ engineRef }) {
  const [on, setOn] = useState(false);
  const toggle = (value) => {
    setOn(value);
    engineRef.current?.marks?.setMode(value);
  };
  useEffect(() => {
    if (!on) return undefined;
    const esc = (e) => { if (e.key === 'Escape') toggle(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      onClick={() => toggle(!on)}
      title="Marcar no mapa: toque = ping, arraste = seta (todos veem). Dica: toque duplo no mapa faz um ping rápido."
      className={`absolute bottom-[6.5rem] left-2 z-10 rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${on ? 'border-red-500 bg-red-950/70 text-red-100' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
    >
      📍<span className="hidden sm:inline"> Marcar:</span> {on ? 'ligado' : 'desligado'}
    </button>
  );
}
