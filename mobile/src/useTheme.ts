import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useLangue } from './i18n';
import { useStore } from './store';
import { Couleurs, clair, sombre, typos } from './theme';

// Palette active : réglage de l'utilisateur (Profil › Apparence), sinon celui du téléphone.
// Tous les écrans passent par ici : ils se réaffichent aussi quand la langue change.
export function useTheme<T = undefined>(creerStyles?: (c: Couleurs) => T) {
  const { apparence } = useStore();
  useLangue();
  const systeme = useColorScheme();
  const estSombre = apparence === 'sombre' || (apparence === 'auto' && systeme === 'dark');
  const c = estSombre ? sombre : clair;
  const s = useMemo(() => (creerStyles ? creerStyles(c) : undefined), [c, creerStyles]) as T;
  return { c, type: estSombre ? typos.sombre : typos.clair, s, estSombre };
}
