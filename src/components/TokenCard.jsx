import { useEffect, useState } from 'react';
import { combatProfile } from '../services/Attack';
import { deslocamentoBlocos, deslocamentoMetros } from '../services/Movement';
import { sizeInfo, sizeOf } from '../data/Tamanhos';
import { normalizeModes } from '../services/Combat';
import CondicoesPanel from './CondicoesPanel.jsx';

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
  const canSee = (key) => isGM || isOwner || engine?.canSeeHud?.(key);
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
      <CondicoesPanel character={character} engineRef={engineRef} roomId={roomId} isGM={isGM} canAct={seeDetails || Boolean(playerId)} playerName={playerName} />
      {hp <= 0 && <p className="mt-1 text-[11px] font-bold text-red-400">{hp === 0 ? 'Fora de combate' : hp <= -21 ? 'Morto' : hp <= -11 ? 'Morrendo' : 'Inconsciente'}</p>}
    </CardShell>
  );
}

function CardShell({ image, title, subtitle, onClose, children }) {
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 w-60 rounded-lg border border-zinc-700 bg-zinc-950/95 p-2 text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="flex h-14 w-12 shrink-0 items-end justify-center overflow-hidden rounded border border-zinc-700 bg-zinc-900">
          {image ? <img src={image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="pb-3 text-xl">👤</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{title}</p>
          {subtitle && <p className="truncate text-[10px] text-zinc-400">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="px-1 text-zinc-500 hover:text-white" title="Fechar">✕</button>
      </div>
      {children && <div className="mt-1.5">{children}</div>}
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
