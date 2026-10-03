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

- 2026-06 (lot 10) : Échéance par client : champ « Délai de paiement accordé (jours) » sur la fiche client (`payment_terms_days`, vide = délai global), colonne « Échéance » dans la liste Clients, prise en compte dans `/api/dashboard/overdue` (remplace le délai global pour ce client, `terms_days` / `custom_terms` renvoyés et affichés dans le widget).

- 2026-06 (lot 14) : Comptabilité — **compte de résultat** (`/api/accounting/income-statement` + export xlsx : produits 701/7019/7071 → ventes nettes, charges 601/658, marge commerciale et taux, bénéfice/perte), **rapprochement bancaire 521** (`/api/accounting/bank-reconciliation`, pointage par ligne `bank_pointage` avec réf. relevé, solde du relevé enregistré dans `settings.bank_reconciliation`, indicateurs solde comptable / pointé / non pointé / écart), **export FEC** (`/api/accounting/export/fec`, fichier texte séparateur `|`, 18 colonnes normalisées, lettrage inclus, nom `<Société>FEC<AAAAMMJJ>.txt`).

- 2026-06 (lot 13) : Comptabilité — **écritures manuelles OD** (`POST/DELETE /api/accounting/entries`, admin/gérant, pièce `OD0000001`, équilibre obligatoire, tiers sur 411/4191/401/4091, suppression bloquée si lettrée), **grand livre général** (`GET /api/accounting/ledger`, onglet imprimable par compte avec report/solde cumulé/lettre), **clôture de période** (`GET/PUT /api/accounting/closing`, admin, `settings.closing.closed_until` ; `assert_period_open` bloque création antidatée / modification / annulation de facture, suppression de mouvement caisse ou banque, écriture OD datées dans la période ; badge + onglet Clôture avec réouverture), **exports Excel** journaux / balance / grand livre (`/api/accounting/export/*.xlsx`).

- 2026-06 (lot 12) : **Comptabilité SYSCOHADA** (`/accounting`, menu COMPTABILITÉ, module accounts ; `accounting_routes.py`) : écritures dérivées automatiquement (ventes D411/C701 + remise 7019, règlements comptants D57x-52x-513/C411, factures fournisseurs D601/C401, règlements/avances tiers (4191/4091), imputations d'avance (OD), mouvements de caisse manuels (658/4718/585→521), banque manuelle, retours (7071, remboursements, avoirs)) ; journaux VT / AC / CA / BQ / OD avec période ; interrogation de compte (tiers auxiliaire, report, solde cumulé, solde non lettré, non lettrées seulement) ; **lettrage** manuel (sélection équilibrée → code AA, AB…), automatique par pièce, délettrage (admin/gérant, audit) — collection `lettrage` ; balance (totaux débit/crédit, soldes débiteurs/créditeurs) ; plan comptable. Impression via navigateur.

- 2026-06 (lot 11e) : **Personnalisation de l'écran Facture** (admin, bouton « Personnaliser l'écran », réglages `settings.invoice_ui` via `GET/PUT/DELETE /api/settings/invoice-ui`, appliqués à tous) : volet Articles à gauche/droite, largeur (curseur + poignée à glisser), affiché par défaut ; ordre/affichage/libellés des champs d'en-tête (Client, Date, N° BC), position et ordre/libellés des boutons ; colonnes (afficher, renommer, réordonner, largeur) ; taille des écritures, format de date, décimales, « F CFA », fond de la facture (gris, blanc, crème, bleu, vert), libellés des blocs ; aperçu en direct, Enregistrer / Annuler / Réinitialiser. Fichiers : `lib/invoiceUi.js`, `hooks/useInvoiceUi.js`, `components/InvoiceUiCustomizer.js`.

- 2026-06 (lot 11d) : **Bon de livraison** sans prix (`/delivery/:saleId`, numéro `BL-VTE…`) : client (tél/adresse), date, bon de commande, chauffeur/véhicule à remplir, désignation / unité / quantité / case de contrôle, total quantités, observations, signatures (préparé / livré / reçu). Boutons « Bon de livraison » sur la facture et dans Documents des ventes.

- 2026-06 (lot 11c) : Passage « POS » → **facturation gros / demi-gros** : menu « Nouvelle facture », titre « FACTURE CLIENT », « Établie par » ; **date de facture modifiable** (antidatée, pas de date future, `invoice_date` → `created_at`), champ **N° bon de commande** (`purchase_order_ref`, imprimé sur la facture), colonne Unité, volet Articles masqué par défaut, espèces par défaut, badge caisse réduit. Pris en compte aussi en modification de facture.

- 2026-06 (lot 11b) : POS — facture « flottante » (colonne facture sticky, lignes toujours visibles, défilement auto vers la dernière ligne, ligne de saisie collée en bas) ; le champ de saisie filtre directement la liste des articles (plus de menu déroulant qui masque les lignes) ; **Tab** depuis la saisie (ou **F4** partout) → liste des articles (↑ ↓, **Entrée** ou bouton **OK** ajoute) → Qté → Tab → P.U. → Tab → saisie ; F4 ne masque plus le volet (bouton dédié). Fond gris clair sur « Documents des ventes » et « Achats ».

- 2026-06 (lot 11) : **Modification de facture validée** (`PUT /api/sales/{id}`, droit `can_edit_invoice` : admin/gérant par défaut + case dans Utilisateurs ; écran POS en mode édition `/pos?edit=<id>`, règlements conservés, stock/solde client recalculés, refus si annulée ou avec retour, mention « Modifiée le… » sur la facture, audit). **POS réorganisé** : fond gris clair, en-tête facture = Client / Date / Valider / Annuler / Vider, bloc règlement en bas, volet Articles masquable (bouton + **F4**), saisie directe d'article dans la facture (`ProductPicker` : Entrée ajoute → Qté → Tab → P.U. → Tab → nouvelle ligne), quantités décimales (0,5 ; 1,5 — stock produit en float). Menu « Historique ventes » → **« Documents des ventes »**. Journal de caisse en colonnes **Débit (entrées) / Crédit (sorties)** (UEMOA) + export Excel. **Retours clients / fournisseurs** (`POST/GET /api/returns`, numéros `RTC0000001` / `RTF0000001`, depuis un document ou retour direct, stock réintégré / diminué, imputation d'abord sur le reste dû puis remboursement espèces (mouvement caisse « Retour ») ou avance ; pages `/returns/customer` et `/returns/supplier`, bon de retour imprimable `/return/:id`, boutons Retour sur facture client / facture fournisseur, lignes « Retour (avoir) » dans les relevés). Correctif : appels au stockage objet rendus non bloquants (threadpool + cache) → aperçus d'images dans « Fichiers joints » chargés correctement.

## Backlog
- P2 : découper `server.py` en routers modulaires
- P2 : tests frontend automatisés

## Identifiants
Voir `/app/memory/test_credentials.md`
