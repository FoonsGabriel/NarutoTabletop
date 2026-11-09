// =====================================================================
// Listas da ficha (tudo por lista, para não precisar digitar).
// Fontes: Livro Básico 4.1b (Clãs pág. 142, Hijutsus pág. 201, graduações
// e vilas no Pergaminho I), Livro de Hijutsus 4.1b e Livro de Hijutsus Vol. 2.
// =====================================================================

export const CLAS_E_HIJUTSUS = [
  {
    grupo: 'Clãs (Livro Básico)',
    itens: ['Aburame', 'Akimichi', 'Hatake', 'Hyuuga', 'Inuzuka', 'Nara', 'Sarutobi', 'Senju', 'Uchiha', 'Uzumaki', 'Yamanaka'],
  },
  {
    grupo: 'Clãs (Livro de Hijutsus)',
    itens: ['Fuuma', 'Hoshigaki', 'Hozuki', 'Kaguya', 'Yotsuki', 'Yuki', 'Shimura', 'Hoshigakure'],
  },
  {
    grupo: 'Hijutsus (Livro Básico)',
    itens: ['Dokujutsu', 'Hachimon Tonkou', 'Hibon Ninpou', 'Jinchuuriki', 'Kagura Shingan', 'Kuchiyose', 'Magen', 'Senjutsu', 'Tensai', 'Versatilidade'],
  },
  {
    grupo: 'Hijutsus (Livro de Hijutsus)',
    itens: ['Jiton', 'Juuinka', 'Kamijutsu', 'Nintaijutsu', 'Rinnegan', 'Samurai', 'Senninka',
      'Bakuton', 'Buki Senmon', 'Chouju-Giga', 'Daikiga', 'Gorudogumo', 'Hebinomichi', 'Jashin Juusha', 'Jingokuon', 'Jiongu', 'Kakuran Tensai', 'Jinton', 'Kibaku Nendo'],
  },
];

export const TODOS_CLAS = CLAS_E_HIJUTSUS.flatMap((g) => g.itens);

/** Vilas (Livro Básico: Folha, Areia, Névoa, Nuvem, Pedra) e outras comuns na campanha. */
export const VILAS = [
  { valor: 'Konoha', rotulo: 'Konoha (Folha)' },
  { valor: 'Suna', rotulo: 'Suna (Areia)' },
  { valor: 'Kiri', rotulo: 'Kiri (Névoa)' },
  { valor: 'Kumo', rotulo: 'Kumo (Nuvem)' },
  { valor: 'Iwa', rotulo: 'Iwa (Pedra)' },
  { valor: 'Oto', rotulo: 'Oto (Som)' },
  { valor: 'Ame', rotulo: 'Ame (Chuva)' },
  { valor: 'Taki', rotulo: 'Taki (Cachoeira)' },
  { valor: 'Kusa', rotulo: 'Kusa (Grama)' },
  { valor: 'Nukenin', rotulo: 'Sem vila (Nukenin)' },
];

/** Graduações e o NC de referência do Livro Básico. */
export const GRADUACOES = [
  { valor: 'Estudante da Academia', nc: 4 },
  { valor: 'Genin', nc: 4 },
  { valor: 'Chuunin', nc: 8 },
  { valor: 'Jounin Especial', nc: 10 },
  { valor: 'ANBU', nc: 10 },
  { valor: 'Jounin', nc: 12 },
  { valor: 'Jounin Elite', nc: 16 },
  { valor: 'Sannin', nc: 20 },
  { valor: 'Kage', nc: 20 },
];
