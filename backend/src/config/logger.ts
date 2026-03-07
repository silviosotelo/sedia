import { config } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  tenant_id?: string;
  job_id?: string;
  stack?: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  let contextStr = '';
  if (context) {
    const { stack, ...rest } = context;
    const restStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
    contextStr = restStr;
    if (stack) {
      contextStr += `\n  ${stack}`;
    }
  }
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (config.server.debug) {
      console.debug(formatLog('debug', message, context));
    }
  },
  info(message: string, context?: LogContext): void {
    console.info(formatLog('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(formatLog('warn', message, context));
  },
  error(message: string, context?: LogContext): void {
    console.error(formatLog('error', message, context));
  },
};
