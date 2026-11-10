import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import Reanimated, { KeyboardState, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Écran qui remonte exactement de la hauteur du clavier, quel que soit le clavier de la personne
// (Android « edge-to-edge » compris), en suivant son animation d'ouverture.
// La marge du bas de l'écran (barre de gestes) est déjà comptée dans la hauteur du clavier : on ne
// la retire que pour ne pas laisser de vide quand le clavier est ouvert.
export function EcranAvecClavier({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const clavier = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();
  const bas = insets.bottom;
  // Sur Android, la hauteur peut rester à sa dernière valeur après la fermeture du clavier (clavier
  // fermé sur l'écran précédent, par exemple) : on se fie aussi à son état, ouvert ou fermé.
  const decalage = useAnimatedStyle(() => {
    const etat = clavier.state.value;
    const visible = etat === KeyboardState.OPEN || etat === KeyboardState.OPENING || etat === KeyboardState.CLOSING;
    return { paddingBottom: visible ? Math.max(0, clavier.height.value - bas) : 0 };
  });
  // Le contenu vit dans une vue intérieure : les barres fixées en bas (position absolue) remontent
  // avec elle au-dessus du clavier.
  return (
    <Reanimated.View style={[{ flex: 1 }, style, decalage]}>
      <View style={{ flex: 1 }}>{children}</View>
    </Reanimated.View>
  );
}
