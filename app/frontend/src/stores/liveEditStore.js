/**
 * liveEditStore — tracks AI file editing in real-time
 *
 * When the AI writes or patches a file, the backend emits the full content.
 * This store animates it character-by-character in the editor.
 */
import { create } from 'zustand';

const EXT_TO_LANG = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown',
  html: 'html', css: 'css', yaml: 'yaml', yml: 'yaml', sql: 'sql',
  sh: 'shell', bash: 'shell', toml: 'toml', xml: 'xml',
};

const useLiveEditStore = create((set, get) => ({
  isEditing: false,
  filePath: '',
  fileName: '',
  language: 'plaintext',
  fullContent: '',       // the complete file content (target)
  visibleContent: '',    // content revealed so far (animated)
  isComplete: false,
  editType: 'write',     // 'write' | 'patch'
  animationId: null,

  /** Start a live edit animation */
  startEdit: ({ path, content, language, editType = 'write' }) => {
    // Cancel any previous animation
    const prev = get().animationId;
    if (prev) cancelAnimationFrame(prev);

    const ext = (path || '').split('.').pop()?.toLowerCase() || '';
    const lang = language || EXT_TO_LANG[ext] || 'plaintext';
    const name = (path || '').split(/[/\\]/).pop() || 'file';

    set({
      isEditing: true,
      filePath: path,
      fileName: name,
      language: lang,
      fullContent: content || '',
      visibleContent: '',
      isComplete: false,
      editType,
      animationId: null,
    });

    // Start the typing animation
    get()._animate();
  },

  /** Internal: animate content reveal at ~120 chars/frame (~60fps) */
  _animate: () => {
    const { fullContent } = get();
    const totalLen = fullContent.length;
    if (totalLen === 0) {
      set({ isComplete: true, isEditing: false });
      return;
    }

    // Calculate chars per frame for ~2-4 second total duration
    const targetDuration = Math.min(4000, Math.max(1500, totalLen * 0.15));
    const fps = 60;
    const totalFrames = (targetDuration / 1000) * fps;
    const charsPerFrame = Math.max(4, Math.ceil(totalLen / totalFrames));
    let pos = 0;

    const step = () => {
      pos = Math.min(pos + charsPerFrame, totalLen);
      set({ visibleContent: fullContent.slice(0, pos) });

      if (pos >= totalLen) {
        set({ isComplete: true, animationId: null });
        return;
      }

      const id = requestAnimationFrame(step);
      set({ animationId: id });
    };

    const id = requestAnimationFrame(step);
    set({ animationId: id });
  },

  /** Skip animation — show full content immediately */
  skipAnimation: () => {
    const { animationId, fullContent } = get();
    if (animationId) cancelAnimationFrame(animationId);
    set({
      visibleContent: fullContent,
      isComplete: true,
      animationId: null,
    });
  },

  /** Reset after animation is done and file is opened */
  reset: () => {
    const { animationId } = get();
    if (animationId) cancelAnimationFrame(animationId);
    set({
      isEditing: false,
      filePath: '',
      fileName: '',
      language: 'plaintext',
      fullContent: '',
      visibleContent: '',
      isComplete: false,
      editType: 'write',
      animationId: null,
    });
  },
}));

export default useLiveEditStore;
