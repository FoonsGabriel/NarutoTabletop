import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase/client';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  CREATURE_SIZES,
  CREATURE_SPECIES,
  NPC_STYLES,
  allowedSizes,
  buildNpc,
  isNpcInstance,
  isNpcTemplate,
} from '../services/Npc';
import AppearanceEditor from './AppearanceEditor.jsx';
import { APARENCIAS_PADRAO, figureFor } from '../data/Aparencias';
import { spawnPoints, withActiveMap } from '../canvas/Spawn';
import { GRADUACOES, VILAS } from '../data/Ficha';
import { uid } from '../services/Uid';

/**
 * Gerador rápido: o papel só escolhe o estilo de luta (pág. 281), o foco em Percepção
 * e as armas. Atributos, Vitalidade e Chakra seguem a regra do Bestiário pelo NC.
 */
const PAPEIS = {
  lutador: { label: 'Lutador (Taijutsu)', style: 'taijutsu', armas: ['kunai'] },
  espadachim: { label: 'Espadachim', style: 'taijutsu', armas: ['katana', 'kunai'] },
  ninjutsu: { label: 'Ninjutsu', style: 'ninjutsu', armas: ['kunai', 'shuriken'] },
  genjutsu: { label: 'Genjutsu', style: 'genjutsu', armas: ['kunai'] },
  sensor: { label: 'Sensor', style: 'genjutsu', usePerception: true, armas: ['kunai', 'senbon'] },
  atirador: { label: 'Atirador (armas de arremesso)', style: 'ninjutsu', usePerception: true, armas: ['shuriken', 'kunai'] },
  medico: { label: 'Ninja médico', style: 'ninjutsu', armas: ['kunai', 'senbon'] },
  capanga: { label: 'Capanga (1 de Vitalidade)', capanga: true },
};

const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white focus:border-red-500 focus:outline-none';
const EMPTY_FORM = { type: 'capanga', name: '', nc: 4, style: 'taijutsu', usePerception: false, avatarUrl: '', figure: {}, species: 'caes', size: 'medio', vila: '' };

// Ajustes do Mestre: deixam um bicho padrão mais forte ou mais fraco (só na cópia desta mesa).
const EMPTY_TUNE = { hpMult: 1, hpBonus: 0, attrBonus: 0, precisaoBonus: 0, danoBonus: 0 };

/** Todos os PdMs padrão do sistema (Livro Básico págs. 280–281 e Kuchiyose dos livros). */
const SINGULAR = {
  aguias: 'Águia', caes: 'Cão Ninja', cobras: 'Cobra', lesmas: 'Lesma', macacos: 'Macaco', sapos: 'Sapo',
  tubaroes: 'Tubarão', baku: 'Baku', doninhas: 'Doninha', mariscos: 'Marisco', salamandras: 'Salamandra', tartarugas: 'Tartaruga',
};

const BESTIARY = [
  { key: 'capanga', label: 'Capanga', sub: 'Básico · pág. 281', form: { type: 'capanga' }, img: APARENCIAS_PADRAO.capanga },
  { key: 'taijutsu', name: 'Ninja de Taijutsu', label: 'Inimigo Taijutsu', sub: 'Básico · pág. 281', form: { type: 'inimigo', style: 'taijutsu' }, img: APARENCIAS_PADRAO.inimigo.taijutsu },
  { key: 'ninjutsu', name: 'Ninja de Ninjutsu', label: 'Inimigo Ninjutsu', sub: 'Básico · pág. 281', form: { type: 'inimigo', style: 'ninjutsu' }, img: APARENCIAS_PADRAO.inimigo.ninjutsu },
  { key: 'genjutsu', name: 'Ninja de Genjutsu', label: 'Inimigo Genjutsu', sub: 'Básico · pág. 281', form: { type: 'inimigo', style: 'genjutsu' }, img: APARENCIAS_PADRAO.inimigo.genjutsu },
  ...Object.entries(APARENCIAS_PADRAO.vila).map(([key, vila]) => ({
    key: `vila_${key}`,
    name: `Ninja de ${vila.label}`,
    label: vila.label,
    sub: 'Inimigo · escolha o estilo',
    form: { type: 'inimigo', style: 'taijutsu', vila: key },
    img: { url: vila.url, fallback: '/sprites/Inimigo-Padrao.png' },
  })),
  ...Object.entries(CREATURE_SPECIES).map(([key, species]) => ({
    key,
    name: SINGULAR[key] || species.label,
    label: species.label,
    sub: species.livro || 'Básico · Kuchiyose',
    form: { type: 'criatura', species: key },
    img: { url: APARENCIAS_PADRAO.criatura[key], fallback: '/sprites/Inimigo-Padrao.png' },
  })),
];

