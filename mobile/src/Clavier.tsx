import { ReactNode, useEffect } from 'react';
import { Keyboard, Platform, View, ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Écran qui remonte de la hauteur du clavier quand il s'ouvre, et redescend quand il se ferme.
// On écoute les événements du clavier du système (ouverture / fermeture) : ils n'agissent que sur cet
// écran. (L'outil précédent, useAnimatedKeyboard de Reanimated, modifiait la fenêtre entière sur
// Android et pouvait la laisser à moitié réduite après la fermeture du clavier.)
// La marge du bas de l'écran (barre de gestes) est déjà comptée dans la hauteur du clavier : on la retire.
export function EcranAvecClavier({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const decalage = useSharedValue(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const ouverture = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      decalage.value = withTiming(Math.max(0, e.endCoordinates.height - insets.bottom), { duration: ios ? e.duration || 250 : 180, easing: Easing.out(Easing.cubic) });
    });
    const fermeture = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      decalage.value = withTiming(0, { duration: ios ? e?.duration || 250 : 160, easing: Easing.out(Easing.cubic) });
    });
    // Écran ouvert alors que le clavier est déjà fermé : aucun décalage.
    if (!Keyboard.isVisible()) decalage.value = 0;
    return () => { ouverture.remove(); fermeture.remove(); };
  }, [insets.bottom]);

  const style2 = useAnimatedStyle(() => ({ paddingBottom: decalage.value }));
  // Le contenu vit dans une vue intérieure : les barres fixées en bas (position absolue) remontent
  // avec elle au-dessus du clavier.
  return (
    <Reanimated.View style={[{ flex: 1 }, style, style2]}>
      <View style={{ flex: 1 }}>{children}</View>
    </Reanimated.View>
  );
}
