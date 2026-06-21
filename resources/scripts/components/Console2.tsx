/**
 * Console 2.0
 * ----------------------------------------------------------------------------
 * Streaming log viewer with:
 *   - Virtualized rendering (only visible lines mounted)
 *   - Ring buffer backing (1M lines, O(1) append)
 *   - Substring + regex search
 *   - Severity filter
 *   - AI action toolbar (explain error, analyze crash)
 *   - Command history
 *
 * Connects to Wings over WebSocket and streams lines into the ring buffer.
 * The renderer reads only the visible window; scroll stays at 60fps regardless
 * of total buffer size.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ConsoleRingBuffer, type LogLine } from '@/lib/consoleBuffer';
import { api } from '@/lib/api';

const VIRTUAL_OVERSCAN = 20;
const LINE_HEIGHT = 22; // px

const SEVERITY_COLOR: Record<LogLine['severity'], string> = {
  debug: 'var(--c-text-dim)',
  info: 'var(--c-text)',
  warn: 'var(--c-warning)',
  error: 'var(--c-danger)',
  fatal: 'var(--c-danger)',
};

interface Props {
  serverId: string;
}

export function Console2({ serverId }: Props) {
  const bufferRef = useRef<ConsoleRingBuffer>(new ConsoleRingBuffer(100_000));
  const [version, setVersion] = useState(0);  // bump to trigger re-render on append
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [query, setQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<LogLine['severity'] | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [aiPanel, setAiPanel] = useState<{ open: boolean; loading: boolean; content: string }>({
    open: false,
    loading: false,
    content: '',
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ============ WebSocket connection to Wings ============
  useEffect(() => {
    const wsUrl = `/ws/server/${serverId}/console`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket failed:', err);
      return;
    }
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'console output') {
          const text: string = msg.args?.[0] ?? '';
          const severity = inferSeverity(text);
          bufferRef.current.append({
            ts: Date.now(),
            severity,
            text: text.replace(/\r?\n$/, ''),
          });
          if (autoScroll) setVersion((v) => v + 1);
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [serverId, autoScroll]);

  // ============ Virtualization math ============
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - VIRTUAL_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / LINE_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const endIndex = Math.min(bufferRef.current.size, startIndex + visibleCount);
    return { startIndex, endIndex };
  }, [scrollTop, viewportHeight, version]);

  const visibleLines = useMemo(() => {
    const out: LogLine[] = [];
    for (const line of bufferRef.current.range(visibleRange.startIndex, visibleRange.endIndex)) {
      if (filterSeverity !== 'all' && line.severity !== filterSeverity) continue;
      if (query && !line.text.toLowerCase().includes(query.toLowerCase())) continue;
      out.push(line);
    }
    return out;
  }, [visibleRange, filterSeverity, query, version]);

  const totalHeight = bufferRef.current.size * LINE_HEIGHT;

  // ============ Auto-scroll to bottom when new lines arrive ============
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = totalHeight;
    }
  }, [version, autoScroll, totalHeight]);

  // ============ Command history ============
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdInput, setCmdInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);

  const sendCommand = useCallback(() => {
    if (!cmdInput.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ event: 'send command', args: [cmdInput] }));
    setCmdHistory((h) => [...h, cmdInput]);
    setCmdInput('');
    setHistoryIdx(-1);
  }, [cmdInput]);

  // ============ AI actions ============
  const runAI = async (capability: 'explain_error' | 'analyze_crash') => {
    const recentLines = bufferRef.current.tail(50).map((l) => l.text).join('\n');
    setAiPanel({ open: true, loading: true, content: '' });
    let acc = '';
    try {
      for await (const chunk of api.streamAI(
        [{ role: 'user', content: recentLines }],
        capability
      )) {
        acc += chunk;
        setAiPanel({ open: true, loading: false, content: acc });
      }
    } catch (err: any) {
      setAiPanel({ open: true, loading: false, content: `Error: ${err.message}` });
    }
  };

  // ============ Render ============
  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search logs..."
          className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as any)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none"
        >
          <option value="all">All</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
        <button
          onClick={() => runAI('explain_error')}
          className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent/20"
        >
          ✨ Explain Error
        </button>
        <button
          onClick={() => runAI('analyze_crash')}
          className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent/20"
        >
          💥 Analyze Crash
        </button>
        <button
          onClick={() => setAutoScroll((a) => !a)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            autoScroll
              ? 'border-accent bg-accent/20 text-accent-2'
              : 'border-border bg-surface-2 text-text-muted'
          }`}
        >
          {autoScroll ? '⬇ Following' : '⏸ Paused'}
        </button>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Virtualized log list */}
        <div
          ref={containerRef}
          onScroll={(e) => {
            setScrollTop((e.target as HTMLDivElement).scrollTop);
            setViewportHeight((e.target as HTMLDivElement).clientHeight);
          }}
          className="flex-1 overflow-auto rounded-lg border border-border bg-[#07080F] font-mono text-xs"
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: visibleRange.startIndex * LINE_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visibleLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start gap-3 px-3 hover:bg-surface-2/30"
                  style={{ height: LINE_HEIGHT }}
                >
                  <span className="select-none text-text-dim">
                    {new Date(line.ts).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span
                    className="select-none uppercase"
                    style={{ color: SEVERITY_COLOR[line.severity], minWidth: '3rem' }}
                  >
                    {line.severity}
                  </span>
                  <span style={{ color: SEVERITY_COLOR[line.severity] }} className="flex-1">
                    {highlightQuery(line.text, query)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI side panel */}
        {aiPanel.open && (
          <aside className="flex w-80 flex-col rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="text-sm font-medium">Archive AI</span>
              <button
                onClick={() => setAiPanel({ ...aiPanel, open: false })}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3 text-sm">
              {aiPanel.loading && (
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  Analyzing...
                </div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {aiPanel.content}
              </pre>
            </div>
          </aside>
        )}
      </div>

      {/* Command input */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
        <span className="px-2 font-mono text-xs text-text-dim">$</span>
        <input
          value={cmdInput}
          onChange={(e) => setCmdInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendCommand();
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const next = Math.min(historyIdx + 1, cmdHistory.length - 1);
              if (next >= 0) {
                setHistoryIdx(next);
                setCmdInput(cmdHistory[cmdHistory.length - 1 - next] ?? '');
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = historyIdx - 1;
              if (next < 0) {
                setHistoryIdx(-1);
                setCmdInput('');
              } else {
                setHistoryIdx(next);
                setCmdInput(cmdHistory[cmdHistory.length - 1 - next] ?? '');
              }
            }
          }}
          placeholder="Send command..."
          className="flex-1 bg-transparent font-mono text-sm outline-none"
        />
        <span className="font-mono text-[10px] text-text-dim">
          {bufferRef.current.size.toLocaleString()} lines
        </span>
      </div>
    </div>
  );
}

function inferSeverity(text: string): LogLine['severity'] {
  const lower = text.toLowerCase();
  if (/\b(fatal|panic|segfault)\b/.test(lower)) return 'fatal';
  if (/\b(error|exception|failed|crash)\b/.test(lower)) return 'error';
  if (/\b(warn|warning|deprecated)\b/.test(lower)) return 'warn';
  if (/\b(debug|trace|verbose)\b/.test(lower)) return 'debug';
  return 'info';
}

function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx: number;
  while ((idx = lower.indexOf(q, i)) !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} className="bg-accent/30 text-text">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}
