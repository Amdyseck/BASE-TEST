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

- 2026-06 : Changement de mot de passe par l'utilisateur (menu profil) ; ticket de clôture de caisse imprimable (80mm) après clôture + historique ; rappels impayés sur tableau de bord (≥7 j) avec boutons WhatsApp/SMS pré-remplis ; exports Excel (historique, relevés, journal de caisse) + PDF/Imprimer ; bouton « Fermer » sur la facture.
- 2026-06 : Onglet « Factures à régler » dans Gestion de caisse : factures clients à encaisser + factures fournisseurs à régler, encaissement/règlement direct (alimente caisse/banque).

- 2026-06 : Gestion de caisse en temps quasi réel : actualisation automatique toutes les 10 s (et au retour sur la fenêtre) des factures à régler, mouvements et session ; indicateur « Actualisé à HH:MM:SS » + bouton manuel ; le caissier est dirigé directement sur Gestion de caisse à la connexion.

- 2026-06 : Encaissement rapide par N° de facture (saisie/scan) dans Gestion de caisse ; notification sonore + toast à l'arrivée d'une nouvelle facture (bouton mute) ; Rapport journalier (Rapports, onglet par défaut : ventes, par mode de paiement, caisse, banque, factures, top articles, sessions ; Excel + impression) ; mode de règlement « Non payé » (client obligatoire).
- 2026-06 : Avances clients/fournisseurs : enregistrement (Comptes tiers, Gestion de caisse), utilisation à la facturation (« Avance client » ou imputation automatique), excédent de règlement conservé en avance, imputation FIFO sur factures impayées, règlement de facture par avance ; relevé de compte adapté.
- 2026-06 : Barre fixe en bas « Ce logiciel est créé par Amdy SECK | Copyright © IBM | 77 571 93 98 ».
- 2026-06 : Historique des ventes : filtre par période (dates + raccourcis Aujourd'hui / Cette semaine / Ce mois) avec total et reste dû de la période.

- 2026-06 : Export des ventes filtrées (période / non payées / recherche) en Excel + impression PDF ; reçu d'avance / de règlement imprimable (80mm) avec avance disponible et reste dû (`/receipt/:paymentId`, ouvert automatiquement après une avance ou un encaissement) ; widget « Alerte stock » sur le tableau de bord (ruptures + stocks faibles) avec envoi WhatsApp au gérant (numéro « Téléphone alertes » dans Paramètres).

- 2026-06 : Achats : date d'achat choisie et N° facture/BL fournisseur à la création, quantité et prix d'achat modifiables par ligne (le prix d'achat met à jour le coût produit à la réception), document d'achat imprimable A4 en colonnes (Bon de commande / Bon de réception / Facture d'achat) via `/purchase/:orderId`.

- 2026-06 : Inventaire physique (`/inventory`, module Produits) : comptage par dépôt, écarts en quantité et valeur, pré-remplissage, ajustement du stock en un clic (confirmation), historique des inventaires (collection `inventories`, tracé dans l'audit) ; Rapport « Marges » par produit sur période (CA, coût, marge, marge %, remises, marge nette) + Excel/PDF.

- 2026-06 (lot 6) : Facture client réorganisée (Client / Date / Vendeur en haut, en-tête articles gris clair, volet Règlement en bas) ; menu en groupes dépliants VENTE · ACHAT · CAISSE · RAPPORT · INVENTAIRE · BANQUE · TABLEAU DE BORD (+ Utilisateurs/Historique/Paramètres), « Facturation » remplacée par « Nouvelle vente » ; Rapport journalier supprimé, onglet « Grand livre des tiers » (période, clients/fournisseurs, report d'ouverture, imprimable + Excel, `/api/reports/ledger`) ; sauvegarde automatique quotidienne 21h (Africa/Dakar) via `.emergent/crons.yml` → `POST /api/cron/backup` (secret `WEBHOOK_CRON_SECRET`), fichiers `backend/backups/sauvegarde_*.json.gz` (30 conservés), liste / téléchargement / « Sauvegarder maintenant » dans Paramètres (admin) ; séparateurs de colonnes bleu clair sur tous les tableaux ; numérotation séquentielle `VTE0000001` (ventes) et `ACH000001` (achats) via collection `counters` (anciens numéros FAC-/ACH- conservés) ; facture fournisseur imprimable `/supplier-invoice/:id` (Prix unitaire, Prix total, MONTANT TOTAL, règlements) ; Caisse renommée « CAISSE » (entrées vert, sorties rouge, solde vert).

- 2026-06 (lot 7) : Restauration d'une sauvegarde depuis Paramètres (`POST /api/backups/{file}/restore`, admin, confirmation, sauvegarde de sécurité automatique avant restauration, compteurs VTE/ACH recalculés, tracé dans l'audit) ; bouton « Grand livre » sur la fiche client / fournisseur et sur le relevé de compte → page `/ledger/:type/:id` (période, impression, Excel, `entity_id` sur `/api/reports/ledger`).

- 2026-06 (lot 8) : Relance WhatsApp groupée sur le tableau de bord (bouton « Relancer tous (N) » → assistant client par client : ouverture WhatsApp pré-remplie, progression, ignorer, copier tous les messages) ; colonne « Grand livre » dans Comptes tiers (clients et fournisseurs) → `/ledger/:type/:id`.

- 2026-06 (lot 9) : Délai de retard client réglable (7 / 15 / 30 jours) : sélecteur dans le widget « Rappels impayés » (admin + gérant, `PUT /api/settings/overdue-days`) et champ dans Paramètres ; valeur stockée dans `settings.overdue_days`, utilisée par défaut par `/api/dashboard/overdue`.

## Backlog
- P2 : découper `server.py` en routers modulaires
- P2 : tests frontend automatisés

## Identifiants
Voir `/app/memory/test_credentials.md`
