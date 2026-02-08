# Agent Definitions

This directory contains context and configuration for specialized agents.

> **Quick Reference:** See [.claude/guides/when-to-use-what.md](../guides/when-to-use-what.md) for decision flowcharts.

## All Agents

### Orchestration Agents
| Agent | Role | File |
|-------|------|------|
| **workflow-orchestrator** | Project coordination, task flow | [workflow-orchestrator.md](workflow-orchestrator.md) |
| **multi-agent-coordinator** | Distributed workflows, fault tolerance | [multi-agent-coordinator.md](multi-agent-coordinator.md) |
| **agent-organizer** | Task decomposition, agent selection | [agent-organizer.md](agent-organizer.md) |

### Development Agents
| Agent | Role | File |
|-------|------|------|
| **fullstack-developer** | Configs, scripts, integration | [fullstack-developer.md](fullstack-developer.md) |
| **backend-developer** | APIs, databases, microservices | [backend-developer.md](backend-developer.md) |
| **frontend-developer** | UI components, React/Vue, state | [frontend-developer.md](frontend-developer.md) |
| **ui-designer** | Visual design, design systems | [ui-designer.md](ui-designer.md) |
| **build-engineer** | Docker, deployment, CI/CD | [build-engineer.md](build-engineer.md) |
| **data-analyst** | SQL, dashboards, metrics | [data-analyst.md](data-analyst.md) |

### Quality Agents
| Agent | Role | File |
|-------|------|------|
| **code-reviewer** | Deep code analysis, security review | [code-reviewer.md](code-reviewer.md) |
| **security-auditor** | Security review, hardening | [security-auditor.md](security-auditor.md) |
| **performance-engineer** | Optimization, profiling | [performance-engineer.md](performance-engineer.md) |
| **verify-app** | Application testing, E2E verification | [verify-app.md](verify-app.md) |
| **build-validator** | Pre-commit validation, static analysis | [build-validator.md](build-validator.md) |

### Research Agents
| Agent | Role | File |
|-------|------|------|
| **research-analyst** | Deep research, analysis, recommendations | [research-analyst.md](research-analyst.md) |

## Agent Workflow

```
+---------------------------------------------------------------------+
|                      ORCHESTRATION LAYER                             |
|  +-----------------+  +------------------+  +-----------------+     |
|  |    workflow-    |  |   multi-agent-   |  |     agent-      |     |
|  |  orchestrator   |<-|   coordinator    |<-|   organizer     |     |
|  |  (projects)     |  |  (distributed)   |  | (decomposition) |     |
|  +--------+--------+  +--------+---------+  +-----------------+     |
+------------|-------------------|------------------------------------+
             |                   |
             v                   v
+---------------------------------------------------------------------+
|                      DEVELOPMENT LAYER                               |
|  +----------+ +----------+ +----------+ +----------+ +----------+  |
|  | fullstk  | | backend  | | frontend | |   ui     | |  data    |  |
|  |   dev    | |   dev    | |   dev    | | designer | | analyst  |  |
|  |          | |          | |          | |          | |          |  |
|  | Configs  | | APIs     | | UI       | | Design   | | SQL      |  |
|  | Scripts  | | Database | | State    | | Systems  | | Metrics  |  |
|  +----------+ +----------+ +----------+ +----------+ +----------+  |
|                         +----------+                                |
|                         |  build   |                                |
|                         | engineer |                                |
|                         | Docker   |                                |
|                         | CI/CD    |                                |
|                         +----------+                                |
+---------------------------------------------------------------------+
             |
             v
+---------------------------------------------------------------------+
|                        QUALITY LAYER                                 |
|  +----------+ +----------+ +----------+ +----------+ +----------+  |
|  |  code    | | security | | perform  | |  verify  | |  build   |  |
|  | reviewer | | auditor  | | engineer | |   app    | |validator |  |
|  |          | |          | |          | |          | |          |  |
|  | Analysis | | Audit    | | Profile  | | E2E      | | Static   |  |
|  | Security | | Harden   | | Optimize | | Runtime  | | PreCommit|  |
|  +----------+ +----------+ +----------+ +----------+ +----------+  |
+---------------------------------------------------------------------+
             |
             v
+---------------------------------------------------------------------+
|                       RESEARCH LAYER                                 |
|                      +--------------+                                |
|                      |   research   |                                |
|                      |   analyst    |                                |
|                      |              |                                |
|                      | External     |                                |
|                      | Patterns     |                                |
|                      +--------------+                                |
+---------------------------------------------------------------------+
```

## Verification Agent Separation

Multiple agents handle different stages of verification - do NOT confuse them:

```
+---------------------------------------------------------------------+
|                      VERIFICATION PIPELINE                           |
+---------------------------------------------------------------------+
|                                                                      |
|  PRE-COMMIT        CODE REVIEW       POST-DEPLOY        SECURITY    |
|  +-----------+    +-----------+    +-----------+    +-----------+  |
|  |  build-   |    |   code-   |    |  verify-  |    | security- |  |
|  | validator |--->| reviewer  |--->|    app    |--->|  auditor  |  |
|  +-----------+    +-----------+    +-----------+    +-----------+  |
|                                                                      |
|  - Type check      - Logic errors    - Run tests      - Deep audit  |
|  - Linting         - Security vulns  - Health checks  - Threat model|
|  - Format          - Code quality    - E2E verify     - Hardening   |
|  - Dockerfile      - Best practices  - Functional     - Compliance  |
|  - Secrets scan    - Conventions     - Integration    - Pen testing |
|                                                                      |
|  WHEN: Before      WHEN: After       WHEN: After      WHEN: Before  |
|        commit            impl              deploy           prod    |
|  SPEED: Fast       SPEED: Medium     SPEED: Medium    SPEED: Slow   |
|  (seconds)         (minutes)         (minutes)        (thorough)    |
+---------------------------------------------------------------------+
```

**Key distinctions:**
- **build-validator:** *Static* pre-commit checks (fast, automated)
- **code-reviewer:** *Deep* code analysis after implementation (quality, security, patterns)
- **verify-app:** *Runtime* post-deploy verification (E2E, functional)
- **security-auditor:** *Comprehensive* security analysis (before production)

## Usage

When invoking agents, provide:
1. Clear task description
2. Reference to relevant files
3. Expected output format
4. Any constraints or requirements

## Context Loading

Each agent should load:
1. `state.json` - Current project state
2. Their specific `.md` file - Agent-specific context
3. Relevant decision files from `memory/decisions/`
