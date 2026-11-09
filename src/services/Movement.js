// =====================================================================
// Movimento no mapa — Naruto "Shinobi no Sho", Livro Básico 4.1b
//
//  - Deslocamento = 10 m + Agilidade ÷ 2 por ação de Movimento (pág. 262).
//  - A ação Padrão pode virar Movimento (pág. 255): até 2 deslocamentos por turno.
//  - Escala do mapa: 1 bloco = 2 m; a diagonal também conta 1 bloco.
//
// O que foi andado fica no registro de ações do combatente (room_combat.actions):
//   { type: 'movimento', slots: ['movimento'], blocks: 4 }
// =====================================================================

import { useAction as registerAction } from './Combat'; // não é hook do React, só o nome
import { sizeInfo, sizeOf } from '../data/Tamanhos';
import { condicoesDe, limitesDoTurno } from '../data/Condicoes';

export const METROS_POR_BLOCO = 2;

/** Deslocamento em metros. O Mestre pode fixar um valor em overrides.deslocamento. */
export function deslocamentoMetros(character) {
  // Condições (págs. 277–278): lento/fatigado/exausto andam metade; impedido/agarrado não saem do lugar.
  const fator = limitesDoTurno(condicoesDe(character)).deslocamento;
  if (fator === 0) return 0;
  return Math.max(1, deslocamentoNormal(character) * fator);
}

/** Deslocamento sem condições: valor do Mestre, do NPC ou 10 m + Agilidade ÷ 2 (+ tamanho). */
function deslocamentoNormal(character) {
  const override = Number(character?.overrides?.deslocamento);
  if (override > 0) return override;
  const npcValue = Number(character?.attributes?.npc?.deslocamento);
  if (npcValue > 0) return npcValue;
  const agilidade = Number(character?.attributes?.attributes?.agilidade || 0);
  // Tamanho muda o deslocamento (pág. 272), mas nunca abaixo de 1 m.
  return Math.max(1, 10 + agilidade / 2 + sizeInfo(sizeOf(character)).deslocamento);
}

export const deslocamentoBlocos = (character) => {
  const metros = deslocamentoMetros(character);
  return metros <= 0 ? 0 : Math.max(1, Math.floor(metros / METROS_POR_BLOCO));
};

/**
 * Quantos blocos ainda dá para andar nesta rodada.
 * Primeiro completa a ação de Movimento já aberta; depois conta quantas ações
 * ainda podem pagar um Movimento (Movimento e Padrão livres).
 */
export function movementBudget(state, deslocBlocks) {
  const open = openMovement(state, deslocBlocks);
  let extra = 0;
  let sim = state;
  for (let i = 0; i < 3; i += 1) {
    const next = registerAction('movimento', sim, true);
    if (!next) break;
    extra += 1;
    sim = next;
  }
  return {
    openBlocks: open ? deslocBlocks - Number(open.entry.blocks || 0) : 0,
    extraActions: extra,
    total: (open ? deslocBlocks - Number(open.entry.blocks || 0) : 0) + extra * deslocBlocks,
  };
}

function openMovement(state, deslocBlocks) {
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const entry = state.log[i];
    if (entry.type === 'movimento' && entry.blocks != null) {
      return Number(entry.blocks) < deslocBlocks ? { entry, index: i } : null;
    }
    if (entry.type !== 'livre') return null; // outra ação no meio fecha o movimento anterior
  }
  return null;
}

/**
 * Gasta `blocks` de movimento. strict = regras do livro: retorna null se não der.
 * No modo narrativo sempre registra (mesmo passando do limite).
 */
export function spendMovement(state, blocks, deslocBlocks, strict) {
  let remaining = Math.max(0, Math.round(blocks));
  if (!remaining) return state;
  if (strict && movementBudget(state, deslocBlocks).total < remaining) return null;

  let next = { ...state, log: [...state.log] };
  const open = openMovement(next, deslocBlocks);
  if (open) {
    const room = deslocBlocks - Number(open.entry.blocks || 0);
    const used = Math.min(room, remaining);
    next.log[open.index] = { ...open.entry, blocks: Number(open.entry.blocks || 0) + used };
    remaining -= used;
  }

  while (remaining > 0) {
    const registered = registerAction('movimento', next, strict);
    if (!registered) return null;
    const used = Math.min(deslocBlocks, remaining);
    const last = registered.log.length - 1;
    registered.log[last] = { ...registered.log[last], blocks: strict ? used : remaining };
    remaining -= strict ? used : remaining;
    next = registered;
  }
  return next;
}

