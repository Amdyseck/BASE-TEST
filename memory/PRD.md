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

## Backlog
- P2 : découper `server.py` en routers modulaires
- P2 : tests frontend automatisés

## Identifiants
Voir `/app/memory/test_credentials.md`
