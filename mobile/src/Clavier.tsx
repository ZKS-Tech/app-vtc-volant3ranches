import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Écran qui remonte exactement de la hauteur du clavier, quel que soit le clavier de la personne
// (Android « edge-to-edge » compris), en suivant son animation d'ouverture.
// La marge du bas de l'écran (barre de gestes) est déjà comptée dans la hauteur du clavier : on ne
// la retire que pour ne pas laisser de vide quand le clavier est ouvert.
export function EcranAvecClavier({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const clavier = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();
  const bas = insets.bottom;
  const decalage = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, clavier.height.value - bas) }));
  // Le contenu vit dans une vue intérieure : les barres fixées en bas (position absolue) remontent
  // avec elle au-dessus du clavier.
  return (
    <Reanimated.View style={[{ flex: 1 }, style, decalage]}>
      <View style={{ flex: 1 }}>{children}</View>
    </Reanimated.View>
  );
}
