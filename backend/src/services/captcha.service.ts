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
  timeoutMs?: number;
}

/**
 * Resuelve un reCAPTCHA v2 usando SolveCaptcha (api.solvecaptcha.com).
 *
 * Flujo:
 *   1. POST /in.php con el sitekey y la URL de la página → obtiene task ID
 *   2. Polling GET /res.php?action=get&id=<taskId> hasta recibir el token
 *   3. Retorna el g-recaptcha-response token para inyectar en el formulario
 *
 * La API key se configura en tenant_config.extra_config.solvecaptcha_api_key
 * o como variable de entorno SOLVECAPTCHA_API_KEY.
 */
export async function resolverCaptcha(opts: SolveCaptchaOptions): Promise<string> {
  const timeout = opts.timeoutMs ?? 120000;
  const started = Date.now();

  logger.debug('Enviando reCAPTCHA a SolveCaptcha', { pageUrl: opts.pageUrl });

  const submitResp = await axios.post<CaptchaInResponse>(
    `${SOLVECAPTCHA_BASE}/in.php`,
    null,
    {
      params: {
        key: opts.apiKey,
        method: 'userrecaptcha',
        googlekey: opts.siteKey,
        pageurl: opts.pageUrl,
        json: 1,
      },
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
