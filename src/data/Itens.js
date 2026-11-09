// Tabela de Itens e Serviços (Livro Básico, pág. 140) e Compartimento de Itens (pág. 126).
// porComp = quantas unidades cabem em 1 compartimento (0 = não ocupa).
// da = compartimentos que o item fornece (bolsas, mochila).

const item = (nome, preco, porComp, extra = {}) => ({ id: nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), nome, preco, porComp, ...extra });

export const ITENS_GERAIS = [
  item('Algemas', 15, 1),
  item('Coldre/Bolsa com cinto', 1, 0, { da: 1 }),
  item('Corda (15 m)', 1, 1),
  item('Kit de artesão (5 usos)', 30, 1),
  item('Kit de ferramentas (5 usos)', 30, 1),
  item('Kit de medicamentos (5 usos)', 50, 1),
  item('Kit de laboratório (5 usos)', 50, 1),
  item('Instrumento musical', 50, 1),
  item('Lanterna', 7, 1),
  item('Mochila', 2, 0, { da: 4 }),
  item('Caneta', 1, 0),
  item('Pergaminho (jutsus)', 10, 1),
  item('Pergaminho (escrita)', 1, 6),
  item('Tarja especial (selos)', 10, 6),
  item('Saco de dormir', 1, 0.5), // 1 item ocupa 2 compartimentos
  item('Ração de viagem (por dia)', 1, 6),
  item('Pílulas do soldado (frasco com 10)', 50, 1),
  // Munições e projéteis (pág. 137–139)
  item('Kunai', 2, 10),
  item('Shuriken', 3, 18),
  item('Senbon', 3, 15),
  item('Tarja explosiva', 10, 6),
  item('Bomba de fumaça', 10, 6),
  item('Bomba luminosa', 10, 6),
  item('Flechas para arcos', 1, 20),
  item('Virotes para bestas', 1, 20),
];

export const SERVICOS = [
  item('Bebida', 1, 0), item('Estadia (por noite)', 5, 0), item('Refeição', 3, 0),
  item('Mensageiro (por km)', 1, 0), item('Condução terrestre (por km)', 1, 0), item('Condução marítima (por km)', 3, 0),
  item('Cão de guarda', 50, 0), item('Cavalo', 75, 0), item('Estábulo (por dia)', 2, 0), item('Sela', 20, 0),
  item('Carroça', 30, 0), item('Carruagem', 100, 0), item('Canoa', 50, 0),
];

export const findItem = (id) => [...ITENS_GERAIS, ...SERVICOS].find((i) => i.id === id) || null;

/** Compartimentos ocupados e fornecidos pela mochila do personagem. */
export function compartimentos(inventario = []) {
  let ocupados = 0;
  let fornecidos = 0;
  inventario.forEach((entrada) => {
    const info = findItem(entrada.id);
    const qtd = Number(entrada.qtd || 0);
    if (!info || qtd <= 0) return;
    if (info.da) fornecidos += info.da * qtd;
    if (info.porComp) ocupados += Math.ceil(qtd / info.porComp);
  });
  return { ocupados, fornecidos, excedentes: Math.max(0, ocupados - 3) };
}
