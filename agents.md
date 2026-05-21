# MODULAR LOCAL AI IDE RULES

## OBJECTIVE
Build a FAST modular local AI IDE optimized for:
- Electron
- Bun
- llama.cpp
- Gemma4
- low token usage
- low credits
- high responsiveness

The system MUST:
- stay modular
- avoid large files
- minimize context
- minimize token usage
- generate maintainable code

---

# CORE ARCHITECTURE

## STACK

Desktop:
- Electron

Frontend:
- React
- Tailwind
- Monaco Editor

Backend:
- Bun

AI Runtime:
- llama.cpp

Model:
- Gemma4 GGUF

Search:
- ripgrep

---

# MODULARITY RULES

## HARD FILE LIMIT
- MAX: 600 lines
- TARGET: 200-400 lines
- IDEAL: 100-250 lines

If a file exceeds 600 lines:
- split automatically
- extract modules
- separate logic

---

# MODULE RULES

## EACH MODULE MUST HAVE ONE PURPOSE

GOOD:
- fileService.ts
- terminalService.ts
- modelService.ts

BAD:
- utilsEverything.ts
- giantManager.ts
- megaController.ts

---

# FOLDER STRUCTURE

## REQUIRED STRUCTURE

/app
  /electron
  /frontend
    /components
    /pages
    /hooks
    /stores
    /services
  /backend
    /routes
    /services
    /tools
    /utils
/models
/shared

---

# COMPONENT RULES

## COMPONENT SIZE
- TARGET: <200 lines
- MAX: 400 lines

Split:
- UI
- state
- logic
- hooks

---

# BACKEND RULES

## SERVICES MUST BE SEPARATED

Separate:
- model service
- file service
- terminal service
- search service
- diff service

Never combine unrelated logic.

---

# AI RULES

## CONTEXT RULES

ONLY LOAD:
- current file
- directly related imports
- active errors
- requested files

NEVER LOAD:
- full project
- unrelated files
- old conversations

---

# TOKEN RULES

## PRIORITIZE
- short prompts
- short responses
- diffs only
- patches only

Avoid:
- full rewrites
- long explanations
- repeated code

---

# RESPONSE RULES

## PREFER

```diff
- old
+ new
```