/** Aplica os ajustes do Mestre na ficha montada pelas regras. */
function tuneNpc(npc, tune) {
  const t = { ...EMPTY_TUNE, ...(tune || {}) };
  const changed = Object.keys(EMPTY_TUNE).some((k) => Number(t[k]) !== EMPTY_TUNE[k]);
  if (!changed) return npc;

  const data = npc.attributes || {};
  const meta = { ...(data.npc || {}) };
  let attributes = data.attributes;
  if (attributes && Number(t.attrBonus)) {
    attributes = Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, Math.max(0, Number(v) + Number(t.attrBonus))]));
  }

  const precision = Number(t.precisaoBonus) || 0;
  const damage = Number(t.danoBonus) || 0;
  let combatBase = data.combat_base;
  if (meta.type === 'capanga') {
    meta.precisao_ataque = Number(meta.precisao_ataque || 0) + precision;
    meta.precisao_defesa = Number(meta.precisao_defesa || 0) + precision;
    meta.dano = Math.max(0, Number(meta.dano || 0) + damage);
  } else {
    if (precision) combatBase = { cc: 3 + precision, cd: 3 + precision, esq: 3 + precision, lm: 3 + precision };
    if (damage) meta.dano_bonus = damage;
  }

  const hp = Math.max(1, Math.round(Number(npc.hp_max || 1) * Number(t.hpMult || 1) + Number(t.hpBonus || 0)));
  meta.ajustes = t;
  return {
    ...npc,
    rank: `${npc.rank} · ajustado`,
    hp_max: hp,
    hp_current: hp,
    attributes: { ...data, attributes, ...(combatBase ? { combat_base: combatBase } : {}), npc: meta },
  };
}

const defaultAvatar = (seed) => `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(seed)}`;

