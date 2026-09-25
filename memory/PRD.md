# Wakeur Khadim Rassoul SECK et FRERES - Logiciel de gestion de produits alimentaires

## Problème initial
Logiciel full-stack (FastAPI + React + MongoDB) de gestion d'une entreprise de produits alimentaires : multi-utilisateurs (admin, vendeur, caissier), Tableau de bord, Produits/Familles, Caisse (POS), Ventes/Factures, Fournisseurs, Clients, Achats, Dépôts, Journal Banque, Rapports, Utilisateurs.
Contrainte : ne pas traduire WAVE, Orange Money, etc. Langue : français.

## Implémenté (à date)
- Auth JWT, gestion utilisateurs (admin modifie utilisateurs + mots de passe)
- CRUD Produits, Familles, Clients, Fournisseurs, Dépôts (affectation du stock aux dépôts, dépôt affiché sur produits/inventaire)
- POS multi-paiements (espèces, WAVE, Orange Money, chèque, banque), règlement partiel, annulation de facture
- Impression Ticket et A4 paysage (double exemplaire client/caissier)
- Achats (ex-Commandes) avec dépôt de destination, réception, transformation en facture fournisseur (FF-), règlement fournisseur
- Journal Banque (crédits/débits)
- Rapports : comptes tiers (soldes clients et fournisseurs)
- 2026-06 : Rebranding complet INTERTRADE TOUBA → Wakeur Khadim Rassoul SECK et FRERES (UI, factures, titre, API, logo `/logo.jpg`, emails utilisateurs migrés vers `@wakeur.sn`, données historiques nettoyées)

- 2026-06 : Comptes tiers (page dédiée : soldes clients/fournisseurs, relevé de compte imprimable `/accounts/:type/:id`, encaissement/règlement direct avec imputation FIFO sur factures impayées + mouvement caisse/journal banque)
- 2026-06 : Gestion de caisse (`/cash` : ouverture avec fond de caisse, mouvements manuels dépense/apport/versement banque, journal de caisse alimenté automatiquement par ventes et règlements espèces, clôture avec écart, historique). Bannière POS si caisse fermée.
- 2026-06 : Paramètres société (`/settings`, admin) : nom, slogan, adresse, tél, email, NINEA, RC, pied de facture, logo téléversé (Emergent Object Storage) → sidebar, login, factures, relevés
- 2026-06 : Couleurs des modes de paiement (Espèces vert, WAVE bleu, Orange Money orange, Chèque slate, Banque indigo) sur POS/Ventes/Achats + badges ; boîte de dialogue de confirmation (AlertDialog) pour toutes les suppressions/annulations ; bouton « Nouvelle facture » sur la facture

- 2026-06 : Rôles Admin / **Gérant** / Vendeur / **Caissier** (caissier : aucune vente, encaissements + caisse uniquement). Autorisations fines par utilisateur (modules cochés, peut supprimer, peut annuler facture, peut modifier prix, plafond de remise %) éditées par admin/gérant dans Utilisateurs. Gérant : pas d'accès aux Paramètres ni aux comptes admin. Contrôles côté backend (require_module/require_perm, remise/prix contrôlés à la vente) + menus/routes filtrés côté frontend.
- 2026-06 : Journal d'audit « Historique » (`/audit`, admin/gérant) : créations/modifications/suppressions/annulations avec avant/après, filtres utilisateur/module/action/période.
- 2026-06 : Écran Facturation en 3 colonnes (règlement | facture avec lignes qté/PU modifiables | liste d'articles une par ligne avec recherche et code-barres).

## Backlog
- P2 : découper `server.py` en routers modulaires
- P2 : tests frontend automatisés

## Identifiants
Voir `/app/memory/test_credentials.md`
