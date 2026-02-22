import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AnyEvent } from '@/events/schema';

type EventHandler = (event: AnyEvent) => void;

interface UseSocketOptions {
  sessionId?: string;
  onEvent?: EventHandler;
}

export function useSocket({ sessionId, onEvent }: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
      if (sessionId) {
        socket.emit('join_session', { session_id: sessionId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });

    // Generic event routing — all backend events come through here
    const ALL_EVENTS = [
      'session.created', 'session.state_changed', 'session.terminated',
      'session.locked', 'session.unlocked',
      'ssh.connecting', 'ssh.connected', 'ssh.disconnected', 'ssh.error',
      'ssh.command_started', 'ssh.command_output', 'ssh.command_completed',
      'terminal.started', 'terminal.data', 'terminal.resize', 'terminal.closed',
      'hunt.started', 'hunt.step_started', 'hunt.step_completed',
      'hunt.observation', 'hunt.completed', 'hunt.failed', 'hunt.cancelled',
      'ai.reasoning_started', 'ai.reasoning_chunk', 'ai.reasoning_completed',
      'ai.finding_generated', 'ai.stix_generated', 'ai.remediation_ready', 'ai.error',
      'mcp.lookup_started', 'mcp.lookup_completed', 'mcp.lookup_failed', 'mcp.enrichment_applied',
      'timeline.event_recorded', 'timeline.finding_linked',
      'system.error', 'system.backpressure',
    ];

    for (const eventType of ALL_EVENTS) {
      socket.on(eventType, (data: AnyEvent) => {
        if (onEvent) onEvent(data);

        const handlers = handlersRef.current.get(eventType);
        if (handlers) {
          handlers.forEach((h) => h(data));
        }
      });
    }

    return () => {
      if (sessionId) {
        socket.emit('leave_session', { session_id: sessionId });
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const on = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  const emit = useCallback((eventType: string, data: unknown) => {
    socketRef.current?.emit(eventType, data);
  }, []);

  return { socket: socketRef.current, on, emit };
}
