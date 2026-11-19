// =====================================================================
// Porta de entrada do sistema Naruto: Shinobi no Sho.
//
// Tudo o que é regra do Shinobi (ficha, jutsus, menu do turno, manobras,
// condições, descanso, cálculo de ataque/dano/chakra, NPCs, dados dos livros)
// mora nesta pasta: data/, services/ e components/.
//
// N1: a mesa e o mapa ainda chamam alguns arquivos daqui direto (ex.: Room.jsx
// usa o menu do turno; o mapa usa o movimento em blocos). No N2 essas ligações
// passam todas por esta porta, para outro sistema poder trocar as peças.
// =====================================================================

export const SISTEMA = {
  id: 'shinobi',
  nome: 'Naruto: Shinobi no Sho',
  livros: ['Livro Básico', 'Livro de Hijutsus 4.1b', 'Livro de Hijutsus Vol. 2'],
};

// Peças que a mesa usa (carregadas só quando alguém entra numa mesa do Shinobi).
export { default as FichaPersonagem } from './components/CharacterSheet.jsx';
export { default as MenuDoTurno } from './components/TurnMenu.jsx';
export { default as CardDoToken } from './components/TokenCard.jsx';
export { default as PainelNpcs } from './components/NpcPanel.jsx';
export { default as PainelCombate } from './components/CombatTracker.jsx';
export { default as PainelPremios } from './components/RewardsPanel.jsx';
export { default as Guia } from './components/TutorialPanel.jsx';
export { default as EditorAparencia } from './components/AppearanceEditor.jsx';
export { default as AjusteMestre } from './components/GmAdjust.jsx';
export { default as BarraIniciativa } from './components/InitiativeBar.jsx';
// O fundo do tema (FundoShinobi.jsx) é importado direto pelo login e pelo lobby:
// passar por aqui faria a tela de login baixar a mesa inteira.
