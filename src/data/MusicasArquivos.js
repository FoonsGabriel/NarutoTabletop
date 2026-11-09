// Trilhas prontas: os arquivos de áudio que estiverem em src/assets/Musicas/
// entram sozinhos na lista do Mestre (o nome do arquivo vira o nome da música).
export const ARQUIVOS_MUSICA = import.meta.glob('../assets/Musicas/*.{mp3,ogg,m4a,wav,MP3,OGG,M4A,WAV}', {
  eager: true,
  query: '?url',
  import: 'default',
});
