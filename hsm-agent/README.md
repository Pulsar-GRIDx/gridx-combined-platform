# GRIDx local HSM agent

The PrismToken HSM lives on the factory LAN (`192.168.0.201`) and must stay off the
public Internet. The GridX backend runs on a cloud droplet, which has no route to
that network — a direct attempt returns `ENETUNREACH`, the kernel's way of saying
no route exists. That is not fixable by configuration, and the answer is not to
punch a hole into the factory network.

Instead, an agent runs on a factory PC that *can* reach the HSM:

```
Browser -> GridX portal -> cloud backend -> [outbound channel] -> agent -> HSM
                                                 ^
                                    the agent always dials out
```

The factory PC needs **no inbound Internet access**, no port forward, no static
address. The HSM is never exposed. HSM credentials live only on the agent.

## Pieces

| File | Side | Role |
|---|---|---|
| `backend/vending/hsmAgentOps.js` | both | operation allow-list + secret redaction |
| `backend/vending/hsmAgentBridge.js` | cloud | job queue; same API as `thriftHsmService` |
| `backend/vending/hsmAgentRoutes.js` | cloud | `/cb/hsm-agent/poll`, `/result`, `/status` |
| `backend/vending/hsmProvider.js` | cloud | selects agent vs direct mode |
| `hsm-agent/agent.js` | factory | polls, executes, returns results |

`thriftHsmService.js` is **unmodified** — in agent mode it simply runs on the agent.
`HSM_MODE=direct` restores the original behaviour for on-premises deployments.

## Security

The agent runs only the operations in `hsmAgentOps.ALLOWED`, and re-checks that
list itself, so a compromised cloud backend cannot issue arbitrary HSM commands.
Nothing in the list can create, replace, clear or rotate a DITK, or extract key
material: the `issue*` calls ask the HSM to *derive* a token from a key it already
holds, and only the token comes back.

Logs pass through `OPS.redact()`, which strips password/key/component fields at any
nesting depth.

## Setup

**1. Generate the shared secret** (once, on either machine):

```bash
node hsm-agent/setup.js
```

Writes two gitignored files and prints only a fingerprint, never the secret:
- `hsm-agent/agent.config.json` — the agent's config
- `hsm-agent/SERVER_ENV.txt` — the `HSM_AGENT_TOKEN=` line for the backend

**2. Cloud backend.** Add `HSM_AGENT_TOKEN` to the backend environment and restart.
With it set, `hsmProvider` selects agent mode automatically. Without it, the agent
endpoints return 503 rather than running unauthenticated.

**3. Factory PC.** Fill in `hsmUsername` / `hsmPassword` in `agent.config.json`, then:

```bash
node hsm-agent/agent.js
```

Run it under a service manager so it restarts on boot (Windows: NSSM or Task
Scheduler; Linux: systemd).

## Verifying

```bash
node hsm-agent/selftest.js          # full chain against the real HSM
node hsm-agent/resilience_test.js   # restart / offline / queue-retention
node hsm-agent/issue_via_agent.js ditk <DRN> 999907 2 1
```

The portal shows agent state at the top of `/hsm`, and `GET /cb/hsm-agent/status`
returns it as JSON.

## Behaviour notes

- Polls are held open ~25 s, below typical proxy idle timeouts, so the server ends
  them rather than the proxy.
- A request arriving with no agent connected fails immediately with a clear
  message instead of hanging.
- A job queued while the agent is down is delivered when it reconnects; jobs are
  requeued rather than dropped if a poller's socket has already gone away.
- Jobs time out after 45 s.
