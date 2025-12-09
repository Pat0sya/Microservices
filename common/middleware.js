import promClient from "prom-client";

export function setupObservability(app, serviceName) {
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  const httpRequestsTotal = new promClient.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["service", "method", "route", "status"],
  });

  const httpRequestDuration = new promClient.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["service", "method", "route"],
  });

  register.registerMetric(httpRequestsTotal);
  register.registerMetric(httpRequestDuration);

  // Logging + Metrics middleware
  app.addHook("onRequest", async (req) => {
    req.startTime = Date.now();
  });

  app.addHook("onResponse", async (req, reply) => {
    const duration = (Date.now() - req.startTime) / 1000;

    const route = reply.context.config.url || req.url;

    httpRequestsTotal.inc({
      service: serviceName,
      method: req.method,
      route,
      status: reply.statusCode,
    });

    httpRequestDuration.observe(
      {
        service: serviceName,
        method: req.method,
        route,
      },
      duration
    );
  });

  // /metrics
  app.get("/metrics", async (req, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
}
