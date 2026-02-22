import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

interface UseTerminalOptions {
  onData?: (data: string) => void; // Called with base64 input to send to server
}

export function useTerminal({ onData }: UseTerminalOptions = {}) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onDataRef = useRef(onData);

  // Keep ref current so the terminal callback never goes stale
  onDataRef.current = onData;

  const safeFit = useCallback(() => {
    const container = containerRef.current;
    if (!container || !fitAddonRef.current || !termRef.current) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    fitAddonRef.current.fit();
  }, []);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (termRef.current) return; // Already initialized

    containerRef.current = container;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 15,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#0b111a',
        foreground: '#e8eef6',
        cursor: '#f7c36a',
        black: '#0b111a',
        red: '#ff6b6b',
        green: '#8be39c',
        yellow: '#f7c36a',
        blue: '#4db2ff',
        magenta: '#ff82b2',
        cyan: '#7cf1c7',
        white: '#d9e1ee',
        brightBlack: '#2a3342',
        brightRed: '#ff8c8c',
        brightGreen: '#a8f0b6',
        brightYellow: '#ffd99a',
        brightBlue: '#79c7ff',
        brightMagenta: '#ffb0d3',
        brightCyan: '#a8f7de',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);
    safeFit();
    requestAnimationFrame(() => safeFit());

    // Forward user input via ref so callback never goes stale
    term.onData((data) => {
      if (onDataRef.current) {
        const encoded = btoa(unescape(encodeURIComponent(data)));
        onDataRef.current(encoded);
      }
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => safeFit());
    resizeObserverRef.current.observe(container);
  }, [safeFit]);

  const writeData = useCallback((base64Data: string) => {
    if (!termRef.current) return;
    try {
      const decoded = atob(base64Data);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      termRef.current.write(bytes);
    } catch {
      termRef.current.write(base64Data);
    }
  }, []);

  const writeText = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const getLineIndex = useCallback(() => {
    const term = termRef.current;
    if (!term) return 0;
    const buffer = term.buffer.active;
    return buffer.baseY + buffer.cursorY;
  }, []);

  const scrollToLine = useCallback((line: number) => {
    const term = termRef.current;
    if (!term) return;
    term.scrollToLine(line);
  }, []);

  const fit = useCallback(() => {
    safeFit();
  }, [safeFit]);

  const getDimensions = useCallback(() => {
    const term = termRef.current;
    if (!term) return { cols: 80, rows: 24 };
    return { cols: term.cols, rows: term.rows };
  }, []);

  useEffect(() => {
    const handleResize = () => fit();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fit]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, []);

  return { initTerminal, writeData, writeText, getLineIndex, scrollToLine, fit, getDimensions };
}