// ---------------------------------------------------------------------
// Caminho em blocos (8 direções, diagonal = 1 bloco)
// ---------------------------------------------------------------------

export const cellKey = (c) => `${c.col},${c.row}`;

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * blocked(cell) → true se não dá para passar pela célula.
 * Diagonal não "corta quina": só passa se as duas células retas ao lado estiverem livres.
 */
function* steps(cell, blocked) {
  for (const [dc, dr] of NEIGHBORS) {
    const next = { col: cell.col + dc, row: cell.row + dr };
    if (blocked(next)) continue;
    if (dc && dr && (blocked({ col: cell.col + dc, row: cell.row }) || blocked({ col: cell.col, row: cell.row + dr }))) continue;
    yield next;
  }
}

// Custo de entrar numa célula: 1 normal; 2 em terreno difícil (água, escalada, mato…).
// Livro (págs. 38–39): nadando ou escalando você anda metade do deslocamento.
const unitCost = () => 1;

/** Fila de prioridade (heap mínimo por `d`). */
class Heap {
  constructor() { this.items = []; }

  get size() { return this.items.length; }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].d <= a[i].d) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let min = i;
        if (l < a.length && a[l].d < a[min].d) min = l;
        if (r < a.length && a[r].d < a[min].d) min = r;
        if (min === i) break;
        [a[min], a[i]] = [a[i], a[min]];
        i = min;
      }
    }
    return top;
  }
}

/**
 * Todas as células alcançáveis gastando até `maxBlocks`. Map "col,row" → custo.
 * costOf(cell) → quanto custa entrar na célula (padrão 1).
 */
export function reachableCells(start, maxBlocks, blocked, costOf = unitCost) {
  const dist = new Map([[cellKey(start), 0]]);
  const open = new Heap();
  open.push({ cell: start, d: 0 });
  while (open.size) {
    const { cell, d } = open.pop();
    if (d > (dist.get(cellKey(cell)) ?? Infinity)) continue;
    for (const next of steps(cell, blocked)) {
      const nd = d + costOf(next);
      if (nd > maxBlocks) continue;
      const key = cellKey(next);
      if (nd >= (dist.get(key) ?? Infinity)) continue;
      dist.set(key, nd);
      open.push({ cell: next, d: nd });
    }
  }
  return dist;
}

/** Custo total de um caminho (lista de células, sem a inicial). */
export const pathCost = (path, costOf = unitCost) => path.reduce((sum, cell) => sum + costOf(cell), 0);

/** Caminho mais barato de `start` até `goal` (lista de células, sem a inicial). null se não há. */
export function findPath(start, goal, blocked, maxBlocks = 80, costOf = unitCost) {
  if (start.col === goal.col && start.row === goal.row) return [];
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const dist = new Map([[startKey, 0]]);
  const came = new Map([[startKey, null]]);
  // A*: estimativa = distância em blocos até o destino (diagonal conta 1, custo mínimo 1).
  const guess = (c) => Math.max(Math.abs(c.col - goal.col), Math.abs(c.row - goal.row));
  const open = new Heap();
  open.push({ cell: start, g: 0, d: guess(start) });

  while (open.size) {
    const { cell, g: d } = open.pop();
    const key = cellKey(cell);
    if (d > (dist.get(key) ?? Infinity)) continue;
    if (key === goalKey) {
      const path = [];
      let back = cell;
      while (back && cellKey(back) !== startKey) {
        path.unshift(back);
        back = came.get(cellKey(back));
      }
      return path;
    }
    for (const next of steps(cell, blocked)) {
      const nd = d + costOf(next);
      if (nd > maxBlocks) continue;
      const nextKey = cellKey(next);
      if (nd >= (dist.get(nextKey) ?? Infinity)) continue;
      dist.set(nextKey, nd);
      came.set(nextKey, cell);
      open.push({ cell: next, g: nd, d: nd + guess(next) });
    }
  }
  return null;
}
