// Movido pra src/storage/ (o reconciliador do coletor também funde conversas
// e o build da nuvem só compila src/). Re-export mantém scripts e testes.
export { mergeDedupLines, mergeMessagesById } from '../../src/storage/jsonl-merge.js';
