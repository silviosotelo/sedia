import { Solver } from 'solvecaptcha-javascript';
import { logger } from '../config/logger';

export interface SolveCaptchaOptions {
  apiKey: string;
  siteKey: string;
  pageUrl: string;
  timeoutMs?: number;
}

/**
 * Resuelve un reCAPTCHA v2 usando el SDK oficial de solvecaptcha-javascript.
 * Retorna el g-recaptcha-response token listo para inyectar en el formulario.
 */
export async function resolverCaptcha(opts: SolveCaptchaOptions): Promise<string> {
  const startMs = Date.now();
  logger.debug('Enviando reCAPTCHA a SolveCaptcha', {
    pageUrl: opts.pageUrl,
  });

  const solver = new Solver(opts.apiKey);

  const res = await solver.recaptcha({
    pageurl: opts.pageUrl,
    googlekey: opts.siteKey,
  });

  const token = res.data;

  if (!token || token.length < 20) {
    throw new Error(`SolveCaptcha: token inválido recibido: ${String(token)}`);
  }

  const elapsedMs = Date.now() - startMs;
  logger.info('Captcha resuelto por SolveCaptcha SDK', {
    captcha_id: res.id,
    elapsed_ms: elapsedMs,
  });

  return token;
}
