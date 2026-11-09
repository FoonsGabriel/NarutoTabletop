// Upload de imagens para o Storage do Supabase (bucket "game-assets").
import { supabase } from './supabase/client';
import { uid } from './Uid';
import { prepareSprite } from './Imagem';

const BUCKET = 'game-assets';

/**
 * Envia um arquivo e devolve a URL pública.
 * folder: 'maps' | 'sprites' | 'props'
 */
export async function uploadImage(original, folder) {
  // Personagens e cenário: reduz o tamanho e tira o fundo verde sozinho.
  const file = folder === 'sprites' || folder === 'props' ? (await prepareSprite(original)).file : original;
  const extension = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${folder}/${uid()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Envia uma música (mp3, ogg…) e devolve a URL pública. */
export async function uploadAudio(file) {
  const extension = (file.name.split('.').pop() || 'mp3').toLowerCase();
  const path = `musicas/${uid()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'audio/mpeg',
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
