// Gera dados/Opcoes.json com as opções de ficha do Shinobi (as mesmas que o site usa),
// para a IA só sugerir o que existe. Rodar de novo quando os dados do sistema mudarem:
//   node ExportarOpcoes.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const base = join(aqui, '..', 'src', 'sistemas', 'shinobi', 'data');
const url = (arq) => new URL(`file://${join(base, arq).replace(/\\/g, '/')}`).href;
const { APTIDOES_COMUNS, APTIDOES_RESTRITAS } = await import(url('Aptidoes.js'));
const { PODERES_COMUNS, PODERES_RESTRITOS } = await import(url('Poderes.js'));
const { TODOS_CLAS, VILAS } = await import(url('Ficha.js'));
const { PRE_REQUISITOS } = await import(url('PreRequisitos.js'));
const { ELEMENTOS, efeitosDoPoder, usaEfeitos } = await import(url('Efeitos.js'));
const { ARMAS, ARMADURAS } = await import(url('Armas.js'));
const { ITENS_GERAIS } = await import(url('Itens.js'));
// Preço da tabela ("20 Ryos", "3 Ryos cada", "—") em número; "—" = sem preço (arma improvisada).
const ryos = (t) => Number(String(t).match(/\d+/)?.[0] || 0);

const curto = (t, n = 90) => String(t || '').replace(/\s+/g, ' ').slice(0, n);
const opcoes = {
  clas: TODOS_CLAS,
  vilas: VILAS.map((v) => v.valor),
  // Comuns + de clã. cla: lista de clãs (vazia = qualquer um); gratuita: pode ser uma das 3 gratuitas.
  aptidoes: [...APTIDOES_COMUNS, ...APTIDOES_RESTRITAS].filter((a) => !a.apenasNpc).map((a) => ({
    id: a.id, nome: a.nome, cla: [].concat(a.cla || []), gratuita: a.gratuita !== false, requer: a.requer || null, exclui: a.exclui || null, resumo: curto(a.resumo),
    // Pré-requisitos (págs. 56–70): lista de condições, cada uma com alternativas ("ou"). Ex.: [["atr:agilidade:3", "apt:Reflexos"]]
    prereq: PRE_REQUISITOS[a.nome] || [],
    // Aptidão genérica: escolhe-se uma categoria ('texto'), uma perícia ('pericia') ou um atributo ('atributo').
    complemento: a.complemento || null, dica: a.dica || null,
  })),
  poderes: [...PODERES_COMUNS, ...PODERES_RESTRITOS].map((p) => ({
    id: p.id, nome: p.nome, tipo: p.tipo, cla: [].concat(p.requisitos?.cla || []), resumo: curto(p.resumo),
    // Pré-requisitos (o servidor confere): atributos mínimos, aptidões exigidas, elementos permitidos, nome próprio.
    atributos_min: p.requisitos?.atributos || {}, aptidoes_req: p.requisitos?.aptidoes || [],
    elementos_permitidos: p.elementosPermitidos || null, precisa_nome: Boolean(p.precisaNome),
    // Efeitos por nível (pág. 94): 1 efeito por nível do poder; repetir = evoluir.
    efeitos: usaEfeitos(p.id) ? efeitosDoPoder(p.id).map((f) => ({
      id: f.id, nome: f.nome, nivel: f.nivel, prereq: f.prereq || null, evolucoes: (f.evolucoes || []).map((v) => v.nivel), resumo: curto(f.resumo, 70),
    })) : [],
    efeito_obrigatorio: ELEMENTOS[p.id]?.obrigatorio || null,
  })),
  // Equipamento (págs. 137–140). Armas especiais (únicas) ficam de fora: só o Mestre dá.
  armas: ARMAS.filter((a) => !a.especial && a.grupo !== 'desarmado').map((a) => ({
    id: a.id, nome: a.nome, categoria: a.categoria, grupo: a.grupo, ataque: a.ataque, dano: a.dano,
    preco: ryos(a.preco), cada: /cada/.test(String(a.preco)), unidades: a.unidades || null,
  })),
  itens: ITENS_GERAIS.map((i) => ({ id: i.id, nome: i.nome, preco: i.preco })),
  // Armaduras (pág. 139; Samurai: Hijutsus pág. 79). Pesada sem a aptidão = penalidade.
  armaduras: ARMADURAS.filter((a) => a.id !== 'nenhuma').map((a) => ({
    id: a.id, nome: a.nome, tipo: a.tipo, absorcao: a.absorcao, preco: a.preco || 0, exige: a.exigeApt || null,
  })),
};
mkdirSync(join(aqui, 'dados'), { recursive: true });
writeFileSync(join(aqui, 'dados', 'Opcoes.json'), JSON.stringify(opcoes, null, 1));
console.log(`Opções exportadas: ${opcoes.clas.length} clãs, ${opcoes.aptidoes.length} aptidões, ${opcoes.poderes.length} poderes, ${opcoes.armas.length} armas, ${opcoes.itens.length} itens, ${opcoes.armaduras.length} armaduras.`);
