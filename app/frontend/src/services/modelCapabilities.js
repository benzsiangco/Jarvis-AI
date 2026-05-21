export function getModelCapabilities(activeModel, serverInfo, models = []) {
  const rawName = getModelName(activeModel);
  const lower = rawName.toLowerCase();
  const isGemma = lower.includes('gemma');

  // 1. Check backend runtime's currentMmproj flag
  // 2. Fallback: look up the selected model in the catalog (which correctly groups mmproj)
  // 3. Name-based heuristics
  const catalogModel = models.find((m) => m.filename === activeModel || m.name === rawName);
  const catalogMultimodal = catalogModel?.multimodal || catalogModel?.mmproj;

  const multimodal = serverInfo?.multimodal || catalogMultimodal || lower.includes('mmproj') || lower.includes('vision') || lower.includes('multimodal') || lower.includes('vl');

  const thinking = /gemma-?4|nemotron|reason|think|qwq|deepseek-r1|deepseek-r1/i.test(rawName);
  const voice = /tts|audio|voice|whisper/i.test(rawName);
  const coding = /gemma|code|coder|deepseek|codestral|starcoder|codeqwen|codegeex|phind|magicoder/i.test(rawName);

  return {
    name: rawName,
    thinking,
    text: true,
    image: multimodal,
    voice,
    coding,
    family: isGemma ? 'Gemma' : rawName.split(/[-_ ]/)[0] || 'Local',
  };
}

export function getModelName(activeModel) {
  if (!activeModel) return '';
  return typeof activeModel === 'string'
    ? activeModel.replace('.gguf', '').split(/[\\/]/).pop()
    : (activeModel.name || activeModel.filename || '');
}