/** Painel do Mestre: modelos de NPC (capangas e inimigos) e colocação no mapa. */
export default function NpcPanel({ roomId }) {
  const [npcs, setNpcs] = useState([]);
  const [gridSize, setGridSize] = useState(64);
  const [form, setForm] = useState(null); // null = formulário fechado
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadNpcs = useCallback(async () => {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_npc', true)
      .order('created_at');
    if (error) console.error('Erro ao carregar NPCs:', error);
    else setNpcs(data || []);
  }, [roomId]);

  useEffect(() => {
    loadNpcs();
    supabase.from('rooms').select('grid_size').eq('id', roomId).single()
      .then(({ data }) => setGridSize(data?.grid_size || 64));

    const channel = supabase
      .channel(`npcs_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `room_id=eq.${roomId}` }, loadNpcs)
      // Exclusões chegam só com o id (sem room_id), então o filtro por sala as descartaria.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'characters' }, (payload) => {
        setNpcs((list) => list.filter((npc) => npc.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadNpcs]);

  const templates = useMemo(() => npcs.filter(isNpcTemplate), [npcs]);
  const instancesOf = (templateId) => npcs.filter((npc) => isNpcInstance(npc) && npc.attributes.npc.template_id === templateId);

  // ---------------- Criar modelo ----------------

  const createTemplate = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);

    const npc = tuneNpc(buildNpc(form), form.tune);
    if (form.figure?.url) npc.attributes.npc.figure = form.figure;
    if (form.vila && form.type !== 'criatura') npc.attributes.npc.vila = form.vila;
    const { data: created, error } = await supabase.from('characters').insert({
      ...npc,
      room_id: roomId,
      owner_id: null,
      is_npc: true,
      active_modes: [],
      overrides: {},
    }).select('*').single();

    setBusy(false);
    if (error) {
      alert('Erro ao criar NPC: ' + error.message);
      return;
    }
    const quantity = Number(form.placeNow || 0);
    setForm(null);
    loadNpcs();
    if (created && quantity > 0) {
      await placeOnMap(created, quantity);
    } else {
      setNotice(`${npc.name} salvo nos modelos da mesa. Use "Colocar no mapa" para adicioná-lo ao tabuleiro.`);
    }
  };

  // ---------------- Colocar no mapa ----------------

  /** Cria N cópias independentes (cada uma com sua própria Vitalidade) e seus tokens. */
  const placeOnMap = async (template, quantity) => {
    if (busy) return;
    setBusy(true);
    setNotice('');

    const existing = instancesOf(template.id).length;
    const copies = Array.from({ length: quantity }, (_, index) => {
      // eslint-disable-next-line no-unused-vars
      const { id, created_at, ...fields } = template;
      return {
        ...fields,
        name: quantity === 1 && existing === 0 ? template.name : `${template.name} ${existing + index + 1}`,
        attributes: {
          ...template.attributes,
          npc: { ...template.attributes.npc, template: false, template_id: template.id },
        },
        active_modes: [],
      };
    });

    const { data: created, error } = await supabase.from('characters').insert(copies).select('*');
    if (error) {
      setBusy(false);
      alert('Erro ao criar as cópias: ' + error.message);
      return;
    }

    // Tokens no meio da tela de quem clicou, em blocos livres ao redor.
    const spots = spawnPoints(created.length, gridSize);
    const tokens = created.map((character, index) => ({
      room_id: roomId,
      character_id: character.id,
      name: character.name,
      image_url: template.avatar_url || defaultAvatar(template.name),
      x: spots[index].x,
      y: spots[index].y,
      width: 1,
      height: 1,
      rotation: 0,
      layer: 'token',
      is_hidden: false,
      is_clone: false,
      sprite: withActiveMap(figureFor(template)), // corpo inteiro do modelo (preso ao mapa em uso)
    }));

    const { error: tokenError } = await supabase.from('map_tokens').insert(tokens);
    setBusy(false);

    if (tokenError) {
      alert('As fichas foram criadas, mas os tokens não: ' + tokenError.message);
      return;
    }
    setNotice(`${quantity}× ${template.name} no mapa.`);
  };

  // ---------------- Gerador rápido ----------------

  const [quick, setQuick] = useState({ vila: 'Konoha', grad: 'Chuunin', papel: 'lutador', qtd: 2 });

  const quickCreate = async () => {
    if (busy) return;
    const papel = PAPEIS[quick.papel];
    const grad = GRADUACOES.find((g) => g.valor === quick.grad) || GRADUACOES[1];
    const vila = VILAS.find((v) => v.valor === quick.vila);
    const vilaNome = quick.vila === 'Nukenin' ? 'Nukenin' : `de ${quick.vila}`;
    const name = papel.capanga ? `Capanga ${vilaNome}` : `${grad.valor} ${vilaNome}${quick.papel === 'lutador' ? '' : ` (${papel.label.replace(/ \(.*\)$/, '')})`}`;
    const npc = buildNpc({ type: papel.capanga ? 'capanga' : 'inimigo', name, nc: grad.nc, style: papel.style, usePerception: Boolean(papel.usePerception) });
    if (vila && quick.vila !== 'Nukenin') npc.attributes.npc.vila = quick.vila.toLowerCase();
    if (papel.armas) npc.attributes.equipment = { weapons: papel.armas.map((id) => ({ uid: uid(), id })), armor: 'nenhuma' };
    npc.attributes.npc.notas = `${papel.label} · ${grad.valor} (NC ${grad.nc}) · gerado pelo gerador rápido`;

    setBusy(true);
    const { data: created, error } = await supabase.from('characters').insert({
      ...npc, room_id: roomId, owner_id: null, is_npc: true, active_modes: [], overrides: {},
    }).select('*').single();
    setBusy(false);
    if (error) { alert('Erro ao criar NPC: ' + error.message); return; }
    loadNpcs();
    if (created) await placeOnMap(created, Math.max(1, Math.min(8, Number(quick.qtd) || 1)));
  };

  // ---------------- Editar / apagar modelo ----------------

  const saveTemplate = async (template, patch) => {
    const { error } = await supabase.from('characters').update(patch).eq('id', template.id);
    if (error) alert('Erro ao salvar: ' + error.message);
    else {
      setEditingId(null);
      loadNpcs();
    }
  };

  const deleteTemplate = async (template) => {
    if (!window.confirm(`Apagar o modelo "${template.name}"? As cópias que já estão no mapa continuam.`)) return;
    const { error } = await supabase.from('characters').delete().eq('id', template.id);
    if (error) alert('Erro ao apagar: ' + error.message);
    else loadNpcs();
  };

  const preview = form ? tuneNpc(buildNpc(form), form.tune) : null;
  const openFromBestiary = (entry) => {
    const base = { ...EMPTY_FORM, ...entry.form, name: entry.name || entry.label, tune: { ...EMPTY_TUNE }, placeNow: 1 };
    const sizes = allowedSizes(base.species, base.nc);
    setForm({ ...base, size: sizes.includes('medio') ? 'medio' : sizes[sizes.length - 1] });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-white">
      <div className="border-b border-zinc-800 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">Painel do Mestre</p>
        <h3 className="text-lg font-black">📖 Bestiário</h3>
        <p className="text-[10px] text-zinc-500">Escolha um inimigo ou criatura padrão do sistema. Ajuste o NC, o tamanho e, se quiser, deixe mais forte ou mais fraco.</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {notice && <div className="rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-200">{notice}</div>}

        {/* ---------- Gerador rápido ---------- */}
        {!form && (
          <section className="space-y-2 rounded-lg border border-red-900/60 bg-red-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-300">⚡ Gerador rápido</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-zinc-400">Vila
                <select value={quick.vila} onChange={(e) => setQuick({ ...quick, vila: e.target.value })} className={`${inputClass} mt-0.5`}>
                  {VILAS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
                </select>
              </label>
              <label className="text-[10px] text-zinc-400">Graduação
                <select value={quick.grad} onChange={(e) => setQuick({ ...quick, grad: e.target.value })} className={`${inputClass} mt-0.5`}>
                  {GRADUACOES.map((g) => <option key={g.valor} value={g.valor}>{g.valor} (NC {g.nc})</option>)}
                </select>
              </label>
              <label className="text-[10px] text-zinc-400">Papel
                <select value={quick.papel} onChange={(e) => setQuick({ ...quick, papel: e.target.value })} className={`${inputClass} mt-0.5`}>
                  {Object.entries(PAPEIS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                </select>
              </label>
              <label className="text-[10px] text-zinc-400">Quantos
                <select value={quick.qtd} onChange={(e) => setQuick({ ...quick, qtd: Number(e.target.value) })} className={`${inputClass} mt-0.5`}>
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <button type="button" disabled={busy} onClick={quickCreate} className="w-full rounded bg-red-600 py-2 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50">
              Gerar e colocar no mapa
            </button>
          </section>
        )}

        {/* ---------- Galeria do Bestiário ---------- */}
        {!form && (
          <div className="grid grid-cols-3 gap-1.5">
            {BESTIARY.map((entry) => (
              <button key={entry.key} type="button" onClick={() => openFromBestiary(entry)}
                className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 text-center hover:border-red-600">
                <BestiaryImage img={entry.img} />
                <span className="mt-1 text-[11px] font-bold leading-tight">{entry.label}</span>
                <span className="text-[9px] leading-tight text-zinc-500">{entry.sub}</span>
              </button>
            ))}
            <button type="button" onClick={() => setForm({ ...EMPTY_FORM, tune: { ...EMPTY_TUNE }, placeNow: 1 })}
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 p-1.5 text-[11px] font-bold text-zinc-400 hover:border-red-600 hover:text-white">
              <span className="text-2xl">✏️</span>Do zero
            </button>
          </div>
        )}

        {/* ---------- Formulário de criação ---------- */}
        {form && (
          <form onSubmit={createTemplate} className="space-y-2 rounded-lg border border-red-900 bg-zinc-950 p-3">
            <div className="grid grid-cols-3 gap-1">
              {[['capanga', 'Capanga'], ['inimigo', 'Inimigo'], ['criatura', 'Criatura']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setForm({ ...form, type: value })}
                  className={`rounded border py-1.5 text-xs font-bold ${form.type === value ? 'border-red-500 bg-red-900/60' : 'border-zinc-700 text-zinc-400'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1">
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.type === 'capanga' ? 'Ex.: Bandido' : 'Ex.: Nukenin da Névoa'} className={`${inputClass} col-span-2`} />
              <input type="number" min="4" max="20" value={form.nc} onChange={(e) => {
                const nc = Number(e.target.value);
                const sizes = allowedSizes(form.species, nc);
                setForm({ ...form, nc, size: sizes.includes(form.size) ? form.size : (sizes.includes('medio') ? 'medio' : sizes[sizes.length - 1]) });
              }} title="Nível da Campanha (NC)" className={inputClass} />
            </div>

            {form.type === 'criatura' && (
              <div className="grid grid-cols-2 gap-1">
                <select
                  value={form.species}
                  onChange={(e) => {
                    const species = e.target.value;
                    const sizes = allowedSizes(species, form.nc);
                    setForm({ ...form, species, size: sizes.includes(form.size) ? form.size : 'medio' });
                  }}
                  className={inputClass}
                >
                  {Object.entries(CREATURE_SPECIES).map(([key, species]) => <option key={key} value={key}>{species.label}</option>)}
                </select>
                <select
                  value={form.size}
                  onChange={(e) => {
                    const size = e.target.value;
                    // Altura no mapa acompanha o tamanho (se já tiver imagem).
                    const figure = form.figure?.url ? { ...form.figure, heightCells: CREATURE_SIZES[size].heightCells } : form.figure;
                    setForm({ ...form, size, figure });
                  }}
                  className={inputClass}
                >
                  {allowedSizes(form.species, form.nc).map((key) => <option key={key} value={key}>{CREATURE_SIZES[key].label}</option>)}
                </select>
              </div>
            )}

            {form.type === 'inimigo' && (
              <>
                <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className={inputClass}>
                  {Object.entries(NPC_STYLES).map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}
                </select>
                {form.style !== 'taijutsu' && (
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input type="checkbox" checked={form.usePerception} onChange={(e) => setForm({ ...form, usePerception: e.target.checked })} />
                    Focar Percepção no lugar de Agilidade
                  </label>
                )}
              </>
            )}

            {form.type !== 'criatura' && (
              <select value={form.vila || ''} onChange={(e) => setForm({ ...form, vila: e.target.value })} title="Vila (muda a aparência)" className={inputClass}>
                <option value="">Sem vila (aparência do estilo)</option>
                {Object.entries(APARENCIAS_PADRAO.vila).map(([key, vila]) => <option key={key} value={key}>{vila.label}</option>)}
              </select>
            )}

            <AppearanceEditor value={form.figure} onChange={(figure) => setForm({ ...form, figure })} />

            <TuneEditor tune={form.tune || EMPTY_TUNE} isCapanga={form.type === 'capanga'} onChange={(tune) => setForm({ ...form, tune })} />

            {preview && <StatBlock npc={preview} />}

            <p className="text-[10px] text-zinc-600">
              {form.type === 'capanga'
                ? 'Regra do livro (pág. 281): precisão 3 + NC, dano NC − 3, 1 de Vitalidade.'
                : form.type === 'criatura'
                  ? 'Regra do Kuchiyose (págs. 225–229): atributos principais da espécie, ajuste de tamanho, Vitalidade pela metade, dano = Força − 3.'
                  : 'Regra do livro (pág. 281): máximo de pontos nos atributos do estilo; perícias usam o nível do atributo.'}
            </p>

            <div className="flex gap-1">
              <label className="flex items-center gap-1 text-[11px] text-zinc-400" title="Quantos colocar no mapa agora (0 = só salvar o modelo)">
                No mapa
                <input type="number" min="0" max="20" value={form.placeNow ?? 1} onChange={(e) => setForm({ ...form, placeNow: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                  className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 py-1.5 text-center text-sm text-white" />
              </label>
              <button type="submit" disabled={busy || !form.name.trim()} className="flex-1 rounded bg-red-600 py-2 text-sm font-bold hover:bg-red-700 disabled:opacity-40">
                {Number(form.placeNow ?? 1) > 0 ? `Criar e colocar ${form.placeNow ?? 1}` : 'Salvar modelo'}
              </button>
              <button type="button" onClick={() => setForm(null)} className="rounded border border-zinc-700 px-3 text-sm text-zinc-400 hover:text-white">Cancelar</button>
            </div>
          </form>
        )}

        {/* ---------- Lista de modelos ---------- */}
        {templates.length > 0 && <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Modelos desta mesa</p>}

        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onMap={instancesOf(template.id).length}
            editing={editingId === template.id}
            busy={busy}
            onEdit={() => setEditingId(editingId === template.id ? null : template.id)}
            onPlace={(quantity) => placeOnMap(template, quantity)}
            onSave={(patch) => saveTemplate(template, patch)}
            onDelete={() => deleteTemplate(template)}
          />
        ))}
      </div>
    </div>
  );
}

