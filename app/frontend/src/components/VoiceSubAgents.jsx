/**
 * VoiceSubAgents — compact sub-agent activity overlay for the Jarvis page.
 *
 * Shows a live feed of spawned sub-agents below the tool calls panel.
 * Each agent card shows: task, status, current step, and final answer.
 * Designed to be minimal and non-intrusive on the cinematic voice UI.
 */
import { useState } from 'react';
import { Bot, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import useSubAgentStore from '../stores/subAgentStore';

const TOOL_COLOR = {
  runTerminal:    '#f97316',
  readFile:       '#22d3ee',
  writeFile:      '#a78bfa',
  patchFile:      '#a78bfa',
  searchCode:     '#fbbf24',
  listFiles:      '#22d3ee',
  searchInternet: '#34d399',
};

export default function VoiceSubAgents() {
  const agents = useSubAgentStore((s) => s.agents);
  if (!agents.length) return null;

  return (
    <div className="vm-subagents">
      <div className="vm-subagents-header">
        <Bot size={11} />
        <span>Sub-Agents</span>
        <span className="vm-subagents-count">{agents.length}</span>
      </div>
      <div className="vm-subagents-list">
        {[...agents].reverse().map((agent) => (
          <VoiceAgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function VoiceAgentCard({ agent }) {
  const [expanded, setExpanded] = useState(agent.status === 'running');
  const isRunning = agent.status === 'running';
  const isError   = agent.status === 'error';

  const latestStep = agent.steps[agent.steps.length - 1];

  return (
    <div className={`vm-agent-card vm-agent-${agent.status}`}>
      <button type="button" className="vm-agent-header" onClick={() => setExpanded(v => !v)}>
        <span className="vm-agent-icon">
          {isRunning
            ? <Loader2 size={10} className="vm-agent-spin" />
            : isError
              ? <AlertCircle size={10} />
              : <CheckCircle2 size={10} />}
        </span>
        <span className="vm-agent-task">{agent.task}</span>
        <span className="vm-agent-toggle">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
      </button>

      {/* Live step indicator — shown even when collapsed */}
      {isRunning && latestStep && (
        <div className="vm-agent-live-step">
          <span
            className="vm-agent-step-dot"
            style={{ background: TOOL_COLOR[latestStep.tool] || '#52546a' }}
          />
          <span className="vm-agent-step-tool">{latestStep.tool}</span>
          <span className="vm-agent-step-args">
            {Object.values(latestStep.args || {}).join(', ').slice(0, 40)}
          </span>
        </div>
      )}

      {/* Expanded: all steps + answer */}
      {expanded && (
        <div className="vm-agent-body">
          {agent.steps.map((step) => (
            <div key={step.step} className={`vm-agent-step vm-agent-step-${step.status}`}>
              <span
                className="vm-agent-step-dot"
                style={{ background: TOOL_COLOR[step.tool] || '#52546a' }}
              />
              <span className="vm-agent-step-tool">{step.tool}</span>
              <span className="vm-agent-step-args">
                {Object.values(step.args || {}).join(', ').slice(0, 50)}
              </span>
              {step.status === 'running' && (
                <Loader2 size={9} className="vm-agent-spin" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              )}
              {step.status === 'failed' && (
                <AlertCircle size={9} style={{ marginLeft: 'auto', color: '#f87171', flexShrink: 0 }} />
              )}
            </div>
          ))}

          {agent.answer && (
            <div className="vm-agent-answer">
              <span className="vm-agent-answer-label">
                {isError ? 'Error' : 'Result'}
              </span>
              <span className="vm-agent-answer-text">{agent.answer}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
