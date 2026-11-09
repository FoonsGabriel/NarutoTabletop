import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { buildRollRow, formatFormula, rollDice } from '../services/Rolls';
import CharacterSheet from './CharacterSheet.jsx';
import CombatTracker from './CombatTracker.jsx';
import DiceHistory from './DiceHistory.jsx';
import NpcPanel from './NpcPanel.jsx';
import MapLibrary from './MapLibrary.jsx';
import ScenePanel from './ScenePanel.jsx';
import FogPanel from './FogPanel.jsx';
import ScenesPanel from './ScenesPanel.jsx';
import MusicPanel from './MusicPanel.jsx';
import TutorialPanel from './TutorialPanel.jsx';
import RewardsPanel from './RewardsPanel.jsx';

const CHAT_LIMIT = 100;
const ROLL_HISTORY_LIMIT = 300;
const DICE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];

/**
 * Painéis da sala:
 *  - Menu ☰ (gaveta à esquerda): Chat, Ambientação, Tokens e Regras (as três últimas são do Mestre).
 *  - Botões flutuantes no canto do mapa: 📋 Ficha, ⚔️ Combate e 🎲 Dados, cada um abre uma janela.
 * Tudo continua montado quando fechado, para o chat e a ficha não perderem o que estava aberto.
 */