/** Resumo dos números de um NPC. */
function StatBlock({ npc }) {
  const info = npc.attributes?.npc || {};
  const attrs = npc.attributes?.attributes;

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px]">
      <div className="mb-1 flex justify-between">
        <span className="text-zinc-400">{npc.rank} · NC {npc.level}</span>
        <span className="font-bold">VIT {npc.hp_max} · CK {npc.chakra_max}</span>
      </div>

      {info.type === 'capanga' ? (
        <p className="text-zinc-300">Ataque +{info.precisao_ataque} · Defesa +{info.precisao_defesa} · Dano {info.dano} · Iniciativa +{info.iniciativa}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
            {ATTRIBUTE_KEYS.map((key) => (
              <span key={key} className="flex justify-between text-zinc-400">
                {ATTRIBUTE_LABELS[key].slice(0, 3)} <b className="text-white">{attrs?.[key] ?? 0}</b>
              </span>
            ))}
          </div>
          <p className="mt-1 text-zinc-400">
            Iniciativa +{info.iniciativa}
            {info.type === 'criatura' && <> · Dano {info.dano} · {info.pontos_poder} pts de poder</>}
          </p>
          {info.type === 'criatura' && info.notas && (
            <details className="mt-1">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Regras da espécie</summary>
              <p className="mt-1 whitespace-pre-line text-[10px] leading-snug text-zinc-400">{info.notas}</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCard({ template, onMap, editing, busy, onEdit, onPlace, onSave, onDelete }) {
  const [quantity, setQuantity] = useState(1);
  const info = template.attributes?.npc || {};
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (editing) {
      setDraft({
        name: template.name,
        avatar_url: template.avatar_url || '',
        hp_max: template.hp_max,
        chakra_max: template.chakra_max,
        iniciativa: info.iniciativa ?? 0,
        precisao_ataque: info.precisao_ataque ?? 0,
        precisao_defesa: info.precisao_defesa ?? 0,
        dano: info.dano ?? 0,
        notas: info.notas || '',
        figure: info.figure || {},
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const npc = {
      ...info,
      iniciativa: Number(draft.iniciativa),
      notas: draft.notas,
      figure: draft.figure?.url ? draft.figure : undefined,
      ...(info.type === 'capanga'
        ? { precisao_ataque: Number(draft.precisao_ataque), precisao_defesa: Number(draft.precisao_defesa), dano: Number(draft.dano) }
        : {}),
    };
    onSave({
      name: draft.name.trim() || template.name,
      avatar_url: draft.avatar_url || null,
      hp_max: Number(draft.hp_max),
      hp_current: Number(draft.hp_max),
      chakra_max: Number(draft.chakra_max),
      chakra_current: Number(draft.chakra_max),
      attributes: { ...template.attributes, npc },
    });
  };

  const field = (key, label) => (
    <label className="text-[10px] text-zinc-500">
      {label}
      <input type="number" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={inputClass} />
    </label>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 p-2">
        <img src={figureFor(template).url} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = template.avatar_url || defaultAvatar(template.name); }} alt="" className="h-10 w-10 shrink-0 rounded bg-zinc-800 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{template.name}</p>
          <p className="truncate text-[10px] text-zinc-500">{template.rank} · NC {template.level}{onMap ? ` · ${onMap} no mapa` : ''}</p>
        </div>
        <button onClick={onEdit} title="Editar modelo" className="text-xs text-zinc-500 hover:text-white">✏️</button>
        <button onClick={onDelete} title="Apagar modelo" className="text-xs text-zinc-600 hover:text-red-400">✕</button>
      </div>

      {!editing && <div className="px-2 pb-2"><StatBlock npc={template} /></div>}

      {editing && draft && (
        <div className="space-y-2 border-t border-zinc-800 p-2">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
          <input value={draft.avatar_url} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })} placeholder="URL da imagem" className={inputClass} />
          <div className="grid grid-cols-3 gap-1">
            {field('hp_max', 'Vitalidade')}
            {field('chakra_max', 'Chakra')}
            {field('iniciativa', 'Iniciativa')}
            {info.type === 'capanga' && field('precisao_ataque', 'Ataque')}
            {info.type === 'capanga' && field('precisao_defesa', 'Defesa')}
            {info.type === 'capanga' && field('dano', 'Dano')}
          </div>
          <AppearanceEditor value={draft.figure} onChange={(figure) => setDraft({ ...draft, figure })} />
          <textarea value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} placeholder="Notas (técnicas, táticas…)" className={`${inputClass} min-h-14`} />
          <p className="text-[10px] text-zinc-600">Mudanças valem para as próximas cópias; as que já estão no mapa não mudam.</p>
          <button onClick={save} className="w-full rounded bg-emerald-700 py-1.5 text-xs font-bold hover:bg-emerald-600">Salvar modelo</button>
        </div>
      )}

      <div className="flex gap-1 border-t border-zinc-800 p-2">
        <input type="number" min="1" max="20" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} title="Quantidade" className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1 text-center text-sm" />
        <button onClick={() => onPlace(quantity)} disabled={busy} className="flex-1 rounded bg-zinc-800 py-1.5 text-xs font-bold hover:bg-zinc-700 disabled:opacity-40">
          📍 Colocar {quantity > 1 ? `${quantity}×` : ''} no mapa
        </button>
      </div>
    </div>
  );
}

