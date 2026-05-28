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
- **Framework**: Express.js or similar
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
- After modifying code, the agent MUST check whether requirements documents, design documents, UI/UX specifications, and test case design documents remain consistent with the code. If inconsistencies are found, the agent MUST update the documents to match the code.
