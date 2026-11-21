/**
 * Application & Upstream Load Balancer
 *
 * Provides high-availability request distribution and failover across:
 * 1. Multiple backend API origins (`API_ORIGINS` / `API_ORIGIN`) for console reverse proxies
 * 2. Database read/write pools (Neon primary + read replicas + Supabase)
 * 3. Multi-worker Node.js cluster processes (`CLUSTER_WORKERS`)
 *
 * Supported algorithms:
 * - "least-connections" (default: routes to healthy node with lowest active in-flight requests)
 * - "round-robin" (cycles evenly across healthy nodes)
 * - "ip-hash" (sticky session affinity by client IP or session token)
 */

const crypto = require("crypto");

const DEFAULT_COOLDOWN_MS = 15_000; // 15s cooldown before probing an unhealthy node
const DEFAULT_FAILURE_THRESHOLD = 2; // 2 consecutive failures marks node unhealthy

class LoadBalancerPool {
  constructor(nodes = [], options = {}) {
    this.name = options.name || "default-pool";
    this.strategy = options.strategy || "least-connections";
    this.cooldownMs = Number(options.cooldownMs || DEFAULT_COOLDOWN_MS);
    this.failureThreshold = Number(options.failureThreshold || DEFAULT_FAILURE_THRESHOLD);
    this.rrIndex = 0;
    this.totalRequests = 0;
    this.totalFailovers = 0;
    this.nodes = [];
    this.setNodes(nodes);
  }

  setNodes(nodes = []) {
    const normalized = (Array.isArray(nodes) ? nodes : [])
      .map((n, idx) => {
        if (typeof n === "string") {
          const clean = n.trim().replace(/\/+$/, "");
          return clean ? { id: `node-${idx + 1}`, url: clean, weight: 1 } : null;
        }
        if (n && typeof n === "object" && (n.url || n.id)) {
          return {
            id: String(n.id || `node-${idx + 1}`),
            url: String(n.url || "").trim().replace(/\/+$/, ""),
            weight: Math.max(1, Number(n.weight || 1)),
            role: n.role || "primary",
          };
        }
        return null;
      })
      .filter(Boolean);

    this.nodes = normalized.map((n) => ({
      ...n,
      healthy: true,
      activeConnections: 0,
      totalHandled: 0,
      failureCount: 0,
      lastFailureAt: 0,
      lastLatencyMs: 0,
    }));
  }

  getHealthyNodes(now = Date.now()) {
    const available = [];
    for (const node of this.nodes) {
      if (node.healthy) {
        available.push(node);
      } else if (now - node.lastFailureAt >= this.cooldownMs) {
        // Half-open recovery probe: allow node back into rotation
        node.healthy = true;
        node.failureCount = 0;
        available.push(node);
      }
    }
    // Fail-safe: if all nodes tripped, reset and return all nodes so traffic is never deadlocked
    if (available.length === 0 && this.nodes.length > 0) {
      return this.nodes;
    }
    return available;
  }

