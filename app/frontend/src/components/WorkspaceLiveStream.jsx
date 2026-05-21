import { useEffect, useMemo, useRef } from 'react';
import { Activity, FilePenLine, Sparkles, Zap } from 'lucide-react';
import useChatStore from '../stores/chatStore';
import useThinkingStore from '../stores/thinkingStore';

const EDIT_TYPES = new Set(['editing', 'writing_file', 'diff_generation', 'tool_execution']);

export default function WorkspaceLiveStream() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamStartedAt = useChatStore((s) => s.streamStartedAt);
  const events = useThinkingStore((s) => s.events);
  const scrollRef = useRef(null);

  const liveText = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    return lastAssistant?.content || '';
  }, [messages]);

  const liveEvents = useMemo(
    () => events.filter((event) => event.ts >= streamStartedAt).slice(-8),
    [events, streamStartedAt],
  );

  const latestType = liveEvents.at(-1)?.type || 'model_generation';
  const isEditing = liveEvents.some((event) => EDIT_TYPES.has(event.type));
  const title = isEditing ? 'Editing live' : 'Generating live';
  const Icon = isEditing ? FilePenLine : Sparkles;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
  }, [liveText, liveEvents.length]);

  return (
    <section className="workspace-live">
      <div className="workspace-live-header">
        <div className="workspace-live-title">
          <Icon size={15} />
          <div>
            <div>{title}</div>
            <span>{normalizeType(latestType)}</span>
          </div>
        </div>
        <div className="workspace-live-pill">
          <Activity size={11} />
          {isStreaming ? 'streaming' : 'ready'}
        </div>
      </div>

      <div ref={scrollRef} className="workspace-live-body">
        {liveText ? (
          <pre className="workspace-live-text">
            {liveText}
            {isStreaming && <span className="workspace-live-cursor" />}
          </pre>
        ) : (
          <div className="workspace-live-empty">
            <Zap size={18} />
            <span>Waiting for model output...</span>
          </div>
        )}
      </div>

      {liveEvents.length > 0 && (
        <div className="workspace-live-events">
          {liveEvents.map((event) => (
            <div key={event.id} className="workspace-live-event">
              <span>{normalizeType(event.type)}</span>
              <p>{event.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function normalizeType(type) {
  return String(type || 'thinking').replace(/_/g, ' ');
}
