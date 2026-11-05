import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Message, chargerMessages, ecouterMessages, envoyerMessageServeur, marquerLusServeur, supabase } from './serveur';
import { useStore } from './store';

// Messagerie client ↔ chauffeur : une conversation par course, en temps réel.
// Sans serveur (démonstration), les messages restent sur le téléphone.

type Ctx = {
  cote: 'client' | 'chauffeur';
  demo: boolean;
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
  const { serveur, role, demoChauffeur } = useStore();
  const cote: Ctx['cote'] = role === 'chauffeur' || demoChauffeur ? 'chauffeur' : 'client';
  const demo = demoChauffeur || !supabase || serveur.etat !== 'connecte';
  const [messages, setMessages] = useState<Message[]>(() => (demoChauffeur ? messagesDemo() : []));
  const reponduDemo = useRef(new Set<string>());

  const fusion = useCallback((m: Message) => setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m])), []);

  useEffect(() => {
    if (demo) { setMessages(demoChauffeur ? messagesDemo() : []); return; }
    let actif = true;
    chargerMessages().then((ms) => { if (actif) setMessages(ms); }).catch(() => {});
    const canal = ecouterMessages(fusion);
    return () => { actif = false; canal?.unsubscribe(); };
  }, [demo, cote]);

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
      demo,
      conversations: [...derniers.entries()]
        .map(([courseId, dernier]) => ({ courseId, dernier, nonLus: nonLusParCourse.get(courseId) ?? 0 }))
        .sort((a, b) => (a.dernier.envoye_le < b.dernier.envoye_le ? 1 : -1)),
      estAMoi: (m) => !recu(m),
      messagesDe: (id) => messages.filter((m) => m.course_id === id),
      nonLus: (id) => nonLusParCourse.get(id) ?? 0,
      totalNonLus: [...nonLusParCourse.values()].reduce((a, b) => a + b, 0),
      conversationsNonLues: [...nonLusParCourse.keys()],
      envoyer: async (id, texte) => {
        if (!demo) { fusion(await envoyerMessageServeur(id, texte)); return; }
        const m: Message = { id: `local-${Date.now()}`, course_id: id, auteur_id: 'moi', de_chauffeur: cote === 'chauffeur', texte: texte.trim(), envoye_le: maintenant(), lu_le: null };
        fusion(m);
        // Démonstration côté client : Fabrice répond une fois, pour montrer l'échange.
        if (cote === 'client' && !reponduDemo.current.has(id)) {
          reponduDemo.current.add(id);
          setTimeout(() => {
            setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, lu_le: maintenant() } : x)));
            fusion({ id: `local-r-${Date.now()}`, course_id: id, auteur_id: 'fabrice', de_chauffeur: true, texte: 'Bien reçu, merci ! Je m’en occupe. (réponse de démonstration)', envoye_le: maintenant(), lu_le: null });
          }, 2200);
        }
      },
      marquerLus: (id) => {
        if (!(nonLusParCourse.get(id) ?? 0)) return;
        setMessages((ms) => ms.map((m) => (m.course_id === id && recu(m) && !m.lu_le ? { ...m, lu_le: maintenant() } : m)));
        if (!demo) marquerLusServeur(id).catch(() => {});
      },
    };
  }, [messages, cote, demo]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useMessagerie = () => useContext(C)!;

// Conversations fictives de l'espace chauffeur en démonstration.
function messagesDemo(): Message[] {
  const il = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const m = (id: string, course: string, chauffeur: boolean, texte: string, min: number, lu: boolean): Message => ({
    id, course_id: course, auteur_id: chauffeur ? 'fabrice' : 'client', de_chauffeur: chauffeur, texte, envoye_le: il(min), lu_le: lu ? il(min - 1) : null,
  });
  return [
    m('dm1', 'demo-3', false, 'Bonjour Fabrice, mon vol AF 6131 aura environ 20 minutes de retard.', 95, true),
    m('dm2', 'demo-3', true, 'Bonjour Claire, bien reçu : je suis le vol, pas d’inquiétude.', 90, true),
    m('dm3', 'demo-3', false, 'Merci ! Je serai au terminal 1, sortie B.', 6, false),
    m('dm4', 'demo-6', false, 'Bonjour, j’aurai un vélo démonté en housse en plus de ma valise, c’est possible ?', 30, false),
  ];
}
