# CLAUDE.md

## 1. Project Objectives

RobotOps Studio (Robot Commissioning & Operations Studio) is a field robot management and upgrade tool designed for FAE (Field Application Engineers).

### Core Objectives

- Manage multiple robots in the field through Wi-Fi connectivity
- View and modify robot basic information (SN, Model, firmware versions, etc.)
- Execute BSP and robot OS upgrades with progress tracking and rollback support
- Deploy application maps and program configurations
- Support reusable Project/Solution mechanism to reduce duplicate configuration
- Provide field diagnostic mode for health checks, real-time monitoring, and troubleshooting

### Target Users

- **Primary**: FAE personnel performing on-site robot deployment, upgrades, and diagnostics
- **Secondary**: Senior FAE / Technical Support sharing solutions and exporting logs
- **Optional**: Administrators maintaining upgrade packages and default configurations

### Supported Platforms

- Windows PC
- Linux PC
- Wi-Fi network environments

---

## 2. Technology Stack

### Frontend

- **Framework**: React (ES6 + TypeScript)
- **UI Library**: Carbon Design System (IBM Carbon)
- **Build Tool**: Vite or Webpack

### Backend

- **Runtime**: Node.js (ES6 + TypeScript)
- **Framework**: Express.js or similar (actually Hono)
- **Logging**: Pino (structured JSON logging, pino-pretty in development)
- **Architecture**: REST API service

### Project Structure

```
syrius-robotops/
├── frontend/          # React application
├── backend/           # Node.js service
├── documents/         # Requirements and design docs
├── playground/        # Sandbox/testing code
└── CLAUDE.md          # This file
```

### Key Dependencies

- All dependencies must be installed via package managers only
- No system-level package installation (apt, pip, npm install -g)

---

## 3. Development Commands

(TBD - to be documented after project structure is established)

### Common Commands

- Install dependencies: `npm install` (within project directories only)
- Development mode: (TBD)
- Build: (TBD)
- Test: (TBD)

---

## 4. Architecture Rules

### Package Management

- **FORBIDDEN**: Do NOT use `apt install`, `pip install`, `npm install -g`, or any system-level package installation
- **FORBIDDEN**: Do NOT pollute the system with global packages
- All dependencies must be installed locally within project directories using standard package managers

### Code Standards

- **TypeScript**: All code MUST be written in TypeScript, not plain JavaScript
- **Module System**: Use ES6 module syntax (`import`/`export`), not CommonJS (`require`/`module.exports`)

### Backend Logging

- **Framework**: Pino (src/backend/src/logger/index.ts)
- **FORBIDDEN**: Do NOT use `console.log`, `console.error`, `console.warn` in backend production code. All logging MUST go through the Pino logging framework.
- **Module-level loggers**: Use `createLogger("ModuleName")` from `src/logger/index.js` to create a child logger with the `module` field. Module name should use PascalCase matching the component.
- **Structured context**: Pass contextual data as the first argument object (e.g., `log.info({ robotSn, version }, 'Upgrading')`) instead of string interpolation. This enables structured log parsing and export.
- **Message convention**: Log messages should be brief descriptive phrases in English, not full sentences.
- **Levels**: `trace` (verbose debug), `debug` (development detail), `info` (normal operations), `warn` (recoverable issues), `error` (errors needing attention), `fatal` (unrecoverable).
- **Development**: pino-pretty is configured for development output. Production outputs raw JSON.
- **Sensitive data**: Never log passwords, tokens, or secrets in any log field.

- **FORBIDDEN**: All logs, comments MUST be in English only
- **FORBIDDEN**: Use of half-width characters in logs and comments is prohibited
- Use full-width characters only when required by UI localization, never in code/logs
- **FORBIDDEN**: Do NOT write code in plain JavaScript; all code must be TypeScript with ES6 module syntax
- **FORBIDDEN**: Do NOT use CommonJS (`require`/`module.exports`); use ES6 `import`/`export` instead

### Security

- **FORBIDDEN**: Do NOT commit secrets, API keys, or credentials to the repository
- **FORBIDDEN**: Do NOT log sensitive information (passwords, tokens, etc.)
- **FORBIDDEN**: Do NOT perform dangerous operations without explicit user confirmation

---

## 9. Agent Behavior Requirements

- When there are questions about requirements, the agent MUST confirm with the user first and clarify all ambiguities before proceeding. Do NOT start implementation when requirements are unclear.
- After modifying code, the agent MUST check whether requirements documents, design documents, UI/UX specifications, test case design documents, usage manuals, and README.md remain consistent with the code. If inconsistencies are found, the agent MUST update the documents to match the code.
- Use `tools/generate_ui_sketches.py` to generate or update UI/UX wireframe sketches. Re-run this script after any UI-related changes to keep the sketches in sync with the implementation.
- UI/UX wireframe sketches under `documents/ui-ux/` MUST be organized by module and sub-module hierarchy. Each module gets its own directory; sub-modules are nested as sub-directories reflecting the parent-child relationship (e.g., `solution-management/robots/`, `artifact-management/`).
- After writing code, check code formatting and eliminate warnings and unused imports.
- When creating, modifying, or deleting a backend task resolver (files under `src/backend/src/tasks/`, excluding mock tasks), you MUST update `documents/design/backend_task_design.md` to keep it consistent. Each task entry includes: functional overview, input parameters, output parameters, and notes.
