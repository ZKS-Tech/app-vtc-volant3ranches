import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Message, chargerMessages, ecouterMessages, envoyerMessageServeur, marquerLusServeur, supabase } from './serveur';
import { useStore } from './store';
import { evenement } from './stats';

// Messagerie client ↔ chauffeur : une conversation par course, en temps réel.

type Ctx = {
  cote: 'client' | 'chauffeur';
  messagesDe: (courseId: string) => Message[];
  nonLus: (courseId: string) => number;
  totalNonLus: number;
  conversationsNonLues: string[];
  // Toutes les conversations, la plus récente en premier.
  conversations: { courseId: string; dernier: Message; nonLus: number }[];
  estAMoi: (m: Message) => boolean;
  envoyer: (courseId: string, texte: string) => Promise<void>;
  marquerLus: (courseId: string) => void;
};

const C = createContext<Ctx | null>(null);
const maintenant = () => new Date().toISOString();

export function MessagerieProvider({ children }: { children: ReactNode }) {
  const { serveur, role } = useStore();
  const cote: Ctx['cote'] = role === 'chauffeur' ? 'chauffeur' : 'client';
  const connecte = !!supabase && serveur.etat === 'connecte';
  const [messages, setMessages] = useState<Message[]>([]);

  const fusion = useCallback((m: Message) => setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m])), []);

  useEffect(() => {
    if (!connecte) { setMessages([]); return; }
    let actif = true;
    chargerMessages().then((ms) => { if (actif) setMessages(ms); }).catch(() => {});
    const canal = ecouterMessages(fusion);
    return () => { actif = false; canal?.unsubscribe(); };
  }, [connecte, cote]);

  // Un message est « à moi » s'il vient de mon côté de la conversation.
  const recu = (m: Message) => m.de_chauffeur !== (cote === 'chauffeur');

  const value = useMemo<Ctx>(() => {
    const nonLusParCourse = new Map<string, number>();
    for (const m of messages) if (recu(m) && !m.lu_le) nonLusParCourse.set(m.course_id, (nonLusParCourse.get(m.course_id) ?? 0) + 1);
    const derniers = new Map<string, Message>();
    for (const m of messages) {
      const d = derniers.get(m.course_id);
      if (!d || m.envoye_le > d.envoye_le) derniers.set(m.course_id, m);
    }
    return {
      cote,
      conversations: [...derniers.entries()]
        .map(([courseId, dernier]) => ({ courseId, dernier, nonLus: nonLusParCourse.get(courseId) ?? 0 }))
        .sort((a, b) => (a.dernier.envoye_le < b.dernier.envoye_le ? 1 : -1)),
      estAMoi: (m) => !recu(m),
      messagesDe: (id) => messages.filter((m) => m.course_id === id),
      nonLus: (id) => nonLusParCourse.get(id) ?? 0,
      totalNonLus: [...nonLusParCourse.values()].reduce((a, b) => a + b, 0),
      conversationsNonLues: [...nonLusParCourse.keys()],
      envoyer: async (id, texte) => {
        evenement('message_envoye');
        if (!connecte) throw new Error('Connexion au serveur impossible pour le moment.');
        fusion(await envoyerMessageServeur(id, texte));
      },
      marquerLus: (id) => {
        if (!(nonLusParCourse.get(id) ?? 0)) return;
        setMessages((ms) => ms.map((m) => (m.course_id === id && recu(m) && !m.lu_le ? { ...m, lu_le: maintenant() } : m)));
        if (connecte) marquerLusServeur(id).catch(() => {});
      },
    };
  }, [messages, cote, connecte]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useMessagerie = () => useContext(C)!;
