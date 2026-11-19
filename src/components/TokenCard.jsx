import { useEffect, useState } from 'react';
import { combatProfile } from '../services/Attack';
import { deslocamentoBlocos, deslocamentoMetros } from '../services/Movement';
import { sizeInfo, sizeOf } from '../data/Tamanhos';
import { normalizeModes } from '../services/Combat';
import CondicoesPanel from './CondicoesPanel.jsx';
import { supabase } from '../services/supabase/client';

/**
 * Card do personagem selecionado (toque/clique num token), estilo tático.
 * Mostra o que o jogador pode ver: Vitalidade/Chakra seguem o HUD do Mestre;
 * defesas e precisões só para o Mestre e para o dono da ficha.
 */
export default function TokenCard({ tokenData, engineRef, isGM, playerId, playerName, roomId, onClose }) {
  const [, setTick] = useState(0);

  // A ficha muda pelo Realtime (dano, chakra): relê do mapa a cada segundo.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const engine = engineRef.current;
  const character = engine?.characters?.[tokenData.character_id] || null;
  const image = tokenData.sprite?.url || character?.avatar_url || tokenData.image_url || null;

  if (!character) {
    return (
      <CardShell onClose={onClose} image={image} title={tokenData.name || 'Token'} subtitle="Sem ficha vinculada" />
    );
  }

  const isOwner = Boolean(playerId) && character.owner_id === playerId;
  const canSee = (key) => isGM || isOwner || engine?.hudPermitido?.(key, character.id);
  const seeDetails = isGM || isOwner;
  const hp = Number(character.hp_current ?? character.hp_max ?? 0);
  const hpMax = Number(character.hp_max || 1);
  const ck = Number(character.chakra_current ?? 0);
  const ckMax = Number(character.chakra_max || 0);
  const size = sizeInfo(sizeOf(character));
  const modes = normalizeModes(character.active_modes).filter((mode) => !mode.condicao && !/^(sangrando|morrendo)/i.test(mode.name || ''));
  const profile = seeDetails ? combatProfile(character) : null;

  return (
    <CardShell
      onClose={onClose}
      image={image}
      title={character.name}
      subtitle={[character.rank, character.clan].filter(Boolean).join(' · ')}
      resumo={(
        <div className="flex gap-2 text-[10px] font-bold">
          {canSee('show_hp') && <span className="text-emerald-300">❤ {hp}/{hpMax}</span>}
          {canSee('show_chakra') && ckMax > 0 && <span className="text-sky-300">🔷 {ck}/{ckMax}</span>}
        </div>
      )}
    >
      {canSee('show_hp') && <Bar label="Vitalidade" now={hp} max={hpMax} color="bg-emerald-500" />}
      {canSee('show_chakra') && ckMax > 0 && <Bar label="Chakra" now={ck} max={ckMax} color="bg-sky-500" />}

      <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
        <Info label="Tamanho" value={size.label} />
        <Info label="Deslocamento" value={`${deslocamentoBlocos(character)} bl. (${deslocamentoMetros(character)} m)`} />
        {profile && <Info label="Esquiva" value={`Dif ${profile.defenses.esquiva.dificuldade}`} />}
        {profile && <Info label="Bloq. / Antec." value={`${profile.defenses.bloqueio.possivel ? `+${profile.defenses.bloqueio.precisao}` : '—'} / +${profile.defenses.antecipar.precisao}`} />}
      </div>

      {modes.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {modes.map((mode) => (
            <span key={mode.id} className="rounded bg-red-950/70 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
              {mode.name}{mode.turns != null ? ` (${mode.turns})` : ''}
            </span>
          ))}
        </div>
      )}
      {isGM && <HudDoPersonagem engine={engine} roomId={roomId} characterId={character.id} />}
      <CondicoesPanel character={character} engineRef={engineRef} roomId={roomId} isGM={isGM} canAct={seeDetails || Boolean(playerId)} playerName={playerName} />
      {hp <= 0 && <p className="mt-1 text-[11px] font-bold text-red-400">{hp === 0 ? 'Fora de combate' : hp <= -21 ? 'Morto' : hp <= -11 ? 'Morrendo' : 'Inconsciente'}</p>}
    </CardShell>
  );
}

