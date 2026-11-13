# web/ai/ (AI2)
`voice.js`: the ElevenLabs voice assistant the HUD loads. Built from `ai/` with `npm run build:hud`; don't edit it by hand.

- Exports: `toggleVoice()`, `getConversation()`, `onAgentText()`, `onUserText()`, `isListening()`, `getVoiceState()`.
- No agent ID inside. Open the HUD once with `?agent=<id>`; the phone remembers it.

Task: T1.2 (see the project board). Details: `ai/README.md`.