/** Imagem do card do Bestiário: tenta a imagem do tipo, depois a genérica, depois um ícone. */
function BestiaryImage({ img }) {
  const [src, setSrc] = useState(img?.url);
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <div className="flex h-14 w-12 items-center justify-center text-2xl">🐾</div>;
  return (
    <img
      src={src}
      alt=""
      className="h-14 w-12 object-contain"
      onError={() => {
        if (img?.fallback && src !== img.fallback) setSrc(img.fallback);
        else setFailed(true);
      }}
    />
  );
}

/** Ajustes do Mestre: fortalecer ou enfraquecer o bicho padrão. */
function TuneEditor({ tune, isCapanga, onChange }) {
  const set = (key, value) => onChange({ ...tune, [key]: value });
  const num = (key, props = {}) => (
    <input type="number" value={tune[key]} onChange={(e) => set(key, Number(e.target.value) || 0)}
      className="w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-center text-sm text-white" {...props} />
  );
  return (
    <details className="rounded border border-amber-900/60 bg-amber-950/10">
      <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-amber-300">⚙️ Ajustes do Mestre (mais forte / mais fraco)</summary>
      <div className="grid grid-cols-2 gap-1.5 p-2 text-[10px] text-zinc-400">
        <label>Vitalidade ×
          <select value={tune.hpMult} onChange={(e) => set('hpMult', Number(e.target.value))}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-sm text-white">
            {[0.5, 1, 1.5, 2, 3, 5].map((m) => <option key={m} value={m}>×{m}</option>)}
          </select>
        </label>
        <label>Vitalidade +/−{num('hpBonus')}</label>
        {!isCapanga && <label>Todos os atributos +/−{num('attrBonus', { min: -5, max: 10 })}</label>}
        <label>Precisão +/−{num('precisaoBonus', { min: -5, max: 10 })}</label>
        <label>Dano base +/−{num('danoBonus', { min: -5, max: 20 })}</label>
        <p className="col-span-2 text-[10px] text-zinc-500">Vale só para este modelo da mesa; o bicho padrão do livro não muda.</p>
      </div>
    </details>
  );
}
