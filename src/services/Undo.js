import { supabase } from './supabase/client';
import { uid } from './Uid';

/**
 * Desfazer do Mestre: guarda como o personagem estava ANTES de cada ação de combate
 * (dano, chakra gasto, cura, modos ativos).
 *
 * - Não grava nada a mais no banco: a pilha fica na memória e é avisada a todos
 *   pelo canal `undo_<sala>` (o Mestre recebe as ações de todos os jogadores).
 * - Guarda as últimas 20 ações. Recarregar a página do Mestre zera a pilha.
 */
const MAX = 20;
let stack = [];
let channel = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(stack));

/** Ouve a pilha (o botão de Desfazer usa). Retorna a função para parar. */
export function onUndoStack(fn) {
  listeners.add(fn);
  fn(stack);
  return () => listeners.delete(fn);
}

function push(entry) {
  if (stack.some((e) => e.id === entry.id)) return;
  stack = [entry, ...stack].slice(0, MAX);
  emit();
}

/** Liga o canal da sala (chamado uma vez pelo Room). */
export function initUndo(roomId) {
  stack = [];
  channel = supabase.channel(`undo_${roomId}`, { config: { broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'push' }, ({ payload }) => payload?.entry && push(payload.entry))
    .on('broadcast', { event: 'done' }, ({ payload }) => {
      stack = stack.filter((e) => e.id !== payload?.id);
      emit();
    })
    .subscribe();
  emit();
  return () => {
    supabase.removeChannel(channel);
    channel = null;
    stack = [];
    emit();
  };
}

/**
 * Atualiza um personagem guardando o "antes" para poder desfazer.
 * label: texto curto do que aconteceu ("Dano em Ninja de Kiri: −12").
 */
export async function trackedUpdate(characterId, patch, label) {
  const keys = Object.keys(patch);
  const { data: read } = await supabase.from('characters').select(['id', 'name', ...keys].join(', ')).eq('id', characterId).single();
  const before = read ? JSON.parse(JSON.stringify(read)) : null; // cópia: o "antes" não pode mudar junto
  const result = await supabase.from('characters').update(patch).eq('id', characterId);
  if (!result.error && before) {
    const entry = {
      id: uid(),
      at: Date.now(),
      label: label || `Mudança em ${before.name || 'personagem'}`,
      characterId,
      before: Object.fromEntries(keys.map((k) => [k, before[k] ?? null])),
    };
    push(entry);
    channel?.send({ type: 'broadcast', event: 'push', payload: { entry } });
  }
  return result;
}

/** Volta a ação (só o Mestre usa). */
export async function undoEntry(entry) {
  const { error } = await supabase.from('characters').update(entry.before).eq('id', entry.characterId);
  if (error) return { error };
  stack = stack.filter((e) => e.id !== entry.id);
  emit();
  channel?.send({ type: 'broadcast', event: 'done', payload: { id: entry.id } });
  return { error: null };
}
