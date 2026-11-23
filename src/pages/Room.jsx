import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase/client';
import { buildRollRow, rollDice } from '../services/Rolls';
import { actionsForRound, freeSlots, initiativeBonus, perdaPorCondicao, rollTiebreak } from '../sistemas/shinobi/services/Combat';
import { deslocamentoBlocos, movementBudget, spendMovement } from '../sistemas/shinobi/services/Movement';
import { condicoesDe, limitesDoTurno } from '../sistemas/shinobi/data/Condicoes';
import { isNpcInstance } from '../sistemas/shinobi/services/Npc';
import { patchFog } from '../services/SceneEnv';
import { CanvasEngine } from '../canvas/Engine.js';
import {
  EditorAparencia as AppearanceEditor,
  MenuDoTurno as TurnMenu,
  CardDoToken as TokenCard,
  AjusteMestre as GmAdjust,
  BarraIniciativa as InitiativeBar,
} from '../sistemas/shinobi/Index.js'; // porta de entrada do sistema
import Sidebar from '../components/Sidebar.jsx';
import { sistemaDaMesa } from '../sistemas/Sistemas';
import DiceRollerAnimation from '../components/DiceRollerAnimation.jsx';
import CamerasMesa from '../components/CamerasMesa.jsx';
import TelaLive from '../components/TelaLive.jsx';
import BotaoGravar from '../components/BotaoGravar.jsx';
import MedirConexao from '../components/MedirConexao.jsx';
import { lerLayoutLive } from '../services/Live';
import UndoButton from '../components/UndoButton.jsx';
import { initUndo } from '../services/Undo';
import { getSfxVolume, isMuted, onMuteChange, setMuted, setSfxVolume } from '../services/Sfx';
import { aplicarMusica, encerrarMusica, liberarMusica, onMusica, setMudoMusica, setVolumeMusica } from '../services/Musica';
import VoiceChat from '../components/VoiceChat.jsx';

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

  // Tela de gravação (Modo live): o Mestre abre para ver/gravar; com "Mostrar para todos" os
  // jogadores também passam a vê-la (cada um pode voltar à tela normal só no seu aparelho).
  const [telaLive, setTelaLive] = useState(false);
  const [liveTodos, setLiveTodos] = useState(false);
  // Arrumação da tela de gravação (Modo live parte 3): a salva na mesa + o rascunho enquanto o
  // Mestre arruma. Vale para todos e para a gravação.
  const [layoutSalvo, setLayoutSalvo] = useState(() => lerLayoutLive(null));
  const [layoutRascunho, setLayoutRascunho] = useState(null);
  const layoutLive = layoutRascunho || layoutSalvo;
  const layoutLiveRef = useRef(layoutLive);
  layoutLiveRef.current = layoutLive;
  const obterLayoutLive = useCallback(() => layoutLiveRef.current, []);
  const [saiuDaLive, setSaiuDaLive] = useState(false);
  const live = isGM ? telaLive : (liveTodos && !saiuDaLive);
  useEffect(() => { if (liveTodos) setSaiuDaLive(false); }, [liveTodos]);
  // O canvas só percebe mudança de tamanho da janela: avisa ao trocar de tela.
  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      try { engineRef.current?.app?.resize?.(); } catch { /* mapa ainda carregando */ }
      window.dispatchEvent(new Event('resize'));
    });
    return () => cancelAnimationFrame(quadro);
  }, [live, layoutLive.mapa.w, layoutLive.mapa.h]); // e quando o Mestre muda o tamanho do mapa

  // ---------------- Combate (para destacar no mapa quem está na vez) ----------------
  const [combatState, setCombatState] = useState({ active: false, turn: null, round: 0, strict: true });
  // Movimento em blocos: o mapa consulta o estado do combate por aqui (sempre o mais novo).
  const moveCtxRef = useRef({ combatState: { active: false }, combatants: [] });
  const [selectedToken, setSelectedToken] = useState(null); // card do personagem tocado no mapa
  const [confirmarMov, setConfirmarMov] = useState(null); // { blocos, responder } — andar vai gastar a ação Padrão
  // Painel lateral (Chat, Dados, Ficha…): no celular começa fechado e abre por cima do mapa.
  const [panelOpen, setPanelOpen] = useState(false); // menu ☰ (Chat, Ambientação, Tokens, Regras)
  const [unread, setUnread] = useState(0);              // mensagens novas com o menu fechado
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  // Minha tela: esconder nomes/vida/chakra acima dos tokens só neste aparelho.
  const [hudLocal, setHudLocalState] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('vtt_hud_local') || '{}'); } catch { return {}; }
  });
  const hudLocalRef = useRef(hudLocal);
  const alternarHudLocal = (key) => {
    const next = { ...hudLocalRef.current, [key]: hudLocalRef.current[key] === false };
    if (next[key]) delete next[key];
    hudLocalRef.current = next;
    setHudLocalState(next);
    try { window.localStorage.setItem('vtt_hud_local', JSON.stringify(next)); } catch { /* sem localStorage */ }
    engineRef.current?.setHudLocal(next);
  };
  const [dangerZone, setDangerZone] = useState(false);
  const [slowHint, setSlowHint] = useState(null); // FPS baixo: sugere o modo leve
  const [lowPower, setLowPower] = useState(() => {
    try { return window.localStorage.getItem('vtt_modo_leve') === '1'; } catch { return false; }
  });
  const [combatants, setCombatants] = useState([]);
  const turnTargetRef = useRef(null);
  const groundKeyRef = useRef(''); // qual mapa está carregado (para trocar ao vivo)
  const salaRef = useRef(null); // última versão conhecida da sala (para ignorar colunas que não vieram no aviso)

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
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (active && data) salaRef.current = data;
        if (active && data) setCombatState({ active: data.combat_active, turn: data.combat_turn, round: data.combat_round || 0, strict: data.combat_strict ?? true });
        if (active) aplicarMusica(data?.scene_env?.musica); // entrou na sala: já cai na música certa
        if (active) setLiveTodos(Boolean(data?.hud_settings?.live_todos));
        if (active) setLayoutSalvo(lerLayoutLive(data?.hud_settings?.live_layout));
      });
    loadCombatants();

    const channel = supabase
      .channel(`room_combat_map_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, (payload) => {
        // Colunas grandes que não mudaram (scene_env, map_layout…) podem chegar vazias no aviso
        // do Supabase. Antes isso fazia o clima, o horário e a música "resetarem" a cada ação do
        // combate. Agora só vale o que de fato veio, e cada parte só é aplicada se mudou.
        const anterior = salaRef.current || {};
        const GRANDES = ['scene_env', 'map_layout', 'hud_settings'];
        const veio = Object.fromEntries(Object.entries(payload.new || {})
          .filter(([k, v]) => v !== undefined && !(v === null && GRANDES.includes(k))));
        const sala = { ...anterior, ...veio };
        salaRef.current = sala;
        const mudou = (campo) => JSON.stringify(anterior[campo]) !== JSON.stringify(sala[campo]);

        setCombatState({ active: sala.combat_active, turn: sala.combat_turn, round: sala.combat_round || 0, strict: sala.combat_strict ?? true });
        if (mudou('hud_settings')) engineRef.current?.setHud(sala.hud_settings); // Mestre mudou a visibilidade do HUD
        if (mudou('hud_settings')) setLiveTodos(Boolean(sala.hud_settings?.live_todos)); // Mestre mostrou/tirou a tela de gravação
        if (mudou('hud_settings')) setLayoutSalvo(lerLayoutLive(sala.hud_settings?.live_layout)); // Mestre arrumou a tela de gravação
        if (mudou('scene_env')) {
          engineRef.current?.setSceneEnv(sala.scene_env); // clima e horário
          window.dispatchEvent(new CustomEvent('vtt:scene-env', { detail: sala.scene_env })); // voz por mapa etc.
          const musicaAntes = JSON.stringify(anterior.scene_env?.musica);
          if (JSON.stringify(sala.scene_env?.musica) !== musicaAntes) aplicarMusica(sala.scene_env?.musica); // música da mesa
        }

        // Mestre trocou o mapa (imagem única ou pedaços): recarrega só o chão, sem reiniciar a sala.
        const groundKey = JSON.stringify([sala.map_url, sala.map_layout]);
        if (groundKey !== groundKeyRef.current) {
          groundKeyRef.current = groundKey;
          engineRef.current?.reloadGround(sala);
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
        navigate('/lobby'); // sem mesa não dá para saber o sistema: volta para a escolha
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
    engine.playerId = playerId;
    engine.setHudLocal(hudLocalRef.current);          // o que este aparelho escondeu
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
      if (!combatant) {
        // Invocação do Kuchiyose (parceiro, pág. 269): age no turno de quem invocou, sem iniciativa própria.
        const invocador = engine.characters[tokenData.character_id]?.attributes?.criatura?.invocador;
        const turnoDele = invocador && list.find((c) => c.character_id === invocador);
        if (turnoDele && turnoDele.id !== cs.turn && !gmMode) return { canMove: false, reason: 'A invocação só age no turno de quem a invocou.' };
        return null; // fora do combate: movimento livre
      }

      const isTurn = combatant.id === cs.turn;
      const enforce = Boolean(cs.strict);
      if (!isTurn && enforce) return { canMove: false, reason: 'Ainda não é o turno deste personagem.' };
      // Jogador só anda no próprio turno durante o combate (o Mestre pode ajustar fora do turno no modo narrativo).
      if (!isTurn && !gmMode) return { canMove: false, reason: 'Em combate você só anda no seu turno.' };
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
        // true quando andar `blocks` usaria também a ação Padrão (aí o planejador pede confirmação)
        gastaPadrao: (blocks) => {
          const next = spendMovement(state, blocks, deslocBlocks, enforce);
          return Boolean(next) && freeSlots(state).includes('padrao') && !freeSlots(next).includes('padrao');
        },
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

    // Andar demais gasta também a ação Padrão: pergunta antes de confirmar.
    engine.onConfirmarMovimento = ({ blocos }) => new Promise((resolve) => {
      if (!isMounted) { resolve(false); return; }
      setConfirmarMov({ blocos, responder: (ok) => { setConfirmarMov(null); resolve(ok); } });
    });

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
      engine._initialDataLoaded = true; // evita carregamento duplo pelo fallback
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
                // Kuchiyose (pág. 224): com Vitalidade 0 ou menos a criatura volta sozinha (o Mestre tira do mapa).
                const criatura = payload.new?.attributes?.criatura;
                if (gmMode && criatura && Number(payload.new.hp_current) <= 0
                  && Object.values(engineRef.current.tokens).some((t) => t.data.character_id === payload.new.id)) {
                  supabase.from('map_tokens').delete().eq('character_id', payload.new.id).then(({ error }) => {
                    if (!error) supabase.from('room_messages').insert({ room_id: id, player_name: '⚔️ Combate', message: `🐸 ${payload.new.name} voltou para o mundo das invocações (Vitalidade 0).`, is_roll: true });
                  });
                }
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

        // Fallback: se o Realtime demorar ou não emitir SUBSCRIBED, carrega os dados
        // após um breve timeout para garantir que a tela não fique preta.
        setTimeout(() => {
          if (isMounted && !engine._initialDataLoaded) loadInitialData();
        }, 3000);
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
      <div className={`faixa-bandana z-40 h-12 shrink-0 items-center justify-between gap-2 px-2 md:h-14 md:px-4 ${live ? 'hidden' : 'flex'}`}>

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

          <h1 className="titulo-shinobi flex min-w-0 items-center gap-2 truncate text-lg text-zinc-50 md:text-2xl">
            <span className="hanko h-6 w-6 shrink-0 text-sm md:h-7 md:w-7 md:text-base" aria-hidden="true">忍</span>
            <span className="truncate">{roomData ? roomData.name : 'Carregando Mesa...'}</span>
            {isGM && (
              <span className="shrink-0 rounded border border-red-700 bg-red-950/70 px-2 py-0.5 align-middle font-sans text-xs font-extrabold text-red-200">
                Mestre
              </span>
            )}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isGM && <UndoButton />}
          {isGM && (
            <div className="hidden md:block"><BotaoGravar engineRef={engineRef} gmId={roomData?.gm_id} obterLayout={obterLayoutLive} /></div>
          )}
          {isGM && (
            <button type="button" onClick={() => setTelaLive(true)} title="Tela de gravação: mesa de um lado, câmeras e personagens do outro, sem botões"
              className="hidden shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 md:block">
              🎬 Tela de gravação{liveTodos ? ' (todos vendo)' : ''}
            </button>
          )}
          {!isGM && liveTodos && saiuDaLive && (
            <button type="button" onClick={() => setSaiuDaLive(false)} className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">
              🎬 Ver a live
            </button>
          )}
          <button
            onClick={() => navigate(`/lobby/${sistemaDaMesa(roomData)}`)}
            className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-700 md:px-4 md:py-2"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Mapa (os painéis ficam por cima dele) */}
      <div className="relative flex flex-1 overflow-hidden">
        {!live && <InitiativeBar combatants={combatants} combatState={combatState} engineRef={engineRef} />}
        {live && (
          <TelaLive engineRef={engineRef} gmId={roomData?.gm_id} isGM={isGM} roomId={id} liveTodos={liveTodos}
            layout={layoutLive} onRascunho={setLayoutRascunho} obterLayout={obterLayoutLive}
            onSair={() => { setLayoutRascunho(null); if (isGM) setTelaLive(false); else setSaiuDaLive(true); }} />
        )}

        <div className={live ? 'absolute z-30 overflow-hidden rounded-lg border-2 border-zinc-800' : 'relative h-full flex-1'}
          style={live ? { left: `${layoutLive.mapa.x}%`, top: `${layoutLive.mapa.y}%`, width: `${layoutLive.mapa.w}%`, height: `${layoutLive.mapa.h}%` } : undefined}>
          <div ref={canvasRef} className="absolute inset-0" />
          {/* Na tela de gravação os painéis somem, mas continuam montados (a chamada de voz não cai). */}
          <div className={live ? 'hidden' : 'contents'}>
          {confirmarMov && (
            <div className="pointer-events-auto absolute inset-x-0 top-24 z-40 flex justify-center px-3">
              <div className="w-full max-w-sm rounded-xl border-2 border-amber-600 bg-zinc-950/95 p-3 text-zinc-100 shadow-2xl">
                <p className="text-sm font-black text-amber-300">⚠️ Esse caminho gasta 2 ações</p>
                <p className="mt-1 text-xs text-zinc-300">
                  Andar <b>{confirmarMov.blocos} {confirmarMov.blocos === 1 ? 'bloco' : 'blocos'}</b> usa a ação de <b>Movimento</b> e também a ação <b>Padrão</b>.
                  Depois disso você não poderá atacar nem usar técnicas de ação Padrão neste turno.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => confirmarMov.responder(false)} className="flex-1 rounded-lg border border-zinc-600 py-2 text-sm font-bold text-zinc-200 hover:border-zinc-400">Cancelar</button>
                  <button type="button" onClick={() => confirmarMov.responder(true)} className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-black text-black hover:bg-amber-500">Andar mesmo assim</button>
                </div>
              </div>
            </div>
          )}
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
          {slowHint && !lowPower && (
            <div className={`absolute left-1/2 ${combatState.active ? 'top-16' : 'top-2'} z-30 flex w-max max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-600 bg-zinc-950/95 px-2 py-1.5 text-[11px] text-amber-100 shadow-xl`}>
              <span>🐢 Está lento por aqui ({slowHint} FPS).</span>
              <button type="button" onClick={() => { setLowPower(true); engineRef.current?.setLowPower(true); setSlowHint(null); }}
                className="rounded bg-amber-600 px-2 py-0.5 font-bold text-black hover:bg-amber-500">Ligar modo leve</button>
              <button type="button" onClick={() => setSlowHint(null)} className="px-1 text-zinc-400 hover:text-white" title="Fechar">✕</button>
            </div>
          )}
          {/* Opções do mapa: Marcar e a música sempre à mão; o resto fica dentro do ⚙️ para não poluir a tela. */}
          <div className="absolute left-2 top-28 z-10 flex flex-col-reverse items-start gap-1 md:bottom-2 md:top-auto md:flex-col">
            {/* No celular fica no alto, à esquerda, para o menu do turno não cobrir. */}
            <MusicToggle />
            {opcoesAbertas && (
              <div className="flex flex-col items-start gap-1 rounded-lg border border-zinc-700 bg-zinc-950/90 p-1.5 shadow-xl backdrop-blur">
                <SoundToggle />
                <button
                  type="button"
                  onClick={() => { const next = !dangerZone; setDangerZone(next); engineRef.current?.setDangerZone(next); }}
                  title="Mostra onde os inimigos conseguem atacar no próximo turno (andar + atacar). Vermelho: corpo a corpo. Laranja: à distância."
                  className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${dangerZone ? 'border-red-600 bg-red-950/70 text-red-200' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
                >
                  ☠️<span className="hidden sm:inline"> Zona de perigo:</span><span className="sm:hidden"> Perigo</span> {dangerZone ? 'ligada' : 'desligada'}
                </button>
                <button
                  type="button"
                  onClick={() => { const next = !lowPower; setLowPower(next); engineRef.current?.setLowPower(next); }}
                  title="Menos efeitos e 30 quadros por segundo, para máquinas fracas (vale só neste aparelho)"
                  className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${lowPower ? 'border-amber-600 bg-amber-950/70 text-amber-200' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
                >
                  ⚡<span className="hidden sm:inline"> Modo leve:</span><span className="sm:hidden"> Leve</span> {lowPower ? 'ligado' : 'desligado'}
                </button>
                <div className="flex items-center gap-1" title="Esconde o que aparece acima dos tokens só na sua tela. Não mostra nada que o Mestre escondeu.">
                  <span className="text-[11px] font-bold text-zinc-400">👁️ Minha tela:</span>
                  {[['show_names', 'Nomes'], ['show_hp', 'Vida'], ['show_chakra', 'Chakra']].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => alternarHudLocal(key)}
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${hudLocal[key] === false ? 'border-zinc-700 text-zinc-500 line-through' : 'border-sky-700 bg-sky-950/60 text-sky-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <MedirConexao roomId={id} />
              </div>
            )}
            <div className="flex items-center gap-1">
              <MarkToggle engineRef={engineRef} />
              <button type="button" onClick={() => setOpcoesAbertas((v) => !v)} title="Som, zona de perigo, modo leve e o que aparece na sua tela"
                className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${opcoesAbertas ? 'border-sky-600 bg-sky-950/70 text-sky-100' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}>
                ⚙️<span className="hidden sm:inline"> Opções</span>{dangerZone ? ' ☠️' : ''}{lowPower ? ' ⚡' : ''}
              </button>
            </div>
          </div>
          <VoiceChat roomId={id} playerId={playerId} playerName={playerName} isGM={isGM} />
          <CamerasMesa isGM={isGM} />

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


/** Liga/desliga os sons de combate (vale só neste aparelho). */
function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted());
  const [volume, setVolume] = useState(getSfxVolume());
  const [aberto, setAberto] = useState(false);
  useEffect(() => onMuteChange((m) => { setMutedState(m); setVolume(getSfxVolume()); }), []);
  return (
    <div className="flex items-center gap-1">
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

  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) return '00:00';
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-start gap-1">
      {aberto && (
        <div className="flex flex-col gap-1.5 rounded border border-zinc-700 bg-zinc-900/95 p-2 backdrop-blur shadow-lg text-xs">
          <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
            <span className="truncate max-w-[9rem] font-bold text-orange-200">{estado.nome}</span>
            <span>{fmt(estado.currentTime)} / {fmt(estado.duration)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMudoMusica(!estado.mudo)} className="text-sm" title={estado.mudo ? 'Ligar a música' : 'Silenciar a música'}>{estado.mudo ? '🔇' : '🔊'}</button>
            <input type="range" min="0" max="1" step="0.05" value={estado.volume} onChange={(e) => setVolumeMusica(e.target.value)} className="w-24 accent-orange-500" aria-label="Volume da música" />
            <span className="w-7 text-right text-[10px] text-zinc-400">{estado.mudo ? '0%' : `${Math.round(estado.volume * 100)}%`}</span>
          </div>
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
      className={`rounded border px-2 py-1 text-[11px] font-bold backdrop-blur ${on ? 'border-red-500 bg-red-950/70 text-red-100' : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white'}`}
    >
      📍 {on ? 'Marcando (Esc sai)' : 'Marcar'}
    </button>
  );
}