export default function Sidebar({
  roomId, playerId, playerName, isGM = false, onTriggerRoll,
  menuOpen = false, onCloseMenu, onUnreadChange,
}) {
  const [section, setSection] = useState('chat');
  const [openWindow, setOpenWindow] = useState(null); // 'ficha' | 'combate' | 'dados' | null
  const activeTab = menuOpen && section === 'chat' ? 'chat' : null; // para rolar o chat ao abrir

  // Espaço ocupado nas laterais (no PC): o menu de turno se encaixa no meio, sem ficar coberto.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--vtt-left', menuOpen ? '22rem' : '0px');
    root.setProperty('--vtt-right', openWindow ? '28rem' : '3.5rem');
    return () => { root.setProperty('--vtt-left', '0px'); root.setProperty('--vtt-right', '0px'); };
  }, [menuOpen, openWindow]);
  const [unread, setUnread] = useState(0);

  // ---------------- Chat ----------------
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef(null);

  // ---------------- Dados ----------------
  const [rolls, setRolls] = useState([]);
  const [diceCount, setDiceCount] = useState(2);
  const [diceSides, setDiceSides] = useState(8);
  const [modifier, setModifier] = useState(0);
  const [gmSecret, setGmSecret] = useState(true); // rolagens do Mestre começam secretas

  const upsertRoll = useCallback((roll) => {
    setRolls((current) => [...current.filter((item) => item.id !== roll.id), roll]);
  }, []);

  // Carrega chat + histórico e escuta tudo em tempo real.
  useEffect(() => {
    let active = true;

    // Chat: as 100 MAIS RECENTES (antes vinham as 50 mais antigas).
    supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(CHAT_LIMIT)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Erro ao carregar chat:', error);
        else setMessages((data || []).reverse());
      });

    supabase
      .from('room_rolls')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(ROLL_HISTORY_LIMIT)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Erro ao carregar histórico de dados:', error);
        else setRolls(data || []);
      });

    const channel = supabase
      .channel(`sidebar_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => (prev.some((msg) => msg.id === payload.new.id) ? prev : [...prev, payload.new]));
          setUnread((n) => n + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_rolls', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setRolls((current) => current.filter((roll) => roll.id !== payload.old.id));
          } else {
            upsertRoll(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, upsertRoll]);

  // Rola o chat para a última mensagem; com o chat aberto, nada fica "não lido".
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ block: 'end' });
      setUnread(0);
    }
  }, [messages, activeTab]);

  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  const toggleWindow = (name) => setOpenWindow((current) => (current === name ? null : name));

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const messageContent = inputText.trim();
    if (!messageContent) return;

    setInputText('');

    const { data, error } = await supabase
      .from('room_messages')
      .insert({
        room_id: roomId,
        player_name: playerName || 'Jogador',
        message: messageContent,
        is_roll: false,
      })
      .select('*')
      .single();

    if (error) {
      alert('Erro ao enviar mensagem: ' + error.message);
      setInputText(messageContent);
      return;
    }

    // Mostra na hora para quem enviou, sem depender do Realtime.
    setMessages((prev) => (prev.some((msg) => msg.id === data.id) ? prev : [...prev, data]));
  };

  /**
   * Rolagem central: usada pelo painel de dados e pela ficha.
   * Anima na tela, salva no histórico (room_rolls) e respeita o modo secreto do Mestre.
   */
  const performRoll = useCallback(async ({ label, count, sides, modifier: mod = 0 }) => {
    const dice = rollDice(count, sides);
    const isSecret = isGM && gmSecret;
    const row = buildRollRow({ roomId, playerId, playerName, label, sides, dice, modifier: mod, isSecret });

    onTriggerRoll?.({
      label: isSecret ? `🔒 ${row.label || 'Rolagem secreta'}` : row.label,
      formula: row.formula,
      sides: row.sides,
      rolls: dice,
      finalResult: row.total,
      playerName: row.player_name,
    });

    const { data, error } = await supabase.from('room_rolls').insert(row).select('*').single();

    if (error) {
      console.error('Erro ao salvar rolagem:', error);
      alert('A rolagem não foi salva no histórico: ' + error.message);
      return null;
    }

    upsertRoll(data);
    return data;
  }, [roomId, playerId, playerName, isGM, gmSecret, onTriggerRoll, upsertRoll]);

  const handleRevealRoll = async (rollId) => {
    const { data, error } = await supabase
      .from('room_rolls')
      .update({ is_secret: false })
      .eq('id', rollId)
      .select('*')
      .single();

    if (error) {
      alert('Erro ao revelar rolagem: ' + error.message);
      return;
    }

    upsertRoll(data);
  };

  const sections = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    ...(isGM ? [{ id: 'ambiente', icon: '🌦️', label: 'Ambientação' }, { id: 'tokens', icon: '👤', label: 'Tokens' }, { id: 'recompensas', icon: '🎁', label: 'Prêmios' }] : []),
    { id: 'regras', icon: '📜', label: 'Regras' },
    { id: 'guia', icon: '📚', label: 'Guia' },
  ];

  return (
    <>
      {/* ================= MENU ☰ (gaveta) ================= */}
      {menuOpen && <div className="absolute inset-0 z-20 bg-black/40 md:hidden" onClick={onCloseMenu} />}
      <aside className={`absolute inset-y-0 left-0 z-30 flex w-full max-w-[22rem] flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl ${menuOpen ? '' : 'hidden'}`}>
        <div className="flex items-stretch border-b border-zinc-800">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors ${section === item.id ? 'border-b-2 border-red-500 bg-zinc-800 text-red-400' : 'text-zinc-400 hover:text-white'}`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={onCloseMenu} className="px-3 text-zinc-500 hover:text-white" title="Fechar o menu">✕</button>
        </div>

        {/* ---------- Chat ---------- */}
        {section === 'chat' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && <p className="text-center text-xs text-zinc-500">Nenhuma mensagem ainda.</p>}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-2.5 text-sm ${msg.is_roll ? 'border border-red-900/50 bg-red-950/40 text-red-200' : 'bg-zinc-800/60 text-zinc-200'}`}
                >
                  <span className="mb-0.5 block text-xs font-bold text-red-400">{msg.player_name}</span>
                  <p className="break-words">{msg.message}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-zinc-800 p-3">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              />
              <button type="submit" className="rounded bg-red-600 px-4 py-2 text-sm font-bold transition-colors hover:bg-red-700">
                Enviar
              </button>
            </form>
          </div>
        )}

        {/* ---------- Ambientação (Mestre) ---------- */}
        {section === 'ambiente' && isGM && (
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <MusicPanel roomId={roomId} />
            <MapLibrary roomId={roomId} />
            <ScenePanel roomId={roomId} parts={['env', 'lights', 'terrain', 'map']} />
            <FogPanel roomId={roomId} />
            <ScenesPanel roomId={roomId} />
          </div>
        )}

        {/* ---------- Tokens (Mestre) ---------- */}
        {section === 'tokens' && isGM && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-2 border-b border-zinc-800 p-3">
              <details className="rounded-lg border border-zinc-800 bg-zinc-950">
                <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Itens de cenário (árvores, fogueiras…)</summary>
                <div className="p-2"><ScenePanel roomId={roomId} parts={['props']} /></div>
              </details>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <NpcPanel roomId={roomId} />
            </div>
          </div>
        )}

        {section === 'recompensas' && isGM && <RewardsPanel roomId={roomId} />}

        {/* ---------- Guia rápido das regras (todos) ---------- */}
        {section === 'guia' && <TutorialPanel isGM={isGM} />}

        {/* ---------- Regras ---------- */}
        {section === 'regras' && (
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <RulesPanel roomId={roomId} isGM={isGM} />
            {isGM && <ScenePanel roomId={roomId} parts={['hud']} />}
          </div>
        )}
      </aside>

      {/* ================= Botões flutuantes ================= */}
      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1.5">
        {[
          { id: 'ficha', icon: '📋', label: 'Ficha' },
          { id: 'combate', icon: '⚔️', label: 'Combate' },
          { id: 'dados', icon: '🎲', label: 'Dados' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggleWindow(item.id)}
            title={item.label}
            className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg border text-lg shadow-lg backdrop-blur transition ${openWindow === item.id ? 'border-red-500 bg-red-950/80' : 'border-zinc-700 bg-zinc-900/85 hover:border-red-600'}`}
          >
            <span className="leading-none">{item.icon}</span>
            <span className="text-[8px] font-bold text-zinc-300">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ================= Janelas ================= */}
      <FloatWindow title="📋 Ficha" open={openWindow === 'ficha'} onClose={() => setOpenWindow(null)}>
        <CharacterSheet roomId={roomId} playerId={playerId} playerName={playerName} onRoll={performRoll} />
      </FloatWindow>

      <FloatWindow title="⚔️ Combate" open={openWindow === 'combate'} onClose={() => setOpenWindow(null)}>
        <CombatTracker roomId={roomId} playerId={playerId} isGM={isGM} onRoll={performRoll} />
      </FloatWindow>

      <FloatWindow title="🎲 Dados" open={openWindow === 'dados'} onClose={() => setOpenWindow(null)}>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-3 border-b border-zinc-800 p-3">
            <div className="grid grid-cols-7 gap-1">
              {DICE_OPTIONS.map((sides) => (
                <button
                  key={sides}
                  onClick={() => setDiceSides(sides)}
                  className={`rounded border py-1.5 text-xs font-bold transition-colors ${diceSides === sides ? 'border-red-500 bg-red-600 text-white' : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800'}`}
                >
                  d{sides}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center justify-between gap-2 text-zinc-400">
                Qtd.
                <input type="number" min="1" max="50" value={diceCount} onChange={(e) => setDiceCount(Number(e.target.value))} className="w-14 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white" />
              </label>
              <label className="flex items-center justify-between gap-2 text-zinc-400">
                Mod.
                <input type="number" value={modifier} onChange={(e) => setModifier(Number(e.target.value))} className="w-14 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white" />
              </label>
            </div>

            {isGM && (
              <label className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs font-bold ${gmSecret ? 'border-amber-800 bg-amber-950/30 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>
                <input type="checkbox" checked={gmSecret} onChange={(e) => setGmSecret(e.target.checked)} />
                {gmSecret ? '🔒 Rolagens secretas (só você vê)' : '👁 Rolagens públicas'}
              </label>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                onClick={() => performRoll({ label: `Rolagem ${formatFormula(diceCount, diceSides, modifier)}`, count: diceCount, sides: diceSides, modifier })}
                className="rounded-lg bg-gradient-to-r from-red-600 to-red-700 py-2.5 font-bold text-white shadow-xl transition-all hover:from-red-500 hover:to-red-600"
              >
                🎲 Rolar {formatFormula(diceCount, diceSides, modifier)}
              </button>
              <button
                onClick={() => performRoll({ label: 'Teste 2d8', count: 2, sides: 8, modifier: 0 })}
                className="rounded-lg border border-zinc-700 px-3 text-xs font-bold text-zinc-300 hover:border-red-600"
                title="O teste padrão do Shinobi no Sho"
              >
                2d8
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Histórico por jogador</p>
            <DiceHistory rolls={rolls} isGM={isGM} onReveal={handleRevealRoll} />
          </div>
        </div>
      </FloatWindow>
    </>
  );
}

/** Janela por cima do mapa: no celular ocupa a tela; no PC fica à direita, ao lado dos botões. */
function FloatWindow({ title, open, onClose, children }) {
  return (
    <div className={`absolute inset-0 z-30 flex flex-col overflow-hidden border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl md:inset-auto md:bottom-2 md:right-16 md:top-2 md:w-[24rem] md:rounded-lg md:border ${open ? '' : 'hidden'}`}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <p className="titulo-shinobi text-lg text-zinc-100">{title}</p>
        <button type="button" onClick={onClose} className="px-1 text-zinc-400 hover:text-white" title="Fechar">✕</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

/** Regras da mesa: o Mestre liga/desliga; os jogadores veem o que está valendo. */
function RulesPanel({ roomId, isGM }) {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let active = true;
    const read = (room) => ({ strict: room?.combat_strict ?? true, autoDamage: Boolean(room?.hud_settings?.auto_damage), defenderChoice: room?.hud_settings?.defender_choice !== false, hud: room?.hud_settings || {} });
    supabase.from('rooms').select('combat_strict, hud_settings').eq('id', roomId).single()
      .then(({ data }) => { if (active) setRules(read(data)); });
    const channel = supabase.channel(`rules_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => setRules(read(payload.new)))
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [roomId]);

  if (!rules) return <p className="text-xs text-zinc-500">Carregando regras…</p>;

  const toggleStrict = async () => {
    setRules({ ...rules, strict: !rules.strict });
    const { error } = await supabase.from('rooms').update({ combat_strict: !rules.strict }).eq('id', roomId);
    if (error) alert('Erro ao salvar: ' + error.message);
  };

  const toggleAutoDamage = async () => {
    const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
    const next = { ...(data?.hud_settings || {}), auto_damage: !rules.autoDamage };
    setRules({ ...rules, autoDamage: !rules.autoDamage });
    const { error } = await supabase.from('rooms').update({ hud_settings: next }).eq('id', roomId);
    if (error) alert('Erro ao salvar: ' + error.message);
  };

  const toggleDefenderChoice = async () => {
    const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
    const next = { ...(data?.hud_settings || {}), defender_choice: !rules.defenderChoice };
    setRules({ ...rules, defenderChoice: !rules.defenderChoice });
    const { error } = await supabase.from('rooms').update({ hud_settings: next }).eq('id', roomId);
    if (error) alert('Erro ao salvar: ' + error.message);
  };

  const Row = ({ title, value, on, onToggle, hint }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        {isGM ? (
          <button type="button" onClick={onToggle} className={`rounded border px-2 py-1 text-[11px] font-bold ${on ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-violet-800 bg-violet-950/40 text-violet-200'}`}>{value}</button>
        ) : (
          <span className={`rounded px-2 py-1 text-[11px] font-bold ${on ? 'bg-emerald-950/50 text-emerald-200' : 'bg-violet-950/40 text-violet-200'}`}>{value}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <Row
        title="Ações e movimento"
        value={rules.strict ? '📖 Regras do livro' : '🎭 Narrativo'}
        on={rules.strict}
        onToggle={toggleStrict}
        hint={rules.strict ? 'Cada um age só no próprio turno e dentro das ações e do deslocamento (págs. 255 e 262).' : 'Tudo liberado: o sistema mostra e registra, mas não trava nada.'}
      />
      <Row
        title="Dano dos ataques"
        value={rules.autoDamage ? 'Automático' : 'Mestre confirma'}
        on={rules.autoDamage}
        onToggle={toggleAutoDamage}
        hint={rules.autoDamage ? 'O dano entra sozinho na Vitalidade do alvo.' : 'O Mestre vê o resultado e pode mudar o valor antes de aplicar.'}
      />
      <Row
        title="Defesa contra ataques"
        value={rules.defenderChoice ? '🛡️ Defensor escolhe' : '⚔️ Atacante escolhe'}
        on={rules.defenderChoice}
        onToggle={toggleDefenderChoice}
        hint={rules.defenderChoice ? 'Quem controla o alvo escolhe Esquiva, Bloquear ou Antecipar (jogador pelo personagem dele, Mestre pelos NPCs). Sem resposta em 30 s, entra a melhor defesa.' : 'Quem ataca escolhe a defesa do alvo na previsão (mais rápido).'}
      />
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
        <p className="mb-1 text-sm font-bold text-zinc-200">Escala do mapa</p>
        1 bloco = 2 m · a diagonal também conta 1 bloco.
      </div>
      {!isGM && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
          <p className="mb-1 text-sm font-bold text-zinc-200">Acima dos tokens você vê</p>
          {['show_names', 'show_hp', 'show_chakra'].filter((k) => rules.hud[k] ?? (k !== 'show_chakra')).map((k) => ({ show_names: 'Nomes', show_hp: 'Vitalidade', show_chakra: 'Chakra' }[k])).join(' · ') || 'Nada'}
        </div>
      )}
    </div>
  );
}