  selectNode(options = {}) {
    const now = options.now || Date.now();
    const strategy = options.strategy || this.strategy;
    const candidates = this.getHealthyNodes(now);
    if (candidates.length === 0) return null;

    this.totalRequests += 1;

    if (candidates.length === 1) {
      return candidates[0];
    }

    if (strategy === "ip-hash" && options.affinityKey) {
      const digest = crypto.createHash("sha256").update(String(options.affinityKey)).digest();
      const idx = digest.readUInt32BE(0) % candidates.length;
      return candidates[idx];
    }

    if (strategy === "round-robin") {
      const idx = this.rrIndex % candidates.length;
      this.rrIndex = (this.rrIndex + 1) % candidates.length;
      return candidates[idx];
    }

    // Default: Least-Connections with round-robin tie-breaker
    let best = candidates[0];
    let bestScore = best.activeConnections / best.weight;
    for (let i = 1; i < candidates.length; i++) {
      const idx = (this.rrIndex + i) % candidates.length;
      const candidate = candidates[idx];
      const score = candidate.activeConnections / candidate.weight;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    this.rrIndex = (this.rrIndex + 1) % candidates.length;
    return best;
  }

  acquireNode(options = {}) {
    const node = this.selectNode(options);
    if (!node) return null;
    node.activeConnections += 1;
    node.totalHandled += 1;
    return node;
  }

  releaseNode(nodeOrId, { success = true, latencyMs = 0, now = Date.now() } = {}) {
    const node =
      typeof nodeOrId === "string"
        ? this.nodes.find((n) => n.id === nodeOrId || n.url === nodeOrId)
        : nodeOrId;
    if (!node) return;

    if (node.activeConnections > 0) {
      node.activeConnections -= 1;
    }
    if (latencyMs > 0) {
      node.lastLatencyMs = latencyMs;
    }
    if (success) {
      node.failureCount = 0;
      node.healthy = true;
    } else {
      node.failureCount += 1;
      node.lastFailureAt = now;
      if (node.failureCount >= this.failureThreshold) {
        node.healthy = false;
      }
    }
  }

  /**
   * Execute an async operation against the load balancer pool with automatic failover
   * to the next healthy node if the selected node errors or times out.
   */
  async executeWithFailover(operationFn, options = {}) {
    const maxAttempts = Math.min(options.maxAttempts || this.nodes.length || 1, 4);
    let lastError = null;
    const triedIds = new Set();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidates = this.getHealthyNodes().filter((n) => !triedIds.has(n.id));
      const poolToUse = candidates.length > 0 ? candidates : this.getHealthyNodes();
      if (poolToUse.length === 0) break;

      const node = this.acquireNode(options);
      if (!node) break;
      triedIds.add(node.id);

      const start = Date.now();
      try {
        const result = await operationFn(node, attempt);
        this.releaseNode(node, { success: true, latencyMs: Date.now() - start });
        return { result, node, attempts: attempt + 1 };
      } catch (err) {
        lastError = err;
        this.totalFailovers += 1;
        this.releaseNode(node, { success: false, latencyMs: Date.now() - start });
      }
    }

    throw lastError || new Error(`All nodes in load balancer pool '${this.name}' failed.`);
  }

  getStats() {
    return {
      name: this.name,
      strategy: this.strategy,
      totalRequests: this.totalRequests,
      totalFailovers: this.totalFailovers,
      healthyCount: this.nodes.filter((n) => n.healthy).length,
      totalNodes: this.nodes.length,
      nodes: this.nodes.map((n) => ({
        id: n.id,
        url: n.url,
        healthy: n.healthy,
        activeConnections: n.activeConnections,
        totalHandled: n.totalHandled,
        failureCount: n.failureCount,
        lastLatencyMs: n.lastLatencyMs,
      })),
    };
  }
}

// --- Singleton API & Database Pools -----------------------------------------

function parseOriginsFromEnv(defaultOrigin = "http://localhost:3000") {
  const raw = process.env.API_ORIGINS || process.env.API_ORIGIN || defaultOrigin;
  return String(raw)
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const defaultApiPool = new LoadBalancerPool(
  parseOriginsFromEnv(process.env.VERCEL ? "https://coldberry-project-x.vercel.app" : "http://localhost:3000"),
  { name: "api-upstream-pool", strategy: process.env.LB_STRATEGY || "least-connections" }
);

function createLoadBalancerPool(nodes, options) {
  return new LoadBalancerPool(nodes, options);
}

async function defaultHandler(req, res) {
  if (res && typeof res.status === "function") {
    const { resolveAuthFromRequest } = require("./admin");
    const auth = resolveAuthFromRequest(req);
    if (!auth || auth.role !== "admin") {
      res.setHeader("Content-Type", "application/json");
      return res.status(401).json({ error: "Unauthorized. Admin authentication required." });
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      status: "ok",
      loadBalancer: defaultApiPool.getStats(),
    });
  }
}

defaultHandler.LoadBalancerPool = LoadBalancerPool;
defaultHandler.createLoadBalancerPool = createLoadBalancerPool;
defaultHandler.defaultApiPool = defaultApiPool;
defaultHandler.parseOriginsFromEnv = parseOriginsFromEnv;

module.exports = defaultHandler;
