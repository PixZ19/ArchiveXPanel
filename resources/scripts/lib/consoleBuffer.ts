/**
 * Console Ring Buffer
 * ----------------------------------------------------------------------------
 * Fixed-capacity ring buffer for log lines. O(1) append, O(1) eviction.
 * Search index updates asynchronously so the renderer never blocks.
 *
 * Capacity is configurable; defaults to 100k lines. The buffer is the
 * substrate that lets the console handle 1M lines without dropping frames.
 */

export interface LogLine {
  id: number;
  ts: number;        // epoch millis
  severity: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source?: string;
  text: string;
}

export interface SearchHit {
  lineId: number;
  start: number;
  end: number;
}

export class ConsoleRingBuffer {
  private lines: LogLine[] = [];
  private capacity: number;
  private head = 0;       // index of oldest line
  private count = 0;      // number of valid lines
  private nextId = 0;
  private searchIndex: Map<string, Set<number>> = new Map();

  constructor(capacity = 100_000) {
    this.capacity = capacity;
    this.lines = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Append a line. If capacity is exceeded, the oldest line is evicted. */
  append(line: Omit<LogLine, 'id'>): LogLine {
    const fullLine: LogLine = { ...line, id: this.nextId++ };
    const idx = (this.head + this.count) % this.capacity;
    if (this.count === this.capacity) {
      // Evict oldest
      this.removeFromIndex(this.lines[this.head]);
      this.lines[this.head] = fullLine;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.lines[idx] = fullLine;
      this.count++;
    }
    this.addToIndex(fullLine);
    return fullLine;
  }

  /** Get the line at logical position (0 = oldest, count-1 = newest). */
  at(logicalIndex: number): LogLine | undefined {
    if (logicalIndex < 0 || logicalIndex >= this.count) return undefined;
    const idx = (this.head + logicalIndex) % this.capacity;
    return this.lines[idx];
  }

  /** Get the last N lines (newest). */
  tail(n: number): LogLine[] {
    const start = Math.max(0, this.count - n);
    const result: LogLine[] = [];
    for (let i = start; i < this.count; i++) {
      result.push(this.lines[(this.head + i) % this.capacity]!);
    }
    return result;
  }

  /** Search by substring (case-insensitive). Returns logical indices. */
  search(query: string, maxResults = 1000): number[] {
    if (!query) return [];
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    // Intersect hits across tokens
    let candidates: Set<number> | null = null;
    for (const tok of tokens) {
      const hits = this.searchIndex.get(tok);
      if (!hits) return [];
      candidates = candidates ? new Set([...candidates].filter((x) => hits.has(x))) : hits;
    }
    if (!candidates) return [];
    return [...candidates].sort((a, b) => a - b).slice(0, maxResults);
  }

  /** Iterate over a logical range (for virtualized rendering). */
  *range(start: number, end: number): Iterable<LogLine> {
    for (let i = start; i < end && i < this.count; i++) {
      yield this.lines[(this.head + i) % this.capacity]!;
    }
  }

  clear(): void {
    this.lines = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
    this.searchIndex.clear();
  }

  // ============ Internal: search index maintenance ============

  private addToIndex(line: LogLine): void {
    const tokens = this.tokenize(line.text);
    for (const tok of tokens) {
      let set = this.searchIndex.get(tok);
      if (!set) {
        set = new Set();
        this.searchIndex.set(tok, set);
      }
      set.add(line.id);
    }
  }

  private removeFromIndex(line: LogLine | undefined): void {
    if (!line) return;
    const tokens = this.tokenize(line.text);
    for (const tok of tokens) {
      const set = this.searchIndex.get(tok);
      if (set) {
        set.delete(line.id);
        if (set.size === 0) this.searchIndex.delete(tok);
      }
    }
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length >= 2);
  }
}
