# mcp-eu-comply — Document de Vision, Stratégie & Implémentation

> **Version :** 0.1 — 12 mars 2026
> **Auteur :** Wael Kebieche
> **Statut :** Pré-développement

---

## Table des matières

1. [Le problème](#1-le-problème)
2. [Pourquoi maintenant](#2-pourquoi-maintenant)
3. [Le produit](#3-le-produit)
4. [Positionnement & concurrence](#4-positionnement--concurrence)
5. [Architecture technique](#5-architecture-technique)
6. [Types & interfaces](#6-types--interfaces)
7. [Implémentation détaillée](#7-implémentation-détaillée)
8. [Stratégie de test](#8-stratégie-de-test)
9. [Erreurs à éviter](#9-erreurs-à-éviter)
10. [Modèle de monétisation](#10-modèle-de-monétisation)
11. [Roadmap](#11-roadmap)
12. [Distribution & visibilité](#12-distribution--visibilité)
13. [Métriques de succès](#13-métriques-de-succès)
14. [Risques & mitigations](#14-risques--mitigations)

---

## 1. Le problème

### Le contexte
L'écosystème MCP (Model Context Protocol) explose : 18 000+ serveurs référencés, adoption par Anthropic, OpenAI, Google, Microsoft, et des centaines de startups. Les agents IA utilisent MCP pour agir dans le monde réel — requêter des APIs, manipuler des bases de données, effectuer des transactions.

### Le vide réglementaire
L'EU AI Act entre en application le **2 août 2026**. Il impose aux systèmes IA (y compris les agents MCP déployés en production) :

- **Article 12** — Logging automatique : les systèmes IA à haut risque doivent enregistrer automatiquement les événements pendant leur fonctionnement (entrées, sorties, actions, décisions)
- **Article 14** — Human oversight : un humain doit pouvoir superviser, intervenir et arrêter le système IA
- **Article 19** — Qualité des logs : les logs doivent être générés automatiquement et permettre la traçabilité des décisions

Pénalités : **jusqu'à €35M ou 7% du chiffre d'affaires global**.

En parallèle :
- **DORA** (Digital Operational Resilience Act) — s'applique aux fintechs et banques, exige des audit trails pour tout système ICT critique, dont les agents IA
- **RGPD** — les données traitées par les agents doivent respecter la résidence des données, le consentement, et le droit à l'effacement
- **SecNumCloud** — référentiel ANSSI pour le cloud de confiance en France

### Le problème concret
**Aucun outil n'implémente le runtime compliance EU spécifiquement pour les serveurs MCP.**

Un développeur qui déploie un serveur MCP en Europe aujourd'hui n'a aucun moyen simple de :
1. Logger chaque appel d'outil de manière structurée et intègre (hash chain)
2. Classifier les actions par niveau de risque
3. Déclencher un human-in-the-loop sur les actions sensibles
4. Prouver l'intégrité des logs à un auditeur
5. Respecter la résidence des données EU

Il doit tout coder à la main. Et la plupart ne le feront pas — jusqu'à ce qu'un auditeur vienne frapper à la porte.

---

## 2. Pourquoi maintenant

### La fenêtre temporelle

```
Mars 2026 ──── NOW ────────────────────────────────────────────┐
                                                                │
Avril 2026 ─── NIST deadline (2 avril) ─ soumission crédibilité│
                                                                │
Mai 2026 ───── Début de la panique compliance ─────────────────│
               (pattern identique au RGPD en 2018)              │
                                                                │
Juin-Juillet ─ Pic de panique ─ adoption maximale ─────────────│
                                                                │
2 Août 2026 ── ENFORCEMENT EU AI ACT ─────────────────────────┘
```

### Leçon du RGPD
Cookiebot, Didomi, OneTrust — ces outils de consent management ont vu leur adoption exploser dans les 3-4 derniers mois avant le 25 mai 2018. Le même pattern se reproduira pour l'AI Act.

**Notre timing :** Ship en avril, être visible en mai, être la référence en juin-juillet, être indispensable le 2 août.

### Pourquoi personne ne l'a fait
- Les MCP gateways existants (Peta, MintMCP, Bifrost) sont **génériques** — US-first, pas EU-spécifiques
- Les compliance tools (Enactia, Protectron) sont **génériques AI** — pas spécifiques au runtime MCP
- Les gros players (Azure, AWS) ajoutent la compliance EU **en réaction**, jamais en proaction — cycle de feature release de 6-12 mois
- Le marché est perçu comme trop niche (quelques centaines de serveurs MCP en prod EU) — mais il explose

---

## 3. Le produit

### En une phrase
**Le middleware qui rend les serveurs MCP conformes à l'EU AI Act, au RGPD et à DORA — en une ligne de code.**

### Ce que c'est
Un package npm (`mcp-eu-comply`) qui wrappe n'importe quel serveur MCP existant et ajoute automatiquement :

1. **Audit logging avec hash chain** — chaque action agent est loguée dans un format structuré, avec intégrité cryptographique (chaque entrée contient le hash SHA-256 de l'entrée précédente)
2. **Classification de risque** — chaque appel d'outil est classifié (low/medium/high/critical) selon des règles configurables
3. **Human oversight** — les actions à haut risque déclenchent une pause et une notification (webhook, email, etc.) pour approbation humaine
4. **Compliance reporter** — génération de rapports d'audit exportables pour les régulateurs

### Ce que ce N'EST PAS
- Pas un nouveau serveur MCP
- Pas un gateway/proxy réseau (pas de latence ajoutée sur le transport)
- Pas un outil de scan statique de code
- Pas un dashboard SaaS (v0.1 = package npm, fichiers locaux)
- Pas "compliant" au sens juridique — "designed to meet" les exigences

### L'expérience développeur cible

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapWithCompliance } from 'mcp-eu-comply';

const server = new McpServer({
  name: 'my-fintech-agent',
  version: '1.0.0',
});

// Avant : aucune compliance
// Après : une ligne
const compliantServer = wrapWithCompliance(server, {
  // Classification automatique des actions
  riskRules: [
    { toolPattern: /payment|transfer|withdraw/, level: 'critical' },
    { toolPattern: /read|list|get/, level: 'low' },
  ],

  // Logging hash chain → fichiers NDJSON quotidiens
  logging: {
    outputDir: './audit-logs',
    retention: { days: 365 },  // Article 12 : conservation
  },

  // Human oversight pour les actions critiques
  oversight: {
    requireApproval: ['critical', 'high'],
    notifyOn: ['medium'],
    webhook: 'https://slack.webhook.example.com/compliance',
    timeoutMs: 300_000, // 5 min pour répondre
    onTimeout: 'deny',  // Par défaut : refuser si pas de réponse
  },

  // Résidence des données
  dataResidency: {
    region: 'EU',
    piiFields: ['email', 'name', 'address', 'iban'],
    redactInLogs: true,
  },
});
```

---

## 4. Positionnement & concurrence

### Carte du marché

| Outil | Ce qu'il fait | Spécifique MCP ? | Spécifique EU ? | Runtime ? |
|-------|--------------|-------------------|------------------|-----------|
| **Peta Gateway** | MCP gateway avec logging générique | ✅ | ❌ | ✅ |
| **MintMCP** | Audit trail SOC2 + GDPR pour MCP | ✅ | Partiel | ✅ |
| **Bifrost** | MCP gateway multi-transport | ✅ | ❌ | ✅ |
| **Azure API Mgmt** | API gateway avec support MCP | ✅ (récent) | ❌ | ✅ |
| **Galileo Agent Control** | Policy enforcement pour agents | ❌ (multi-framework) | ❌ | ✅ |
| **Enactia** | AI Act compliance (référence loi) | ❌ | ✅ | ❌ (statique) |
| **Protectron** | Scan + audit IA | ❌ | ✅ | ❌ (statique) |
| **mcp-eu-comply** | **Runtime compliance EU pour MCP** | **✅** | **✅** | **✅** |

### Notre position unique
On est au croisement de trois axes que personne ne couvre simultanément :
- **Spécifique MCP** (on wrappe le SDK, pas un framework générique)
- **Spécifique EU** (AI Act Articles 12/14/19, RGPD, DORA)
- **Runtime** (en production, pas un scan de code)

### Distances concurrentielles honnêtes
- **Peta/MintMCP → nous : 2-3 semaines de dev** — ils pourraient ajouter un "EU mode". Mais ce n'est pas leur priorité (clients US).
- **Azure → nous : 6-12 mois** — cycle enterprise, mais quand ils le font, ils écrasent. Notre fenêtre.
- **Enactia/Protectron → nous : marché différent** — ils font de la conformité documentaire, on fait de la conformité runtime.

---

## 5. Architecture technique

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    Agent IA (Claude, GPT, etc.)          │
│                           │                              │
│                    Appel d'outil MCP                      │
│                           │                              │
│              ┌────────────▼─────────────┐                │
│              │     mcp-eu-comply        │                │
│              │                          │                │
│              │  ┌────────────────────┐  │                │
│              │  │  Risk Classifier   │  │                │
│              │  │  (pattern matching │  │                │
│              │  │   + configurable)  │  │                │
│              │  └────────┬───────────┘  │                │
│              │           │              │                │
│              │  ┌────────▼───────────┐  │                │
│              │  │  Oversight Engine  │  │                │
│              │  │  (pause + webhook  │  │                │
│              │  │   si high/critical)│  │                │
│              │  └────────┬───────────┘  │                │
│              │           │              │                │
│              │  ┌────────▼───────────┐  │                │
│              │  │  Audit Logger      │  │                │
│              │  │  (hash chain +     │  │                │
│              │  │   NDJSON + PII     │  │                │
│              │  │   redaction)       │  │                │
│              │  └────────┬───────────┘  │                │
│              │           │              │                │
│              └───────────┼──────────────┘                │
│                          │                               │
│              ┌───────────▼──────────────┐                │
│              │   Serveur MCP original    │                │
│              │   (inchangé)              │                │
│              └──────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Approche d'interception

Le SDK MCP n'a **pas de middleware pattern côté serveur**. L'interception se fait en wrappant la méthode `registerTool` de `McpServer` :

```
McpServer.registerTool(name, config, callback)
                                        │
                            ┌───────────▼────────────┐
                            │  On remplace callback   │
                            │  par un wrapper qui :    │
                            │  1. Classifie le risque  │
                            │  2. Vérifie oversight    │
                            │  3. Exécute le callback  │
                            │  4. Logge le résultat    │
                            └────────────────────────┘
```

Concrètement, `wrapWithCompliance` :
1. **Proxy le McpServer** — intercepte les appels à `registerTool`
2. **Wrappe chaque callback d'outil** — ajoute pre-hook (classification + oversight) et post-hook (logging)
3. **Ne modifie pas le serveur original** — pattern décorateur, non invasif

### Stockage des logs

```
audit-logs/
├── 2026-03-12.ndjson    # Un fichier par jour
├── 2026-03-13.ndjson
├── chain-state.json     # Dernier hash pour la continuité inter-fichiers
└── retention.json       # Métadonnées de rétention
```

**Format NDJSON** (une ligne JSON par entrée) :
```json
{"id":"uuid","timestamp":"2026-03-12T14:30:00.000Z","prevHash":"sha256:abc...","hash":"sha256:def...","tool":"transfer_funds","args":{"amount":500,"to":"***REDACTED***"},"risk":"critical","oversight":{"required":true,"approved":true,"approvedBy":"wael@company.com","approvedAt":"2026-03-12T14:30:45.000Z"},"result":{"status":"success"},"duration":1234,"agentId":"claude-3","sessionId":"sess_abc"}
```

### Hash chain

Chaque entrée contient :
- `prevHash` : SHA-256 de l'entrée précédente (ou `"genesis"` pour la première)
- `hash` : SHA-256 du contenu de l'entrée courante (sans le champ `hash` lui-même)

Cela permet de détecter toute modification a posteriori d'un log. Un auditeur peut vérifier l'intégrité de toute la chaîne.

### PII Redaction

Les champs configurés comme PII sont remplacés par `***REDACTED***` dans les logs :
- L'original n'est jamais stocké
- La redaction se fait avant le calcul du hash (on hash le redacted)
- Pattern matching configurable (regex ou liste de champs)

---

## 6. Types & interfaces

### Types fondamentaux

```typescript
/** Niveaux de risque EU AI Act */
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Statut d'une demande d'oversight */
type OversightStatus = 'approved' | 'denied' | 'timeout' | 'not-required';

/** Action à prendre en cas de timeout */
type TimeoutAction = 'deny' | 'allow' | 'escalate';

/** Régions pour la résidence des données */
type DataRegion = 'EU' | 'FR' | 'DE' | 'custom';
```

### Configuration

```typescript
interface ComplianceConfig {
  /** Règles de classification de risque */
  riskRules: RiskRule[];

  /** Configuration du logging */
  logging: LoggingConfig;

  /** Configuration du human oversight (optionnel) */
  oversight?: OversightConfig;

  /** Résidence des données (optionnel) */
  dataResidency?: DataResidencyConfig;
}

interface RiskRule {
  /** Pattern regex ou string pour matcher le nom de l'outil */
  toolPattern: RegExp | string;

  /** Niveau de risque assigné */
  level: RiskLevel;

  /** Pattern optionnel sur les arguments pour affiner la classification */
  argsPattern?: Record<string, RegExp | string>;
}

interface LoggingConfig {
  /** Répertoire de sortie pour les fichiers NDJSON */
  outputDir: string;

  /** Rétention des logs */
  retention?: {
    days: number;  // Article 12 recommande au minimum la durée de vie du système
  };

  /** Algorithme de hash (défaut : sha256) */
  hashAlgorithm?: 'sha256' | 'sha384' | 'sha512';
}

interface OversightConfig {
  /** Niveaux de risque nécessitant une approbation humaine */
  requireApproval: RiskLevel[];

  /** Niveaux de risque nécessitant une notification (sans blocage) */
  notifyOn?: RiskLevel[];

  /** URL webhook pour les notifications/approbations */
  webhook?: string;

  /** Handler custom pour les demandes d'approbation */
  handler?: OversightHandler;

  /** Timeout en ms pour la réponse humaine */
  timeoutMs: number;

  /** Action en cas de timeout */
  onTimeout: TimeoutAction;
}

interface DataResidencyConfig {
  /** Région cible */
  region: DataRegion;

  /** Champs à considérer comme PII */
  piiFields: string[];

  /** Redacter les PII dans les logs */
  redactInLogs: boolean;
}
```

### Entrée de log (audit trail)

```typescript
interface AuditLogEntry {
  /** UUID v4 unique */
  id: string;

  /** Timestamp ISO 8601 UTC */
  timestamp: string;

  /** Hash SHA-256 de l'entrée précédente */
  prevHash: string;

  /** Hash SHA-256 de cette entrée (calculé sans ce champ) */
  hash: string;

  /** Nom de l'outil MCP appelé */
  tool: string;

  /** Arguments de l'appel (PII redactés si configuré) */
  args: Record<string, unknown>;

  /** Niveau de risque classifié */
  risk: RiskLevel;

  /** Détails de l'oversight humain */
  oversight: {
    required: boolean;
    status: OversightStatus;
    approvedBy?: string;
    approvedAt?: string;
    reason?: string;
  };

  /** Résultat de l'appel */
  result: {
    status: 'success' | 'error' | 'denied';
    error?: string;
    /** Hash du contenu de la réponse (pas le contenu brut, pour limiter la taille) */
    contentHash?: string;
  };

  /** Durée d'exécution en ms */
  durationMs: number;

  /** Identifiant de l'agent (si disponible via authInfo) */
  agentId?: string;

  /** Identifiant de session MCP */
  sessionId?: string;

  /** Version du format de log */
  schemaVersion: '0.1.0';
}
```

### Interface d'oversight handler

```typescript
interface OversightHandler {
  /**
   * Appelé quand une action nécessite une approbation humaine.
   * Doit retourner une décision dans le temps imparti.
   */
  requestApproval(request: OversightRequest): Promise<OversightDecision>;

  /**
   * Appelé pour notifier sans bloquer (niveaux "notifyOn").
   */
  notify?(notification: OversightNotification): Promise<void>;
}

interface OversightRequest {
  /** ID unique de la demande */
  id: string;

  /** Nom de l'outil */
  tool: string;

  /** Arguments (PII redactés) */
  args: Record<string, unknown>;

  /** Niveau de risque */
  risk: RiskLevel;

  /** Timestamp de la demande */
  timestamp: string;

  /** Contexte MCP (sessionId, agentId si disponible) */
  context: {
    sessionId?: string;
    agentId?: string;
  };
}

interface OversightDecision {
  status: 'approved' | 'denied';
  approvedBy: string;
  reason?: string;
}

interface OversightNotification {
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  timestamp: string;
}
```

---

## 7. Implémentation détaillée

### Module 1 : Audit Logger (`src/logger/`)

**Fichiers :**
- `src/logger/audit-logger.ts` — classe principale
- `src/logger/hash-chain.ts` — logique de hash chain
- `src/logger/pii-redactor.ts` — redaction PII
- `src/logger/audit-logger.test.ts` — tests

**Responsabilités :**
1. Créer/ouvrir le fichier NDJSON du jour
2. Calculer le hash de chaque entrée avec chaînage
3. Redacter les PII avant stockage et hash
4. Gérer la rotation quotidienne des fichiers
5. Maintenir le `chain-state.json` pour la continuité inter-fichiers
6. Exposer une méthode `verify()` pour vérifier l'intégrité de la chaîne

**Détail du hash chain :**
```
Entrée 1: prevHash = "genesis"
           hash = SHA-256(JSON.stringify({...entry, hash: undefined}))

Entrée 2: prevHash = Entrée 1.hash
           hash = SHA-256(JSON.stringify({...entry, hash: undefined}))

Entrée N: prevHash = Entrée (N-1).hash
           hash = SHA-256(JSON.stringify({...entry, hash: undefined}))
```

**Vérification d'intégrité :**
```typescript
async function verifyChain(logDir: string): Promise<{
  valid: boolean;
  entries: number;
  firstBrokenAt?: number;
  error?: string;
}>
```

### Module 2 : Risk Classifier (`src/classifier/`)

**Fichiers :**
- `src/classifier/risk-classifier.ts` — classification
- `src/classifier/risk-classifier.test.ts` — tests

**Responsabilités :**
1. Matcher le nom de l'outil contre les règles configurées
2. Matcher optionnellement les arguments
3. Retourner le niveau de risque le plus élevé parmi les règles matchées
4. Niveau par défaut : `medium` (principe de précaution)

**Algorithme :**
```
Pour chaque règle dans riskRules (ordre décroissant de risque) :
  1. Si toolPattern matche le nom de l'outil :
     a. Si argsPattern est défini, vérifier que les args matchent
     b. Retourner le niveau de risque
  2. Sinon, continuer
Si aucune règle ne matche → retourner 'medium' (défaut prudent)
```

### Module 3 : Human Oversight (`src/oversight/`)

**Fichiers :**
- `src/oversight/oversight-engine.ts` — moteur principal
- `src/oversight/webhook-handler.ts` — handler webhook par défaut
- `src/oversight/oversight-engine.test.ts` — tests

**Responsabilités :**
1. Déterminer si l'action nécessite une approbation (basé sur le risk level et la config)
2. Si oui : envoyer la demande via le handler (webhook ou custom), attendre la réponse
3. Si timeout : appliquer la politique configurée (deny/allow/escalate)
4. Si notification seule : envoyer sans bloquer
5. Retourner la décision d'oversight pour inclusion dans le log

**Flow :**
```
Action reçue
    │
    ├─ risk in requireApproval ?
    │    │
    │    ├─ OUI → envoyer OversightRequest → attendre réponse
    │    │         │
    │    │         ├─ approved → continuer
    │    │         ├─ denied → bloquer + logger
    │    │         └─ timeout → appliquer onTimeout
    │    │
    │    └─ NON ─┬─ risk in notifyOn ?
    │            │    │
    │            │    ├─ OUI → envoyer notification (non-bloquant)
    │            │    └─ NON → rien
    │            │
    │            └─ continuer
    │
    └─ Logger la décision dans l'audit entry
```

### Module 4 : MCP Wrapper (`src/wrapper/`)

**Fichiers :**
- `src/wrapper/compliance-wrapper.ts` — fonction `wrapWithCompliance`
- `src/wrapper/compliance-wrapper.test.ts` — tests

**Responsabilités :**
1. Intercepter `McpServer.registerTool` via un Proxy
2. Pour chaque outil enregistré, wrapper le callback avec :
   - Pre-hook : classification + oversight
   - Exécution du callback original
   - Post-hook : logging de l'audit entry
3. Retourner le McpServer proxifié (même API, comportement enrichi)

**Mécanisme d'interception :**

Le SDK MCP n'a pas de middleware côté serveur. On utilise un **Proxy JavaScript** sur l'instance `McpServer` pour intercepter les appels à `registerTool` :

```typescript
function wrapWithCompliance(server: McpServer, config: ComplianceConfig): McpServer {
  const logger = new AuditLogger(config.logging);
  const classifier = new RiskClassifier(config.riskRules);
  const oversight = config.oversight
    ? new OversightEngine(config.oversight)
    : null;

  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'registerTool') {
        return function wrappedRegisterTool(
          name: string,
          config: ToolConfig,
          callback: ToolCallback
        ) {
          const wrappedCallback = async (args, extra) => {
            const startTime = Date.now();
            const risk = classifier.classify(name, args);

            // Human oversight check
            let oversightResult = { required: false, status: 'not-required' };
            if (oversight) {
              oversightResult = await oversight.check(name, args, risk, extra);
              if (oversightResult.status === 'denied') {
                await logger.log({ /* denied entry */ });
                throw new Error(`Action denied by human oversight: ${oversightResult.reason}`);
              }
            }

            // Execute original callback
            try {
              const result = await callback(args, extra);
              await logger.log({ /* success entry */ });
              return result;
            } catch (error) {
              await logger.log({ /* error entry */ });
              throw error;
            }
          };

          return target.registerTool(name, config, wrappedCallback);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
```

### Module 5 : PII Redactor (`src/logger/`)

**Intégré dans le logger.**

**Algorithme :**
```
Pour chaque champ dans les args :
  Si le nom du champ matche un des piiFields (case-insensitive) :
    Remplacer la valeur par "***REDACTED***"
  Si la valeur est un objet : récurser
  Si la valeur est un tableau : récurser sur chaque élément
```

**Important :** La redaction se fait AVANT le calcul du hash. On hash le contenu redacté. L'original n'est jamais persisté.

---

## 8. Stratégie de test

### Ce qui DOIT être testé (critique)

| Test | Pourquoi | Fichier |
|------|----------|---------|
| Hash chain intégrité | Si la chaîne est cassée, les logs sont inutiles pour un auditeur | `audit-logger.test.ts` |
| Hash chain vérification | La fonction `verify()` doit détecter toute modification | `audit-logger.test.ts` |
| Hash chain continuité inter-fichiers | Le hash doit continuer entre les fichiers quotidiens | `audit-logger.test.ts` |
| PII redaction | Si un email fuit dans un log, c'est une violation RGPD | `pii-redactor.test.ts` |
| PII redaction récursive | Les PII dans des objets imbriqués doivent aussi être redactés | `pii-redactor.test.ts` |
| Risk classification | Mauvaise classification = mauvais oversight = non-conformité | `risk-classifier.test.ts` |
| Risk classification défaut medium | Sans règle, le défaut prudent doit être `medium` | `risk-classifier.test.ts` |
| Oversight blocking | Une action `critical` sans approbation DOIT être bloquée | `oversight-engine.test.ts` |
| Oversight timeout → deny | Le timeout DOIT appliquer la politique configurée | `oversight-engine.test.ts` |
| Wrapper intercepte registerTool | Le proxy doit intercepter tous les outils enregistrés | `compliance-wrapper.test.ts` |
| Wrapper n'altère pas le résultat | Le résultat de l'outil original doit être retourné intact | `compliance-wrapper.test.ts` |

### Ce qui DEVRAIT être testé (important)

| Test | Fichier |
|------|---------|
| Rotation quotidienne des fichiers de log | `audit-logger.test.ts` |
| Format NDJSON valide | `audit-logger.test.ts` |
| Webhook handler HTTP | `webhook-handler.test.ts` |
| Notification non-bloquante | `oversight-engine.test.ts` |

### Ce qui n'a PAS besoin de test (v0.1)

- Performance/benchmarks
- Intégration avec des webhooks réels (on mock)
- Compatibilité avec toutes les versions du SDK MCP

---

## 9. Erreurs à éviter

### Erreurs techniques

1. **Ne JAMAIS dire "compliant"** — dire "designed to meet EU AI Act Article 12/14/19 requirements". Le format officiel des logs n'est pas encore défini par CEN/CENELEC. Se prétendre "compliant" est juridiquement présomptueux.

2. **Ne JAMAIS stocker les PII non-redactés** — même temporairement en mémoire, les redacter le plus tôt possible dans le pipeline.

3. **Hash chain : hasher le contenu REDACTÉ, pas l'original** — sinon un auditeur qui reçoit les logs redactés ne peut pas vérifier la chaîne.

4. **Hash chain : gérer le cas genesis** — la première entrée a `prevHash: "genesis"`, pas un hash vide ou null.

5. **Hash chain : persister le dernier hash** — entre les redémarrages du serveur et les rotations de fichiers, le `chain-state.json` doit maintenir la continuité.

6. **Ne PAS utiliser SQLite en v0.1** — NDJSON est plus simple, plus portable, plus facile à auditer. SQLite viendra plus tard si nécessaire.

7. **Le Proxy doit être transparent** — toute méthode non-interceptée doit passer directement au serveur original via `Reflect.get`.

8. **Oversight timeout : DENY par défaut** — une action sensible sans réponse humaine doit être refusée, pas autorisée. C'est le principe de précaution Article 14.

9. **Ne PAS logger le contenu complet des réponses** — logger un hash du contenu pour limiter la taille des logs et éviter de stocker des données sensibles retournées par les outils.

10. **Timestamps en UTC ISO 8601** — jamais en heure locale. Les audits cross-timezone doivent être cohérents.

### Erreurs produit

11. **Ne PAS over-engineer la v0.1** — pas de dashboard, pas de SaaS, pas de base de données. Fichiers NDJSON locaux. Le package npm EST le produit.

12. **Ne PAS cibler "tous les MCP servers"** — cibler les fintechs EU (DORA + AI Act = double contrainte) et l'e-commerce EU (agent commerce).

13. **Ne PAS construire le dashboard avant d'avoir 50 utilisateurs du package npm** — le dashboard est un produit futur, pas le MVP.

14. **Ne PAS négliger la DX** — un dev qui installe le package doit avoir un working setup en < 5 minutes. Si c'est compliqué, il désinstalle.

15. **Ne PAS ignorer les issues GitHub** — chaque issue est un signal. Répondre en < 24h.

### Erreurs marketing

16. **Ne PAS marketer avant mai 2026** — construire en mars-avril, marketer en mai quand la panique commence.

17. **Ne PAS faire de landing page SaaS** — le README GitHub EST la landing page pour v0.1.

18. **Ne PAS créer de Discord/Community avant 200+ stars** — une communauté vide tue la crédibilité.

19. **Ne PAS utiliser le mot "startup"** — c'est un side project open source. La crédibilité technique d'abord.

---

## 10. Modèle de monétisation

### Phase 1 : Open source gratuit (mars-août 2026)
- Package npm gratuit, Apache 2.0
- Aucune monétisation
- Objectif : adoption, crédibilité, feedback

### Phase 2 : Freemium SaaS (post-adoption, H2 2026)
- **Gratuit :** package npm avec logs locaux (ce qu'on construit maintenant)
- **Payant :** dashboard SaaS hébergé en EU
  - Visualisation des logs en temps réel
  - Alertes configurables
  - Rapports d'audit PDF exportables
  - Intégration Slack/Teams pour l'oversight
  - Rétention cloud longue durée
  - Multi-serveur MCP centralisé

### Pricing envisagé (à valider)
- **Free** : npm package, logs locaux, 1 serveur MCP
- **Pro** : €49/mois — dashboard, 5 serveurs, alertes, rapports PDF
- **Enterprise** : €299/mois — multi-équipe, SSO, audit API, support SLA, custom data residency

### Pourquoi ce modèle
- Le gratuit crée l'adoption et la crédibilité (pattern Sentry, PostHog, Grafana)
- Le payant résout un vrai problème : les logs locaux ne suffisent pas en enterprise (centralisation, accès multi-équipe, rétention garantie)
- L'EU AI Act FORCE la conservation longue durée des logs → besoin naturel de solution cloud

---

## 11. Roadmap

### v0.1 — "First ship" (mars-avril 2026)

**Objectif : être le premier package npm de compliance EU pour MCP. Fonctionnel, testé, documenté.**

| Composant | Livrable |
|-----------|----------|
| Audit logger | NDJSON + hash chain + rotation quotidienne |
| PII redaction | Redaction configurable par nom de champ |
| Risk classifier | Pattern matching sur nom d'outil + args |
| Human oversight | Webhook + handler custom + timeout policy |
| MCP wrapper | `wrapWithCompliance(server, config)` |
| Vérification | `verifyChain(logDir)` CLI |
| Tests | 100% des cas critiques listés en section 8 |
| README | Usage, exemples, référence Articles 12/14/19 |

### v0.2 — "Polish" (avril 2026)

| Composant | Livrable |
|-----------|----------|
| CLI | `npx mcp-eu-comply verify ./audit-logs` |
| CLI | `npx mcp-eu-comply report ./audit-logs --format pdf` |
| Export | Rapport d'audit JSON/CSV exportable |
| Config | Fichier `eu-comply.config.ts` en alternative à l'inline config |
| Exemples | Repo `examples/` avec 3 cas concrets (fintech, e-commerce, RAG) |

### v0.3 — "Credibility" (avril 2026)

| Composant | Livrable |
|-----------|----------|
| NIST | Soumission au NIST AI Agent Standards Initiative (deadline 2 avril) |
| Blog | Article technique "EU AI Act compliance for MCP servers" |
| Show HN | Post avec l'angle "first EU AI Act compliance tool for MCP" |

### v1.0 — "Product" (juin-juillet 2026, conditionnel à la traction)

| Composant | Livrable |
|-----------|----------|
| Dashboard SaaS | Interface web pour visualiser/chercher les logs |
| Cloud storage | Logs centralisés, hébergés EU (Scaleway/OVHcloud) |
| Alertes | Slack/Teams/Email en temps réel |
| Rapports | PDF d'audit formaté pour les régulateurs |
| Multi-serveur | Centraliser les logs de N serveurs MCP |

### v2.0 — "Platform" (H2 2026, conditionnel au business)

| Composant | Livrable |
|-----------|----------|
| DORA module | Templates spécifiques DORA pour fintechs |
| eIDAS bridge | Vérification d'identité agent via EU Digital Identity Wallet |
| SecNumCloud | Hébergement certifié SecNumCloud (via partenaire) |
| API | API publique pour intégration dans des pipelines CI/CD |

---

## 12. Distribution & visibilité

### Canaux par ordre de priorité

#### 1. GitHub (jour 1 — OBLIGATOIRE)
- Repo public, README irréprochable, exemples fonctionnels
- Le repo EST le produit, la landing page, et la preuve technique
- **Objectif :** 100 stars en 2 mois, des issues réelles

#### 2. npm (jour 1 — OBLIGATOIRE)
- `npm install mcp-eu-comply`
- Le nom EST le SEO. Quand un dev cherche "mcp eu compliance" sur npm, il nous trouve.

#### 3. Contenu SEO (mai 2026 — CRITIQUE)
Articles qui rankent sur les requêtes que les devs taperont en mai-juillet :
- "EU AI Act MCP compliance" — article fondateur
- "AI Act Article 12 logging requirements for AI agents" — guide technique
- "DORA AI agent compliance fintech" — article ciblé fintechs
- "How to make MCP server EU compliant" — tutoriel pratique
- Publiés sur Medium + blog perso (SEO dual)
- Chaque article pointe vers le package

#### 4. Hacker News (mai 2026)
- Show HN: "mcp-eu-comply — EU AI Act compliance for MCP servers in one line of code"
- L'angle : premier outil, timing enforcement, one-liner DX
- Si front page → distribution massive dans la cible exacte

#### 5. Twitter/X (mai 2026, continu)
- Thread technique court, pas de hype
- Tag les gens MCP (Anthropic devrel, MCP contributors), les VCs agent-infra, les compliance EU folks
- Objectif : débat + RT, pas likes

#### 6. Dev.to + Reddit (mai-juin 2026)
- Cross-post des articles
- r/artificial, r/MachineLearning, r/eupolitics, r/fintech

#### 7. Communautés spécialisées (juin 2026)
- MCP Discord/community
- EU AI Act compliance forums/Slack
- Fintech meetups EU

#### 8. NIST (avril 2026)
- Soumission concept paper
- "Contributed to NIST AI Agent Standards Initiative" dans le README
- Boost de crédibilité disproportionné vs effort (2-3h de rédaction)

### Ce qu'on NE fait PAS
- Pas de landing page SaaS avant v1.0
- Pas de newsletter
- Pas de Discord avant 200+ stars
- Pas de vidéo YouTube
- Pas de pitch deck / fundraise
- Pas de conférence speaking avant la traction

---

## 13. Métriques de succès

### Phase 1 : Construction (mars-avril 2026)

| Métrique | Objectif | Signal |
|----------|----------|--------|
| Build | ✅ 0 erreurs TypeScript | Non-négociable |
| Tests | ✅ 100% des cas critiques passent | Non-négociable |
| npm publish | Package publié et installable | Non-négociable |
| README | Un dev peut avoir un setup fonctionnel en < 5 min | Non-négociable |

### Phase 2 : Visibilité (mai-juin 2026)

| Métrique | Objectif | Signal |
|----------|----------|--------|
| npm downloads | 100/semaine | ✅ Les devs cherchent le sujet |
| GitHub stars | 100 | ✅ Visibilité minimale |
| GitHub issues | 10+ issues réelles (pas du spam) | ✅ Des gens utilisent le package |
| Articles publiés | 4 articles SEO | Non-négociable |
| HN post | Front page (ou > 50 points) | Signal fort |

### Phase 3 : Validation (juillet-août 2026)

| Métrique | Objectif | Signal GO pour v1.0 SaaS |
|----------|----------|--------------------------|
| npm downloads | 500/semaine | ✅ Adoption réelle |
| GitHub stars | 500 | ✅ Notoriété |
| Demandes de features SaaS | 10+ | ✅ Le marché veut payer |
| Emails/DM "quand le dashboard ?" | 5+ | ✅ Urgence perçue |

### Signal GO / NO GO pour passer en produit payant
- **GO** si : > 500 downloads/semaine + demandes spontanées de dashboard + au moins 1 entreprise fintech intéressée
- **NO GO** si : < 100 downloads/semaine à fin juillet malgré le marketing → le marché est trop early, on maintient le package open source et on attend

---

## 14. Risques & mitigations

### Risque 1 : Le marché est trop early
**Probabilité : 30%**
Les entreprises EU ne déploient pas encore assez de MCP servers en production pour avoir un problème de compliance.

**Mitigation :** Le package est open source et coûte peu à maintenir. On attend que le marché mûrisse. Le timing RGPD montre que l'adoption explose dans les derniers mois avant enforcement.

### Risque 2 : Un gros player le fait avant nous
**Probabilité : 20% avant août 2026, 60% sur 12 mois**
Azure, Cloudflare, ou un MCP gateway existant ajoute un mode EU compliance.

**Mitigation :** Être premier donne la crédibilité et le SEO. Même si Azure le fait en septembre 2026, "mcp-eu-comply" sera déjà le résultat #1 sur Google et npm. Et les PME/ETI préfèrent souvent un outil indépendant à un lock-in Azure.

### Risque 3 : Le format de log qu'on définit est incompatible avec le standard CEN/CENELEC
**Probabilité : 40%**
Quand CEN/CENELEC publie les standards harmonisés, notre format ne correspond pas.

**Mitigation :** Dire "designed to meet" pas "compliant". Garder le format flexible et versionné (`schemaVersion: '0.1.0'`). Adapter dès que les standards sont publiés. Être dans la conversation NIST aide à anticiper.

### Risque 4 : Qualité technique insuffisante
**Probabilité : 10% (contrôlable)**
Un dev senior installe le package, trouve du code bâclé, désinstalle et écrit un tweet négatif.

**Mitigation :** TypeScript strict, tests exhaustifs, hash chain irréprochable, README exemplaire. La qualité technique est le ticket d'entrée, pas le différenciant — mais sans elle, rien ne marche.

### Risque 5 : L'EU AI Act n'est pas appliqué strictement
**Probabilité : 25% sur les 12 premiers mois**
Les régulateurs sont lents, les premières sanctions ne tombent qu'en 2027-2028.

**Mitigation :** Même sans enforcement strict, les entreprises ont un devoir de compliance (assurance, auditeurs, clients enterprise qui l'exigent dans les contrats). Le risque de non-compliance suffit à motiver l'adoption, même sans amendes immédiates.

### Risque 6 : Concurrence open source
**Probabilité : 30%**
Quelqu'un fork ou crée un package similaire.

**Mitigation :** Être le premier, avoir le meilleur README, la meilleure DX, et la communauté la plus active. Dans l'open source, le premier projet bien exécuté gagne presque toujours (Express vs restify, React vs Angular, etc.)

---

## Annexe A : Références réglementaires

| Réglementation | Articles clés | Exigences | Deadline |
|---------------|---------------|-----------|----------|
| **EU AI Act** | Art. 12 | Logging automatique des systèmes IA | 2 août 2026 |
| **EU AI Act** | Art. 14 | Human oversight des systèmes IA à haut risque | 2 août 2026 |
| **EU AI Act** | Art. 19 | Qualité et traçabilité des logs auto-générés | 2 août 2026 |
| **RGPD** | Art. 5, 17, 25 | Minimisation, droit à l'effacement, privacy by design | En vigueur |
| **DORA** | Art. 11, 12 | Logs ICT, audit trails, incident reporting (fintechs) | 17 janvier 2025 |
| **SecNumCloud** | 3.1 | Hébergement sur infra certifiée ANSSI | En vigueur |
| **eIDAS 2.0** | — | Digital Identity Wallet, vérification d'identité | Rollout 2026 |

## Annexe B : Stack technique

| Outil | Usage |
|-------|-------|
| TypeScript 5.9 | Langage, strict mode |
| Node.js ≥ 18 | Runtime |
| Vitest 4 | Tests unitaires |
| @modelcontextprotocol/sdk | SDK MCP officiel (peer dependency) |
| crypto (Node built-in) | SHA-256 pour hash chain |
| fs/promises (Node built-in) | Écriture NDJSON |
| uuid (ou crypto.randomUUID) | Génération des IDs de log |

Zéro dépendance externe au-delà du SDK MCP. C'est intentionnel : moins de dépendances = moins de surface d'attaque = plus de confiance dans un contexte compliance.

## Annexe C : Exemple de fichier de log NDJSON

```json
{"id":"550e8400-e29b-41d4-a716-446655440001","timestamp":"2026-03-12T14:30:00.000Z","prevHash":"genesis","hash":"sha256:a1b2c3d4e5f6...","tool":"list_accounts","args":{},"risk":"low","oversight":{"required":false,"status":"not-required"},"result":{"status":"success","contentHash":"sha256:f6e5d4c3b2a1..."},"durationMs":45,"sessionId":"sess_abc123","schemaVersion":"0.1.0"}
{"id":"550e8400-e29b-41d4-a716-446655440002","timestamp":"2026-03-12T14:30:12.000Z","prevHash":"sha256:a1b2c3d4e5f6...","hash":"sha256:b2c3d4e5f6a1...","tool":"transfer_funds","args":{"amount":500,"to":"***REDACTED***","from":"***REDACTED***"},"risk":"critical","oversight":{"required":true,"status":"approved","approvedBy":"wael@company.com","approvedAt":"2026-03-12T14:30:45.000Z"},"result":{"status":"success","contentHash":"sha256:c3d4e5f6a1b2..."},"durationMs":1234,"agentId":"claude-agent-v1","sessionId":"sess_abc123","schemaVersion":"0.1.0"}
{"id":"550e8400-e29b-41d4-a716-446655440003","timestamp":"2026-03-12T14:31:00.000Z","prevHash":"sha256:b2c3d4e5f6a1...","hash":"sha256:c3d4e5f6a1b2...","tool":"delete_user","args":{"userId":"***REDACTED***"},"risk":"critical","oversight":{"required":true,"status":"denied","approvedBy":"admin@company.com","reason":"Deletion requires manager approval"},"result":{"status":"denied"},"durationMs":0,"sessionId":"sess_abc123","schemaVersion":"0.1.0"}
```
