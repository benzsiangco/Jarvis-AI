import { useRef, useEffect } from 'react';
import { Trash2, CheckCircle2, Sparkles, Loader2, Cpu, AlertTriangle } from 'lucide-react';
import useChatStore from '../stores/chatStore';
import useModelStore from '../stores/modelStore';
import { MessageBlock } from './ChatMessage';
import { getModelName } from '../services/modelCapabilities';
import QuestionPicker from './QuestionPicker';

export default function ChatPanel({ backendUrl }) {
  const { messages, isStreaming, clearMessages } = useChatStore();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModel  = useModelStore((s) => s.activeModel);
  const loadProgress = useModelStore((s) => s.loadProgress);
  const errorMessage = useModelStore((s) => s.errorMessage);
  const modelName    = getModelName(activeModel);
  const scrollRef    = useRef(null);
  const bottomRef    = useRef(null);
  const isNearBottom = useRef(true);

  const hasMessages = messages.length > 0;

  // Auto-scroll using a sentinel element at the bottom of the message list
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth', block: 'end' });
    }
  }, [messages, isStreaming]);

  // Track whether the user is scrolled near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handle = () => {
      isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, []);

  return (
    <div className="cp-root">
      {/* Floating clear button — top-right, only visible when there are messages */}
      {hasMessages && (
        <button
          onClick={() => clearMessages(backendUrl)}
          className="cp-clear-btn"
          title="Clear thread"
        >
          <Trash2 size={12} />
        </button>
      )}

      {/* Status banner — only shown when model is NOT ready */}
      <ModelStatusBanner
        status={serverStatus}
        modelName={modelName}
        loadProgress={loadProgress}
        errorMessage={errorMessage}
      />

      {/* Messages */}
      <div ref={scrollRef} className="cp-scroll">
        {!hasMessages ? (
          <EmptyState status={serverStatus} modelName={modelName} />
        ) : (
          <div className="cp-msg-list">
            {messages.map((msg, i) => (
              <MessageBlock
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
              />
            ))}
            <QuestionPicker backendUrl={backendUrl} />
            <div ref={bottomRef} className="cp-scroll-anchor" />
          </div>
        )}
      </div>
    </div>
  );
}

function ModelStatusBanner({ status, modelName, loadProgress, errorMessage }) {
  if (status === 'ready') return null;
  const cfg = {
    offline:  ['No model loaded',  'Load a GGUF model from Models.', Cpu],
    starting: ['Starting',         loadProgress || 'Launching model server…', Loader2],
    loading:  ['Loading',          loadProgress || `Preparing ${modelName || 'model'}…`, Loader2],
    error:    ['Model error',      errorMessage || 'Check the Models panel.', AlertTriangle],
  }[status] || ['No model loaded', 'Load a model to start.', Cpu];
  const Icon = cfg[2];
  return (
    <div className="cp-banner">
      <Icon size={12} className={status === 'starting' || status === 'loading' ? 'animate-spin' : ''} />
      <span className="cp-banner-title">{cfg[0]}</span>
      <span className="cp-banner-detail">{cfg[1]}</span>
    </div>
  );
}

function EmptyState({ status, modelName }) {
  return (
    <div className="cp-empty">
      <div className="cp-empty-icon">
        {status === 'ready' ? <CheckCircle2 size={22} /> : <Sparkles size={22} />}
      </div>
      <div className="cp-empty-title">
        {status === 'ready' ? 'Ready to help' : 'No model loaded'}
      </div>
      <div className="cp-empty-desc">
        {status === 'ready'
          ? `${modelName || 'The model'} is loaded. Ask anything below.`
          : 'Open Models and load a GGUF file to start.'}
      </div>
    </div>
  );
}
