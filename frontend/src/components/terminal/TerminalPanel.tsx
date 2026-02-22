import { useEffect, useRef } from 'react';
import { useTerminal } from '@/hooks/useTerminal';
import type { Socket } from 'socket.io-client';

interface TerminalPanelProps {
  sessionId: string;
  socket: Socket | null;
  active?: boolean;
  jumpStepId?: string | null;
  jumpStepOutput?: string;
  onJumpHandled?: () => void;
}

export function TerminalPanel({ sessionId, socket, active, jumpStepId, jumpStepOutput, onJumpHandled }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stepMarkersRef = useRef<Map<string, number>>(new Map());
  const { initTerminal, writeData, writeText, getLineIndex, scrollToLine, getDimensions, fit } = useTerminal({
    onData: (base64Data) => {
      socket?.emit('terminal_input', {
        session_id: sessionId,
        input: base64Data,
      });
    },
  });

  useEffect(() => {
    if (containerRef.current) {
      initTerminal(containerRef.current);
    }
  }, [initTerminal]);

  // Listen for terminal.data events
  useEffect(() => {
    if (!socket) return;

    const handleData = (event: { data: string }) => {
      writeData(event.data);
    };

    const handleStepStarted = (event: { session_id: string; step_id: string; description: string }) => {
      if (event.session_id !== sessionId) return;
      const lineIndex = getLineIndex();
      stepMarkersRef.current.set(event.step_id, lineIndex);
      writeText(`\r\n\x1b[36m── ${event.description} ──\x1b[0m\r\n`);
    };

    const handleObservation = (event: { session_id: string; data: any }) => {
      if (event.session_id !== sessionId) return;
      const data = event.data || {};
      if (!data.step_id) return;
      // Normalize \n to \r\n for xterm (avoid double \r\r\n)
      const norm = (s: string) => s.replace(/\r?\n/g, '\r\n');
      if (data.command) writeText(`\r\n\x1b[33m$ ${data.command}\x1b[0m\r\n`);
      if (data.stdout) writeText(norm(String(data.stdout)));
      if (data.stderr) writeText(`\r\n\x1b[31m${norm(String(data.stderr))}\x1b[0m`);
    };

    const handleStepCompleted = (event: { session_id: string; step_id: string }) => {
      if (event.session_id !== sessionId) return;
      writeText(`\r\n\x1b[2m[step done]\x1b[0m\r\n`);
    };

    socket.on('terminal.data', handleData);
    socket.on('hunt.step_started', handleStepStarted);
    socket.on('hunt.observation', handleObservation);
    socket.on('hunt.step_completed', handleStepCompleted);
    return () => {
      socket.off('terminal.data', handleData);
      socket.off('hunt.step_started', handleStepStarted);
      socket.off('hunt.observation', handleObservation);
      socket.off('hunt.step_completed', handleStepCompleted);
    };
  }, [socket, sessionId, writeData, writeText, getLineIndex]);

  // Re-fit terminal when tab becomes visible
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => fit());
    }
  }, [active, fit]);

  // Jump to step marker when clicking a hunt step
  useEffect(() => {
    if (!jumpStepId) return;
    const line = stepMarkersRef.current.get(jumpStepId);
    if (line !== undefined) {
      // Marker exists — just scroll to it
      scrollToLine(line);
    } else {
      // Marker not found (terminal started after hunt) — replay stored output
      const newLine = getLineIndex();
      stepMarkersRef.current.set(jumpStepId, newLine);
      writeText(`\r\n[HUNT ${jumpStepId}] output\r\n`);
      if (jumpStepOutput) {
        writeText(jumpStepOutput.replace(/\r?\n/g, '\r\n'));
      } else {
        writeText('\r\n(no output captured)\r\n');
      }
      scrollToLine(newLine);
    }
    onJumpHandled?.();
  }, [jumpStepId, jumpStepOutput, getLineIndex, writeText, scrollToLine, onJumpHandled]);

  // Emit resize when terminal dimensions change
  useEffect(() => {
    const { cols, rows } = getDimensions();
    socket?.emit('terminal_resize', { session_id: sessionId, cols, rows });
  }, [socket, sessionId, getDimensions]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--panel-3)',
        padding: 4,
      }}
      ref={containerRef}
    />
  );
}