// No celular o card começa recolhido (uma linha) para não tapar o mapa; toque em ▾ para ver tudo.
// Fica à direita, ao lado dos botões Ficha/Combate/Dados, longe do botão de voz (que fica à esquerda).
function CardShell({ image, title, subtitle, resumo, onClose, children }) {
  const [aberto, setAberto] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  return (
    <div className="pointer-events-auto absolute right-16 top-[7.75rem] z-30 w-[min(13rem,calc(100vw-5rem))] md:top-2 rounded-lg border border-zinc-700 bg-zinc-950/95 p-2 text-zinc-100 shadow-2xl backdrop-blur md:right-20 md:w-64">
      <div className="flex items-start gap-2">
        <div className={`flex shrink-0 items-end justify-center overflow-hidden rounded border border-zinc-700 bg-zinc-900 ${aberto ? 'h-14 w-12' : 'h-8 w-7'}`}>
          {image ? <img src={image} alt="" className="max-h-full max-w-full object-contain" /> : <span className={aberto ? 'pb-3 text-xl' : 'text-sm'}>👤</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{title}</p>
          {aberto ? (subtitle && <p className="truncate text-[10px] text-zinc-400">{subtitle}</p>) : resumo}
        </div>
        {children && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="px-1 text-zinc-400 hover:text-white" title={aberto ? 'Recolher' : 'Ver tudo'}>
            {aberto ? '▴' : '▾'}
          </button>
        )}
        <button type="button" onClick={onClose} className="px-1 text-zinc-500 hover:text-white" title="Fechar">✕</button>
      </div>
      {children && aberto && <div className="mt-1.5 max-h-[50vh] overflow-y-auto md:max-h-none">{children}</div>}
    </div>
  );
}

const HUD_ITENS = [
  { key: 'show_names', label: 'Nome' },
  { key: 'show_hp', label: 'Vida' },
  { key: 'show_chakra', label: 'Chakra' },
];

/**
 * Só o Mestre: o que os jogadores veem deste personagem (ex.: esconder a vida de um inimigo).
 * Sem escolha aqui, vale o padrão da mesa (painel Cenário). O dono da ficha sempre vê o dele.
 */
function HudDoPersonagem({ engine, roomId, characterId }) {
  const [, setTick] = useState(0);
  const hud = engine?.hudSettings || {};
  const escolhas = hud.por_personagem?.[characterId] || {};

  const alternar = async (key) => {
    // Lê a sala de novo para não apagar escolhas feitas em outro lugar.
    const { data } = await supabase.from('rooms').select('hud_settings').eq('id', roomId).single();
    const atual = data?.hud_settings || hud;
    const padrao = Boolean(atual[key]);
    const minhas = { ...(atual.por_personagem?.[characterId] || {}) };
    const agora = minhas[key] ?? padrao;
    if (!agora === padrao) delete minhas[key];
    else minhas[key] = !agora;
    const porPersonagem = { ...(atual.por_personagem || {}) };
    if (Object.keys(minhas).length) porPersonagem[characterId] = minhas;
    else delete porPersonagem[characterId];
    const next = { ...atual, por_personagem: porPersonagem };
    engine?.setHud(next); // aplica na hora na tela do Mestre
    setTick((n) => n + 1);
    const { error } = await supabase.from('rooms').update({ hud_settings: next }).eq('id', roomId);
    if (error) alert('Erro ao salvar: ' + error.message);
  };

  return (
    <div className="mt-1 rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-1">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Jogadores veem</p>
      <div className="mt-0.5 flex gap-1">
        {HUD_ITENS.map(({ key, label }) => {
          const proprio = escolhas[key] !== undefined && escolhas[key] !== null;
          const ve = proprio ? Boolean(escolhas[key]) : Boolean(hud[key]);
          return (
            <button key={key} type="button" onClick={() => alternar(key)}
              title={proprio ? 'Escolha só deste personagem (toque para voltar ao padrão da mesa)' : 'Padrão da mesa (toque para mudar só neste personagem)'}
              className={`flex-1 rounded border py-0.5 text-[10px] font-bold ${ve ? 'border-emerald-700 bg-emerald-950/60 text-emerald-200' : 'border-zinc-700 text-zinc-500 line-through'}`}>
              {label}{proprio ? ' •' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ label, now, max, color }) {
  const pct = Math.max(0, Math.min(100, (now / Math.max(1, max)) * 100));
  return (
    <div className="mt-1">
      <div className="flex justify-between text-[10px] text-zinc-400"><span>{label}</span><span className="font-bold text-zinc-200">{now}/{max}</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-zinc-800"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded bg-zinc-900 px-1.5 py-1">
      <p className="text-[9px] text-zinc-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
