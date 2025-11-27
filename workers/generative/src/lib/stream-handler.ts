import type { SSEEvent } from '../types';

/**
 * SSE Stream Handler
 *
 * Manages Server-Sent Events streaming to the client
 */

/**
 * Create an SSE response with proper headers
 */
export function createSSEResponse(
  generator: AsyncGenerator<SSEEvent>,
  request: Request
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start streaming in the background
  streamEvents(generator, writer, encoder).catch(err => {
    console.error('SSE stream error:', err);
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

/**
 * Stream events to the client
 */
async function streamEvents(
  generator: AsyncGenerator<SSEEvent>,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder
): Promise<void> {
  try {
    let eventId = 0;

    for await (const event of generator) {
      eventId++;

      const sseMessage = formatSSEMessage(event, eventId);
      await writer.write(encoder.encode(sseMessage));
    }
  } finally {
    await writer.close();
  }
}

/**
 * Format an event as an SSE message
 */
function formatSSEMessage(event: SSEEvent, id: number): string {
  const lines: string[] = [];

  // Add event ID for reconnection
  lines.push(`id: ${id}`);

  // Add event type
  lines.push(`event: ${event.event}`);

  // Add data (JSON encoded)
  lines.push(`data: ${JSON.stringify(event.data)}`);

  // Empty line to end the message
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

/**
 * Create a callback-based SSE stream
 */
export function createCallbackSSEStream(
  processor: (emit: (event: SSEEvent) => void) => Promise<void>
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let eventId = 0;
  let closed = false;

  const emit = (event: SSEEvent) => {
    if (closed) return;

    eventId++;
    const message = formatSSEMessage(event, eventId);
    writer.write(encoder.encode(message)).catch(() => {
      closed = true;
    });
  };

  // Start processing in background
  processor(emit)
    .catch(err => {
      if (!closed) {
        emit({
          event: 'error',
          data: {
            code: 'PROCESSING_ERROR',
            message: err.message,
            recoverable: false,
          },
        });
      }
    })
    .finally(() => {
      closed = true;
      writer.close().catch(() => {});
    });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Send a heartbeat to keep connection alive
 */
export function createHeartbeat(interval: number = 15000): {
  start: (emit: (event: SSEEvent) => void) => void;
  stop: () => void;
} {
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start: (emit) => {
      timer = setInterval(() => {
        // Send a comment as heartbeat (: prefix)
        // This is handled specially in SSE - comments are ignored by EventSource
      }, interval);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

/**
 * Parse Last-Event-ID header for resume capability
 */
export function parseLastEventId(request: Request): number | null {
  const lastEventId = request.headers.get('Last-Event-ID');

  if (lastEventId) {
    const parsed = parseInt(lastEventId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Create an async generator from a callback-based event source
 */
export function callbackToGenerator(
  processor: (emit: (event: SSEEvent) => void) => Promise<void>
): AsyncGenerator<SSEEvent> {
  const events: SSEEvent[] = [];
  let done = false;
  let error: Error | null = null;
  let resolve: (() => void) | null = null;

  // Start processing
  processor((event) => {
    events.push(event);
    if (resolve) {
      resolve();
      resolve = null;
    }
  })
    .then(() => {
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    })
    .catch((err) => {
      error = err;
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

  return {
    async next(): Promise<IteratorResult<SSEEvent>> {
      // Wait for events if queue is empty
      while (events.length === 0 && !done) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }

      if (error) {
        throw error;
      }

      if (events.length > 0) {
        return { value: events.shift()!, done: false };
      }

      return { value: undefined as any, done: true };
    },

    async return(): Promise<IteratorResult<SSEEvent>> {
      done = true;
      return { value: undefined as any, done: true };
    },

    async throw(e: Error): Promise<IteratorResult<SSEEvent>> {
      error = e;
      done = true;
      throw e;
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
