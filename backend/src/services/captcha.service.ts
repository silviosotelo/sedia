import axios from 'axios';
import { logger } from '../config/logger';

const SOLVECAPTCHA_BASE = 'https://api.solvecaptcha.com';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

interface CaptchaInResponse {
  status: number;
  request: string;
}

interface CaptchaResultResponse {
  status: number;
  request: string;
}

export interface SolveCaptchaOptions {
  apiKey: string;
  siteKey: string;
  pageUrl: string;
  recaptchaTokenPagina?: string;
  timeoutMs?: number;
}

/**
 * Resuelve un reCAPTCHA v2 usando SolveCaptcha (api.solvecaptcha.com).
 *
 * Flujo:
 *   1. POST /in.php con el sitekey, la URL de la página y opcionalmente el
 *      recaptcha-token dinámico extraído por Puppeteer → obtiene task ID
 *   2. Polling GET /res.php?action=get&id=<taskId> hasta recibir el token
 *   3. Retorna el g-recaptcha-response token para inyectar en el formulario
 *
 * recaptchaTokenPagina:
 *   eKuatia inyecta en cada carga de /consultas/ un <input id="recaptcha-token">
 *   con un valor dinámico que el backend usa para validar la sesión. Se debe
 *   extraer con Puppeteer y enviarlo a SolveCaptcha como parámetro adicional
 *   para que el worker pueda resolver el challenge correctamente.
 */
export async function resolverCaptcha(opts: SolveCaptchaOptions): Promise<string> {
  const timeout = opts.timeoutMs ?? 120000;
  const started = Date.now();

  logger.debug('Enviando reCAPTCHA a SolveCaptcha', {
    pageUrl: opts.pageUrl,
    con_token_pagina: !!opts.recaptchaTokenPagina,
  });

  const params: Record<string, unknown> = {
    key: opts.apiKey,
    method: 'userrecaptcha',
    googlekey: opts.siteKey,
    pageurl: opts.pageUrl,
    json: 1,
  };

  if (opts.recaptchaTokenPagina) {
    params['recaptcha_token'] = opts.recaptchaTokenPagina;
  }

  const submitResp = await axios.post<CaptchaInResponse>(
    `${SOLVECAPTCHA_BASE}/in.php`,
    null,
    {
      params,
      timeout: 30000,
    }
  );

  if (submitResp.data.status !== 1) {
    throw new Error(
      `SolveCaptcha: error al enviar tarea. Respuesta: ${String(submitResp.data.request)}`
    );
  }

  const taskId = submitResp.data.request;
  logger.debug('Tarea de captcha enviada', { taskId });

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    if (Date.now() - started > timeout) {
      throw new Error(`SolveCaptcha: timeout esperando solución (taskId: ${taskId})`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const resultResp = await axios.get<CaptchaResultResponse>(
      `${SOLVECAPTCHA_BASE}/res.php`,
      {
        params: {
          key: opts.apiKey,
          action: 'get',
          id: taskId,
          json: 1,
        },
        timeout: 10000,
      }
    );

    if (resultResp.data.status === 1) {
      const token = resultResp.data.request;
      logger.debug('Captcha resuelto', { taskId, intento: attempt });
      return token;
    }

    if (resultResp.data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(
        `SolveCaptcha: error inesperado. Respuesta: ${String(resultResp.data.request)}`
      );
    }

    logger.debug(`Captcha aún no resuelto, intento ${attempt}/${POLL_MAX_ATTEMPTS}`);
  }

  throw new Error(`SolveCaptcha: se agotaron los intentos de polling (taskId: ${taskId})`);
}
