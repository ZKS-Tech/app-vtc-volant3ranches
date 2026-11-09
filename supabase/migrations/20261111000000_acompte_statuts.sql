-- Volant3ranches VTC — acompte, partie 1 : deux nouveaux statuts de course.
-- À exécuter seul (SQL Editor › New query › coller › Run), AVANT 20261111000001_acompte.sql :
-- PostgreSQL ne permet pas d'utiliser un nouveau statut dans la même exécution que sa création.
--
--  • acompte_attendu : Fabrice a accepté, le client doit régler l'acompte pour confirmer ;
--  • expiree : l'acompte n'a pas été réglé dans le délai, le créneau est libéré.

alter type public.statut_course add value if not exists 'acompte_attendu' after 'envoyee';
alter type public.statut_course add value if not exists 'expiree' after 'refusee';
