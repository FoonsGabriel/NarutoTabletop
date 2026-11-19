// =====================================================================
// Fichas fora da mesa e pedidos para levar uma ficha a uma mesa
// (PLANEJAMENTO-IA seção 10 — "Fichas fora da mesa").
//
//  - Ficha salva = linha em `characters` com attributes.ficha_salva = true
//    (room_id vazio enquanto não está em nenhuma mesa).
//  - Levar para a mesa cria um pedido em `pedidos_ficha`; o Mestre aceita ou nega
//    (o pedido não expira).
//      cópia    → a mesa recebe uma cópia; a ficha salva não muda.
//      original → a própria ficha entra na mesa (o que acontece lá muda a ficha);
//                 só pode estar em uma mesa por vez.
// =====================================================================
import { supabase } from './supabase/client';

export const ehFichaSalva = (row) => Boolean(row?.attributes?.ficha_salva);
export const sistemaDaFicha = (row) => row?.attributes?.sistema || 'shinobi';

/** Mensagem clara quando o banco ainda não tem a tabela/coluna do recurso. */
export function erroDeBanco(error) {
  const msg = error?.message || String(error || '');
  if (/pedidos_ficha|relation .* does not exist|schema cache/i.test(msg)) {
    return 'O banco ainda não tem a parte de fichas fora da mesa. Rode o SQL do DEPLOY.md no Supabase.';
  }
  if (/room_id.*null|null value in column "room_id"/i.test(msg)) {
    return 'O banco ainda não aceita ficha sem mesa. Rode o SQL do DEPLOY.md no Supabase.';
  }
  return msg;
}

/** Minhas fichas salvas deste sistema (com o nome da mesa onde a original está, se estiver). */
export async function listarMinhasFichas(playerId, sistema) {
  const { data, error } = await supabase.from('characters').select('*').eq('owner_id', playerId);
  if (error) throw error;
  const fichas = (data || []).filter((row) => ehFichaSalva(row) && sistemaDaFicha(row) === sistema);
  const salas = [...new Set(fichas.map((f) => f.room_id).filter(Boolean))];
  let nomes = {};
  if (salas.length) {
    const { data: rooms } = await supabase.from('rooms').select('id, name').in('id', salas);
    nomes = Object.fromEntries((rooms || []).map((r) => [r.id, r.name]));
  }
  return fichas
    .map((f) => ({ ...f, mesaNome: f.room_id ? nomes[f.room_id] || 'uma mesa' : null }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/** Pedidos que eu fiz (para mostrar "aguardando o Mestre"). */
export async function meusPedidos(playerId) {
  const { data, error } = await supabase.from('pedidos_ficha').select('*').eq('player_id', playerId);
  if (error) throw error;
  return data || [];
}

export async function pedirParaMesa({ ficha, roomId, modo, playerId, playerName }) {
  if (modo === 'original' && ficha.room_id) throw new Error('A original já está numa mesa. Use uma cópia.');
  const { data: aberto } = await supabase.from('pedidos_ficha').select('id')
    .eq('character_id', ficha.id).eq('room_id', roomId).eq('status', 'pendente');
  if (aberto?.length) throw new Error('Já existe um pedido desta ficha para esta mesa, aguardando o Mestre.');
  const { error } = await supabase.from('pedidos_ficha').insert({
    room_id: roomId, character_id: ficha.id, player_id: playerId, player_name: playerName || null,
    ficha_nome: ficha.name || null, modo, status: 'pendente',
  });
  if (error) throw error;
}

export async function cancelarPedido(pedidoId) {
  const { error } = await supabase.from('pedidos_ficha').delete().eq('id', pedidoId).eq('status', 'pendente');
  if (error) throw error;
}

/** Pedidos pendentes de uma ou mais mesas (o Mestre vê na mesa e no lobby). */
export async function pedidosPendentes(roomIds) {
  const ids = [].concat(roomIds).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('pedidos_ficha').select('*').in('room_id', ids).eq('status', 'pendente');
  if (error) throw error;
  return data || [];
}

const CAMPOS_FORA = ['id', 'created_at', 'updated_at'];

/** Mestre aceita: copia a ficha para a mesa, ou leva a original. */
export async function aceitarPedido(pedido) {
  const { data: ficha, error } = await supabase.from('characters').select('*').eq('id', pedido.character_id).maybeSingle();
  if (error) throw error;
  if (!ficha) throw new Error('A ficha deste pedido foi apagada pelo jogador.');

  if (pedido.modo === 'original') {
    if (ficha.room_id && ficha.room_id !== pedido.room_id) throw new Error('A original já está em outra mesa. Peça uma cópia ao jogador.');
    const { error: e2 } = await supabase.from('characters').update({ room_id: pedido.room_id }).eq('id', ficha.id);
    if (e2) throw e2;
  } else {
    const copia = Object.fromEntries(Object.entries(ficha).filter(([k]) => !CAMPOS_FORA.includes(k)));
    copia.room_id = pedido.room_id;
    copia.attributes = { ...(ficha.attributes || {}), ficha_salva: false, copia_de: ficha.id };
    const { error: e3 } = await supabase.from('characters').insert(copia);
    if (e3) throw e3;
  }
  const { error: e4 } = await supabase.from('pedidos_ficha').update({ status: 'aceito' }).eq('id', pedido.id);
  if (e4) throw e4;
}

export async function negarPedido(pedido) {
  const { error } = await supabase.from('pedidos_ficha').update({ status: 'negado' }).eq('id', pedido.id);
  if (error) throw error;
}

/** Tira a original da mesa (volta a ficar só salva). */
export async function tirarDaMesa(ficha) {
  const { error } = await supabase.from('characters').update({ room_id: null }).eq('id', ficha.id);
  if (error) throw error;
  await supabase.from('map_tokens').delete().eq('character_id', ficha.id);
}

export async function apagarFicha(ficha) {
  if (ficha.room_id) throw new Error('Esta ficha está numa mesa. Tire da mesa antes de apagar.');
  const { error } = await supabase.from('characters').delete().eq('id', ficha.id);
  if (error) throw error;
}

/** Mesas deste sistema em que eu estou (para escolher onde levar a ficha). */
export async function minhasMesas(playerId, sistema) {
  const { data, error } = await supabase.from('room_members').select('role, rooms ( * )').eq('player_id', playerId);
  if (error) throw error;
  return (data || []).filter((m) => m?.rooms && (m.rooms.sistema || 'shinobi') === sistema)
    .map((m) => ({ ...m.rooms, role: m.role }));
}
