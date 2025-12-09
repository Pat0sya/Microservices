import pino from "pino";

export function createLogger(service) {
  return pino({
    level: "info",
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
