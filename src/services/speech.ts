import type { Language } from '../types/vocab';

export const speakTerm = (text: string, lang: Language): void => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Web Speech API is not supported in this environment.');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const targetPrefix = lang === 'pt' ? 'pt' : 'en';
  const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(targetPrefix));
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  window.speechSynthesis.speak(utterance);
};

export const stopSpeech = (): void => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
