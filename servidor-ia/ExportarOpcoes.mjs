// Gera dados/Opcoes.json com as opções de ficha do Shinobi (as mesmas que o site usa),
// para a IA só sugerir o que existe. Rodar de novo quando os dados do sistema mudarem:
//   node ExportarOpcoes.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const base = join(aqui, '..', 'src', 'sistemas', 'shinobi', 'data');
const url = (arq) => new URL(`file://${join(base, arq).replace(/\\/g, '/')}`).href;
const { APTIDOES_COMUNS } = await import(url('Aptidoes.js'));
const { PODERES_COMUNS, PODERES_RESTRITOS } = await import(url('Poderes.js'));
const { TODOS_CLAS, VILAS } = await import(url('Ficha.js'));

const curto = (t, n = 90) => String(t || '').replace(/\s+/g, ' ').slice(0, n);
const opcoes = {
  clas: TODOS_CLAS,
  vilas: VILAS.map((v) => v.valor),
  aptidoes: APTIDOES_COMUNS.map((a) => ({ id: a.id, nome: a.nome, resumo: curto(a.resumo) })),
  poderes: [...PODERES_COMUNS, ...PODERES_RESTRITOS].map((p) => ({
    id: p.id, nome: p.nome, tipo: p.tipo, cla: p.requisitos?.cla || null, resumo: curto(p.resumo),
  })),
};
mkdirSync(join(aqui, 'dados'), { recursive: true });
writeFileSync(join(aqui, 'dados', 'Opcoes.json'), JSON.stringify(opcoes, null, 1));
console.log(`Opções exportadas: ${opcoes.clas.length} clãs, ${opcoes.aptidoes.length} aptidões, ${opcoes.poderes.length} poderes.`);
